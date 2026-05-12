"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Check, Download, Loader2 } from "lucide-react";
import type { PingResult } from "@/lib/ai/browser-direct";
import { isRemoteOrigin } from "@/lib/ai/browser-direct";
import { cn } from "@/lib/utils";

/**
 * Small inline command block with a copy-to-clipboard button. Mirrors
 * the CopyableCommand in AIProviderSettings so the user sees one
 * canonical recipe across the panel.
 */
function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <span className="flex items-start gap-1.5 my-1">
      <code className="flex-1 font-mono text-[10px] bg-white px-1.5 py-1 rounded-sm select-all break-all border border-parchment-dark">
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 px-1.5 py-1 text-[10px] bg-white border border-parchment-dark rounded-sm hover:border-burgundy transition-colors flex items-center gap-1"
        title="Copy to clipboard"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

interface OllamaConnectionStatusProps {
  result: PingResult;
  /** The model the user has selected — used to detect "not installed" cases. */
  selectedModel?: string;
  /** Called after a successful `ollama pull` so the parent can refresh state. */
  onPulled?: () => void;
}

/**
 * Rich status panel for Ollama Test Connection results.
 *
 * On failure: shows a headline, an origin-aware diagnosis, a copyable
 * command (plain `ollama serve` for local; `OLLAMA_ORIGINS="..." ollama
 * serve` for a deployed CCS-WB), and the Safari caveat on remote.
 *
 * On success: confirms the connection, lists installed models, and if
 * the user's selected model is not in the list, offers a one-click
 * `ollama pull <model>` (browser-direct to /api/pull).
 */
