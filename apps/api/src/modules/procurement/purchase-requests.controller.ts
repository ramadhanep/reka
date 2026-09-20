import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { AuthRequest } from '../../common/auth-request.js'
import { ModuleEnabledGuard } from '../module-registry/module-enabled.guard.js'
import { RequireModule } from '../module-registry/require-module.decorator.js'
import {
  CreatePurchaseRequestDto,
  ReviewRequestDto,
  SubmitRequestDto,
} from './dto/procurement.dto.js'
import { ProcurementPermissions } from './procurement-access.guard.js'
import { ProcurementService } from './procurement.service.js'

@Controller('purchase-requests')
@RequireModule('procurement')
@UseGuards(ModuleEnabledGuard)
export class PurchaseRequestsController {
  constructor(private readonly procurement: ProcurementService) {}

  @Get()
  @ProcurementPermissions('procurement.purchase_request.read')
  async list(@Req() req: AuthRequest) {
    return {
      purchaseRequests: await this.procurement.listPurchaseRequests(
        req.organization!.organizationId,
      ),
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ProcurementPermissions('procurement.purchase_request.create')
  async create(@Body() dto: CreatePurchaseRequestDto, @Req() req: AuthRequest) {
    return {
      purchaseRequest: await this.procurement.createPurchaseRequest(
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }

  @Get(':id')
  @ProcurementPermissions('procurement.purchase_request.read')
  async get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return {
      purchaseRequest: await this.procurement.getPurchaseRequest(
        id,
        req.organization!.organizationId,
      ),
    }
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ProcurementPermissions('procurement.purchase_request.submit')
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitRequestDto,
    @Req() req: AuthRequest,
  ) {
    return {
      purchaseRequest: await this.procurement.submitPurchaseRequest(
        id,
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ProcurementPermissions('procurement.purchase_request.approve')
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewRequestDto,
    @Req() req: AuthRequest,
  ) {
    return {
      purchaseRequest: await this.procurement.reviewPurchaseRequest(
        id,
        'approve',
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ProcurementPermissions('procurement.purchase_request.reject')
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewRequestDto,
    @Req() req: AuthRequest,
  ) {
    return {
      purchaseRequest: await this.procurement.reviewPurchaseRequest(
        id,
        'reject',
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }
}
