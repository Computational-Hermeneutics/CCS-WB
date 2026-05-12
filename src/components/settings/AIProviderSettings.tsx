"use client";

import { useState, useEffect } from "react";
import { useAISettings } from "@/context/AISettingsContext";
import { PROVIDER_CONFIGS, getAllProviders, initializeModels, getProviderConfigWithModels } from "@/lib/ai/config";
import type { AIProvider } from "@/types/ai-settings";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";

interface AIProviderSettingsProps {
  onClose?: () => void;
}

export function AIProviderSettings({ onClose }: AIProviderSettingsProps) {
  const {
    settings,
    setProvider,
    setModel,
    setApiKey,
    setBaseUrl,
    setCustomModelId,
    setAiEnabled,
    setBeDirectMode,
    setTeachMeMode,
    isConfigured,
    connectionStatus,
    connectionError,
    setConnectionStatus,
  } = useAISettings();

  const [showApiKey, setShowApiKey] = useState(false);
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // Load dynamic models from models.md on mount
  useEffect(() => {
    initializeModels().then(() => setModelsLoaded(true));
  }, []);

  // Use dynamic config that includes loaded models
  const currentProvider = modelsLoaded
    ? getProviderConfigWithModels(settings.provider)
    : PROVIDER_CONFIGS[settings.provider];
  const providers = getAllProviders();

  const handleProviderChange = (provider: AIProvider) => {
    setProvider(provider);
    setIsProviderDropdownOpen(false);
    // Connection status is reset automatically by setProvider in context
  };

  const handleModelChange = (model: string) => {
    setModel(model);
    setIsModelDropdownOpen(false);
  };

  const handleTestConnection = async () => {
    setConnectionStatus("testing");

    try {
      const response = await fetch("/api/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AI-Provider": settings.provider,
          "X-AI-Model": settings.model,
          "X-AI-API-Key": settings.apiKey || "",
          "X-AI-Base-URL": settings.baseUrl || "",
          "X-AI-Custom-Model": settings.customModelId || "",
        },
      });

      const data = await response.json();

      if (data.success) {
        setConnectionStatus("success");
      } else {
        setConnectionStatus("error", data.error || "Connection test failed");
      }
    } catch (error) {
      setConnectionStatus(
        "error",
        error instanceof Error ? error.message : "Connection test failed"
      );
    }
  };

  const showBaseUrl =
    settings.provider === "ollama" ||
    settings.provider === "openai-compatible";
  // Show custom model input whenever "custom" is selected for any provider
  const showCustomModel = settings.model === "custom";

  return (
    <div className="space-y-4">
      {/* AI Enable/Disable Toggle */}
      <div className="flex items-center justify-between pb-3 border-b border-parchment">
        <div>
          <label className="block font-sans text-caption font-medium text-ink">
            Enable AI Assistant
          </label>
          <p className="font-sans text-[10px] text-slate-muted mt-0.5">
            When disabled, you can still annotate code and manage references
          </p>
        </div>
        <button
          onClick={() => setAiEnabled(!settings.aiEnabled)}
          className={cn(
            "w-10 h-5 rounded-full transition-colors relative flex-shrink-0",
            settings.aiEnabled ? "bg-burgundy" : "bg-parchment"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
              settings.aiEnabled ? "translate-x-5" : "translate-x-0"
            )}
          />
        </button>
      </div>

      {/* Provider Selection */}
      <div className={cn(!settings.aiEnabled && "opacity-50 pointer-events-none")}>
        <label className="block font-sans text-[10px] uppercase tracking-widest text-slate-muted mb-1.5">
          AI Provider
        </label>
        <div className="relative">
          <button
            onClick={() => setIsProviderDropdownOpen(!isProviderDropdownOpen)}
            className={cn(
              "w-full flex items-center justify-between px-2.5 py-1.5",
              "bg-card border border-parchment-dark rounded-sm",
              "font-sans text-[11px] text-ink",
              "hover:border-slate-muted transition-colors",
              isProviderDropdownOpen && "ring-1 ring-burgundy border-burgundy"
            )}
          >
            <div>
              <span className="font-medium">{currentProvider.name}</span>
              <span className="text-slate-muted ml-1.5 text-[9px]">
                {currentProvider.description}
              </span>
            </div>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-slate-muted transition-transform",
                isProviderDropdownOpen && "rotate-180"
              )}
            />
          </button>

          {isProviderDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover rounded-sm shadow-editorial-lg border border-parchment py-1 z-50 max-h-64 overflow-y-auto">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => handleProviderChange(provider.id)}
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 font-sans text-[11px]",
                    "hover:bg-cream transition-colors",
                    settings.provider === provider.id &&
                      "bg-burgundy/5 text-burgundy"
                  )}
                >
                  <div className="font-medium">{provider.name}</div>
                  <div className="text-[9px] text-slate-muted">
                    {provider.description}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Model Selection */}
      <div className={cn(!settings.aiEnabled && "opacity-50 pointer-events-none")}>
        <label className="block font-sans text-[10px] uppercase tracking-widest text-slate-muted mb-1.5">
          Model
        </label>
        <div className="relative">
          <button
            onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
            className={cn(
              "w-full flex items-center justify-between px-2.5 py-1.5",
              "bg-card border border-parchment-dark rounded-sm",
              "font-sans text-[11px] text-ink",
              "hover:border-slate-muted transition-colors",
              isModelDropdownOpen && "ring-1 ring-burgundy border-burgundy"
            )}
          >
            <span>
              {currentProvider.models.find((m) => m.id === settings.model)
                ?.name || settings.model}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-slate-muted transition-transform",
                isModelDropdownOpen && "rotate-180"
              )}
            />
          </button>

          {isModelDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover rounded-sm shadow-editorial-lg border border-parchment py-1 z-50 max-h-48 overflow-y-auto">
              {currentProvider.models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleModelChange(model.id)}
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 font-sans text-[11px]",
                    "hover:bg-cream transition-colors",
                    settings.model === model.id && "bg-burgundy/5 text-burgundy"
                  )}
                >
                  {model.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Custom Model ID (for any provider when "custom" is selected) */}
      {showCustomModel && (
        <div className={cn(!settings.aiEnabled && "opacity-50 pointer-events-none")}>
          <label className="block font-sans text-[10px] uppercase tracking-widest text-slate-muted mb-1.5">
            Custom Model ID
          </label>
          <input
            type="text"
            value={settings.customModelId || ""}
            onChange={(e) => setCustomModelId(e.target.value)}
            placeholder={
              settings.provider === "ollama"
                ? "e.g., llama3.2:latest, mistral, codellama"
                : settings.provider === "anthropic"
                  ? "e.g., claude-opus-4-20250514, claude-3-opus-20240229"
                  : settings.provider === "openai"
                    ? "e.g., gpt-4-turbo, o1-preview"
                    : settings.provider === "google"
                      ? "e.g., gemini-1.5-pro-latest, gemini-exp-1206"
                      : settings.provider === "openrouter"
                        ? "e.g., anthropic/claude-opus-4, deepseek/deepseek-chat"
                        : settings.provider === "huggingface"
                          ? "e.g., mistralai/Mistral-7B-Instruct-v0.3"
                          : "Enter model identifier"
            }
            className={cn(
              "w-full px-2.5 py-1.5 bg-card border border-parchment-dark rounded-sm",
              "font-sans text-[11px] text-ink",
              "placeholder:text-slate-muted",
              "focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy"
            )}
          />
          <p className="mt-1 font-sans text-[10px] text-slate-muted">
            Enter the exact model identifier for your provider.
          </p>
        </div>
      )}

      {/* API Key (if required) */}
      {currentProvider.requiresApiKey && (
        <div className={cn(!settings.aiEnabled && "opacity-50 pointer-events-none")}>
          <label className="block font-sans text-[10px] uppercase tracking-widest text-slate-muted mb-1.5">
            API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              value={settings.apiKey || ""}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`Enter your ${currentProvider.name} API key`}
              className={cn(
                "w-full px-2.5 py-1.5 pr-8 bg-card border border-parchment-dark rounded-sm",
                "font-sans text-[11px] text-ink",
                "placeholder:text-slate-muted",
                "focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy"
              )}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-muted hover:text-ink transition-colors"
            >
              {showApiKey ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <p className="mt-1 font-sans text-[10px] text-slate-muted">
            Your API key is stored locally in your browser and never sent to our
            servers.
          </p>
        </div>
      )}

      {/* Base URL (for Ollama and OpenAI-compatible) */}
      {showBaseUrl && (
        <div className={cn(!settings.aiEnabled && "opacity-50 pointer-events-none")}>
          <label className="block font-sans text-[10px] uppercase tracking-widest text-slate-muted mb-1.5">
            Base URL
          </label>
          <input
            type="text"
            value={settings.baseUrl || ""}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={
              settings.provider === "ollama"
                ? "http://localhost:11434"
                : "https://api.example.com/v1"
            }
            className={cn(
              "w-full px-2.5 py-1.5 bg-card border border-parchment-dark rounded-sm",
              "font-sans text-[11px] text-ink",
              "placeholder:text-slate-muted",
              "focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy"
            )}
          />
          {settings.provider === "ollama" && (
            <p className="mt-1 font-sans text-[10px] text-slate-muted">
              Start Ollama with{" "}
              <code className="bg-cream px-1 rounded-sm text-[10px]">ollama serve</code> in
              your terminal.
            </p>
          )}
        </div>
      )}

      {/* Test Connection Button */}
      <div className={cn("pt-1", !settings.aiEnabled && "opacity-50 pointer-events-none")}>
        <button
          onClick={handleTestConnection}
          disabled={connectionStatus === "testing" || !isConfigured || !settings.aiEnabled}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-2.5 py-1.5",
            "font-sans text-[11px] rounded-sm transition-all",
            connectionStatus === "success"
              ? "bg-success/10 text-success border border-success/30"
              : connectionStatus === "error"
                ? "bg-error/10 text-error border border-error/30"
                : "bg-cream text-ink border border-parchment-dark hover:border-burgundy",
            (connectionStatus === "testing" || !isConfigured) &&
              "opacity-50 cursor-not-allowed"
          )}
        >
          {connectionStatus === "testing" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Testing connection...
            </>
          ) : connectionStatus === "success" ? (
            <>
              <CheckCircle className="h-3.5 w-3.5" />
              Connection successful
            </>
          ) : connectionStatus === "error" ? (
            <>
              <XCircle className="h-3.5 w-3.5" />
              Connection failed
            </>
          ) : (
            "Test Connection"
          )}
        </button>

        {connectionError && (
          <p className="mt-1.5 font-sans text-[10px] text-error">{connectionError}</p>
        )}

        {!isConfigured && (
          <p className="mt-1.5 font-sans text-[10px] text-slate-muted">
            Please enter your API key to test the connection.
          </p>
        )}

        {isConfigured && settings.aiEnabled && connectionStatus !== "success" && connectionStatus !== "testing" && (
          <p className="mt-1.5 font-sans text-[10px] text-amber-600 dark:text-amber-400">
            Please test connection to enable AI features.
          </p>
        )}
      </div>

      {/* Conversation Style Settings */}
      <div className={cn("pt-3 border-t border-parchment space-y-3", !settings.aiEnabled && "opacity-50 pointer-events-none")}>
        <div>
          <h4 className="font-sans text-[10px] uppercase tracking-widest text-slate-muted mb-2">
            Conversation Style
          </h4>

          {/* Be Direct Toggle */}
          <div className="flex items-center justify-between py-1.5">
            <div>
              <label className="block font-sans text-caption font-medium text-ink">
                Be Direct
              </label>
              <p className="font-sans text-[10px] text-slate-muted">
                Offer clear readings and interpretive suggestions
              </p>
            </div>
            <button
              onClick={() => setBeDirectMode(!settings.beDirectMode)}
              className={cn(
                "w-10 h-5 rounded-sm transition-colors flex-shrink-0",
                settings.beDirectMode ? "bg-burgundy" : "bg-parchment"
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 bg-white rounded-sm transition-transform mx-0.5 shadow-editorial",
                  settings.beDirectMode && "translate-x-5"
                )}
              />
            </button>
          </div>

          {/* Teach Me Toggle */}
          <div className="flex items-center justify-between py-1.5">
            <div>
              <label className="block font-sans text-caption font-medium text-ink">
                Teach Me
              </label>
              <p className="font-sans text-[10px] text-slate-muted">
                Explain CCS concepts and connect to scholarship
              </p>
            </div>
            <button
              onClick={() => setTeachMeMode(!settings.teachMeMode)}
              className={cn(
                "w-10 h-5 rounded-sm transition-colors flex-shrink-0",
                settings.teachMeMode ? "bg-burgundy" : "bg-parchment"
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 bg-white rounded-sm transition-transform mx-0.5 shadow-editorial",
                  settings.teachMeMode && "translate-x-5"
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Close button */}
      {onClose && (
        <div className="pt-2 border-t border-parchment">
          <button
            onClick={onClose}
            className="w-full px-3 py-2 font-sans text-caption text-slate hover:text-ink hover:bg-cream rounded-sm transition-colors"
          >
            Close Settings
          </button>
        </div>
      )}
    </div>
  );
}
