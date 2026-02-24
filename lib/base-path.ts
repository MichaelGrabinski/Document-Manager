// Centralized basePath helper.
// When deployed under a sub-path (e.g. https://host/file), set Next's `basePath`.
// Then use `withBasePath('/api/...')` or `withBasePath('/some/page')` from client code.

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

export function withBasePath(path: string): string {
  if (!path.startsWith('/')) return `${BASE_PATH}/${path}`
  return `${BASE_PATH}${path}`
}
