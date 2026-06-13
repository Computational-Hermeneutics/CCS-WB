/**
 * Supabase Browser Client
 *
 * Use this client for browser-side operations (React components, client actions).
 * For server-side operations (API routes, server components), use server.ts instead.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { resolveSupabaseConfig } from "./runtime-config";
import { CLOUD_ENABLED } from "@/cloud/config";

// Lazy singleton pattern - client is created on first use
let supabaseClient: SupabaseClient<Database> | null = null;

// Track last successful request for connection health monitoring
let lastSuccessfulRequest: number = Date.now();
let lastRequestError: Error | null = null;

/**
 * Get the Supabase browser client singleton.
 * Returns null if Supabase is not configured (missing environment variables).
 */
export function getSupabaseClient(): SupabaseClient<Database> | null {
  // Check if already created
  if (supabaseClient) {
    return supabaseClient;
  }

  // Resolve from runtime config (Settings → Cloud Backend) first, env
  // vars second. Either source is sufficient.
  const resolved = resolveSupabaseConfig();
  if (!resolved) {
    return null;
  }
  const { url: supabaseUrl, anonKey: supabaseAnonKey } = resolved;

  // Create and cache the client with resilient auth settings
  supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Use a no-op lock to prevent AbortError from Web Locks API timing out on slow connections
      // This disables cross-tab synchronization but makes auth more resilient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
        // Just execute the function without acquiring a lock
        return await fn();
      },
      // Detect session from URL (for OAuth callbacks)
      detectSessionInUrl: true,
      // Persist session in localStorage
      persistSession: true,
      // Auto-refresh tokens
      autoRefreshToken: true,
    },
  });
  return supabaseClient;
}

/**
 * Check whether Supabase is actually available in this build — i.e.
 * the build-time CLOUD_ENABLED flag is on AND either env vars or
 * runtime config supply the URL+key. Use this to conditionally show
 * collaborative features; consumers do not need to also check
 * CLOUD_ENABLED separately.
 *
 * Setting `cloud.config.json -> enabled: false` collapses this to
 * always-false regardless of env vars or runtime config — the cloud
 * subtree then ships in the bundle but never activates.
 */
export function isSupabaseConfigured(): boolean {
  if (!CLOUD_ENABLED) return false;
  return resolveSupabaseConfig() !== null;
}

/**
 * Drop the cached client so the next getSupabaseClient() rebuilds with
 * whatever the current resolved config is. Called when the user saves
 * or clears a runtime config in Settings.
 */
export function resetSupabaseClient(): void {
  supabaseClient = null;
}

/**
 * Test connection to Supabase with a lightweight query
 * Updates lastSuccessfulRequest timestamp on success
 * @returns true if connection is healthy, false otherwise
 */
export async function testConnection(): Promise<boolean> {
  const client = getSupabaseClient();

  if (!client) {
    return false;
  }

  try {
    // Lightweight query - just check if we can reach Supabase
    const { error } = await client.from("projects").select("id").limit(1);

    if (error) {
      lastRequestError = new Error(error.message);
      return false;
    }

    // Success
    lastSuccessfulRequest = Date.now();
    lastRequestError = null;
    return true;
  } catch (error) {
    lastRequestError = error instanceof Error ? error : new Error("Unknown connection error");
    return false;
  }
}

/**
 * Get connection health metrics
 * @returns Health metrics for monitoring
 */
export function getConnectionMetrics(): {
  lastSuccessfulRequest: number;
  timeSinceLastSuccess: number;
  lastError: Error | null;
} {
  return {
    lastSuccessfulRequest,
    timeSinceLastSuccess: Date.now() - lastSuccessfulRequest,
    lastError: lastRequestError,
  };
}

/**
 * Record a successful Supabase request
 * Call this after successful sync operations to update health tracking
 */
export function recordSuccessfulRequest(): void {
  lastSuccessfulRequest = Date.now();
  lastRequestError = null;
}

/**
 * Record a failed Supabase request
 * Call this after failed sync operations to update health tracking
 */
export function recordFailedRequest(error: Error): void {
  lastRequestError = error;
}
