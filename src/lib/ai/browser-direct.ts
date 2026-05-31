// Browser-direct AI dispatch.
//
// The default path runs the model call from the browser instead of via
// the Next.js API route. This makes CCS-WB host-independent (the static
// PWA shell can drive every supported provider with no server), lets a
// deployed CCS-WB reach a local Ollama (server routes can't — see the
// note on the loopback exemption below), and is the prerequisite to a
// genuinely offline-installable workbench.
//
// Ollama: browsers treat `localhost` / `127.0.0.1` as potentially-
// trustworthy and exempt them from mixed-content blocking, so an HTTPS
// page CAN fetch `http://localhost:11434` directly — provided Ollama is
// started with the page's origin in `OLLAMA_ORIGINS`.
//
// Anthropic / OpenAI / Google / OpenRouter / Hugging Face: each provider
// allows browser-direct calls with the user's API key, gated by an
// explicit acknowledgement header where applicable (Anthropic's
// `anthropic-dangerous-direct-browser-access`). The key already lives
// in localStorage in the existing AISettings, so no new security
// tradeoff is introduced.
//
// The server-side `/api/*` routes are preserved as a fallback for
// deployments that configure provider keys via env vars.

import type { AIProvider } from "@/types/ai-settings";

// ---- Per-provider payload shapes ----

export interface OllamaPayload {
  baseUrl: string;
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
  temperature?: number;
}

export interface AnthropicPayload {
  apiKey: string;
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
  temperature?: number;
}

/**
 * Providers that should be dispatched directly from the browser rather
 * than via the Next.js API route. Currently Ollama + Anthropic; the
 * remaining commercial providers will be added in subsequent commits.
 */
export function shouldBrowserDispatch(provider: AIProvider): boolean {
  return provider === "ollama" || provider === "anthropic";
}

/**
 * True when the page is loaded from a non-loopback origin. Used to warn
 * the user that a local Ollama is unreachable from a deployed server
 * route (the browser-direct path is fine; the server route is not).
 */
export function isRemoteOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
}

/**
 * Result of a ping. When reachable, `installedModels` lists the model
 * IDs Ollama reports via `/api/tags` so the UI can show the user
 * exactly what they have pulled (and flag a missing model the user has
 * selected). When unreachable, `kind` tells the renderer which fix to
 * suggest: a CORS block for a deployed origin needs OLLAMA_ORIGINS;
 * a local failure usually means Ollama isn't running.
 */
export type PingResult =
  | { ok: true; baseUrl: string; installedModels: string[] }
  | { ok: false; baseUrl: string; kind: "unreachable" | "http_error"; status?: number; message: string };

/**
 * Check that Ollama is reachable. Uses the native `/api/tags` endpoint,
 * which is CORS-permissive when `OLLAMA_ORIGINS` is set appropriately.
 * On success, returns the list of installed model IDs as well.
 */
