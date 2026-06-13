import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/cloud/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { color } = await request.json();

    // Validate color format (hex color or null)
    if (color !== null && !/^#[0-9A-F]{6}$/i.test(color)) {
      return NextResponse.json(
        { error: "Invalid color format. Must be hex color like #FF5733" },
        { status: 400 }
      );
    }

    // Create response object to capture Set-Cookie headers
    const responseHeaders = new Headers();
    const supabase = createSupabaseRouteClient(request, { headers: responseHeaders });

    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 503 }
      );
    }

    // Get current user with proper cookie-based auth
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: { user }, error: authError } = await (supabase as any).auth.getUser();

    if (authError || !user) {
      console.error("Auth error in update-color:", authError);
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Update profile color
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from("profiles")
      .update({ profile_color: color })
      .eq("id", user.id);

    if (updateError) {
      console.error("Error updating profile color:", updateError);
      return NextResponse.json(
        { error: "Failed to update color" },
        { status: 500 }
      );
    }

    // Return response with auth cookies from Supabase
    return new NextResponse(JSON.stringify({ success: true }), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Error in update-color API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
