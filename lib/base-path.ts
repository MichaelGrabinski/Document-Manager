// Centralized basePath helper.
// When deployed under a sub-path (e.g. https://host/file), set Next's `basePath`.
// Then use `withBasePath('/api/...')` or `withBasePath('/some/page')` from client code.

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

// API_BASE is intentionally empty string for local dev when using the Next proxy rewrite.
// In production (nginx routes /file/api/ → Django), keep it empty too — nginx handles it.
// Only set this to an absolute URL (e.g. http://otherdomain:8000/file) if Django is on
// a completely different host with no proxy in front.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ''

export function withBasePath(path: string): string {
  if (!path.startsWith('/')) return `${BASE_PATH}/${path}`
  return `${BASE_PATH}${path}`
}

export function withApiBase(path: string): string {
  // If API_BASE is set to an absolute URL, use it directly (cross-origin Django).
  if (API_BASE) {
    if (!path.startsWith('/')) return `${API_BASE}/${path}`
    return `${API_BASE}${path}`
  }
  // Same-origin: prefix with BASE_PATH so /api/... becomes /file/api/...
  // This is required when the app is mounted at a sub-path via nginx.
  if (!path.startsWith('/')) return `${BASE_PATH}/${path}`
  return `${BASE_PATH}${path}`
}
