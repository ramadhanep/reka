export interface RekaUser {
  id: string
  email: string
  displayName: string
  status: string
  createdAt: string
}

export const useAuth = () => {
  const user = useState<RekaUser | null>('auth:user', () => null)
  const status = useState<'loading' | 'authenticated' | 'unauthenticated'>(
    'auth:status',
    () => 'loading',
  )
  const error = useState<string | null>('auth:error', () => null)

  async function refresh() {
    status.value = 'loading'
    try {
      const res = await $fetch<{ user: RekaUser }>('/api/v1/auth/session')
      user.value = res.user
      status.value = 'authenticated'
      error.value = null
    } catch {
      user.value = null
      status.value = 'unauthenticated'
    }
  }

  async function login(email: string, password: string) {
    error.value = null
    try {
      const res = await $fetch<{ user: RekaUser }>('/api/v1/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      user.value = res.user
      status.value = 'authenticated'
      return true
    } catch (e: any) {
      error.value = e?.data?.message ?? 'Login failed'
      return false
    }
  }

  async function logout() {
    try {
      await $fetch('/api/v1/auth/logout', { method: 'POST' })
    } finally {
      user.value = null
      status.value = 'unauthenticated'
      await navigateTo('/login')
    }
  }

  return { user, status, error, refresh, login, logout }
}
