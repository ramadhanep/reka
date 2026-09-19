export default defineNuxtRouteMiddleware(async (to) => {
  if (process.server) return
  const auth = useAuth()
  if (auth.status.value === 'loading') {
    await auth.refresh()
  }
  if (auth.status.value !== 'authenticated' && to.path !== '/login') {
    return navigateTo('/login')
  }
})
