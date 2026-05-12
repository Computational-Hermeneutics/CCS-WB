// Unified AI Client - abstracts multiple providers behind single interface

import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOllama } from "ai-sdk-ollama";
import { NextRequest } from "next/server";
import type {
  AIProvider,
  AIRequestConfig,
  AIValidationResult,
} from "@/types/ai-settings";
import { PROVIDER_CONFIGS, getDefaultModel } from "./config";

// Extract AI configuration from request headers
export function extractAIConfig(request: NextRequest): AIRequestConfig {
  const provider =
    (request.headers.get("X-AI-Provider") as AIProvider) || "anthropic";
  const model =
    request.headers.get("X-AI-Model") || getDefaultModel(provider);
  const apiKey = request.headers.get("X-AI-API-Key") || "";
  const baseUrl = request.headers.get("X-AI-Base-URL") || "";
  const customModelId = request.headers.get("X-AI-Custom-Model") || "";

  // Fallback to environment variables for backwards compatibility
  const effectiveApiKey = apiKey || getEnvApiKey(provider);
  const effectiveModel = customModelId || model;

  return {
    provider,
    model: effectiveModel,
    apiKey: effectiveApiKey,
    baseUrl: baseUrl || getDefaultBaseUrl(provider),
  };
}

function getEnvApiKey(provider: AIProvider): string {
  switch (provider) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY || "";
    case "openai":
      return process.env.OPENAI_API_KEY || "";
    case "google":
      return process.env.GOOGLE_API_KEY || "";
    case "openai-compatible":
      return process.env.OPENAI_COMPATIBLE_API_KEY || "";
    case "openrouter":
      return process.env.OPENROUTER_API_KEY || "";
    case "huggingface":
      return process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "";
    default:
      return "";
  }
}

function getDefaultBaseUrl(provider: AIProvider): string {
  const config = PROVIDER_CONFIGS[provider];
  return config.defaultBaseUrl || "";
}

// Validate AI configuration
export function validateAIConfig(config: AIRequestConfig): AIValidationResult {
  const { provider, apiKey, baseUrl } = config;

  // Check provider is known
  if (!PROVIDER_CONFIGS[provider]) {
    return { valid: false, error: `Unknown provider: ${provider}` };
  }

  const providerConfig = PROVIDER_CONFIGS[provider];

  // Check API key if required
  if (providerConfig.requiresApiKey && !apiKey) {
    return {
      valid: false,
      error: `${providerConfig.name} requires an API key. Please configure it in Settings.`,
      requiresSetup: true,
    };
  }

  // Basic API key format validation
  if (apiKey) {
    if (provider === "anthropic" && !apiKey.startsWith("sk-ant-")) {
      return {
        valid: false,
        error:
          "Invalid Anthropic API key format. Keys should start with 'sk-ant-'",
      };
    }
    if (
      provider === "openai" &&
      !apiKey.startsWith("sk-") &&
      !apiKey.startsWith("sess-")
    ) {
      return {
        valid: false,
        error: "Invalid OpenAI API key format. Keys should start with 'sk-'",
      };
    }
    if (provider === "huggingface" && !apiKey.startsWith("hf_")) {
      return {
        valid: false,
        error: "Invalid Hugging Face token format. Tokens should start with 'hf_'",
      };
    }
    if (provider === "openrouter" && !apiKey.startsWith("sk-or-")) {
      return {
        valid: false,
        error: "Invalid OpenRouter API key format. Keys should start with 'sk-or-'",
      };
    }
  }

  // Validate base URL for providers that need it
  if (provider === "ollama" || provider === "openai-compatible") {
    if (baseUrl) {
      try {
        new URL(baseUrl);
      } catch {
        return { valid: false, error: "Invalid base URL format" };
      }
    } else if (provider === "ollama") {
      // Ollama needs a base URL, use default
      return { valid: true };
    }
  }

  return { valid: true };
}

// Create provider-specific client
function createAIClient(config: AIRequestConfig) {
  const { provider, apiKey, baseUrl } = config;

  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey });

    case "openai":
      return createOpenAI({ apiKey });

    case "google":
      return createGoogleGenerativeAI({ apiKey });

    case "ollama":
      return createOllama({
        baseURL: baseUrl || "http://localhost:11434/api",
      });

    case "openai-compatible": {
      const compat = createOpenAI({
        apiKey,
        baseURL: baseUrl,
      });
      return (modelId: string) => compat.chat(modelId);
    }

    case "openrouter": {
      const or = createOpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
      });
      return (modelId: string) => or.chat(modelId);
    }

    case "huggingface": {
      const hf = createOpenAI({
        apiKey,
        baseURL: "https://router.huggingface.co/v1",
      });
      return (modelId: string) => hf.chat(modelId);
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// Unified function to generate AI responses
export async function generateAIResponse(
  config: AIRequestConfig,
  options: {
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    maxTokens: number;
  }
): Promise<string> {
  const client = createAIClient(config);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await generateText({
      model: client(config.model) as any,
      system: options.system,
      messages: options.messages,
      maxOutputTokens: options.maxTokens,
    });

    // Ensure we have a valid response
    if (!result.text || result.text.trim() === "") {
      console.error("Empty response from AI:", { provider: config.provider, model: config.model, result });
      throw new Error(`${PROVIDER_CONFIGS[config.provider].name} returned an empty response. Please try again.`);
    }

    return result.text;
  } catch (error) {
    // Enhance error messages for common issues
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes("rate limit")) {
        throw new Error(
          `Rate limit exceeded for ${PROVIDER_CONFIGS[config.provider].name}. Please wait and try again.`
        );
      }

      if (
        message.includes("authentication") ||
        message.includes("api key") ||
        message.includes("unauthorized")
      ) {
        throw new Error(
          `Authentication failed for ${PROVIDER_CONFIGS[config.provider].name}. Please check your API key in Settings.`
        );
      }

      if (message.includes("model") && message.includes("not found")) {
        throw new Error(
          `Model "${config.model}" not found. Please select a different model in Settings.`
        );
      }

      if (
        message.includes("connection") ||
        message.includes("econnrefused")
      ) {
        if (config.provider === "ollama") {
          throw new Error(
            "Cannot connect to Ollama. Please ensure Ollama is running with `ollama serve`."
          );
        }
        throw new Error(
          `Cannot connect to ${PROVIDER_CONFIGS[config.provider].name}. Please check your internet connection.`
        );
      }
    }

    throw error;
  }
}

// Check if Ollama is running (useful for UI feedback)
export async function checkOllamaConnection(
  baseUrl?: string
): Promise<boolean> {
  try {
    const url = baseUrl || "http://localhost:11434";
    const response = await fetch(`${url}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Test API connection (for settings UI)
export async function testAIConnection(
  config: AIRequestConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    // For Ollama, just check if server is running
    if (config.provider === "ollama") {
      const isRunning = await checkOllamaConnection(config.baseUrl);
      if (!isRunning) {
        return {
          success: false,
          error:
            "Ollama is not running. Start it with `ollama serve` in your terminal.",
        };
      }
      return { success: true };
    }

    // For other providers, try a minimal API call
    await generateAIResponse(config, {
      system: "You are a helpful assistant.",
      messages: [{ role: "user", content: "Hi" }],
      maxTokens: 5,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Connection test failed",
    };
  }
}