export async function pingOllama(baseUrl: string): Promise<PingResult> {
  const url = (baseUrl || "http://localhost:11434").replace(/\/+$/, "");
  try {
    const response = await fetch(`${url}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return {
        ok: false,
        baseUrl: url,
        kind: "http_error",
        status: response.status,
        message: `Ollama responded with HTTP ${response.status}`,
      };
    }
    const data = await response.json().catch(() => null) as { models?: Array<{ name?: string; model?: string }> } | null;
    const installedModels = Array.isArray(data?.models)
      ? data!.models.map((m) => m.name ?? m.model ?? "").filter(Boolean)
      : [];
    return { ok: true, baseUrl: url, installedModels };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, baseUrl: url, kind: "unreachable", message };
  }
}

/**
 * Call Ollama's OpenAI-compatible chat completions endpoint directly
 * from the browser. Returns the assistant text content.
 */
export async function callOllamaDirect(payload: OllamaPayload): Promise<string> {
  const url = (payload.baseUrl || "http://localhost:11434").replace(/\/+$/, "");
  const messages = [
    ...(payload.system ? [{ role: "system" as const, content: payload.system }] : []),
    ...payload.messages,
  ];

  const response = await fetch(`${url}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: payload.model,
      messages,
      max_tokens: payload.maxTokens,
      ...(payload.temperature !== undefined ? { temperature: payload.temperature } : {}),
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Ollama returned HTTP ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Ollama returned an empty response. The model may need more tokens, or it may be a reasoning model whose output went to the `reasoning` field.");
  }
  return content;
}

// ---- Generalised envelope dispatcher ----
//
// The Next.js routes return a provider-tagged envelope of the form
// `{ browserDirect: true, provider, payload, messageTemplate }`. Call
// sites pass that envelope to `dispatchBrowserDirect` and get back the
// assistant text, regardless of provider. This keeps the per-provider
// switch isolated to this module.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dispatchBrowserDirect(envelope: any): Promise<string> {
  // Tolerate the legacy Ollama-specific envelope shape that hooks
  // wrote against before the generalisation.
  if (envelope?.ollamaPayload && !envelope?.payload) {
    return callOllamaDirect(envelope.ollamaPayload);
  }
  const payload = envelope?.payload;
  if (!payload || !payload.provider) {
    throw new Error("dispatchBrowserDirect: missing provider in envelope.");
  }
  switch (payload.provider as AIProvider) {
    case "ollama":
      return callOllamaDirect(payload);
    case "anthropic":
      return callAnthropicDirect(payload);
    default:
      throw new Error(`dispatchBrowserDirect: provider "${payload.provider}" not yet supported in browser-direct mode.`);
  }
}

// ---- Anthropic browser-direct dispatch ----

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Cheap browser-direct reachability + key validity check. Issues a
 * 1-token Messages call (cheaper than any other test); a 200 means the
 * key works and the network/CORS path is open. Returns a discriminated
 * result like `pingOllama` so the Settings UI can render specific
 * failure guidance.
 */
export async function pingAnthropic(apiKey: string, model = "claude-3-5-haiku-20241022"): Promise<
  | { ok: true }
  | { ok: false; kind: "auth" | "network" | "http_error"; status?: number; message: string }
> {
  if (!apiKey) {
    return { ok: false, kind: "auth", message: "No Anthropic API key configured." };
  }
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return { ok: true };
    if (response.status === 401 || response.status === 403) {
      return { ok: false, kind: "auth", status: response.status, message: "Authentication failed — check your Anthropic API key." };
    }
    const errText = await response.text().catch(() => "");
    return {
      ok: false,
      kind: "http_error",
      status: response.status,
      message: `Anthropic responded with HTTP ${response.status}${errText ? `: ${errText.slice(0, 160)}` : ""}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, kind: "network", message };
  }
}

/**
 * Call Anthropic's Messages API directly from the browser. Returns the
 * assistant text content. Mirrors `callOllamaDirect` so the dispatch
 * sites are symmetric.
 */
export async function callAnthropicDirect(payload: AnthropicPayload): Promise<string> {
  if (!payload.apiKey) {
    throw new Error("Anthropic API key is required for browser-direct dispatch.");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": payload.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: payload.model,
      max_tokens: payload.maxTokens,
      ...(payload.system ? { system: payload.system } : {}),
      ...(payload.temperature !== undefined ? { temperature: payload.temperature } : {}),
      messages: payload.messages,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error("Authentication failed for Anthropic. Please check your API key in Settings.");
    }
    if (response.status === 429) {
      throw new Error("Rate limit exceeded for Anthropic. Please wait and try again.");
    }
    throw new Error(`Anthropic returned HTTP ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`);
  }

  const data = await response.json();
  // Messages API content is an array of blocks; concatenate text blocks.
  const blocks = Array.isArray(data?.content) ? data.content : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = blocks.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("");
  if (!text || text.trim() === "") {
    throw new Error("Anthropic returned an empty response.");
  }
  return text;
}
