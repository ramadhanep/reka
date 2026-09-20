import { describe, expect, it } from 'vitest'
import { formatDocumentNumber } from './procurement-numbering.js'
import {
  assertNonNegativePrice,
  assertPositiveQuantity,
  validatePurchaseOrderItems,
  validateRequestItemFields,
  validateRequestItemsForSubmit,
} from './procurement-rules.js'
import { procurementWorkflowDefinitionInput } from './procurement-workflow.js'

describe('formatDocumentNumber', () => {
  it('zero-pads the sequence to six digits', () => {
    expect(formatDocumentNumber('PR', 1)).toBe('PR-000001')
    expect(formatDocumentNumber('PO', 123)).toBe('PO-000123')
    expect(formatDocumentNumber('GR', 999999)).toBe('GR-999999')
  })
})

describe('purchase request validation rules', () => {
  it('rejects submit when a request has no items', () => {
    expect(() => validateRequestItemsForSubmit([])).toThrow(/at least one item/)
    expect(() => validateRequestItemsForSubmit(undefined as never)).toThrow(/at least one item/)
  })

  it('rejects items with non-positive quantity', () => {
    expect(() => validateRequestItemsForSubmit([{ description: 'Pen', quantity: 0 }])).toThrow(
      /positive integer/,
    )
    expect(() => validateRequestItemsForSubmit([{ description: 'Pen', quantity: -3 }])).toThrow(
      /positive integer/,
    )
  })

  it('rejects fractional or non-integer quantities', () => {
    expect(() => validateRequestItemsForSubmit([{ description: 'Fabric', quantity: 1.5 }])).toThrow(
      /positive integer/,
    )
  })

  it('rejects negative estimated price but allows zero', () => {
    expect(() =>
      validateRequestItemsForSubmit([
        { description: 'Sample', quantity: 1, estimatedUnitPrice: -1 },
      ]),
    ).toThrow(/non-negative integer/)
    expect(() =>
      validateRequestItemsForSubmit([{ description: 'Free', quantity: 1, estimatedUnitPrice: 0 }]),
    ).not.toThrow()
  })

  it('rejects items without a description', () => {
    expect(() => validateRequestItemsForSubmit([{ description: '', quantity: 1 }])).toThrow(
      /description/,
    )
  })

  it('allows an empty item list for a draft (field-level checks only)', () => {
    expect(() => validateRequestItemFields([])).not.toThrow()
  })
})

describe('purchase order validation rules', () => {
  it('requires at least one item', () => {
    expect(() => validatePurchaseOrderItems([])).toThrow(/at least one item/)
  })

  it('rejects invalid quantity and negative price', () => {
    expect(() => validatePurchaseOrderItems([{ quantity: 0, unitPrice: 100 }])).toThrow()
    expect(() => validatePurchaseOrderItems([{ quantity: 5, unitPrice: -1 }])).toThrow()
    expect(() => validatePurchaseOrderItems([{ quantity: 5, unitPrice: 0 }])).not.toThrow()
  })
})

describe('assertPositiveQuantity / assertNonNegativePrice', () => {
  it('accepts edge values correctly', () => {
    expect(() => assertPositiveQuantity(1, 'x')).not.toThrow()
    expect(() => assertPositiveQuantity(0, 'x')).toThrow()
    expect(() => assertNonNegativePrice(0, 'x')).not.toThrow()
    expect(() => assertNonNegativePrice(-1, 'x')).toThrow()
  })
})

describe('procurement workflow definition', () => {
  it('exposes a generic purchase-request lifecycle through the workflow engine', () => {
    const def = procurementWorkflowDefinitionInput()
    expect(def.key).toBe('purchase-request')
    expect(def.states).toHaveLength(4)
    const initial = def.states!.filter((s) => s.isInitial)
    expect(initial).toHaveLength(1)
    expect(initial[0].key).toBe('draft')
    const terminal = def.states!.filter((s) => s.isTerminal)
    expect(terminal.map((s) => s.key).sort()).toEqual(['approved', 'rejected'])
    const submit = def.transitions!.find((t) => t.key === 'submit')!
    expect(submit.fromStateKey).toBe('draft')
    expect(submit.requiredPermission).toBe('procurement.purchase_request.submit')
    expect(def.transitions!.find((t) => t.key === 'approve')!.requiredPermission).toBe(
      'procurement.purchase_request.approve',
    )
    expect(def.transitions!.find((t) => t.key === 'reject')!.requiredPermission).toBe(
      'procurement.purchase_request.reject',
    )
  })
})
