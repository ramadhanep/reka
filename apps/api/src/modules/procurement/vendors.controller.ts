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
import { CreateVendorDto, UpdateVendorDto } from './dto/procurement.dto.js'
import { ProcurementPermissions } from './procurement-access.guard.js'
import { ProcurementService } from './procurement.service.js'

@Controller('vendors')
@RequireModule('procurement')
@UseGuards(ModuleEnabledGuard)
export class VendorsController {
  constructor(private readonly procurement: ProcurementService) {}

  @Get()
  @ProcurementPermissions('procurement.vendor.read')
  async list(@Req() req: AuthRequest) {
    return { vendors: await this.procurement.listVendors(req.organization!.organizationId) }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ProcurementPermissions('procurement.vendor.manage')
  async create(@Body() dto: CreateVendorDto, @Req() req: AuthRequest) {
    const vendor = await this.procurement.createVendor(
      dto,
      req.user!.userId,
      req.organization!.organizationId,
    )
    return { vendor }
  }

  @Get(':id')
  @ProcurementPermissions('procurement.vendor.read')
  async get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return { vendor: await this.procurement.getVendor(id, req.organization!.organizationId) }
  }

  @Patch(':id')
  @ProcurementPermissions('procurement.vendor.manage')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorDto,
    @Req() req: AuthRequest,
  ) {
    return {
      vendor: await this.procurement.updateVendor(
        id,
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }
}
