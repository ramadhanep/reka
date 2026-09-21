export interface Organization {
  id: string
  name: string
  code: string
  roleKey: string
  status: string
}

export const useOrganizationContext = () => {
  const organizations = useState<Organization[]>('org-context:organizations', () => [])
  const activeOrgId = useState<string | null>('org-context:active', () => null)
  const loading = useState<boolean>('org-context:loading', () => false)
  const error = useState<string | null>('org-context:error', () => null)

  const activeOrganization = computed(() => {
    return organizations.value.find((org) => org.id === activeOrgId.value) || null
  })

  async function fetchOrganizations() {
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ organizations: Organization[] }>('/api/v1/organizations')
      organizations.value = res.organizations
      if (!activeOrgId.value && res.organizations.length > 0) {
        activeOrgId.value = res.organizations[0]!.id
      }
    } catch (e: any) {
      error.value = e?.data?.message ?? 'Failed to load organizations'
    } finally {
      loading.value = false
    }
  }

  function setActiveOrganization(orgId: string) {
    const org = organizations.value.find((o) => o.id === orgId)
    if (org) {
      activeOrgId.value = orgId
    }
  }

  return {
    organizations,
    activeOrgId,
    activeOrganization,
    loading,
    error,
    fetchOrganizations,
    setActiveOrganization,
  }
}
