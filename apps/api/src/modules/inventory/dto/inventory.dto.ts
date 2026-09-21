import { IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator'

export class CreateInventoryItemDto {
  @IsString()
  @MaxLength(100)
  sku!: string

  @IsString()
  @MaxLength(255)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string
}

export class UpdateInventoryItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string
}

export class CreateWarehouseDto {
  @IsString()
  @MaxLength(50)
  code!: string

  @IsString()
  @MaxLength(255)
  name!: string

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string
}

export class CreateLocationDto {
  @IsUUID()
  warehouseId!: string

  @IsString()
  @MaxLength(50)
  code!: string

  @IsString()
  @MaxLength(255)
  name!: string

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string
}

export class ReceiveStockDto {
  @IsUUID()
  goodsReceiptItemId!: string

  @IsUUID()
  inventoryItemId!: string

  @IsUUID()
  locationId!: string

  @IsNumber()
  @Min(0)
  quantity!: number

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string
}

export class TransferStockDto {
  @IsUUID()
  inventoryItemId!: string

  @IsUUID()
  fromLocationId!: string

  @IsUUID()
  toLocationId!: string

  @IsNumber()
  @Min(0)
  quantity!: number

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string
}

export class AdjustStockDto {
  @IsUUID()
  inventoryItemId!: string

  @IsUUID()
  locationId!: string

  /** Signed quantity: positive = ADJUSTMENT_IN, negative = ADJUSTMENT_OUT. */
  @IsNumber()
  quantity!: number

  @IsIn(['DAMAGED', 'LOST', 'COUNT_CORRECTION', 'FOUND', 'OTHER'])
  reason!: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string
}

export class IssueStockDto {
  @IsUUID()
  inventoryItemId!: string

  @IsUUID()
  locationId!: string

  @IsNumber()
  @Min(0)
  quantity!: number

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reason?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string
}