export function OllamaConnectionStatus({ result, selectedModel, onPulled }: OllamaConnectionStatusProps) {
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pulled, setPulled] = useState(false);

  if (!result.ok) {
    return <FailurePanel result={result} />;
  }

  const installed = result.installedModels;
  // A model is considered installed if its ID is a prefix or full match of
  // any installed tag — Ollama returns names like "llama3.2:latest" while
  // models.md uses "llama3.2"; either should match.
  const hasSelected =
    !selectedModel || selectedModel === "custom"
      ? true
      : installed.some((m) => m === selectedModel || m.startsWith(`${selectedModel}:`));

  const handlePull = async () => {
    if (!selectedModel || selectedModel === "custom") return;
    setPulling(true);
    setPullError(null);
    try {
      const res = await fetch(`${result.baseUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selectedModel, stream: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string }));
        setPullError((data as { error?: string }).error || `Pull failed (HTTP ${res.status})`);
      } else {
        setPulled(true);
        setTimeout(() => onPulled?.(), 1200);
      }
    } catch (err) {
      setPullError(err instanceof Error ? err.message : "Pull failed");
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="mt-1.5 font-sans text-[10px] text-slate-muted space-y-1.5 bg-success/5 border border-success/30 rounded-sm p-2">
      <p className="flex items-center gap-1.5 text-success font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Connection successful — Ollama is reachable at{" "}
        <code className="font-mono text-[10px] bg-white px-1 rounded-sm border border-parchment-dark">
          {result.baseUrl}
        </code>
      </p>

      {installed.length === 0 ? (
        <p>
          No models are installed yet. Pull one with{" "}
          <code className="font-mono bg-white px-1 rounded-sm">ollama pull gemma4</code>{" "}
          (or any model from{" "}
          <a
            href="https://ollama.com/library"
            target="_blank"
            rel="noopener noreferrer"
            className="text-burgundy hover:underline"
          >
            ollama.com/library
          </a>
          ).
        </p>
      ) : (
        <>
          <p className="text-ink font-medium uppercase tracking-widest text-[9px]">
            Installed models ({installed.length})
          </p>
          <ul className="space-y-0.5 max-h-24 overflow-y-auto bg-white border border-parchment-dark rounded-sm p-1.5">
            {installed.map((m) => (
              <li
                key={m}
                className={cn(
                  "font-mono text-[10px]",
                  selectedModel && (m === selectedModel || m.startsWith(`${selectedModel}:`))
                    ? "text-burgundy font-medium"
                    : "text-ink"
                )}
              >
                {m}
              </li>
            ))}
          </ul>
        </>
      )}

      {selectedModel && selectedModel !== "custom" && !hasSelected && !pulled && (
        <div className="pt-1 border-t border-success/20 space-y-1">
          <p className="text-warning-600 dark:text-amber-500 flex items-start gap-1">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              The selected model{" "}
              <code className="font-mono bg-white px-1 rounded-sm">{selectedModel}</code>{" "}
              is not in your installed list. Pull it now, or run{" "}
              <code className="font-mono bg-white px-1 rounded-sm">
                ollama pull {selectedModel}
              </code>{" "}
              in your terminal.
            </span>
          </p>
          <button
            onClick={handlePull}
            disabled={pulling}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-sm text-[11px] font-sans transition-colors",
              "bg-burgundy text-white hover:bg-burgundy/90 disabled:opacity-50"
            )}
          >
            {pulling ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Pulling {selectedModel} (this may take a few minutes)…
              </>
            ) : (
              <>
                <Download className="h-3 w-3" />
                Pull {selectedModel}
              </>
            )}
          </button>
          {pullError && <p className="text-error">{pullError}</p>}
        </div>
      )}

      {pulled && (
        <p className="text-success flex items-center gap-1 pt-1 border-t border-success/20">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {selectedModel} pulled. Try Test Connection again.
        </p>
      )}
    </div>
  );
}

function FailurePanel({ result }: { result: Extract<PingResult, { ok: false }> }) {
  const remote = isRemoteOrigin();
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://your-ccs-wb-origin";

  // Headline, diagnosis, and (origin-aware) command vary by the kind of
  // failure. Following the manifold-atlas / LLMbench pattern: a distinct
  // headline for each class of failure so the user immediately knows
  // which fix applies, plus a clearly-labelled copyable command block.
  let headline: string;
  let diagnosis: string;
  let commandLabel: string | null;
  let command: string | null;
  if (result.kind === "http_error") {
    headline = `Ollama responded with HTTP ${result.status ?? "?"}`;
    diagnosis =
      "The server is running but rejected the request. Check the baseURL and any reverse proxy in front of Ollama.";
    commandLabel = null;
    command = null;
  } else if (remote) {
    headline = "Ollama is unreachable from this page (CORS)";
    diagnosis =
      "The browser tried to fetch Ollama directly but the request was blocked — almost certainly because the deployed origin is not in Ollama's CORS allowlist, or Ollama isn't running.";
    commandLabel = "Stop Ollama, then run this in your terminal";
    command = `OLLAMA_ORIGINS="${origin},http://localhost:3000,http://127.0.0.1:3000" ollama serve`;
  } else {
    headline = "Ollama is not running";
    diagnosis =
      "Nothing answered on this URL. The most likely cause is that the Ollama server hasn't been started.";
    commandLabel = "Start it in your terminal";
    command = "ollama serve";
  }

  return (
    <div className="mt-1.5 font-sans text-[10px] text-slate-muted space-y-1.5 bg-error/5 border border-error/30 rounded-sm p-2">
      <p className="flex items-center gap-1.5 text-error font-medium">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>{headline}</span>
      </p>
      <p>
        Tried{" "}
        <code className="font-mono bg-white px-1 rounded-sm">{result.baseUrl}</code>.{" "}
        {diagnosis}
      </p>
      {command && (
        <div>
          {commandLabel && (
            <p className="text-[9px] uppercase tracking-widest text-slate-muted mb-0.5">
              {commandLabel}
            </p>
          )}
          <CopyableCommand command={command} />
        </div>
      )}
      {remote && result.kind === "unreachable" && (
        <p>
          <strong className="text-ink">Safari note:</strong> Safari blocks HTTPS pages from
          calling{" "}
          <code className="font-mono bg-white px-1 rounded-sm">http://localhost</code>{" "}
          regardless of CORS — use Chrome, Firefox, Edge, Arc, or Brave for Ollama from a
          deployed CCS-WB. Local dev works in Safari.
        </p>
      )}
      <details className="pt-1 border-t border-error/20">
        <summary className="cursor-pointer text-slate-muted hover:text-ink">
          Technical detail
        </summary>
        <p className="mt-1 font-mono text-[10px] text-ink/80 bg-white p-1 rounded-sm border border-parchment-dark">
          {result.message}
        </p>
      </details>
    </div>
  );
}
