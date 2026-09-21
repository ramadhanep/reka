export interface InventoryItem {
  id: string
  organizationId: string
  sku: string
  name: string
  description: string | null
  unit: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface Warehouse {
  id: string
  organizationId: string
  code: string
  name: string
  status: string
  createdAt: string
  updatedAt: string
  locations?: Location[]
}

export interface Location {
  id: string
  organizationId: string
  warehouseId: string
  code: string
  name: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface StockBalance {
  id: string
  organizationId: string
  inventoryItemId: string
  sku: string
  itemName: string
  unit: string
  locationId: string
  locationCode: string
  locationName: string
  warehouseId: string
  warehouseCode: string
  quantity: number
  updatedAt: string
}

export interface StockMovement {
  id: string
  organizationId: string
  inventoryItemId: string
  sku: string
  itemName: string
  locationId: string
  locationCode: string
  locationName: string
  warehouseId: string
  warehouseCode: string
  type: string
  quantity: number
  referenceType: string
  referenceId: string | null
  reason: string | null
  reference: string | null
  notes: string | null
  actorId: string
  createdAt: string
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

export const useInventory = () => {
  const items = useState<InventoryItem[]>('inventory:items', () => [])
  const warehouses = useState<Warehouse[]>('inventory:warehouses', () => [])
  const locations = useState<Location[]>('inventory:locations', () => [])
  const balances = useState<StockBalance[]>('inventory:balances', () => [])
  const movements = useState<StockMovement[]>('inventory:movements', () => [])
  const loading = useState<boolean>('inventory:loading', () => false)
  const error = useState<string | null>('inventory:error', () => null)
  const actionMessage = useState<string | null>('inventory:action-message', () => null)

  async function fetchItems() {
    loading.value = true
    error.value = null
    const res = await run<{ items: InventoryItem[] }>(
      () => $fetch('/api/v1/inventory/items'),
      (m) => (error.value = m),
      'Failed to load inventory items',
    )
    if (res.success) items.value = res.data!.items
    loading.value = false
  }

  async function fetchWarehouses() {
    loading.value = true
    error.value = null
    const res = await run<{ warehouses: Warehouse[] }>(
      () => $fetch('/api/v1/inventory/warehouses'),
      (m) => (error.value = m),
      'Failed to load warehouses',
    )
    if (res.success) warehouses.value = res.data!.warehouses
    loading.value = false
  }

  async function fetchLocations() {
    loading.value = true
    const res = await run<{ locations: Location[] }>(
      () => $fetch('/api/v1/inventory/locations'),
      (m) => (error.value = m),
      'Failed to load locations',
    )
    if (res.success) locations.value = res.data!.locations
    loading.value = false
  }

  async function fetchStock() {
    loading.value = true
    error.value = null
    const res = await run<{ balances: StockBalance[] }>(
      () => $fetch('/api/v1/inventory/stock'),
      (m) => (error.value = m),
      'Failed to load stock',
    )
    if (res.success) balances.value = res.data!.balances
    loading.value = false
  }

  async function fetchMovements() {
    loading.value = true
    error.value = null
    const res = await run<{ movements: StockMovement[] }>(
      () => $fetch('/api/v1/inventory/movements'),
      (m) => (error.value = m),
      'Failed to load movements',
    )
    if (res.success) movements.value = res.data!.movements
    loading.value = false
  }

  function clearAction() {
    actionMessage.value = null
  }

  async function createItem(body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        $fetch('/api/v1/inventory/items', {
          method: 'POST',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not create item',
    )
    if (res.success) await fetchItems()
    return { success: res.success, error: res.error }
  }

  async function updateItem(id: string, body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        $fetch(`/api/v1/inventory/items/${id}`, {
          method: 'PATCH',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not update item',
    )
    if (res.success) await fetchItems()
    return { success: res.success, error: res.error }
  }

  async function createWarehouse(body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        $fetch('/api/v1/inventory/warehouses', {
          method: 'POST',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not create warehouse',
    )
    if (res.success) await fetchWarehouses()
    return { success: res.success, error: res.error }
  }

  async function createLocation(body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        $fetch('/api/v1/inventory/locations', {
          method: 'POST',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not create location',
    )
    if (res.success) await Promise.all([fetchLocations(), fetchWarehouses()])
    return { success: res.success, error: res.error }
  }

  async function receiveStock(body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        $fetch('/api/v1/inventory/receive', {
          method: 'POST',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not receive stock',
    )
    if (res.success) await Promise.all([fetchStock(), fetchMovements()])
    return { success: res.success, error: res.error }
  }

  async function transferStock(body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        $fetch('/api/v1/inventory/transfer', {
          method: 'POST',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not transfer stock',
    )
    if (res.success) await Promise.all([fetchStock(), fetchMovements()])
    return { success: res.success, error: res.error }
  }

  async function adjustStock(body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        $fetch('/api/v1/inventory/adjust', {
          method: 'POST',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not adjust stock',
    )
    if (res.success) await Promise.all([fetchStock(), fetchMovements()])
    return { success: res.success, error: res.error }
  }

  async function issueStock(body: Record<string, unknown>): Promise<ActionResult> {
    clearAction()
    const res = await run(
      () =>
        $fetch('/api/v1/inventory/issue', {
          method: 'POST',
          body,
        }),
      (m) => (actionMessage.value = m),
      'Could not issue stock',
    )
    if (res.success) await Promise.all([fetchStock(), fetchMovements()])
    return { success: res.success, error: res.error }
  }

  return {
    items,
    warehouses,
    locations,
    balances,
    movements,
    loading,
    error,
    actionMessage,
    clearAction,
    fetchItems,
    fetchWarehouses,
    fetchLocations,
    fetchStock,
    fetchMovements,
    createItem,
    updateItem,
    createWarehouse,
    createLocation,
    receiveStock,
    transferStock,
    adjustStock,
    issueStock,
  }
}
