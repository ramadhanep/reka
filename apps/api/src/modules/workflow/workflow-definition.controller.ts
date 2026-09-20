import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import type { AuthRequest } from '../../common/auth-request.js'
import { ModuleEnabledGuard } from '../module-registry/module-enabled.guard.js'
import { RequireModule } from '../module-registry/require-module.decorator.js'
import {
  CreateWorkflowDefinitionBodyDto,
  UpdateWorkflowDefinitionBodyDto,
} from './dto/workflow.dto.js'
import { WorkflowPermissions } from './workflow-access.guard.js'
import { WorkflowService } from './workflow.service.js'

@Controller('workflows')
@RequireModule('workflow')
@UseGuards(ModuleEnabledGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class WorkflowDefinitionController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get()
  @WorkflowPermissions('workflow.definition.read')
  async listDefinitions(@Req() req: AuthRequest) {
    const orgId = req.organization?.organizationId
    const workflows = await this.workflowService.listDefinitions(orgId)
    return { workflows }
  }

  @Get(':id')
  @WorkflowPermissions('workflow.definition.read')
  async getDefinition(@Param('id') id: string, @Req() req: AuthRequest) {
    const orgId = req.organization?.organizationId
    const workflow = await this.workflowService.getDefinition(id, orgId)
    return { workflow }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @WorkflowPermissions('workflow.definition.manage')
  async createDefinition(@Body() body: CreateWorkflowDefinitionBodyDto, @Req() req: AuthRequest) {
    const actorId = req.user!.userId
    const orgId = req.organization?.organizationId
    const workflow = await this.workflowService.createDefinition(body, actorId, orgId)
    return { workflow }
  }

  @Patch(':id')
  @WorkflowPermissions('workflow.definition.manage')
  async updateDefinition(
    @Param('id') id: string,
    @Body() body: UpdateWorkflowDefinitionBodyDto,
    @Req() req: AuthRequest,
  ) {
    const actorId = req.user!.userId
    const orgId = req.organization?.organizationId
    const workflow = await this.workflowService.updateDefinition(id, body, actorId, orgId)
    return { workflow }
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @WorkflowPermissions('workflow.definition.manage')
  async publishDefinition(@Param('id') id: string, @Req() req: AuthRequest) {
    const actorId = req.user!.userId
    const orgId = req.organization?.organizationId
    const workflow = await this.workflowService.updateDefinition(
      id,
      { status: 'active' },
      actorId,
      orgId,
    )
    return { workflow }
  }

  @Post(':id/version')
  @HttpCode(HttpStatus.CREATED)
  @WorkflowPermissions('workflow.definition.manage')
  async createNextVersion(@Param('id') id: string, @Req() req: AuthRequest) {
    const actorId = req.user!.userId
    const orgId = req.organization?.organizationId
    const workflow = await this.workflowService.createNextVersion(id, actorId, orgId)
    return { workflow }
  }
}
