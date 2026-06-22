export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`
}

export function createDraftTitle(input: string): string {
  const normalized = input.replace(/\s+/g, ' ').trim()
  if (!normalized) return 'Новый чат'
  return normalized.length > 42 ? `${normalized.slice(0, 39)}...` : normalized
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
