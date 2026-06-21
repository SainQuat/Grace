/// <reference types="vite/client" />

import type {
  ChatRequestPayload,
  ChatStreamEvent,
  CustomProviderSummary,
  ResponseNotificationPayload,
  ResponseNotificationResult,
  SaveCustomProviderPayload,
  SetupAgentRequestPayload,
  SetupAgentResponse
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
      showResponseNotification(payload: ResponseNotificationPayload): Promise<ResponseNotificationResult>
      askSetupAgent(payload: SetupAgentRequestPayload): Promise<SetupAgentResponse>
    }
  }
}

export {}
