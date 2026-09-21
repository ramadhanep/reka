export interface Asset {
  id: string
  organizationId: string
  assetTag: string
  name: string
  description: string | null
  category: string
  status: string
  serialNumber: string | null
  purchaseDate: string | null
  purchasePrice: number | null
  currency: string | null
  vendorId: string | null
  purchaseOrderId: string | null
  createdAt: string
  updatedAt: string
}

export interface AssetAssignment {
  id: string
  organizationId: string
  assetId: string
  assigneeUserId: string
  assigneeName?: string | null
  assigneeEmail?: string | null
  assignedAt: string
  returnedAt: string | null
  assignedBy: string
  returnedBy: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
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

export function formatAssetMoney(amount: number | null, currency = 'USD'): string {
  if (amount === null || amount === undefined) return '—'
  const value = (amount / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${currency} ${value}`
}

export const useAssets = () => {
  const assets = useState<Asset[]>('assets:list', () => [])
  const history = useState<AssetAssignment[]>('assets:history', () => [])
  const loading = useState<boolean>('assets:loading', () => false)
  const error = useState<string | null>('assets:error', () => null)
  const actionMessage = useState<string | null>('assets:action-message', () => null)
  const api = useApi()

  async function fetchAssets() {
    loading.value = true
    error.value = null
    const res = await run<{ assets: Asset[] }>(
      () => api('/api/v1/assets'),
      (m) => (error.value = m),
      'Failed to load assets',
    )
    if (res.success) assets.value = res.data!.assets
    loading.value = false
  }

  async function fetchAsset(id: string) {
    loading.value = true
    error.value = null
    const res = await run<{ asset: Asset }>(
      () => api(`/api/v1/assets/${id}`),
      (m) => (error.value = m),
      'Failed to load asset',
    )
    loading.value = false
    return res
  }

  async function fetchAssetHistory(id: string) {
    loading.value = true
    error.value = null
    const res = await run<{ history: AssetAssignment[] }>(
      () => api(`/api/v1/assets/${id}/history`),
      (m) => (error.value = m),
      'Failed to load asset history',
    )
    if (res.success) history.value = res.data!.history
    loading.value = false
  }

  function clearAction() {
    actionMessage.value = null
  }

  async function createAsset(body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        api('/api/v1/assets', {
          method: 'POST',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not create asset',
    )
    if (res.success) await fetchAssets()
    return { success: res.success, error: res.error }
  }

  async function updateAsset(id: string, body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        api(`/api/v1/assets/${id}`, {
          method: 'PATCH',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not update asset',
    )
    if (res.success) await fetchAssets()
    return { success: res.success, error: res.error }
  }

  async function assignAsset(id: string, body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        api(`/api/v1/assets/${id}/assign`, {
          method: 'POST',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not assign asset',
    )
    if (res.success) await fetchAssets()
    return { success: res.success, error: res.error }
  }

  async function returnAsset(id: string, body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        api(`/api/v1/assets/${id}/return`, {
          method: 'POST',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not return asset',
    )
    if (res.success) await fetchAssets()
    return { success: res.success, error: res.error }
  }

  async function startMaintenance(id: string): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () => api(`/api/v1/assets/${id}/maintenance`, { method: 'POST' }),
      (m) => (actionMessage.value = m),
      'Could not start maintenance',
    )
    if (res.success) await fetchAssets()
    return { success: res.success, error: res.error }
  }

  async function retireAsset(id: string): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () => api(`/api/v1/assets/${id}/retire`, { method: 'POST' }),
      (m) => (actionMessage.value = m),
      'Could not retire asset',
    )
    if (res.success) await fetchAssets()
    return { success: res.success, error: res.error }
  }

  return {
    assets,
    history,
    loading,
    error,
    actionMessage,
    fetchAssets,
    fetchAsset,
    fetchAssetHistory,
    createAsset,
    updateAsset,
    assignAsset,
    returnAsset,
    startMaintenance,
    retireAsset,
    formatAssetMoney,
  }
}
