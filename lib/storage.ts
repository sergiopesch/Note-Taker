export function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function safeGetFromStorage<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  return safeJsonParse<T>(window.localStorage.getItem(key))
}

export function safeSetInStorage(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore quota / serialization issues
  }
}
