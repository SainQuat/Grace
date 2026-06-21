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

export function createNotificationBody(input: string, maxLength = 160): string {
  const normalized = input.replace(/\s+/g, ' ').trim()

  if (!normalized || maxLength <= 0) {
    return ''
  }

  if (normalized.length <= maxLength) {
    return normalized
  }

  const sliceLength = Math.max(0, maxLength - 3)
  return `${normalized.slice(0, sliceLength).trimEnd()}...`
}

export interface ProviderGroupedItem {
  id: string
  provider: string
  providerKind: 'demo' | 'custom'
  providerId?: string
  hint?: string
}

export interface ModelSearchItem extends ProviderGroupedItem {
  modelId?: string
  label?: string
  description?: string
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
    const groupId = isCustom ? `custom:${model.providerId ?? model.provider}` : `demo:${model.provider}`
    const existingGroup = groups.find((group) => group.id === groupId)

    if (existingGroup) {
      existingGroup.models.push(model)
      continue
    }

    groups.push({
      id: groupId,
      label: model.provider,
      detail: isCustom ? model.hint : undefined,
      models: [model]
    })
  }

  return groups
}

export function filterModelsByQuery<T extends ModelSearchItem>(models: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return models
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)

  return models.filter((model) => {
    const searchableText = [
      model.id,
      model.modelId,
      model.label
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return tokens.every((token) => searchableText.includes(token))
  })
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
