import { app, safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getProviderPreset, providerPresets } from '../shared/providerPresets'
import type { CustomProviderSummary, ProviderApiFormat, ProviderModel } from '../shared/types'

interface StoredProvider {
  id: string
  label: string
  apiFormat: ProviderApiFormat
  baseUrl: string
  encryptedApiKey: string
  models: ProviderModel[]
  selectedModelId?: string
  updatedAt: string
}

const providersFilePath = (): string => join(app.getPath('userData'), 'provider-connections.json')
const legacyProviderFilePath = (): string => join(app.getPath('userData'), 'custom-provider.json')

export async function getProviderSummaries(): Promise<CustomProviderSummary[]> {
  const storedProviders = await readStoredProviders()

  return providerPresets.map((preset) => {
    const storedProvider = storedProviders.find((provider) => provider.id === preset.id)

    if (!storedProvider) {
      return {
        id: preset.id,
        label: preset.label,
        apiFormat: preset.apiFormat,
        baseUrl: preset.baseUrl,
        configured: false,
        models: []
      }
    }

    return toSummary(storedProvider)
  })
}

export async function getCustomProviderSummary(providerId = 'custom'): Promise<CustomProviderSummary> {
  const summaries = await getProviderSummaries()
  return summaries.find((summary) => summary.id === providerId) ?? createEmptySummary(providerId)
}

export async function saveCustomProvider(args: {
  providerId?: string
  baseUrl: string
  apiKey: string
  apiFormat?: ProviderApiFormat
  label?: string
  models: ProviderModel[]
  selectedModelId?: string
}): Promise<CustomProviderSummary> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Защищенное хранилище ключей недоступно на этой машине.')
  }

  const providerId = args.providerId ?? 'custom'
  const preset = getProviderPreset(providerId)
  const providers = await readStoredProviders()
  const nextProvider: StoredProvider = {
    id: providerId,
    label: args.label ?? preset.label,
    apiFormat: args.apiFormat ?? preset.apiFormat,
    baseUrl: args.baseUrl,
    encryptedApiKey: safeStorage.encryptString(args.apiKey.trim()).toString('base64'),
    models: args.models,
    selectedModelId: args.selectedModelId ?? args.models[0]?.id,
    updatedAt: new Date().toISOString()
  }
  const nextProviders = providers.filter((provider) => provider.id !== providerId).concat(nextProvider)

  await writeStoredProviders(nextProviders)

  return toSummary(nextProvider)
}

export async function getCustomProviderSecret(
  providerId = 'custom'
): Promise<{ baseUrl: string; apiKey: string; apiFormat: ProviderApiFormat } | null> {
  const storedProviders = await readStoredProviders()
  const storedProvider = storedProviders.find((provider) => provider.id === providerId)

  if (!storedProvider) {
    return null
  }

  return {
    baseUrl: storedProvider.baseUrl,
    apiKey: safeStorage.decryptString(Buffer.from(storedProvider.encryptedApiKey, 'base64')),
    apiFormat: storedProvider.apiFormat
  }
}

export async function updateCustomProviderModels(
  providerId: string,
  models: ProviderModel[]
): Promise<CustomProviderSummary> {
  const storedProviders = await readStoredProviders()
  const provider = storedProviders.find((storedProvider) => storedProvider.id === providerId)

  if (!provider) {
    throw new Error('Свой провайдер не настроен.')
  }

  const nextProvider: StoredProvider = {
    ...provider,
    models,
    selectedModelId: models.some((model) => model.id === provider.selectedModelId)
      ? provider.selectedModelId
      : models[0]?.id,
    updatedAt: new Date().toISOString()
  }

  await writeStoredProviders(storedProviders.map((storedProvider) => (storedProvider.id === providerId ? nextProvider : storedProvider)))

  return toSummary(nextProvider)
}

async function readStoredProviders(): Promise<StoredProvider[]> {
  try {
    const parsed = JSON.parse(await readFile(providersFilePath(), 'utf8')) as { providers?: StoredProvider[] }
    return Array.isArray(parsed.providers) ? parsed.providers : []
  } catch {
    const legacyProvider = await readLegacyProvider()
    return legacyProvider ? [legacyProvider] : []
  }
}

async function readLegacyProvider(): Promise<StoredProvider | null> {
  try {
    const legacy = JSON.parse(await readFile(legacyProviderFilePath(), 'utf8')) as Omit<StoredProvider, 'id' | 'label' | 'apiFormat'>
    const preset = getProviderPreset('custom')

    return {
      id: 'custom',
      label: preset.label,
      apiFormat: preset.apiFormat,
      ...legacy
    }
  } catch {
    return null
  }
}

async function writeStoredProviders(providers: StoredProvider[]): Promise<void> {
  const filePath = providersFilePath()
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify({ providers }, null, 2), 'utf8')
}

function toSummary(storedProvider: StoredProvider): CustomProviderSummary {
  return {
    id: storedProvider.id,
    label: storedProvider.label,
    apiFormat: storedProvider.apiFormat,
    baseUrl: storedProvider.baseUrl,
    configured: true,
    models: storedProvider.models,
    selectedModelId: storedProvider.selectedModelId,
    updatedAt: storedProvider.updatedAt
  }
}

function createEmptySummary(providerId: string): CustomProviderSummary {
  const preset = getProviderPreset(providerId)

  return {
    id: preset.id,
    label: preset.label,
    apiFormat: preset.apiFormat,
    baseUrl: preset.baseUrl,
    configured: false,
    models: []
  }
}
