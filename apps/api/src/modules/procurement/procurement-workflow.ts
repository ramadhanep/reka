import type { CreateWorkflowDefinitionDto } from '../workflow/workflow.service.js'

export const PURCHASE_REQUEST_WORKFLOW_KEY = 'purchase-request'

export const PROCUREMENT_WORKFLOW_DEFINITION = 'purchase-request'

export const PURCHASE_REQUEST_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const

export type PurchaseRequestStatus =
  (typeof PURCHASE_REQUEST_STATUS)[keyof typeof PURCHASE_REQUEST_STATUS]

export const PURCHASE_ORDER_STATUS = {
  DRAFT: 'draft',
  ISSUED: 'issued',
  PARTIALLY_RECEIVED: 'partially_received',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
} as const

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUS)[keyof typeof PURCHASE_ORDER_STATUS]

export const VENDOR_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const

export function procurementWorkflowDefinitionInput(): CreateWorkflowDefinitionDto {
  return {
    key: PURCHASE_REQUEST_WORKFLOW_KEY,
    name: 'Purchase Request Workflow',
    description:
      'Submits a purchase request through review and routes it to approval or rejection.',
    states: [
      { key: 'draft', name: 'Draft', isInitial: true },
      { key: 'submitted', name: 'Submitted (Pending Approval)' },
      { key: 'approved', name: 'Approved', isTerminal: true },
      { key: 'rejected', name: 'Rejected', isTerminal: true },
    ],
    transitions: [
      {
        key: 'submit',
        name: 'Submit for Approval',
        fromStateKey: 'draft',
        toStateKey: 'submitted',
        requiredPermission: 'procurement.purchase_request.submit',
      },
      {
        key: 'approve',
        name: 'Approve Request',
        fromStateKey: 'submitted',
        toStateKey: 'approved',
        requiredPermission: 'procurement.purchase_request.approve',
      },
      {
        key: 'reject',
        name: 'Reject Request',
        fromStateKey: 'submitted',
        toStateKey: 'rejected',
        requiredPermission: 'procurement.purchase_request.reject',
      },
    ],
  }
}
