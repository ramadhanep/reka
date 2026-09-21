export default defineNuxtPlugin(() => {
  const orgContext = useOrganizationContext()

  // Intercept $fetch to add x-organization-id header
  const originalFetch = globalThis.$fetch
  globalThis.$fetch = ((input: any, options: any = {}) => {
    const activeOrgId = orgContext.activeOrgId.value
    if (activeOrgId) {
      options.headers = options.headers || {}
      options.headers['x-organization-id'] = activeOrgId
    }
    return originalFetch(input, options)
  }) as typeof originalFetch
})
