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
import { CreateGoodsReceiptDto } from './dto/procurement.dto.js'
import { ProcurementPermissions } from './procurement-access.guard.js'
import { ProcurementService } from './procurement.service.js'

@Controller('goods-receipts')
@RequireModule('procurement')
@UseGuards(ModuleEnabledGuard)
export class GoodsReceiptsController {
  constructor(private readonly procurement: ProcurementService) {}

  @Get()
  @ProcurementPermissions('procurement.goods_receipt.read')
  async list(@Req() req: AuthRequest) {
    return {
      goodsReceipts: await this.procurement.listGoodsReceipts(req.organization!.organizationId),
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ProcurementPermissions('procurement.goods_receipt.create')
  async create(@Body() dto: CreateGoodsReceiptDto, @Req() req: AuthRequest) {
    return {
      goodsReceipt: await this.procurement.createGoodsReceipt(
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }

  @Get(':id')
  @ProcurementPermissions('procurement.goods_receipt.read')
  async get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return {
      goodsReceipt: await this.procurement.getGoodsReceipt(id, req.organization!.organizationId),
    }
  }
}
