"use client";

/**
 * Intro + per-provider setup guide shown above AIProviderSettings in
 * the AI tab. Modelled on LLMbench's OnboardingGuide pattern: a short
 * tab intro framing the architecture, then a collapsible "Getting
 * started — how to obtain an API key" section with per-provider
 * expandable cards. Setup steps, free-tier descriptions, and key
 * URLs are ported from LLMbench and lightly adapted (LLMbench-only
 * concerns like logprobs, Sampling Probe, and the A/B slot model are
 * stripped; references to LLMbench become CCS-WB).
 */

import { useState } from "react";
import { ExternalLink, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProviderGuide {
  id: string;
  name: string;
  signupUrl: string;
  keyUrl: string;
  keyLabel: string;            // text describing the key prefix or "(no key)"
  freeTier: string;            // one-paragraph cost / free-tier description
  steps: string[];             // ordered setup steps
  notes?: string;              // optional caveats / good-to-knows
}

const PROVIDER_GUIDES: ProviderGuide[] = [
  {
    id: "ollama",
    name: "Ollama (local, no API key)",
    signupUrl: "https://ollama.com/download",
    keyUrl: "https://ollama.com/library",
    keyLabel: "(no key)",
    freeTier:
      "Free. All inference happens on your own machine — no calls leave your laptop, no per-token cost. Works from both a local dev build and a deployed CCS-WB (the browser calls Ollama directly).",
    steps: [
      "Install Ollama from ollama.com/download (macOS, Linux, Windows).",
      "Pull a model: `ollama pull gemma4` or `ollama pull llama3.2` or `ollama pull qwen3`. The library link below lists what's available.",
      "Start the server. If you're using CCS-WB locally (`npm run dev` on localhost:3000), a plain `ollama serve` is enough.",
      "If you're using a DEPLOYED CCS-WB (e.g. on Vercel), start Ollama with `OLLAMA_ORIGINS=\"<your-ccs-wb-origin>\" ollama serve` so its CORS policy allows the deployed page. The Ollama settings panel below shows the exact command with your origin pre-filled and a copy button.",
      "In Settings, choose Ollama, leave the API key blank, and pick a model from the list (or enter the exact ID you pulled, e.g. `gemma4` or `llama3.2:latest`).",
    ],
    notes:
      "Ollama is the one provider where the browser-direct path was originally added to dodge the loopback / Vercel-serverless gap. The same path is now used for every commercial provider too. Safari blocks HTTPS→http://localhost regardless of CORS, so use Chrome, Firefox, Edge, Arc, or Brave for Ollama from a deployed CCS-WB; Safari is fine for local dev.",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    signupUrl: "https://huggingface.co/join",
    keyUrl: "https://huggingface.co/settings/tokens",
    keyLabel: "hf_…",
    freeTier:
      "Free Inference API access to many open-weight chat models (Llama, Qwen, Mistral, DeepSeek, Gemma). Rate-limited; needs a paid Pro or dedicated endpoint for heavy use.",
    steps: [
      "Sign up at huggingface.co (email or GitHub).",
      "Open Settings → Access Tokens (link below).",
      "Click \"+ Create new token\". Choose Token type \"Read\". A name like `ccs-wb` is fine.",
      "Copy the token (starts with `hf_`). Paste into the API Key field below.",
      "Pick a model — Llama 3.3, Qwen 2.5, DeepSeek R1/V3 all work. Add a custom model ID if you need a specific repo.",
    ],
    notes:
      "Easiest free-tier option for getting started without a credit card. Some routed models can be slow or temporarily unavailable; if you see errors, try a different model.",
  },
  {
    id: "google",
    name: "Google (Gemini)",
    signupUrl: "https://aistudio.google.com/",
    keyUrl: "https://aistudio.google.com/app/apikey",
    keyLabel: "AIza…",
    freeTier:
      "Generous free tier on the Gemini 2.0/2.5 series via AI Studio. No credit card required for the free tier.",
    steps: [
      "Open Google AI Studio (aistudio.google.com) and sign in with a Google account.",
      "Click \"Get API key\" or visit the link below.",
      "Create an API key in a new or existing Google Cloud project.",
      "Copy and paste below. Gemini 2.5 Flash is a good default; Pro for longer / more careful generations.",
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    signupUrl: "https://console.anthropic.com/",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyLabel: "sk-ant-…",
    freeTier:
      "Initial free credit on signup; pay-as-you-go after. Typical CCS analysis costs fractions of a cent per turn.",
    steps: [
      "Sign up at console.anthropic.com.",
      "Open Settings → API Keys (link below) and click \"Create Key\".",
      "Copy the key (starts with `sk-ant-`). Paste below.",
      "Claude Sonnet 4 is the recommended default; Haiku for faster / cheaper short replies.",
    ],
    notes:
      "Strong default for scholarly close-reading dialogue — long-form, careful, willing to sit with ambiguity. CCS-WB's browser-direct path uses the `anthropic-dangerous-direct-browser-access` header that Anthropic explicitly added for in-browser use.",
  },
  {
    id: "openai",
    name: "OpenAI",
    signupUrl: "https://platform.openai.com/signup",
    keyUrl: "https://platform.openai.com/api-keys",
    keyLabel: "sk-…",
    freeTier:
      "No free tier. Pay-as-you-go after a small initial credit if you add a payment method.",
    steps: [
      "Sign up at platform.openai.com.",
      "Add a payment method under Billing.",
      "Open API Keys (link below) and click \"Create new secret key\". Copy it once — it cannot be shown again.",
      "Paste below. Pick a model (gpt-4o or gpt-4o-mini are sensible defaults; o1 / o3 for reasoning-heavy work).",
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    signupUrl: "https://openrouter.ai/",
    keyUrl: "https://openrouter.ai/keys",
    keyLabel: "sk-or-…",
    freeTier:
      "Pay-as-you-go across many models with a single key. Some models have free tiers.",
    steps: [
      "Sign up at openrouter.ai.",
      "Add a few dollars of credit (covers a lot of CCS-WB usage).",
      "Open Keys (link below), create a key, copy it.",
      "Paste below. The Model dropdown lists OpenRouter-compatible models; you can also enter any model ID via the Custom Model option.",
    ],
    notes:
      "Most flexible option for trying many models against the same close-reading session — Claude, GPT, Llama, Qwen, Mistral, DeepSeek all reachable through one key.",
  },
  {
    id: "openai-compatible",
    name: "OpenAI-Compatible API",
    signupUrl: "https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html",
    keyUrl: "",
    keyLabel: "varies",
    freeTier:
      "Free or paid depending on what you point it at — vLLM / Ollama's /v1 / Groq / Together / Fireworks / DeepInfra / your own self-hosted endpoint all expose OpenAI-format Chat Completions and work here.",
    steps: [
      "Find or stand up any OpenAI-compatible Chat Completions endpoint.",
      "Below, choose OpenAI-Compatible API, paste the endpoint URL (e.g. `https://api.together.xyz/v1`) in Base URL, the API key in API Key, and the exact model identifier.",
      "Test Connection sends one ping-token call to verify reachability.",
    ],
    notes:
      "Useful for self-hosted models that don't match one of the named providers above, or for cost / latency / data-residency reasons.",
  },
];

interface ProviderCardProps {
  guide: ProviderGuide;
}

function ProviderCard({ guide }: ProviderCardProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-parchment rounded-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-cream/50 hover:bg-cream transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="font-sans text-caption font-medium text-ink">{guide.name}</div>
          <div className="font-sans text-[10px] text-slate-muted">
            {guide.keyLabel} — {guide.freeTier.split(".")[0]}.
          </div>
        </div>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-slate-muted shrink-0 transition-transform",
            open && "rotate-90"
          )}
        />
      </button>
      {open && (
        <div className="px-3 py-3 space-y-2 font-sans text-[11px] text-slate leading-relaxed bg-card">
          <p>
            <strong className="text-ink">Cost.</strong> {guide.freeTier}
          </p>
          <div>
            <p className="font-medium text-ink mb-1">Setup</p>
            <ol className="list-decimal pl-5 space-y-1">
              {guide.steps.map((step, i) => (
                <li key={i}>{renderInlineCode(step)}</li>
              ))}
            </ol>
          </div>
          {guide.notes && (
            <p className="pt-1 border-t border-parchment">
              <strong className="text-ink">Note.</strong> {guide.notes}
            </p>
          )}
          <div className="flex flex-wrap gap-3 pt-1">
            <a
              href={guide.signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-burgundy hover:underline inline-flex items-center gap-0.5"
            >
              Sign up <ExternalLink className="h-2.5 w-2.5" />
            </a>
            {guide.keyUrl && (
              <a
                href={guide.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-burgundy hover:underline inline-flex items-center gap-0.5"
              >
                {guide.id === "ollama" ? "Model library" : "Get key"} <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Renders inline `code` spans inside a string for the setup steps. */
function renderInlineCode(s: string): React.ReactNode {
  const parts = s.split(/(`[^`]+`)/g);
  return parts.map((part, i) =>
    part.startsWith("`") && part.endsWith("`") ? (
      <code key={i} className="font-mono text-[10px] bg-cream px-1 rounded-sm">
        {part.slice(1, -1)}
      </code>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function AISetupGuide() {
  return (
    <div className="space-y-4 pb-4 border-b border-parchment">
      {/* Tab intro */}
      <div className="space-y-2">
        <h3 className="font-display text-base text-ink">AI Provider</h3>
        <p className="font-sans text-caption text-slate leading-relaxed">
          CCS-WB drives every supported AI provider <strong>directly from your
          browser</strong>. Your API key is stored in this browser&apos;s
          localStorage only — no key ever passes through any server CCS-WB
          controls, and requests go straight from you to the provider you
          chose. Switching providers preserves the keys you&apos;ve already
          entered for the others.
        </p>
        <p className="font-sans text-caption text-slate leading-relaxed">
          Seven providers are supported. If you&apos;re new and don&apos;t want
          to add a card, start with <strong>Hugging Face</strong> (free tier,
          no credit card) or <strong>Google (Gemini)</strong> (generous free
          tier). If you have a Claude or OpenAI account already, either of
          those is a strong default for close-reading work. If you have a
          decent local machine, <strong>Ollama</strong> runs everything
          offline at zero cost.
        </p>
      </div>

      {/* Per-provider setup guide */}
      <details className="border-t border-parchment pt-3">
        <summary className="cursor-pointer font-sans text-caption font-medium text-ink hover:text-burgundy">
          Getting started — how to obtain an API key
        </summary>
        <div className="mt-3 space-y-2">
          {PROVIDER_GUIDES.map((g) => (
            <ProviderCard key={g.id} guide={g} />
          ))}
        </div>
      </details>
    </div>
  );
}
