import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import type { AuthRequest } from '../../common/auth-request.js'
import { ModuleEnabledGuard } from '../module-registry/module-enabled.guard.js'
import { RequireModule } from '../module-registry/require-module.decorator.js'
import { CreateWorkflowInstanceBodyDto, ExecuteTransitionBodyDto } from './dto/workflow.dto.js'
import { WorkflowPermissions } from './workflow-access.guard.js'
import { WorkflowService } from './workflow.service.js'

@Controller('workflow-instances')
@RequireModule('workflow')
@UseGuards(ModuleEnabledGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class WorkflowInstanceController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @WorkflowPermissions('workflow.instance.create')
  async createInstance(@Body() body: CreateWorkflowInstanceBodyDto, @Req() req: AuthRequest) {
    const actorId = req.user!.userId
    const orgId = req.organization!.organizationId
    const instance = await this.workflowService.createInstance(body, actorId, orgId)
    return { instance }
  }

  @Get(':id')
  @WorkflowPermissions('workflow.instance.read')
  async getInstance(@Param('id') id: string, @Req() req: AuthRequest) {
    const orgId = req.organization!.organizationId
    const instance = await this.workflowService.getInstance(id, orgId)
    return { instance }
  }

  @Get(':id/history')
  @WorkflowPermissions('workflow.instance.read')
  async getInstanceHistory(@Param('id') id: string, @Req() req: AuthRequest) {
    const orgId = req.organization!.organizationId
    const history = await this.workflowService.getInstanceHistory(id, orgId)
    return { history }
  }

  @Post(':id/transitions/:transitionKey')
  @HttpCode(HttpStatus.OK)
  @WorkflowPermissions('workflow.instance.transition')
  async executeTransition(
    @Param('id') id: string,
    @Param('transitionKey') transitionKey: string,
    @Body() body: ExecuteTransitionBodyDto,
    @Req() req: AuthRequest,
  ) {
    const actorId = req.user!.userId
    const orgId = req.organization!.organizationId
    const instance = await this.workflowService.executeTransition(
      id,
      transitionKey,
      body,
      actorId,
      orgId,
    )
    return { instance }
  }
}
