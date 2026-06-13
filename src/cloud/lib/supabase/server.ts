/**
 * Supabase Server Client
 *
 * Use this client for server-side operations (API routes, server components).
 * For browser-side operations, use client.ts instead.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

/**
 * Create a Supabase client for server-side use (API routes, Server Components).
 * Returns null if Supabase is not configured.
 *
 * Note: This creates a new client for each request, which is the recommended
 * pattern for server-side usage to ensure proper cookie handling.
 */
export async function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
}

/**
 * Create a Supabase client for use in API route handlers.
 * This version accepts request/response for cookie management.
 */
export function createSupabaseRouteClient(
  request: Request,
  response: { headers: Headers }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  // Parse cookies from request
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieMap = new Map<string, string>();
  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name) {
      cookieMap.set(name, rest.join("="));
    }
  });

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return Array.from(cookieMap.entries()).map(([name, value]) => ({
          name,
          value,
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          const cookieValue = serializeCookie(name, value, options);
          response.headers.append("Set-Cookie", cookieValue);
        });
      },
    },
  });
}

/**
 * Serialize a cookie for the Set-Cookie header
 */
function serializeCookie(
  name: string,
  value: string,
  options?: CookieOptions
): string {
  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

  if (options) {
    if (options.maxAge !== undefined) {
      cookie += `; Max-Age=${options.maxAge}`;
    }
    if (options.domain) {
      cookie += `; Domain=${options.domain}`;
    }
    if (options.path) {
      cookie += `; Path=${options.path}`;
    }
    if (options.expires) {
      cookie += `; Expires=${options.expires.toUTCString()}`;
    }
    if (options.httpOnly) {
      cookie += "; HttpOnly";
    }
    if (options.secure) {
      cookie += "; Secure";
    }
    if (options.sameSite) {
      cookie += `; SameSite=${options.sameSite}`;
    }
  }

  return cookie;
}
