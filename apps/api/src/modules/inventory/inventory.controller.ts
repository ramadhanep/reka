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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { AuthRequest } from '../../common/auth-request.js'
import { ModuleEnabledGuard } from '../module-registry/module-enabled.guard.js'
import { RequireModule } from '../module-registry/require-module.decorator.js'
import { InventoryPermissions } from './inventory-access.guard.js'
import {
  InventoryService,
  type InventoryItemView,
  type WarehouseView,
  type LocationView,
  type OpenStockMovementResult,
  type ReceiveResult,
  type TransferResult,
} from './inventory.service.js'
import type { StockBalanceView, StockMovementView } from './inventory.repo.js'
import {
  AdjustStockDto,
  CreateInventoryItemDto,
  CreateLocationDto,
  CreateWarehouseDto,
  IssueStockDto,
  ReceiveStockDto,
  TransferStockDto,
  UpdateInventoryItemDto,
} from './dto/inventory.dto.js'

@Controller('inventory')
@RequireModule('inventory')
@UseGuards(ModuleEnabledGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('items')
  @InventoryPermissions('inventory.read')
  async listItems(@Req() req: AuthRequest): Promise<{ items: InventoryItemView[] }> {
    return { items: await this.inventory.listItems(req.organization!.organizationId) }
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  @InventoryPermissions('inventory.item.manage')
  async createItem(
    @Body() dto: CreateInventoryItemDto,
    @Req() req: AuthRequest,
  ): Promise<{ item: InventoryItemView }> {
    return {
      item: await this.inventory.createItem(
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }

  @Get('items/:id')
  @InventoryPermissions('inventory.read')
  async getItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ): Promise<{ item: InventoryItemView }> {
    return { item: await this.inventory.getItem(id, req.organization!.organizationId) }
  }

  @Patch('items/:id')
  @InventoryPermissions('inventory.item.manage')
  async updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInventoryItemDto,
    @Req() req: AuthRequest,
  ): Promise<{ item: InventoryItemView }> {
    return {
      item: await this.inventory.updateItem(
        id,
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }

  @Get('warehouses')
  @InventoryPermissions('inventory.read')
  async listWarehouses(@Req() req: AuthRequest): Promise<{ warehouses: WarehouseView[] }> {
    return { warehouses: await this.inventory.listWarehouses(req.organization!.organizationId) }
  }

  @Post('warehouses')
  @HttpCode(HttpStatus.CREATED)
  @InventoryPermissions('inventory.warehouse.manage')
  async createWarehouse(
    @Body() dto: CreateWarehouseDto,
    @Req() req: AuthRequest,
  ): Promise<{ warehouse: WarehouseView }> {
    return {
      warehouse: await this.inventory.createWarehouse(
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }

  @Get('warehouses/:id')
  @InventoryPermissions('inventory.read')
  async getWarehouse(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ): Promise<{ warehouse: WarehouseView; locations: LocationView[] }> {
    return this.inventory.getWarehouse(id, req.organization!.organizationId)
  }

  @Get('locations')
  @InventoryPermissions('inventory.read')
  async listLocations(
    @Query('warehouseId') warehouseId: string | undefined,
    @Req() req: AuthRequest,
  ): Promise<{ locations: LocationView[] }> {
    return {
      locations: await this.inventory.listLocations(
        req.organization!.organizationId,
        warehouseId ?? undefined,
      ),
    }
  }

  @Post('locations')
  @HttpCode(HttpStatus.CREATED)
  @InventoryPermissions('inventory.warehouse.manage')
  async createLocation(
    @Body() dto: CreateLocationDto,
    @Req() req: AuthRequest,
  ): Promise<{ location: LocationView }> {
    return {
      location: await this.inventory.createLocation(
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }

  @Get('stock')
  @InventoryPermissions('inventory.read')
  async listStock(
    @Query('itemId') itemId: string | undefined,
    @Query('locationId') locationId: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined,
    @Req() req: AuthRequest,
  ): Promise<{ balances: StockBalanceView[] }> {
    return {
      balances: await this.inventory.listStock(req.organization!.organizationId, {
        itemId: itemId ?? undefined,
        locationId: locationId ?? undefined,
        warehouseId: warehouseId ?? undefined,
      }),
    }
  }

  @Get('movements')
  @InventoryPermissions('inventory.read')
  async listMovements(
    @Query('itemId') itemId: string | undefined,
    @Query('locationId') locationId: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('type') type: string | undefined,
    @Req() req: AuthRequest,
  ): Promise<{ movements: StockMovementView[] }> {
    return {
      movements: await this.inventory.listMovements(req.organization!.organizationId, {
        itemId: itemId ?? undefined,
        locationId: locationId ?? undefined,
        warehouseId: warehouseId ?? undefined,
        type: type ?? undefined,
      }),
    }
  }

  @Post('receive')
  @HttpCode(HttpStatus.CREATED)
  @InventoryPermissions('inventory.stock.receive')
  async receive(
    @Body() dto: ReceiveStockDto,
    @Req() req: AuthRequest,
  ): Promise<{ result: ReceiveResult }> {
    return {
      result: await this.inventory.receiveStock(
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }

  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
  @InventoryPermissions('inventory.stock.transfer')
  async transfer(
    @Body() dto: TransferStockDto,
    @Req() req: AuthRequest,
  ): Promise<{ result: TransferResult }> {
    return {
      result: await this.inventory.transferStock(
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }

  @Post('adjust')
  @HttpCode(HttpStatus.CREATED)
  @InventoryPermissions('inventory.stock.adjust')
  async adjust(
    @Body() dto: AdjustStockDto,
    @Req() req: AuthRequest,
  ): Promise<{ result: OpenStockMovementResult }> {
    return {
      result: await this.inventory.adjustStock(
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }

  @Post('issue')
  @HttpCode(HttpStatus.CREATED)
  @InventoryPermissions('inventory.stock.issue')
  async issue(
    @Body() dto: IssueStockDto,
    @Req() req: AuthRequest,
  ): Promise<{ result: OpenStockMovementResult }> {
    return {
      result: await this.inventory.issueStock(
        dto,
        req.user!.userId,
        req.organization!.organizationId,
      ),
    }
  }
}
