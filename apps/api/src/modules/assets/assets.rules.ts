import { BadRequestException } from '@nestjs/common'

export const ASSET_STATUS = {
  AVAILABLE: 'AVAILABLE',
  ASSIGNED: 'ASSIGNED',
  MAINTENANCE: 'MAINTENANCE',
  RETIRED: 'RETIRED',
} as const

export type AssetStatus = (typeof ASSET_STATUS)[keyof typeof ASSET_STATUS]

export const ASSET_CATEGORIES = [
  'Laptop',
  'Monitor',
  'Phone',
  'Vehicle',
  'Furniture',
  'Equipment',
] as const

export function assertValidStatus(status: string): asserts status is AssetStatus {
  if (!Object.values(ASSET_STATUS).includes(status as AssetStatus)) {
    throw new BadRequestException(`Invalid asset status: ${status}`)
  }
}

export function assertValidCategory(category: string): void {
  if (!ASSET_CATEGORIES.includes(category as (typeof ASSET_CATEGORIES)[number])) {
    throw new BadRequestException(`Invalid asset category: ${category}`)
  }
}

export function assertPositivePrice(price: number, fieldName: string): void {
  if (price < 0) {
    throw new BadRequestException(`${fieldName} must be non-negative`)
  }
}

export function assertValidCurrency(currency: string): void {
  if (currency.length !== 3) {
    throw new BadRequestException('Currency must be a 3-letter ISO code')
  }
}

export function canAssignAsset(status: string): boolean {
  return status === ASSET_STATUS.AVAILABLE
}

export function canReturnAsset(status: string): boolean {
  return status === ASSET_STATUS.ASSIGNED
}

export function canMaintainAsset(status: string): boolean {
  return status === ASSET_STATUS.AVAILABLE || status === ASSET_STATUS.ASSIGNED
}

export function canRetireAsset(status: string): boolean {
  return status !== ASSET_STATUS.RETIRED
}

export function getNextStatusOnAssign(_status: string): AssetStatus {
  return ASSET_STATUS.ASSIGNED
}

export function getNextStatusOnReturn(_status: string): AssetStatus {
  return ASSET_STATUS.AVAILABLE
}

export function getNextStatusOnMaintenance(_status: string): AssetStatus {
  return ASSET_STATUS.MAINTENANCE
}

export function getNextStatusOnRetire(_status: string): AssetStatus {
  return ASSET_STATUS.RETIRED
}
