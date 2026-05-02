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
    displayName: 'Kimi (Moonshot)',
    colorVar: '--color-provider-kimi',
    // Moonshot/Kimi keys are OpenAI-compatible: prefix `sk-` followed by URL-safe chars (letters, digits, -, _).
    // Some keys also embed dots/colons in newer formats — accept the broader OpenAI-compat shape.
    keyPattern: /^sk-[A-Za-z0-9._:-]{16,}$/,
    keyPrefix: 'sk-',
    baseUrl: 'https://api.moonshot.ai/v1',
  },
} as const;
