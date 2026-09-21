/**
 * Organization-aware API fetch.
 *
 * Every application API call should go through this wrapper so the currently
 * selected organization is transmitted as `x-organization-id`. The organization
 * context is read from the same `useState` ref the org switcher mutates, so
 * switching organizations immediately changes the backend request context.
 */
export const useApi = () => {
  const activeOrgId = useState<string | null>('org-context:active', () => null)

  return <T = unknown>(url: string, options: Record<string, any> = {}): Promise<T> => {
    const headers = new Headers((options.headers ?? {}) as HeadersInit)
    if (activeOrgId.value) {
      headers.set('x-organization-id', activeOrgId.value)
    }
    return $fetch<T>(url, { ...options, headers })
  }
}
