import type { ChatRequestPayload, ProviderModel } from './types'

export function normalizeBaseUrl(value: string): string {
  const trimmedValue = value.trim().replace(/\/+$/, '')

  if (!trimmedValue) {
    throw new Error('Base URL обязателен.')
  }

  const parsedUrl = new URL(trimmedValue)
  const isLocalHttp =
    parsedUrl.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname)

  if (parsedUrl.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('Base URL должен использовать HTTPS, кроме localhost.')
  }

  return parsedUrl.toString().replace(/\/+$/, '')
}

export function buildProviderUrl(baseUrl: string, path: string): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBaseUrl}${normalizedPath}`
}

export function parseOpenAIModelList(payload: unknown): ProviderModel[] {
  const modelRows = extractModelRows(payload)
  const seen = new Set<string>()

  return modelRows
    .map((row): ProviderModel | null => {
      if (!row || typeof row !== 'object') return null

      const candidate = row as Record<string, unknown>
      const id = typeof candidate.id === 'string' ? candidate.id : undefined
      const label =
        typeof candidate.name === 'string'
          ? candidate.name
          : typeof candidate.label === 'string'
            ? candidate.label
            : id

      if (!id || !label || seen.has(id)) return null
      seen.add(id)

      return {
        id,
        label,
        ownedBy: typeof candidate.owned_by === 'string' ? candidate.owned_by : undefined,
        created: typeof candidate.created === 'number' ? candidate.created : undefined
      }
    })
    .filter((model): model is ProviderModel => Boolean(model))
}

export async function fetchProviderModels(baseUrl: string, apiKey: string): Promise<ProviderModel[]> {
  const response = await fetch(buildProviderUrl(baseUrl, '/models'), {
    method: 'GET',
    headers: providerHeaders(apiKey)
  })

  if (!response.ok) {
    throw new Error(await createProviderErrorMessage(response, 'models'))
  }

  const payload = await response.json()
  const models = parseOpenAIModelList(payload)

  if (models.length === 0) {
    throw new Error('Провайдер не вернул моделей.')
  }

  return models
}

export async function* streamProviderChat(
  baseUrl: string,
  apiKey: string,
  payload: ChatRequestPayload,
  signal: AbortSignal
): AsyncGenerator<string> {
  const response = await fetch(buildProviderUrl(baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: providerHeaders(apiKey),
    signal,
    body: JSON.stringify({
      model: payload.modelId,
      messages: payload.messages.map((message) => ({
        role: message.role,
        content: message.content
      })),
      stream: true
    })
  })

  if (!response.ok) {
    throw new Error(await createProviderErrorMessage(response, 'chat completion'))
  }

  if (!response.body) {
    throw new Error('Ответ провайдера не содержит stream body.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const text = parseStreamLine(line)
      if (text === '[DONE]') return
      if (text) yield text
    }
  }
}

function extractModelRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []

  const candidate = payload as Record<string, unknown>
  if (Array.isArray(candidate.data)) return candidate.data
  if (Array.isArray(candidate.models)) return candidate.models

  return []
}

function providerHeaders(apiKey: string): Record<string, string> {
  const trimmedApiKey = apiKey.trim()

  if (!trimmedApiKey) {
    throw new Error('API key обязателен.')
  }

  return {
    Authorization: `Bearer ${trimmedApiKey}`,
    'Content-Type': 'application/json'
  }
}

async function createProviderErrorMessage(response: Response, action: string): Promise<string> {
  const body = await response.text()
  const detail = body ? ` ${body.slice(0, 240)}` : ''
  return `Запрос провайдера (${action}) завершился с HTTP ${response.status}.${detail}`
}

function parseStreamLine(line: string): string | null {
  const trimmedLine = line.trim()

  if (!trimmedLine || trimmedLine.startsWith(':')) {
    return null
  }

  if (!trimmedLine.startsWith('data:')) {
    return null
  }

  const data = trimmedLine.slice(5).trim()
  if (data === '[DONE]') return '[DONE]'

  try {
    const payload = JSON.parse(data) as {
      choices?: Array<{
        delta?: { content?: string }
        message?: { content?: string }
        text?: string
      }>
    }

    return (
      payload.choices?.[0]?.delta?.content ??
      payload.choices?.[0]?.message?.content ??
      payload.choices?.[0]?.text ??
      null
    )
  } catch {
    return null
  }
}
