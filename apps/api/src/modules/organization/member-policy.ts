export interface MemberChangeContext {
  ownerRoleKey: string
  currentRoleKey: string
  targetRoleKey: string
  currentStatus: string
  nextStatus?: string
  ownerCount: number
}

export function canChangeMembership(ctx: MemberChangeContext): boolean {
  const isOwner = ctx.currentRoleKey === ctx.ownerRoleKey
  if (!isOwner) {
    return true
  }
  const demoted = ctx.targetRoleKey !== ctx.ownerRoleKey
  const deactivated = ctx.currentStatus === 'active' && ctx.nextStatus === 'inactive'
  const lastOwner = ctx.ownerCount <= 1
  return !lastOwner || !(demoted || deactivated)
}
