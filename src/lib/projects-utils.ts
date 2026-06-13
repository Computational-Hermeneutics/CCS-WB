/**
 * Shared utility functions for project operations
 */

import type { Profile } from "@/cloud/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetch profiles by user IDs (used in library, admin, members)
 * @param supabase Supabase client
 * @param userIds Array of user IDs to fetch profiles for
 * @returns Map of user ID to Profile
 */
export async function fetchProfilesByIds(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, Profile>> {
  if (userIds.length === 0) {
    return new Map();
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("*")
      .in("id", userIds);

    if (error) {
      console.error("Error fetching profiles:", error);
      return new Map();
    }

    const profileMap = new Map<string, Profile>();
    (data || []).forEach((profile: Profile) => {
      profileMap.set(profile.id, profile);
    });

    return profileMap;
  } catch (err) {
    console.error("Error in fetchProfilesByIds:", err);
    return new Map();
  }
}

/**
 * Remap IDs in an array of items (used in fork/copy operations)
 * @param items Array of items with id property
 * @param oldToNewMap Map of old IDs to new IDs
 * @returns Array with remapped IDs
 */
export function remapIds<T extends { id: string }>(
  items: T[],
  oldToNewMap: Map<string, string>
): T[] {
  return items.map((item) => {
    const newId = oldToNewMap.get(item.id);
    if (!newId) {
      console.warn(`No mapping found for ID: ${item.id}`);
      return item;
    }
    return { ...item, id: newId };
  });
}

/**
 * Standard error handler for project operations
 * @param error Error object or unknown
 * @param operation Operation name for logging
 * @returns Standardized Error object
 */
export function handleProjectError(
  error: unknown,
  operation: string
): Error {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${operation} error:`, error);
  return new Error(`${operation} failed: ${message}`);
}

/**
 * Check if error is a session expiration error
 * @param error Supabase error object
 * @returns true if error indicates session expiration
 */
export function isSessionExpiredError(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error?.code === "PGRST301" ||
    (error?.message?.includes("JWT") ?? false) ||
    (error?.message?.includes("expired") ?? false) ||
    (error?.message?.includes("invalid") ?? false)
  );
}

/**
 * Sanitize project name for filesystem/URL safety
 * @param name Project name to sanitize
 * @returns Sanitized name
 */
export function sanitizeProjectName(name: string): string {
  return name
    .replace(/[^a-z0-9-_ ]/gi, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 100); // Limit length
}

/**
 * Generate a unique project name by appending a number if needed
 * @param baseName Base name for the project
 * @param existingNames Set of existing project names
 * @returns Unique project name
 */
export function generateUniqueProjectName(
  baseName: string,
  existingNames: Set<string>
): string {
  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let counter = 2;
  let uniqueName = `${baseName} (${counter})`;
  while (existingNames.has(uniqueName)) {
    counter++;
    uniqueName = `${baseName} (${counter})`;
  }

  return uniqueName;
}
