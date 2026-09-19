import { ConflictException, Inject, Injectable } from '@nestjs/common'
import { type Database, type Db } from '@reka/database'
import { DATABASE } from '../../common/database.token.js'
import { AuditService } from '../audit/audit.service.js'
import { PasswordService } from '../identity/password.service.js'
import { SessionService } from '../identity/session.service.js'
import { createUser } from '../identity/user.repo.js'
import { UserService } from '../identity/user.service.js'
import { OrganizationService } from '../organization/organization.service.js'
import { SetupDto } from './dto/setup.dto.js'

@Injectable()
export class SetupService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly users: UserService,
    private readonly password: PasswordService,
    private readonly organizations: OrganizationService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async initialize(input: SetupDto): Promise<{
    user: { id: string; email: string; displayName: string }
    organization: { id: string; name: string; slug: string }
    token: string
  }> {
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db
      if (await this.users.isInitialized(db)) {
        throw new ConflictException('REKA is already initialized')
      }
      const user = await createUser(db, {
        email: input.email.toLowerCase(),
        passwordHash: await this.password.hash(input.password),
        displayName: input.displayName,
      })
      const organization = await this.organizations.createIn(db, {
        name: input.organizationName,
        ownerUserId: user.id,
      })
      const token = await this.sessions.create(user.id, db)
      await this.audit.record(
        {
          actorId: user.id,
          organizationId: organization.id,
          action: 'setup.initialized',
          resourceType: 'organization',
          resourceId: organization.id,
          metadata: { name: organization.name },
        },
        db,
      )
      return {
        user: { id: user.id, email: user.email, displayName: user.displayName },
        organization: { id: organization.id, name: organization.name, slug: organization.slug },
        token,
      }
    })
  }
}
