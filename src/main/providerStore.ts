import { app, safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CustomProviderSummary, ProviderModel } from '../shared/types'

interface StoredProvider {
  baseUrl: string
  encryptedApiKey: string
  models: ProviderModel[]
  selectedModelId?: string
  updatedAt: string
}

const providerFilePath = (): string => join(app.getPath('userData'), 'custom-provider.json')

export async function getCustomProviderSummary(): Promise<CustomProviderSummary> {
  const storedProvider = await readStoredProvider()

  if (!storedProvider) {
    return createEmptySummary()
  }

  return toSummary(storedProvider)
}

export async function saveCustomProvider(args: {
  baseUrl: string
  apiKey: string
  models: ProviderModel[]
  selectedModelId?: string
}): Promise<CustomProviderSummary> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure credential storage is not available on this machine.')
  }

  const provider: StoredProvider = {
    baseUrl: args.baseUrl,
    encryptedApiKey: safeStorage.encryptString(args.apiKey.trim()).toString('base64'),
    models: args.models,
    selectedModelId: args.selectedModelId ?? args.models[0]?.id,
    updatedAt: new Date().toISOString()
  }

  const filePath = providerFilePath()
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(provider, null, 2), 'utf8')

  return toSummary(provider)
}

export async function getCustomProviderSecret(): Promise<{ baseUrl: string; apiKey: string } | null> {
  const storedProvider = await readStoredProvider()

  if (!storedProvider) {
    return null
  }

  return {
    baseUrl: storedProvider.baseUrl,
    apiKey: safeStorage.decryptString(Buffer.from(storedProvider.encryptedApiKey, 'base64'))
  }
}

export async function updateCustomProviderModels(models: ProviderModel[]): Promise<CustomProviderSummary> {
  const storedProvider = await readStoredProvider()

  if (!storedProvider) {
    throw new Error('Custom provider is not configured.')
  }

  return saveCustomProvider({
    baseUrl: storedProvider.baseUrl,
    apiKey: safeStorage.decryptString(Buffer.from(storedProvider.encryptedApiKey, 'base64')),
    models,
    selectedModelId: models.some((model) => model.id === storedProvider.selectedModelId)
      ? storedProvider.selectedModelId
      : models[0]?.id
  })
}

async function readStoredProvider(): Promise<StoredProvider | null> {
  try {
    return JSON.parse(await readFile(providerFilePath(), 'utf8')) as StoredProvider
  } catch {
    return null
  }
}

function toSummary(storedProvider: StoredProvider): CustomProviderSummary {
  return {
    baseUrl: storedProvider.baseUrl,
    configured: true,
    models: storedProvider.models,
    selectedModelId: storedProvider.selectedModelId,
    updatedAt: storedProvider.updatedAt
  }
}

function createEmptySummary(): CustomProviderSummary {
  return {
    baseUrl: '',
    configured: false,
    models: []
  }
}
