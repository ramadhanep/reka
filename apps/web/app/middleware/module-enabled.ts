export default defineNuxtRouteMiddleware(async (to) => {
  if (process.server) return

  const moduleRoutes: Record<string, string> = {
    procurement: '/procurement',
    inventory: '/inventory',
    assets: '/assets',
  }

  for (const [moduleId, prefix] of Object.entries(moduleRoutes)) {
    if (to.path.startsWith(prefix)) {
      const { modules, fetchModules } = useModules()
      if (modules.value.length === 0) {
        await fetchModules()
      }
      const mod = modules.value.find((m) => m.id === moduleId)
      if (mod && !mod.enabled) {
        return navigateTo('/module-disabled')
      }
    }
  }
})
