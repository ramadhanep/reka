export interface AuthenticatedActor {
  id: string
  organizationId: string | null
  roles: string[]
}

export interface AuthProvider {
  readonly kind: 'local' | 'oidc'
  authenticate(credential: unknown): Promise<AuthenticatedActor>
}
