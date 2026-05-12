// Browser-direct Ollama dispatch.
//
// When CCS-WB is deployed on a remote origin (e.g. Vercel), the Next.js
// API routes run as serverless functions that cannot reach the user's
// `http://localhost:11434` Ollama instance. Browsers, however, treat
// `localhost` / `127.0.0.1` as a "potentially trustworthy" origin and
// exempt them from mixed-content blocking, so an HTTPS page CAN fetch
// `http://localhost:11434` directly — provided Ollama is started with
// the deployed origin in its CORS allowlist (`OLLAMA_ORIGINS`).
//
// This module isolates that dispatch path so the API routes can return
// a prepared payload for Ollama and the browser can complete the call.

import type { AIProvider } from "@/types/ai-settings";

export interface OllamaPayload {
  baseUrl: string;
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
  temperature?: number;
}

/**
 * Providers that should be dispatched directly from the browser rather
 * than via the Next.js API route. Currently Ollama only.
 */
export function shouldBrowserDispatch(provider: AIProvider): boolean {
  return provider === "ollama";
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
