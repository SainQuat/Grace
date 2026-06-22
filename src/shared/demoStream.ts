import type { ChatRequestPayload } from './types'

export async function* createDemoStream(payload: ChatRequestPayload): AsyncGenerator<string> {
  const latestUserMessage = [...payload.messages].reverse().find((message) => message.role === 'user')
  const prompt = latestUserMessage?.content.trim() || 'новый диалог'
  const selectedTools = payload.tools.length > 0 ? payload.tools.join(', ') : 'без инструментов'
  const attachedFiles =
    payload.files.length > 0 ? payload.files.map((file) => file.name).join(', ') : 'без вложений'

  const response = [
    `Могу помочь с запросом: "${prompt}". `,
    `Сейчас это demo-ответ модели ${payload.modelId} с режимом рассуждения ${payload.effort}. `,
    `Инструменты: ${selectedTools}. Файлы: ${attachedFiles}.`,
    '\n\nПрактичный первый шаг:\n\n',
    '1. Зафиксировать нужный результат.\n',
    '2. Собрать минимальную рабочую версию.\n',
    '3. Уточнить ответ на конкретных примерах или файлах.\n\n',
    '```ts\n',
    'type NextStep = "draft" | "review" | "ship"\n',
    'const nextStep: NextStep = "draft"\n',
    '```\n\n',
    'Когда будет подключен свой провайдер, поток пойдет от выбранной модели через тот же интерфейс чата.'
  ].join('')

  for (const chunk of splitIntoChunks(response, 18)) {
    await delay(42)
    yield chunk
  }
}

function splitIntoChunks(value: string, size: number): string[] {
  const chunks: string[] = []
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size))
  }
  return chunks
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
