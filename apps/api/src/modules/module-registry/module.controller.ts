import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common'
import type { AuthRequest } from '../../common/auth-request.js'
import { AuditService } from '../audit/audit.service.js'
import { ModulePermissions } from './module-access.guard.js'
import { ModuleRegistryService } from './module-registry.service.js'

@Controller('modules')
export class ModuleController {
  constructor(
    private readonly registry: ModuleRegistryService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ModulePermissions('module.read')
  async list() {
    return { modules: this.registry.list() }
  }

  @Get(':id')
  @ModulePermissions('module.read')
  async detail(@Param('id') id: string) {
    const module = this.registry.get(id)
    if (!module) {
      throw new NotFoundException(`Module '${id}' not found`)
    }
    return { module }
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @ModulePermissions('module.manage')
  async enable(@Param('id') id: string, @Req() req: AuthRequest) {
    const module = await this.registry.enable(id)
    await this.audit.record({
      actorId: req.user?.userId,
      organizationId: req.organization?.organizationId,
      action: 'module.enabled',
      resourceType: 'module',
      resourceId: module.id,
      metadata: {
        version: module.version,
        displayName: module.displayName,
        dependencies: module.dependencies,
      },
    })
    return { module }
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @ModulePermissions('module.manage')
  async disable(@Param('id') id: string, @Req() req: AuthRequest) {
    const module = await this.registry.disable(id)
    await this.audit.record({
      actorId: req.user?.userId,
      organizationId: req.organization?.organizationId,
      action: 'module.disabled',
      resourceType: 'module',
      resourceId: module.id,
      metadata: {
        version: module.version,
        displayName: module.displayName,
      },
    })
    return { module }
  }
}
