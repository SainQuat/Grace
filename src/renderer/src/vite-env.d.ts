/// <reference types="vite/client" />

import type {
  ChatRequestPayload,
  ChatStreamEvent,
  CustomProviderSummary,
  McpServerSummary,
  ProviderHealthResult,
  ResponseNotificationPayload,
  ResponseNotificationResult,
  SaveCustomProviderPayload,
  SaveMcpServerPayload,
  SetupAgentRequestPayload,
  SetupAgentResponse,
  UpdateMcpServerPayload
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
      checkProviderHealth(providerId?: string): Promise<ProviderHealthResult>
      getMcpServers(): Promise<McpServerSummary[]>
      saveMcpServer(payload: SaveMcpServerPayload): Promise<McpServerSummary>
      updateMcpServer(serverId: string, patch: UpdateMcpServerPayload): Promise<McpServerSummary>
      deleteMcpServer(serverId: string): Promise<void>
      showResponseNotification(payload: ResponseNotificationPayload): Promise<ResponseNotificationResult>
      askSetupAgent(payload: SetupAgentRequestPayload): Promise<SetupAgentResponse>
    }
  }
}

export {}
