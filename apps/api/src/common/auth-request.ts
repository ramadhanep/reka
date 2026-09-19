export interface AuthRequest {
  cookies?: Record<string, string | undefined>
  user?: { userId: string }
  organization?: { organizationId: string; membershipId: string; roleId: string }
}
