import type { ProviderPreset } from './types'

export const providerPresets: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI / Codex',
    description: 'GPT and Codex-capable OpenAI models.',
    baseUrl: 'https://api.openai.com/v1',
    apiFormat: 'openai',
    modelHint: 'GPT, o-series, Codex-capable models'
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Claude models through the native Anthropic Messages API.',
    baseUrl: 'https://api.anthropic.com/v1',
    apiFormat: 'anthropic',
    modelHint: 'Claude Sonnet, Opus, Haiku'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek chat and reasoner models.',
    baseUrl: 'https://api.deepseek.com/v1',
    apiFormat: 'openai',
    modelHint: 'deepseek-chat, deepseek-reasoner'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'Marketplace access to many hosted model families.',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiFormat: 'openai',
    modelHint: 'Anthropic, OpenAI, Google, Meta, DeepSeek'
  },
  {
    id: 'groq',
    label: 'Groq',
    description: 'Fast hosted inference for open models.',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiFormat: 'openai',
    modelHint: 'Llama, Mixtral, Gemma'
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Gemini through Google’s OpenAI-compatible endpoint.',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiFormat: 'openai',
    modelHint: 'Gemini 2.x models'
  },
  {
    id: 'mistral',
    label: 'Mistral',
    description: 'Mistral hosted models.',
    baseUrl: 'https://api.mistral.ai/v1',
    apiFormat: 'openai',
    modelHint: 'Mistral Large, Codestral'
  },
  {
    id: 'xai',
    label: 'xAI',
    description: 'Grok models through xAI.',
    baseUrl: 'https://api.x.ai/v1',
    apiFormat: 'openai',
    modelHint: 'Grok models'
  },
  {
    id: 'zed',
    label: 'Zed',
    description: 'Zed-hosted OpenAI-compatible models.',
    baseUrl: 'https://api.zed.md/v1',
    apiFormat: 'openai',
    modelHint: 'Zed model gateway'
  },
  {
    id: 'ollama',
    label: 'Ollama',
    description: 'Local OpenAI-compatible Ollama server.',
    baseUrl: 'http://localhost:11434/v1',
    apiFormat: 'openai',
    modelHint: 'Local models'
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    description: 'Local OpenAI-compatible LM Studio server.',
    baseUrl: 'http://localhost:1234/v1',
    apiFormat: 'openai',
    modelHint: 'Local models'
  },
  {
    id: 'custom',
    label: 'Custom provider',
    description: 'Any OpenAI-compatible endpoint.',
    baseUrl: 'https://api.example.com/v1',
    apiFormat: 'openai',
    modelHint: 'OpenAI-compatible models'
  }
]

export function getProviderPreset(providerId = 'custom'): ProviderPreset {
  return providerPresets.find((provider) => provider.id === providerId) ?? providerPresets.at(-1)!
}
