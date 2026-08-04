'use strict';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nestedValue of Object.values(value)) deepFreeze(nestedValue);
  return Object.freeze(value);
}

const MANAGED_PROVIDER_IDS = deepFreeze([
  'openai',
  'cerebras',
  'deepseek',
  'mistral',
  'openrouter',
  'gemini',
  'groq',
  'fireworks',
  'together',
  'xai',
  'anthropic'
]);

const MANAGED_PROVIDER_ENVIRONMENT_VARIABLES = deepFreeze({
  openai: 'OPENAI_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  gemini: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  together: 'TOGETHER_API_KEY',
  xai: 'XAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY'
});

const MANAGED_PROVIDER_DEFAULT_MODELS = deepFreeze({
  openai: 'gpt-4o-mini',
  cerebras: 'gemma-4-31b',
  deepseek: 'deepseek-chat',
  mistral: 'mistral-small-latest',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  gemini: 'gemini-3.5-flash',
  groq: 'llama-3.3-70b-versatile',
  fireworks: 'accounts/fireworks/models/gpt-oss-120b',
  together: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  xai: 'grok-3-mini',
  anthropic: 'claude-haiku-4-5-20251001'
});

const MANAGED_PROVIDER_VISION_MODELS = deepFreeze({
  openai: 'gpt-4o-mini',
  gemini: 'gemini-3.5-flash',
  groq: 'meta-llama/llama-4-scout-17b-16e-instruct',
  openrouter: 'google/gemini-2.5-flash',
  anthropic: 'claude-haiku-4-5-20251001'
});

const MANAGED_PROVIDER_ORDER = deepFreeze({
  chat: [
    'openai',
    'cerebras',
    'deepseek',
    'mistral',
    'openrouter',
    'gemini',
    'groq',
    'fireworks',
    'together',
    'xai',
    'anthropic'
  ],
  pdf: ['gemini', 'openai', 'deepseek', 'cerebras', 'mistral', 'openrouter', 'anthropic'],
  vision: ['openai', 'gemini', 'groq', 'openrouter', 'anthropic']
});

const MANAGED_PROVIDER_DISPLAY_NAMES = deepFreeze({
  openai: 'OpenAI Cloud',
  cerebras: 'Cerebras Cloud ☁️',
  deepseek: 'DeepSeek Cloud ☁️',
  mistral: 'Mistral Cloud ☁️',
  openrouter: 'OpenRouter Cloud',
  gemini: 'Gemini Cloud',
  groq: 'Groq Cloud',
  fireworks: 'Fireworks Cloud ☁️',
  together: 'Together Cloud ☁️',
  xai: 'Grok / xAI',
  anthropic: null
});

const MANAGED_PROVIDER_DEFINITIONS = deepFreeze(Object.fromEntries(
  MANAGED_PROVIDER_IDS.map(providerId => {
    const tasks = Object.keys(MANAGED_PROVIDER_ORDER)
      .filter(taskType => MANAGED_PROVIDER_ORDER[taskType].includes(providerId));
    const order = Object.fromEntries(
      tasks.map(taskType => [taskType, MANAGED_PROVIDER_ORDER[taskType].indexOf(providerId)])
    );
    const defaultModel = MANAGED_PROVIDER_DEFAULT_MODELS[providerId];
    const visionModel = MANAGED_PROVIDER_VISION_MODELS[providerId];
    const models = [...new Set([defaultModel, visionModel].filter(Boolean))];

    return [providerId, {
      id: providerId,
      displayName: MANAGED_PROVIDER_DISPLAY_NAMES[providerId],
      aliases: {
        provider: [providerId],
        modelSuffix: [`-${providerId}`]
      },
      environmentVariable: MANAGED_PROVIDER_ENVIRONMENT_VARIABLES[providerId],
      defaultModel,
      visionModel,
      models,
      tasks,
      streaming: false,
      capabilities: {
        chat: tasks.includes('chat'),
        pdf: tasks.includes('pdf'),
        vision: tasks.includes('vision'),
        streaming: false
      },
      order
    }];
  })
));

function getManagedProviderMetadata(environment = {}) {
  const environmentValues = environment && typeof environment === 'object' ? environment : {};
  return deepFreeze(MANAGED_PROVIDER_IDS.map(providerId => {
    const definition = MANAGED_PROVIDER_DEFINITIONS[providerId];
    return {
      ...definition,
      configured: Boolean(environmentValues[definition.environmentVariable])
    };
  }));
}

module.exports = {
  MANAGED_PROVIDER_IDS,
  MANAGED_PROVIDER_ENVIRONMENT_VARIABLES,
  MANAGED_PROVIDER_DEFAULT_MODELS,
  MANAGED_PROVIDER_VISION_MODELS,
  MANAGED_PROVIDER_ORDER,
  MANAGED_PROVIDER_DISPLAY_NAMES,
  MANAGED_PROVIDER_DEFINITIONS,
  getManagedProviderMetadata
};
