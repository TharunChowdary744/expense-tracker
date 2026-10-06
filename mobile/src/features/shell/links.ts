/**
 * Maps an in-app link written by the web app (e.g. on a notification) to this app's routes:
 * a budget is /budget/:id and a group /group/:id here, because /budgets and /groups are tabs.
 */
export function mobilePath(link: string): string | null {
  if (!link.startsWith('/')) return null
  const [path = '/', search = ''] = link.split('?')
  const query = search ? `?${search}` : ''
  const budget = /^\/budgets\/([^/]+)\/?$/.exec(path)
  if (budget) return `/budget/${budget[1]}${query}`
  const group = /^\/groups\/([^/]+)\/?$/.exec(path)
  if (group) return `/group/${group[1]}${query}`
  return `${path}${query}`
}
