export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`
}

export function createDraftTitle(input: string): string {
  const normalized = input.replace(/\s+/g, ' ').trim()
  if (!normalized) return 'New chat'
  return normalized.length > 42 ? `${normalized.slice(0, 39)}...` : normalized
}

export interface ProviderGroupedItem {
  id: string
  provider: string
  providerKind: 'demo' | 'custom'
  hint?: string
}

export interface ProviderModelGroup<T extends ProviderGroupedItem> {
  id: string
  label: string
  detail?: string
  models: T[]
}

export function groupModelsByProvider<T extends ProviderGroupedItem>(models: T[]): ProviderModelGroup<T>[] {
  const groups: ProviderModelGroup<T>[] = []

  for (const model of models) {
    const isCustom = model.providerKind === 'custom'
    const groupId = isCustom ? 'custom' : `demo:${model.provider}`
    const existingGroup = groups.find((group) => group.id === groupId)

    if (existingGroup) {
      existingGroup.models.push(model)
      continue
    }

    groups.push({
      id: groupId,
      label: isCustom ? 'Custom provider' : model.provider,
      detail: isCustom ? model.hint : undefined,
      models: [model]
    })
  }

  return groups
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
