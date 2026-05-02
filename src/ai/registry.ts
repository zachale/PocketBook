import type { AIProvider, AIProviderConfig } from '../shared/ai/types'
import { OllamaProvider } from './providers/OllamaProvider'
import { OpenRouterProvider } from './providers/OpenRouterProvider'

export function createProvider(config: AIProviderConfig): AIProvider {
  switch (config.provider) {
    case 'ollama':
      return new OllamaProvider(config)
    case 'openrouter':
      return new OpenRouterProvider(config)
  }
}
