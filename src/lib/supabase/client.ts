/**
 * Supabase Browser Client
 *
 * Use this client for browser-side operations (React components, client actions).
 * For server-side operations (API routes, server components), use server.ts instead.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

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

  // Check for required environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Supabase not configured - collaborative features disabled
    return null;
  }

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
 * Check if Supabase is configured (has required environment variables).
 * Use this to conditionally show collaborative features.
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
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
