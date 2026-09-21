import { BadRequestException } from '@nestjs/common'

export const ITEM_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const

export type ItemStatus = (typeof ITEM_STATUS)[keyof typeof ITEM_STATUS]

export const WAREHOUSE_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const

export type WarehouseStatus = (typeof WAREHOUSE_STATUS)[keyof typeof WAREHOUSE_STATUS]

export const MOVEMENT_TYPE = {
  RECEIPT: 'RECEIPT',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
  ADJUSTMENT_IN: 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT: 'ADJUSTMENT_OUT',
  ISSUE: 'ISSUE',
} as const

export type MovementType = (typeof MOVEMENT_TYPE)[keyof typeof MOVEMENT_TYPE]

export const REFERENCE_TYPE = {
  GOODS_RECEIPT: 'GOODS_RECEIPT',
  TRANSFER: 'TRANSFER',
  ADJUSTMENT: 'ADJUSTMENT',
  ISSUE: 'ISSUE',
} as const

export type ReferenceType = (typeof REFERENCE_TYPE)[keyof typeof REFERENCE_TYPE]

export const ADJUSTMENT_REASONS = ['DAMAGED', 'LOST', 'COUNT_CORRECTION', 'FOUND', 'OTHER'] as const

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]

/** Maximum fractional precision supported by stock quantities (NUMERIC(18,4)). */
export const QUANTITY_SCALE = 4

/** Upper bound on stock quantities; safely inside NUMERIC(18,4) and away from IEEE-754 rounding edge cases. */
export const MAX_QUANTITY = 10_000_000_000_000

export function assertValidQuantity(value: number, label = 'Quantity'): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${label} must be a finite number`)
  }
  if (value <= 0) {
    throw new BadRequestException(`${label} must be positive`)
  }
  if (value > MAX_QUANTITY) {
    throw new BadRequestException(`${label} exceeds the supported maximum`)
  }
  const rounded = Number(value.toFixed(QUANTITY_SCALE))
  if (rounded !== value) {
    throw new BadRequestException(`${label} supports at most ${QUANTITY_SCALE} decimal places`)
  }
}

export function assertValidAdjustmentReason(reason: string): void {
  if (!ADJUSTMENT_REASONS.includes(reason as AdjustmentReason)) {
    throw new BadRequestException(
      `Invalid adjustment reason '${reason}'. Use one of: ${ADJUSTMENT_REASONS.join(', ')}`,
    )
  }
}

export function assertValidItemStatus(status: string): asserts status is ItemStatus {
  if (!Object.values(ITEM_STATUS).includes(status as ItemStatus)) {
    throw new BadRequestException(`Invalid item status: ${status}`)
  }
}

export function assertValidWarehouseStatus(status: string): asserts status is WarehouseStatus {
  if (!Object.values(WAREHOUSE_STATUS).includes(status as WarehouseStatus)) {
    throw new BadRequestException(`Invalid warehouse status: ${status}`)
  }
}

export function canMoveStockAtLocation(locationStatus: string, itemStatus: string): boolean {
  if (itemStatus !== ITEM_STATUS.ACTIVE) return false
  return locationStatus !== 'INACTIVE'
}

export function assertLocationEligibleForStock(
  locationStatus: string,
  locationCode: string,
  itemStatus: string,
): void {
  if (itemStatus !== ITEM_STATUS.ACTIVE) {
    throw new BadRequestException('Stock operations require an active inventory item')
  }
  if (locationStatus === 'INACTIVE') {
    throw new BadRequestException(`Location '${locationCode}' is inactive`)
  }
}
