export interface AuthenticatedActor {
  id: string
  organizationId: string | null
  roles: string[]
  email?: string
  name?: string
  provider?: 'local' | 'oidc'
  providerId?: string
}

export interface AuthProvider {
  readonly kind: 'local' | 'oidc'
  authenticate(credential: unknown): Promise<AuthenticatedActor>
  getAuthUrl?(state: string): string
  handleCallback?(params: Record<string, string>): Promise<AuthenticatedActor>
}

export interface OIDCProviderConfig {
  issuer: string
  clientId: string
  clientSecret: string
  callbackUrl: string
  scopes?: string[]
}

export class OIDCProvider implements AuthProvider {
  readonly kind = 'oidc' as const
  private readonly config: OIDCProviderConfig
  private readonly issuerMetadata: OIDCIssuerMetadata | null = null

  constructor(config: OIDCProviderConfig) {
    this.config = config
  }

  async authenticate(_credential: unknown): Promise<AuthenticatedActor> {
    throw new Error('OIDC provider uses callback flow, call handleCallback instead')
  }

  getAuthUrl(state: string): string {
    const authUrl = new URL(`${this.config.issuer}/protocol/openid-connect/auth`)
    authUrl.searchParams.set('client_id', this.config.clientId)
    authUrl.searchParams.set('redirect_uri', this.config.callbackUrl)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', this.config.scopes?.join(' ') ?? 'openid profile email')
    authUrl.searchParams.set('state', state)
    return authUrl.toString()
  }

  async handleCallback(params: Record<string, string>): Promise<AuthenticatedActor> {
    const code = params.code
    const error = params.error

    if (error) {
      throw new Error(`OIDC authentication failed: ${error}`)
    }
    if (!code) {
      throw new Error('No authorization code received')
    }

    const tokenResponse = await this.exchangeCodeForTokens(code)
    const userInfo = await this.getUserInfo(tokenResponse.access_token)

    return {
      id: userInfo.sub,
      organizationId: null,
      roles: [],
      email: userInfo.email,
      name: userInfo.name ?? userInfo.preferred_username,
      provider: 'oidc',
      providerId: userInfo.sub,
    }
  }

  private async exchangeCodeForTokens(code: string): Promise<{
    access_token: string
    id_token?: string
    refresh_token?: string
    expires_in: number
    token_type: string
  }> {
    const tokenUrl = `${this.config.issuer}/protocol/openid-connect/token`
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.callbackUrl,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    })

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token exchange failed: ${error}`)
    }

    return response.json() as Promise<{
      access_token: string
      id_token?: string
      refresh_token?: string
      expires_in: number
      token_type: string
    }>
  }

  private async getUserInfo(accessToken: string): Promise<{
    sub: string
    email?: string
    name?: string
    preferred_username?: string
  }> {
    const userInfoUrl = `${this.config.issuer}/protocol/openid-connect/userinfo`
    const response = await fetch(userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch user info')
    }

    return response.json() as Promise<{
      sub: string
      email?: string
      name?: string
      preferred_username?: string
    }>
  }
}

export function createAuthProvider(
  config: { kind: 'local' } | ({ kind: 'oidc' } & OIDCProviderConfig),
): AuthProvider {
  if (config.kind === 'local') {
    return {
      kind: 'local',
      authenticate: async () => {
        throw new Error('Local auth uses session-based authentication')
      },
    }
  }
  return new OIDCProvider(config)
}

interface OIDCIssuerMetadata {
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  jwks_uri: string
}
