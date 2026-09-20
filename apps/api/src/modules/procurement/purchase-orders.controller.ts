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
import { CreatePurchaseOrderDto } from './dto/procurement.dto.js'
import { ProcurementPermissions } from './procurement-access.guard.js'
import { ProcurementService } from './procurement.service.js'

@Controller('purchase-orders')
@RequireModule('procurement')
@UseGuards(ModuleEnabledGuard)
export class PurchaseOrdersController {
  constructor(private readonly procurement: ProcurementService) {}

  @Get()
  @ProcurementPermissions('procurement.purchase_order.read')
  async list(@Req() req: AuthRequest) {
    return {
      purchaseOrders: await this.procurement.listPurchaseOrders(req.organization!.organizationId),
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ProcurementPermissions('procurement.purchase_order.create')
  async create(@Body() dto: CreatePurchaseOrderDto, @Req() req: AuthRequest) {
    return {
      purchaseOrder: await this.procurement.createPurchaseOrder(
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }

  @Get(':id')
  @ProcurementPermissions('procurement.purchase_order.read')
  async get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return {
      purchaseOrder: await this.procurement.getPurchaseOrder(id, req.organization!.organizationId),
    }
  }

  @Post(':id/issue')
  @HttpCode(HttpStatus.OK)
  @ProcurementPermissions('procurement.purchase_order.issue')
  async issue(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return {
      purchaseOrder: await this.procurement.issuePurchaseOrder(
        id,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }
}
