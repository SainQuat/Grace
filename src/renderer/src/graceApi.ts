import { createDemoStream } from '../../shared/demoStream'
import { fetchProviderModels, normalizeBaseUrl, streamProviderChat } from '../../shared/providerClient'
import type {
  ChatRequestPayload,
  ChatStreamEvent,
  CustomProviderSummary,
  ProviderModel,
  SaveCustomProviderPayload
} from '../../shared/types'

export interface GraceApi {
  startChat(payload: ChatRequestPayload): void
  stopChat(requestId: string): void
  onChatEvent(callback: (event: ChatStreamEvent) => void): () => void
  getCustomProvider(): Promise<CustomProviderSummary>
  saveCustomProvider(payload: SaveCustomProviderPayload): Promise<CustomProviderSummary>
  refreshCustomProviderModels(): Promise<CustomProviderSummary>
}

interface BrowserStoredProvider {
  baseUrl: string
  apiKey: string
  models: ProviderModel[]
  selectedModelId?: string
  updatedAt: string
}

const providerStorageKey = 'grace.customProvider.v1'

export const graceApi: GraceApi = getNativeGraceApi() ?? createBrowserGraceApi()

function getNativeGraceApi(): GraceApi | undefined {
  if (typeof window === 'undefined') return undefined
  return window.graceAI
}

function createBrowserGraceApi(): GraceApi {
  const listeners = new Set<(event: ChatStreamEvent) => void>()
  const activeRequests = new Map<string, AbortController>()

  function emit(event: ChatStreamEvent): void {
    listeners.forEach((listener) => listener(event))
  }

  return {
    startChat(payload) {
      const requestId = payload?.requestId

      if (!requestId || !Array.isArray(payload.messages)) {
        emit({
          type: 'error',
          requestId: requestId || 'unknown',
          message: 'Некорректный запрос чата.'
        })
        return
      }

      const abortController = new AbortController()
      activeRequests.set(requestId, abortController)

      void (async () => {
        try {
          for await (const chunk of createBrowserStream(payload, abortController.signal)) {
            if (abortController.signal.aborted) break
            emit({ type: 'delta', requestId, text: chunk })
          }

          emit({ type: 'done', requestId })
        } catch (error) {
          if (isAbortError(error)) {
            emit({ type: 'done', requestId })
            return
          }

          emit({
            type: 'error',
            requestId,
            message: error instanceof Error ? error.message : 'Неизвестная ошибка генерации.'
          })
        } finally {
          activeRequests.delete(requestId)
        }
      })()
    },

    stopChat(requestId) {
      activeRequests.get(requestId)?.abort()
    },

    onChatEvent(callback) {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    },

    async getCustomProvider() {
      const storedProvider = readStoredProvider()
      return storedProvider ? toSummary(storedProvider) : createEmptySummary()
    },

    async saveCustomProvider(payload) {
      const baseUrl = normalizeBaseUrl(payload.baseUrl)
      const apiKey = payload.apiKey.trim()
      const models = await fetchProviderModels(baseUrl, apiKey)
      const provider: BrowserStoredProvider = {
        baseUrl,
        apiKey,
        models,
        selectedModelId: models[0]?.id,
        updatedAt: new Date().toISOString()
      }

      localStorage.setItem(providerStorageKey, JSON.stringify(provider))
      return toSummary(provider)
    },

    async refreshCustomProviderModels() {
      const storedProvider = readStoredProvider()
      if (!storedProvider) {
        throw new Error('Свой провайдер не настроен.')
      }

      const models = await fetchProviderModels(storedProvider.baseUrl, storedProvider.apiKey)
      const nextProvider: BrowserStoredProvider = {
        ...storedProvider,
        models,
        selectedModelId: storedProvider.selectedModelId ?? models[0]?.id,
        updatedAt: new Date().toISOString()
      }

      localStorage.setItem(providerStorageKey, JSON.stringify(nextProvider))
      return toSummary(nextProvider)
    }
  }
}

async function* createBrowserStream(
  payload: ChatRequestPayload,
  signal: AbortSignal
): AsyncGenerator<string> {
  if (payload.providerKind !== 'custom') {
    yield* createDemoStream(payload)
    return
  }

  const storedProvider = readStoredProvider()
  if (!storedProvider) {
    throw new Error('Свой провайдер не настроен.')
  }

  yield* streamProviderChat(storedProvider.baseUrl, storedProvider.apiKey, payload, signal)
}

function readStoredProvider(): BrowserStoredProvider | null {
  try {
    const storedValue = localStorage.getItem(providerStorageKey)
    if (!storedValue) return null

    const candidate = JSON.parse(storedValue) as Partial<BrowserStoredProvider>
    if (
      typeof candidate.baseUrl !== 'string' ||
      typeof candidate.apiKey !== 'string' ||
      !Array.isArray(candidate.models)
    ) {
      return null
    }

    return {
      baseUrl: candidate.baseUrl,
      apiKey: candidate.apiKey,
      models: candidate.models,
      selectedModelId: candidate.selectedModelId,
      updatedAt: candidate.updatedAt || new Date().toISOString()
    }
  } catch {
    return null
  }
}

function toSummary(provider: BrowserStoredProvider): CustomProviderSummary {
  return {
    baseUrl: provider.baseUrl,
    configured: Boolean(provider.apiKey),
    models: provider.models,
    selectedModelId: provider.selectedModelId,
    updatedAt: provider.updatedAt
  }
}

function createEmptySummary(): CustomProviderSummary {
  return {
    baseUrl: '',
    configured: false,
    models: []
  }
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError'
  )
}
