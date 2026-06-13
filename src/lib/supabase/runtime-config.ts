// Runtime Supabase configuration.
//
// In v4.0 the public CCS-WB deployment ships as a local-first client
// with no hosted backend. Users who want Cloud sync supply
// their own Supabase project's URL + anon key — *at runtime, from the
// Settings UI* — rather than having to fork-and-rebuild with env vars.
//
// Resolution order:
//   1. Browser localStorage entry (set via Settings → Profile → Cloud
//      Backend). Wins when present and looks valid.
//   2. NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY env
//      vars at build time. Preserved as the fallback so any deployment
//      that already wired its own Supabase via env vars keeps working.
//   3. Nothing — Cloud is unavailable; Local still works.
//
// Server-side code (the API routes) only sees the env-var path; the
// runtime override is browser-only by design. With browser-direct AI
// dispatch now in place, the server rarely needs Supabase access
// anyway (OAuth callback is the main exception).

export interface SupabaseRuntimeConfig {
  url: string;
  anonKey: string;
}

const STORAGE_KEY = "ccs-supabase-config";

/** Read the user-set runtime config from localStorage, if any. */
export function getRuntimeSupabaseConfig(): SupabaseRuntimeConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SupabaseRuntimeConfig>;
    if (!parsed || typeof parsed.url !== "string" || typeof parsed.anonKey !== "string") return null;
    const url = parsed.url.trim();
    const anonKey = parsed.anonKey.trim();
    if (!url || !anonKey) return null;
    return { url, anonKey };
  } catch {
    return null;
  }
}

/** Persist a user-supplied runtime config. */
export function setRuntimeSupabaseConfig(config: SupabaseRuntimeConfig): void {
  if (typeof window === "undefined") return;
  const cleaned: SupabaseRuntimeConfig = {
    url: config.url.trim().replace(/\/+$/, ""),
    anonKey: config.anonKey.trim(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
}

/** Remove the user-set runtime config (falls back to env, if any). */
export function clearRuntimeSupabaseConfig(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Resolve the effective Supabase config from runtime override first,
 * env vars second. Returns null when neither source has it OR when
 * the build-time CLOUD_ENABLED flag is off — in the off case the
 * cloud subtree is inert by design, so config resolution must report
 * "no backend available" regardless of what's in localStorage or env
 * vars (otherwise downstream UI gets contradictory state: "backend
 * configured" + "toggle hidden").
 */
export function resolveSupabaseConfig(): { url: string; anonKey: string; source: "runtime" | "env" } | null {
  // Lazy-import to avoid a circular dep at module load (this file is
  // loaded from src/lib/supabase, src/cloud/config is loaded by
  // src/lib/supabase/client which imports this file).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CLOUD_ENABLED } = require("@/cloud/config") as { CLOUD_ENABLED: boolean };
  if (!CLOUD_ENABLED) return null;
  const runtime = getRuntimeSupabaseConfig();
  if (runtime) return { url: runtime.url, anonKey: runtime.anonKey, source: "runtime" };
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey, source: "env" };
  return null;
}

/** Sanity check that a URL looks like a Supabase project URL. */
export function looksLikeSupabaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.length > 0;
  } catch {
    return false;
  }
}
