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
  Req,
  UseGuards,
} from '@nestjs/common'
import type { AuthRequest } from '../../common/auth-request.js'
import { ModuleEnabledGuard } from '../module-registry/module-enabled.guard.js'
import { RequireModule } from '../module-registry/require-module.decorator.js'
import { AssetsPermissions } from './assets-access.guard.js'
import { AssetsService, type AssetView, type AssetAssignmentView } from './assets.service.js'
import { CreateAssetDto, UpdateAssetDto, AssignAssetDto, ReturnAssetDto } from './dto/assets.dto.js'

@Controller('assets')
@RequireModule('assets')
@UseGuards(ModuleEnabledGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @AssetsPermissions('assets.read')
  async list(@Req() req: AuthRequest): Promise<{ assets: AssetView[] }> {
    return { assets: await this.assets.listAssets(req.organization!.organizationId) }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @AssetsPermissions('assets.create')
  async create(
    @Body() dto: CreateAssetDto,
    @Req() req: AuthRequest,
  ): Promise<{ asset: AssetView }> {
    const asset = await this.assets.createAsset(
      dto,
      req.user!.userId,
      req.organization!.organizationId,
    )
    return { asset }
  }

  @Get(':id')
  @AssetsPermissions('assets.read')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ): Promise<{ asset: AssetView }> {
    return { asset: await this.assets.getAsset(id, req.organization!.organizationId) }
  }

  @Patch(':id')
  @AssetsPermissions('assets.update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetDto,
    @Req() req: AuthRequest,
  ): Promise<{ asset: AssetView }> {
    return {
      asset: await this.assets.updateAsset(
        id,
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.CREATED)
  @AssetsPermissions('assets.assign')
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignAssetDto,
    @Req() req: AuthRequest,
  ): Promise<{ asset: AssetView; assignment: AssetAssignmentView }> {
    return this.assets.assignAsset(id, dto, req.user!.userId, req.organization!.organizationId)
  }

  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @AssetsPermissions('assets.return')
  async return(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnAssetDto,
    @Req() req: AuthRequest,
  ): Promise<{ asset: AssetView; assignment: AssetAssignmentView }> {
    return this.assets.returnAsset(id, dto, req.user!.userId, req.organization!.organizationId)
  }

  @Post(':id/maintenance')
  @HttpCode(HttpStatus.OK)
  @AssetsPermissions('assets.maintain')
  async maintenance(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ): Promise<{ asset: AssetView }> {
    return {
      asset: await this.assets.startMaintenance(
        id,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }

  @Post(':id/retire')
  @HttpCode(HttpStatus.OK)
  @AssetsPermissions('assets.retire')
  async retire(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ): Promise<{ asset: AssetView }> {
    return {
      asset: await this.assets.retireAsset(id, req.user!.userId, req.organization!.organizationId),
    }
  }

  @Get(':id/history')
  @AssetsPermissions('assets.read')
  async history(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ): Promise<{ history: AssetAssignmentView[] }> {
    return { history: await this.assets.getAssetHistory(id, req.organization!.organizationId) }
  }

  @Get(':id/timeline')
  @AssetsPermissions('assets.read')
  async timeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ): Promise<{ timeline: any[] }> {
    return { timeline: await this.assets.getAssetTimeline(id, req.organization!.organizationId) }
  }
}
