/**
 * Auth Callback Route
 *
 * Handles OAuth redirects and magic link confirmations from Supabase.
 * Exchanges the auth code for a session and redirects to the app.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/cloud/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/";

  // Create response for setting cookies
  const response = NextResponse.redirect(new URL(next, requestUrl.origin));

  if (code) {
    const supabase = createSupabaseRouteClient(request, response);

    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("Auth callback error:", error);
        // Redirect to home with error
        return NextResponse.redirect(
          new URL(`/?auth_error=${encodeURIComponent(error.message)}`, requestUrl.origin)
        );
      }
    }
  }

  return response;
}
