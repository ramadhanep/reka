import type { RekaModule } from '@reka/contracts'

export const coreModuleManifest: RekaModule = {
  id: 'core',
  version: '0.1.0',
  displayName: 'Core Platform',
  description: 'Foundational framework and bootstrapping capabilities',
  category: 'platform',
  dependencies: [],
}

export const identityModuleManifest: RekaModule = {
  id: 'identity',
  version: '0.1.0',
  displayName: 'Identity & Authentication',
  description: 'User management, credentials, and session handling',
  category: 'platform',
  dependencies: ['core'],
  permissions: ['auth.login', 'auth.logout', 'session.read'],
}

export const accessModuleManifest: RekaModule = {
  id: 'access',
  version: '0.1.0',
  displayName: 'Access & Authorization',
  description: 'Role-based access control and permissions evaluation',
  category: 'platform',
  dependencies: ['core', 'identity'],
  permissions: ['module.read', 'module.manage'],
}

export const organizationModuleManifest: RekaModule = {
  id: 'organization',
  version: '0.1.0',
  displayName: 'Organization Management',
  description: 'Organizations, memberships, and tenant-level settings',
  category: 'platform',
  dependencies: ['core', 'identity', 'access'],
  permissions: [
    'organization.read',
    'organization.update',
    'organization.members.read',
    'organization.members.manage',
    'organization.roles.read',
  ],
}

export const auditModuleManifest: RekaModule = {
  id: 'audit',
  version: '0.1.0',
  displayName: 'Audit Logging',
  description: 'Immutable trail of administrative and security events',
  category: 'platform',
  dependencies: ['core'],
}

export const moduleRegistryManifest: RekaModule = {
  id: 'module-registry',
  version: '0.1.0',
  displayName: 'Module Registry',
  description: 'Runtime module registration and lifecycle management',
  category: 'platform',
  dependencies: ['core', 'access', 'audit'],
  permissions: ['module.read', 'module.manage'],
}

export const workflowModuleManifest: RekaModule = {
  id: 'workflow',
  version: '0.1.0',
  displayName: 'Workflow Engine',
  description: 'Generic state machine and workflow execution engine',
  category: 'platform',
  dependencies: ['core', 'access', 'audit', 'organization'],
  permissions: [
    'workflow.definition.read',
    'workflow.definition.manage',
    'workflow.instance.read',
    'workflow.instance.create',
    'workflow.instance.transition',
  ],
  menus: [
    {
      id: 'settings-workflows-menu',
      label: 'Workflows',
      path: '/settings/workflows',
      order: 50,
    },
  ],
}

export const platformManifests: RekaModule[] = [
  coreModuleManifest,
  identityModuleManifest,
  accessModuleManifest,
  organizationModuleManifest,
  auditModuleManifest,
  moduleRegistryManifest,
  workflowModuleManifest,
]

export const procurementModuleManifest: RekaModule = {
  id: 'procurement',
  version: '0.2.0',
  displayName: 'Procurement',
  description: 'Purchase requests, vendor approvals, purchase orders, and goods receipt',
  category: 'business',
  dependencies: ['organization', 'access', 'audit', 'workflow'],
  permissions: [
    'procurement.vendor.read',
    'procurement.vendor.manage',
    'procurement.purchase_request.read',
    'procurement.purchase_request.create',
    'procurement.purchase_request.submit',
    'procurement.purchase_request.approve',
    'procurement.purchase_request.reject',
    'procurement.purchase_order.read',
    'procurement.purchase_order.create',
    'procurement.purchase_order.issue',
    'procurement.goods_receipt.read',
    'procurement.goods_receipt.create',
  ],
  routes: [
    '/procurement',
    '/procurement/vendors',
    '/procurement/purchase-requests',
    '/procurement/purchase-orders',
    '/procurement/goods-receipts',
  ],
  menus: [
    {
      id: 'procurement-menu',
      label: 'Procurement',
      path: '/procurement',
      order: 10,
    },
  ],
}

export const assetsModuleManifest: RekaModule = {
  id: 'assets',
  version: '0.1.0',
  displayName: 'Asset Management',
  description: 'Physical and digital asset tracking and assignments',
  category: 'business',
  dependencies: ['organization', 'access', 'audit'],
  menus: [
    {
      id: 'assets-menu',
      label: 'Assets',
      path: '/assets',
      order: 20,
    },
  ],
}

export const hrModuleManifest: RekaModule = {
  id: 'hr',
  version: '0.1.0',
  displayName: 'Human Resources',
  description: 'Employee profiles, departments, and directory',
  category: 'business',
  dependencies: ['organization', 'access', 'audit'],
  menus: [
    {
      id: 'hr-menu',
      label: 'HR',
      path: '/hr',
      order: 30,
    },
  ],
}

export const inventoryModuleManifest: RekaModule = {
  id: 'inventory',
  version: '0.1.0',
  displayName: 'Inventory',
  description: 'Stock levels, warehouse management, and item catalogs',
  category: 'business',
  dependencies: ['organization', 'assets'],
  menus: [
    {
      id: 'inventory-menu',
      label: 'Inventory',
      path: '/inventory',
      order: 40,
    },
  ],
}

export const initialBusinessManifests: RekaModule[] = [
  procurementModuleManifest,
  assetsModuleManifest,
  hrModuleManifest,
  inventoryModuleManifest,
]

export interface RegisterableModuleRegistry {
  register(module: RekaModule): void
}

export function registerProcurementModule(registry: RegisterableModuleRegistry): void {
  registry.register(procurementModuleManifest)
}

export function registerAssetsModule(registry: RegisterableModuleRegistry): void {
  registry.register(assetsModuleManifest)
}

export function registerHrModule(registry: RegisterableModuleRegistry): void {
  registry.register(hrModuleManifest)
}

export function registerInventoryModule(registry: RegisterableModuleRegistry): void {
  registry.register(inventoryModuleManifest)
}
