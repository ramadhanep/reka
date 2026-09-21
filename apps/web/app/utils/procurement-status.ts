export interface StatusBadge {
  label: string
  className: string
}

export function statusBadge(status: string): StatusBadge {
  const normalized = status.toLowerCase()
  switch (normalized) {
    case 'active':
    case 'approved':
    case 'issued':
    case 'received':
    case 'available':
      return { label: normalized.replace('_', ' '), className: 'bg-emerald-50 text-emerald-700' }
    case 'draft':
      return { label: 'draft', className: 'bg-amber-50 text-amber-700' }
    case 'submitted':
      return { label: 'pending approval', className: 'bg-blue-50 text-blue-700' }
    case 'rejected':
    case 'cancelled':
    case 'inactive':
    case 'retired':
      return { label: normalized, className: 'bg-red-50 text-red-700' }
    case 'partially_received':
      return { label: 'partially received', className: 'bg-purple-50 text-purple-700' }
    case 'assigned':
    case 'maintenance':
      return { label: normalized, className: 'bg-blue-50 text-blue-700' }
    case 'pending':
      return { label: 'pending', className: 'bg-amber-50 text-amber-700' }
    default:
      return { label: normalized, className: 'bg-slate-100 text-slate-600' }
  }
}
