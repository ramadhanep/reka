import { IsString, IsOptional, IsNumber, Min, MaxLength, IsUUID, IsISO8601 } from 'class-validator'

export class CreateAssetDto {
  @IsString()
  @MaxLength(100)
  assetTag!: string

  @IsString()
  @MaxLength(255)
  name!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsString()
  @MaxLength(100)
  category!: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string

  @IsOptional()
  @IsISO8601()
  purchaseDate?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string

  @IsOptional()
  @IsUUID()
  vendorId?: string

  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string
}

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string

  @IsOptional()
  @IsISO8601()
  purchaseDate?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string

  @IsOptional()
  @IsUUID()
  vendorId?: string

  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string
}

export class AssignAssetDto {
  @IsUUID()
  assigneeUserId!: string

  @IsOptional()
  @IsString()
  notes?: string
}

export class ReturnAssetDto {
  @IsOptional()
  @IsString()
  notes?: string
}
