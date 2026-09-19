import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import type { AuthRequest } from '../../common/auth-request.js'
import { CurrentUser } from '../identity/current-user.decorator.js'
import { SessionGuard } from '../identity/session.guard.js'
import { OrgAccess, OrgPermissions } from './organization-acl.js'
import { OrganizationService } from './organization.service.js'
import {
  AddMemberDto,
  CreateOrganizationDto,
  UpdateMemberDto,
  UpdateOrganizationDto,
} from './dto/organization.dto.js'

@Controller('organizations')
@UseGuards(SessionGuard)
export class OrganizationController {
  constructor(private readonly organizations: OrganizationService) {}

  @Get()
  async list(@CurrentUser() current: AuthRequest['user']) {
    return { organizations: await this.organizations.listForUser(current!.userId) }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateOrganizationDto, @CurrentUser() current: AuthRequest['user']) {
    const organization = await this.organizations.create({
      name: dto.name,
      slug: dto.slug,
      ownerUserId: current!.userId,
    })
    return { organization: await this.organizations.getForUser(current!.userId, organization.id) }
  }

  @Get(':id')
  @OrgAccess()
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() current: AuthRequest['user'],
  ) {
    return { organization: await this.organizations.getForUser(current!.userId, id) }
  }

  @Patch(':id')
  @OrgPermissions('organization.update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() current: AuthRequest['user'],
  ) {
    return {
      organization: await this.organizations.update(id, current!.userId, {
        name: dto.name,
        slug: dto.slug,
      }),
    }
  }

  @Get(':id/members')
  @OrgPermissions('organization.members.read')
  async members(@Param('id', ParseUUIDPipe) id: string) {
    return { members: await this.organizations.listMembers(id) }
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  @OrgPermissions('organization.members.manage')
  async addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() current: AuthRequest['user'],
  ) {
    return {
      member: await this.organizations.addMember(id, current!.userId, {
        email: dto.email,
        roleId: dto.roleId,
      }),
    }
  }

  @Patch(':id/members/:memberId')
  @OrgPermissions('organization.members.manage')
  async updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() current: AuthRequest['user'],
  ) {
    return {
      member: await this.organizations.updateMember(id, memberId, current!.userId, {
        roleId: dto.roleId,
        status: dto.status,
      }),
    }
  }

  @Get(':id/roles')
  @OrgPermissions('organization.roles.read')
  async roles(@Param('id', ParseUUIDPipe) id: string) {
    return { roles: await this.organizations.listRoles(id) }
  }
}
