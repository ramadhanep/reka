export interface Vendor {
  id: string
  organizationId: string
  name: string
  code: string
  email: string | null
  phone: string | null
  address: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface PurchaseRequestItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  estimatedUnitPrice: number
}

export interface PurchaseRequest {
  id: string
  organizationId: string
  number: string
  title: string
  description: string | null
  currency: string
  status: string
  requesterId: string
  workflowInstanceId: string | null
  createdAt: string
  updatedAt: string
  items: PurchaseRequestItem[]
}

export interface PurchaseOrderItem {
  id: string
  purchaseRequestItemId: string
  description: string
  quantity: number
  unitPrice: number
  receivedQuantity: number
}

export interface PurchaseOrder {
  id: string
  number: string
  vendorId: string
  vendorName: string | null
  purchaseRequestId: string
  purchaseRequestNumber: string | null
  currency: string
  status: string
  issuedAt: string | null
  createdAt: string
  items: PurchaseOrderItem[]
}

export interface GoodsReceiptItem {
  id: string
  purchaseOrderItemId: string
  description: string
  quantity: number
}

export interface GoodsReceipt {
  id: string
  number: string
  purchaseOrderId: string
  purchaseOrderNumber: string | null
  receivedBy: string
  receivedAt: string
  note: string | null
  createdAt: string
  items: GoodsReceiptItem[]
}

export interface ActionResult {
  success: boolean
  error?: string
}

async function run<T>(
  request: () => Promise<T>,
  onError: (message: string) => void,
  fallback: string,
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const data = await request()
    return { success: true, data }
  } catch (e: unknown) {
    const err = e as { data?: { message?: string } }
    const message = err?.data?.message ?? fallback
    onError(message)
    return { success: false, error: message }
  }
}

export function formatMoney(amount: number, currency = 'USD'): string {
  const value = (amount / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${currency} ${value}`
}

export const useProcurement = () => {
  const vendors = useState<Vendor[]>('procurement:vendors', () => [])
  const requests = useState<PurchaseRequest[]>('procurement:requests', () => [])
  const orders = useState<PurchaseOrder[]>('procurement:orders', () => [])
  const receipts = useState<GoodsReceipt[]>('procurement:receipts', () => [])

  const loading = useState<boolean>('procurement:loading', () => false)
  const error = useState<string | null>('procurement:error', () => null)
  const actionMessage = useState<string | null>('procurement:action-message', () => null)
  const api = useApi()

  async function fetchVendors() {
    loading.value = true
    error.value = null
    const res = await run<{ vendors: Vendor[] }>(
      () => api('/api/v1/vendors'),
      (m) => (error.value = m),
      'Failed to load vendors',
    )
    if (res.success) vendors.value = res.data!.vendors
    loading.value = false
  }

  async function fetchRequests() {
    loading.value = true
    error.value = null
    const res = await run<{ purchaseRequests: PurchaseRequest[] }>(
      () => api('/api/v1/purchase-requests'),
      (m) => (error.value = m),
      'Failed to load purchase requests',
    )
    if (res.success) requests.value = res.data!.purchaseRequests
    loading.value = false
  }

  async function fetchOrders() {
    loading.value = true
    error.value = null
    const res = await run<{ purchaseOrders: PurchaseOrder[] }>(
      () => api('/api/v1/purchase-orders'),
      (m) => (error.value = m),
      'Failed to load purchase orders',
    )
    if (res.success) orders.value = res.data!.purchaseOrders
    loading.value = false
  }

  async function fetchReceipts() {
    loading.value = true
    error.value = null
    const res = await run<{ goodsReceipts: GoodsReceipt[] }>(
      () => api('/api/v1/goods-receipts'),
      (m) => (error.value = m),
      'Failed to load goods receipts',
    )
    if (res.success) receipts.value = res.data!.goodsReceipts
    loading.value = false
  }

  function clearAction() {
    actionMessage.value = null
  }

  async function createVendor(body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        api('/api/v1/vendors', {
          method: 'POST',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not create vendor',
    )
    if (res.success) await fetchVendors()
    return { success: res.success, error: res.error }
  }

  async function updateVendor(id: string, body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        api(`/api/v1/vendors/${id}`, {
          method: 'PATCH',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not update vendor',
    )
    if (res.success) await fetchVendors()
    return { success: res.success, error: res.error }
  }

  async function createRequest(body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        api('/api/v1/purchase-requests', {
          method: 'POST',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not create purchase request',
    )
    if (res.success) await fetchRequests()
    return { success: res.success, error: res.error }
  }

  async function requestAction(
    id: string,
    action: 'submit' | 'approve' | 'reject',
    body: Record<string, unknown> = {},
  ): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        api(`/api/v1/purchase-requests/${id}/${action}`, {
          method: 'POST',
          body,
        }),
      (m) => (actionMessage.value = m),
      `Could not ${action} purchase request`,
    )
    if (res.success) await fetchRequests()
    return { success: res.success, error: res.error }
  }

  async function createOrder(body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        api('/api/v1/purchase-orders', {
          method: 'POST',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not create purchase order',
    )
    if (res.success) {
      await Promise.all([fetchOrders(), fetchRequests()])
    }
    return { success: res.success, error: res.error }
  }

  async function issueOrder(id: string): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () => api(`/api/v1/purchase-orders/${id}/issue`, { method: 'POST' }),
      (m) => (actionMessage.value = m),
      'Could not issue purchase order',
    )
    if (res.success) await fetchOrders()
    return { success: res.success, error: res.error }
  }

  async function createReceipt(body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        api('/api/v1/goods-receipts', {
          method: 'POST',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not create goods receipt',
    )
    if (res.success) {
      await Promise.all([fetchReceipts(), fetchOrders()])
    }
    return { success: res.success, error: res.error }
  }

  return {
    vendors,
    requests,
    orders,
    receipts,
    loading,
    error,
    actionMessage,
    fetchVendors,
    fetchRequests,
    fetchOrders,
    fetchReceipts,
    createVendor,
    updateVendor,
    createRequest,
    requestAction,
    createOrder,
    issueOrder,
    createReceipt,
  }
}
