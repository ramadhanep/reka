import { BadRequestException } from '@nestjs/common'

export interface RequestItemRule {
  description?: string | null
  quantity: number
  unit?: string | null
  estimatedUnitPrice?: number
}

export interface OrderedItemRule {
  quantity: number
  unitPrice?: number
}

export interface ReceiptItemRule {
  quantity: number
}

export function assertPositiveQuantity(quantity: number, context: string): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new BadRequestException(`${context} quantity must be a positive integer`)
  }
}

export function assertNonNegativePrice(price: number, context: string): void {
  if (!Number.isInteger(price) || price < 0) {
    throw new BadRequestException(
      `${context} must be a non-negative integer (minor currency units)`,
    )
  }
}

export function validateRequestItemFields(items: RequestItemRule[]): void {
  for (const item of items) {
    if (!item.description?.trim()) {
      throw new BadRequestException('Every purchase request item must have a description')
    }
    assertPositiveQuantity(item.quantity, 'Purchase request item')
    assertNonNegativePrice(item.estimatedUnitPrice ?? 0, 'Estimated unit price')
  }
}

export function validateRequestItemsForSubmit(items: RequestItemRule[]): void {
  if (!items || items.length === 0) {
    throw new BadRequestException('A purchase request must contain at least one item before submit')
  }
  validateRequestItemFields(items)
}

export function validatePurchaseOrderItems(items: OrderedItemRule[]): void {
  if (!items || items.length === 0) {
    throw new BadRequestException('A purchase order must contain at least one item')
  }
  for (const item of items) {
    assertPositiveQuantity(item.quantity, 'Purchase order item')
    assertNonNegativePrice(item.unitPrice ?? 0, 'Unit price')
  }
}

export function validateGoodsReceiptItems(items: ReceiptItemRule[]): void {
  if (!items || items.length === 0) {
    throw new BadRequestException('A goods receipt must contain at least one item')
  }
  for (const item of items) {
    assertPositiveQuantity(item.quantity, 'Goods receipt item')
  }
}
