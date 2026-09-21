import { describe, expect, it } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import {
  assertValidAdjustmentReason,
  assertValidQuantity,
  ADJUSTMENT_REASONS,
  assertLocationEligibleForStock,
} from './inventory.rules.js'

describe('inventory quantity rules', () => {
  it('accepts integer and fractional quantities within the numeric scale', () => {
    expect(() => assertValidQuantity(5)).not.toThrow()
    expect(() => assertValidQuantity(10)).not.toThrow()
    expect(() => assertValidQuantity(2.5)).not.toThrow()
    expect(() => assertValidQuantity(0.25)).not.toThrow()
  })

  it('rejects zero and negative quantities', () => {
    expect(() => assertValidQuantity(0)).toThrow(BadRequestException)
    expect(() => assertValidQuantity(-3)).toThrow(BadRequestException)
  })

  it('rejects non-finite and non-number input', () => {
    expect(() => assertValidQuantity(Number.NaN)).toThrow(BadRequestException)
    expect(() => assertValidQuantity(Number.POSITIVE_INFINITY)).toThrow(BadRequestException)
    expect(() => assertValidQuantity('5' as unknown as number)).toThrow(BadRequestException)
  })

  it('rejects quantities finer than the supported 4-decimal scale', () => {
    expect(() => assertValidQuantity(0.00001)).toThrow(BadRequestException)
    expect(() => assertValidQuantity(1.12345)).toThrow(BadRequestException)
  })

  it('rejects quantities that would overflow the NUMERIC(18,4) column', () => {
    expect(() => assertValidQuantity(1e20)).toThrow(BadRequestException)
    expect(() => assertValidQuantity(100_000_000_000_000)).toThrow(BadRequestException)
  })
})

describe('inventory adjustment reason rules', () => {
  it('accepts every declared reason', () => {
    for (const reason of ADJUSTMENT_REASONS) {
      expect(() => assertValidAdjustmentReason(reason)).not.toThrow()
    }
  })

  it('rejects unknown reasons', () => {
    expect(() => assertValidAdjustmentReason('SHRUNK')).toThrow(BadRequestException)
    expect(() => assertValidAdjustmentReason('')).toThrow(BadRequestException)
  })
})

describe('inventory stock eligibility rules', () => {
  it('allows stock movement for an active item at an active location', () => {
    expect(() => assertLocationEligibleForStock('ACTIVE', 'STORAGE-A', 'ACTIVE')).not.toThrow()
  })

  it('blocks stock movement at an inactive location', () => {
    expect(() => assertLocationEligibleForStock('INACTIVE', 'STORAGE-A', 'ACTIVE')).toThrow(
      BadRequestException,
    )
  })

  it('blocks stock movement for an inactive item', () => {
    expect(() => assertLocationEligibleForStock('ACTIVE', 'STORAGE-A', 'INACTIVE')).toThrow(
      BadRequestException,
    )
  })
})
