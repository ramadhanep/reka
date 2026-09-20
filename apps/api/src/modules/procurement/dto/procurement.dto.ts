import { Type } from 'class-transformer'
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

const INT_MAX = 2_147_483_647

export class CreateVendorDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  name!: string

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/, { message: 'code must be upper-case alphanumeric' })
  @MaxLength(40)
  code!: string

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string
}

export class UpdateVendorDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/, { message: 'code must be upper-case alphanumeric' })
  @MaxLength(40)
  code?: string

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string
}

export class PurchaseRequestItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description!: string

  @IsInt()
  @Min(1)
  @Max(INT_MAX)
  quantity!: number

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  estimatedUnitPrice?: number
}

export class CreatePurchaseRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string

  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestItemDto)
  items?: PurchaseRequestItemDto[]
}

export class PurchaseOrderItemDto {
  @IsUUID()
  purchaseRequestItemId!: string

  @IsInt()
  @Min(1)
  @Max(INT_MAX)
  quantity!: number

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  unitPrice!: number
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  purchaseRequestId!: string

  @IsUUID()
  vendorId!: string

  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[]
}

export class GoodsReceiptItemDto {
  @IsUUID()
  purchaseOrderItemId!: string

  @IsInt()
  @Min(1)
  @Max(INT_MAX)
  quantity!: number
}

export class CreateGoodsReceiptDto {
  @IsUUID()
  purchaseOrderId!: string

  @IsOptional()
  @IsDateString()
  receivedAt?: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptItemDto)
  items!: GoodsReceiptItemDto[]
}

export class SubmitRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string
}

export class ReviewRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string
}
