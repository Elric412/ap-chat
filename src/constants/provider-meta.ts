import type { ProviderId } from '../types/models';

export interface ProviderMeta {
  displayName: string;
  colorVar: string;
  keyPattern: RegExp;
  keyPrefix: string;
  baseUrl: string;
}

export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  openai: {
    displayName: 'OpenAI',
    colorVar: '--color-provider-openai',
    keyPattern: /^sk-[a-zA-Z0-9_-]{20,}$/,
    keyPrefix: 'sk-',
    baseUrl: 'https://api.openai.com/v1',
  },
  anthropic: {
    displayName: 'Anthropic',
    colorVar: '--color-provider-anthropic',
    keyPattern: /^sk-ant-[a-zA-Z0-9_-]{20,}$/,
    keyPrefix: 'sk-ant-',
    baseUrl: 'https://api.anthropic.com',
  },
  google: {
    displayName: 'Google',
    colorVar: '--color-provider-google',
    keyPattern: /^AIza[a-zA-Z0-9_-]{30,}$/,
    keyPrefix: 'AIza',
    baseUrl: 'https://generativelanguage.googleapis.com',
  },
  mistral: {
    displayName: 'Mistral',
    colorVar: '--color-provider-mistral',
    keyPattern: /^[a-zA-Z0-9]{20,}$/,
    keyPrefix: '',
    baseUrl: 'https://api.mistral.ai/v1',
  },
  groq: {
    displayName: 'Groq',
    colorVar: '--color-provider-groq',
    keyPattern: /^gsk_[a-zA-Z0-9]{20,}$/,
    keyPrefix: 'gsk_',
    baseUrl: 'https://api.groq.com/openai/v1',
  },
  cohere: {
    displayName: 'Cohere',
    colorVar: '--color-provider-cohere',
    keyPattern: /^[a-zA-Z0-9]{20,}$/,
    keyPrefix: '',
    baseUrl: 'https://api.cohere.ai/v1',
  },
  together: {
    displayName: 'Together AI',
    colorVar: '--color-provider-together',
    keyPattern: /^[a-zA-Z0-9]{20,}$/,
    keyPrefix: '',
    baseUrl: 'https://api.together.xyz/v1',
  },
  ollama: {
    displayName: 'Ollama',
    colorVar: '--color-provider-ollama',
    keyPattern: /^.*$/,
    keyPrefix: '',
    baseUrl: 'http://localhost:11434',
  },
  kimi: {
    displayName: 'Kimi',
    colorVar: '--color-provider-kimi',
    keyPattern: /^[a-zA-Z0-9_-]{20,}$/,
    keyPrefix: '',
    baseUrl: 'https://api.kimi.com/coding/v1',
  },
} as const;
