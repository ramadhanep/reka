export interface NavItem {
  id: string
  label: string
  path: string
  category: 'platform' | 'business'
  moduleId?: string
}

export const platformNavItems: NavItem[] = [
  {
    id: 'nav-orgs',
    label: 'Organizations',
    path: '/',
    category: 'platform',
  },
  {
    id: 'nav-settings-modules',
    label: 'Modules',
    path: '/settings/modules',
    category: 'platform',
    moduleId: 'module-registry',
  },
]

export const knownBusinessNavItems: NavItem[] = [
  {
    id: 'nav-procurement',
    label: 'Procurement',
    path: '/procurement',
    category: 'business',
    moduleId: 'procurement',
  },
  {
    id: 'nav-assets',
    label: 'Assets',
    path: '/assets',
    category: 'business',
    moduleId: 'assets',
  },
  {
    id: 'nav-hr',
    label: 'HR',
    path: '/hr',
    category: 'business',
    moduleId: 'hr',
  },
  {
    id: 'nav-inventory',
    label: 'Inventory',
    path: '/inventory',
    category: 'business',
    moduleId: 'inventory',
  },
  {
    id: 'nav-finance',
    label: 'Finance',
    path: '/finance',
    category: 'business',
    moduleId: 'finance',
  },
]

export function resolveNavigation(
  enabledModuleIds: string[],
  businessItems: NavItem[] = knownBusinessNavItems,
): NavItem[] {
  const activeBusiness = businessItems.filter(
    (item) => item.moduleId && enabledModuleIds.includes(item.moduleId),
  )
  return [...platformNavItems, ...activeBusiness]
}

export function canManageModules(userPermissions: string[] | undefined, roleKey?: string): boolean {
  if (roleKey === 'owner') {
    return true
  }
  return userPermissions?.includes('module.manage') === true
}
