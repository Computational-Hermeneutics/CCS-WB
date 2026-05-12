// Provider configurations and model definitions

import type { AIProvider, ProviderConfig, ModelConfig } from "@/types/ai-settings";
import { loadModelsConfig, type LoadedModels } from "./load-models";

// Cache for dynamically loaded models
let loadedModels: LoadedModels | null = null;
let modelsLoadPromise: Promise<LoadedModels | null> | null = null;

export const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    description: "Run models locally with Ollama - private and free",
    requiresApiKey: false,
    baseUrlConfigurable: true,
    defaultBaseUrl: "http://localhost:11434",
    models: [
      {
        id: "llama3.2",
        name: "Llama 3.2",
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        recommendedFor: ["chat"],
      },
      {
        id: "llama3.1",
        name: "Llama 3.1",
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation"],
      },
      {
        id: "mistral",
        name: "Mistral",
        contextWindow: 32000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        recommendedFor: ["chat"],
      },
      {
        id: "mixtral",
        name: "Mixtral 8x7B",
        contextWindow: 32000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation"],
      },
      {
        id: "custom",
        name: "Custom Model",
        contextWindow: 32000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
    ],
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic (Claude)",
    description: "Claude models from Anthropic - excellent for research and analysis",
    requiresApiKey: true,
    baseUrlConfigurable: false,
    models: [
      {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
      {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        recommendedFor: ["chat", "analysis"],
      },
      {
        id: "custom",
        name: "Custom Model",
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
    ],
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    description: "GPT models from OpenAI - strong reasoning capabilities",
    requiresApiKey: true,
    baseUrlConfigurable: false,
    models: [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsStreaming: true,
        recommendedFor: ["chat", "analysis"],
      },
      {
        id: "o1",
        name: "o1",
        contextWindow: 200000,
        maxOutputTokens: 100000,
        supportsStreaming: true,
        recommendedFor: ["generation", "analysis"],
      },
      {
        id: "o1-mini",
        name: "o1-mini",
        contextWindow: 128000,
        maxOutputTokens: 65536,
        supportsStreaming: true,
        recommendedFor: ["chat", "analysis"],
      },
      {
        id: "custom",
        name: "Custom Model",
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
    ],
  },
  google: {
    id: "google",
    name: "Google (Gemini)",
    description: "Gemini models from Google - large context windows",
    requiresApiKey: true,
    baseUrlConfigurable: false,
    models: [
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        contextWindow: 1048576,
        maxOutputTokens: 65536,
        supportsStreaming: true,
        recommendedFor: ["generation", "analysis"],
      },
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        contextWindow: 1048576,
        maxOutputTokens: 65536,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
      {
        id: "gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash-Lite",
        contextWindow: 1048576,
        maxOutputTokens: 65536,
        supportsStreaming: true,
        recommendedFor: ["chat"],
      },
      {
        id: "custom",
        name: "Custom Model",
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
    ],
  },
  "openai-compatible": {
    id: "openai-compatible",
    name: "OpenAI-Compatible API",
    description: "Any API compatible with OpenAI format (Together, Groq, vLLM, etc.)",
    requiresApiKey: true,
    baseUrlConfigurable: true,
    models: [
      {
        id: "custom",
        name: "Custom Model",
        contextWindow: 32000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
    ],
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    description: "Access 300+ models via a single OpenRouter API key",
    requiresApiKey: true,
    baseUrlConfigurable: false,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    models: [
      {
        id: "anthropic/claude-sonnet-4",
        name: "Claude Sonnet 4",
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o Mini",
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        recommendedFor: ["chat", "analysis"],
      },
      {
        id: "google/gemini-2.0-flash-001",
        name: "Gemini 2.0 Flash",
        contextWindow: 1048576,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct",
        name: "Llama 3.3 70B Instruct",
        contextWindow: 131072,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation"],
      },
      {
        id: "qwen/qwen-2.5-72b-instruct",
        name: "Qwen 2.5 72B Instruct",
        contextWindow: 131072,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
      {
        id: "mistralai/mistral-large",
        name: "Mistral Large",
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation"],
      },
      {
        id: "custom",
        name: "Custom Model",
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
    ],
  },
  huggingface: {
    id: "huggingface",
    name: "Hugging Face",
    description: "Open-weights models via Hugging Face Inference Providers",
    requiresApiKey: true,
    baseUrlConfigurable: false,
    defaultBaseUrl: "https://router.huggingface.co/v1",
    models: [
      {
        id: "meta-llama/Llama-3.3-70B-Instruct",
        name: "Llama 3.3 70B Instruct",
        contextWindow: 131072,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation"],
      },
      {
        id: "meta-llama/Llama-3.1-8B-Instruct",
        name: "Llama 3.1 8B Instruct",
        contextWindow: 131072,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        recommendedFor: ["chat"],
      },
      {
        id: "Qwen/Qwen2.5-72B-Instruct",
        name: "Qwen 2.5 72B Instruct",
        contextWindow: 131072,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
      {
        id: "Qwen/Qwen2.5-Coder-32B-Instruct",
        name: "Qwen 2.5 Coder 32B",
        contextWindow: 131072,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        recommendedFor: ["generation", "analysis"],
      },
      {
        id: "deepseek-ai/DeepSeek-R1",
        name: "DeepSeek R1",
        contextWindow: 163840,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        recommendedFor: ["analysis", "generation"],
      },
      {
        id: "deepseek-ai/DeepSeek-V3",
        name: "DeepSeek V3",
        contextWindow: 131072,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
      {
        id: "custom",
        name: "Custom Model",
        contextWindow: 131072,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        recommendedFor: ["chat", "generation", "analysis"],
      },
    ],
  },
};

// Default model specs (used when models.md doesn't specify full details)
const DEFAULT_MODEL_SPECS: Record<AIProvider, Partial<ModelConfig>> = {
  ollama: { contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, recommendedFor: ["chat", "generation"] },
  anthropic: { contextWindow: 200000, maxOutputTokens: 8192, supportsStreaming: true, recommendedFor: ["chat", "generation", "analysis"] },
  openai: { contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, recommendedFor: ["chat", "generation", "analysis"] },
  google: { contextWindow: 1048576, maxOutputTokens: 65536, supportsStreaming: true, recommendedFor: ["chat", "generation", "analysis"] },
  "openai-compatible": { contextWindow: 32000, maxOutputTokens: 4096, supportsStreaming: true, recommendedFor: ["chat", "generation", "analysis"] },
  openrouter: { contextWindow: 128000, maxOutputTokens: 8192, supportsStreaming: true, recommendedFor: ["chat", "generation", "analysis"] },
  huggingface: { contextWindow: 131072, maxOutputTokens: 4096, supportsStreaming: true, recommendedFor: ["chat", "generation", "analysis"] },
};

/**
 * Load models from models.md file (cached after first load)
 */
export async function initializeModels(): Promise<void> {
  if (loadedModels !== null) return;

  if (!modelsLoadPromise) {
    modelsLoadPromise = loadModelsConfig();
  }

  loadedModels = await modelsLoadPromise;
}

/**
 * Get models for a provider, merging loaded models with defaults
 */
export function getModelsForProvider(provider: AIProvider): ModelConfig[] {
  const baseConfig = PROVIDER_CONFIGS[provider];

  // If no loaded models or provider not in loaded models, use defaults
  if (!loadedModels || !(provider in loadedModels) || provider === "openai-compatible") {
    return baseConfig.models;
  }

  const loaded = loadedModels[provider as keyof LoadedModels];
  if (!loaded || loaded.length === 0) {
    return baseConfig.models;
  }

  // Convert loaded models to ModelConfig, using default specs
  const specs = DEFAULT_MODEL_SPECS[provider];
  const models: ModelConfig[] = loaded.map(m => ({
    id: m.id,
    name: m.name,
    contextWindow: specs.contextWindow || 32000,
    maxOutputTokens: specs.maxOutputTokens || 4096,
    supportsStreaming: specs.supportsStreaming ?? true,
    recommendedFor: specs.recommendedFor || ["chat"],
  }));

  // Always add the "custom" option at the end
  const customModel = baseConfig.models.find(m => m.id === "custom");
  if (customModel) {
    models.push(customModel);
  }

  return models;
}

export function getDefaultModel(provider: AIProvider): string {
  const models = getModelsForProvider(provider);
  return models[0]?.id || "custom";
}

export function getProviderConfig(provider: AIProvider): ProviderConfig {
  return PROVIDER_CONFIGS[provider];
}

/**
 * Get provider config with dynamically loaded models
 */
export function getProviderConfigWithModels(provider: AIProvider): ProviderConfig {
  const baseConfig = PROVIDER_CONFIGS[provider];
  return {
    ...baseConfig,
    models: getModelsForProvider(provider),
  };
}

export function getAllProviders(): ProviderConfig[] {
  return Object.values(PROVIDER_CONFIGS);
}

/**
 * Get all providers with dynamically loaded models
 */
export function getAllProvidersWithModels(): ProviderConfig[] {
  return (Object.keys(PROVIDER_CONFIGS) as AIProvider[]).map(getProviderConfigWithModels);
}

/**
 * Get the display name for a model given provider and model ID
 */
export function getModelDisplayName(provider: AIProvider, modelId: string): string {
  const models = getModelsForProvider(provider);
  const model = models.find(m => m.id === modelId);
  if (model) {
    return model.name;
  }
  // For custom models, return the model ID as-is
  return modelId;
}
