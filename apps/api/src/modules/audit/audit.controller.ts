import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { IsOptional, IsString, IsISO8601 } from 'class-validator'
import { createOrgPermissionGuard } from '../../common/org-permission.guard.js'
import { AuditService, type AuditLogView } from './audit.service.js'

const AuditReadGuard = createOrgPermissionGuard('audit.read')

class QueryAuditLogsDto {
  @IsString()
  organizationId!: string

  @IsOptional()
  @IsString()
  actorId?: string

  @IsOptional()
  @IsString()
  resourceType?: string

  @IsOptional()
  @IsString()
  resourceId?: string

  @IsOptional()
  @IsString()
  action?: string

  @IsOptional()
  @IsISO8601()
  fromDate?: string

  @IsOptional()
  @IsISO8601()
  toDate?: string
}

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @UseGuards(AuditReadGuard)
  async listAuditLogs(@Query() query: QueryAuditLogsDto): Promise<{ logs: AuditLogView[] }> {
    const logs = await this.audit.listAuditLogs({
      organizationId: query.organizationId,
      actorId: query.actorId,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      action: query.action,
      fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
      toDate: query.toDate ? new Date(query.toDate) : undefined,
    })
    return { logs }
  }
}
