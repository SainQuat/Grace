/// <reference types="vite/client" />

import type {
  ChatRequestPayload,
  ChatStreamEvent,
  CustomProviderSummary,
  SaveCustomProviderPayload
} from '../../shared/types'

declare global {
  interface Window {
    graceAI: {
      startChat(payload: ChatRequestPayload): void
      stopChat(requestId: string): void
      onChatEvent(callback: (event: ChatStreamEvent) => void): () => void
      getCustomProvider(): Promise<CustomProviderSummary>
      getProviders(): Promise<CustomProviderSummary[]>
      saveCustomProvider(payload: SaveCustomProviderPayload): Promise<CustomProviderSummary>
      refreshCustomProviderModels(providerId?: string): Promise<CustomProviderSummary>
    }
  }
}

export {}
