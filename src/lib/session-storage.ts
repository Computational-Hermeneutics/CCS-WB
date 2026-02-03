// Per-mode session persistence
// Saves session data to localStorage keyed by mode

import type { Session, EntryMode } from "@/types";

const STORAGE_KEY_PREFIX = "ccs-session-";
const STORAGE_VERSION = "1";
const LAST_MODE_KEY = "ccs-last-mode";

interface StoredSession {
  version: string;
  session: Session;
  savedAt: string;
}

/**
 * Get the storage key for a specific mode
 */
function getStorageKey(mode: EntryMode): string {
  return `${STORAGE_KEY_PREFIX}${mode}`;
}

/**
 * Save session data for a specific mode to localStorage
 */
export function saveSessionForMode(mode: EntryMode, session: Session): void {
  if (typeof window === "undefined") return;

  try {
    const stored: StoredSession = {
      version: STORAGE_VERSION,
      session,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(getStorageKey(mode), JSON.stringify(stored));
  } catch (error) {
    console.warn("Failed to save session to localStorage:", error);
  }
}

/**
 * Load session data for a specific mode from localStorage
 * Returns null if no saved session exists or if it's invalid
 */
export function loadSessionForMode(mode: EntryMode): Session | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(getStorageKey(mode));
    if (!stored) return null;

    const parsed: StoredSession = JSON.parse(stored);

    // Version check - if versions don't match, clear and return null
    if (parsed.version !== STORAGE_VERSION) {
      clearSessionForMode(mode);
      return null;
    }

    // Ensure the session mode matches what we're loading
    if (parsed.session.mode !== mode) {
      return null;
    }

    return parsed.session;
  } catch (error) {
    console.warn("Failed to load session from localStorage:", error);
    return null;
  }
}

/**
 * Clear saved session data for a specific mode
 */
export function clearSessionForMode(mode: EntryMode): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(getStorageKey(mode));
  } catch (error) {
    console.warn("Failed to clear session from localStorage:", error);
  }
}

/**
 * Clear all saved session data for all modes
 */
export function clearAllSessions(): void {
  if (typeof window === "undefined") return;

  const modes: EntryMode[] = ["critique", "interpret", "create"];
  modes.forEach(clearSessionForMode);
}

/**
 * Check if a saved session exists for a specific mode
 */
export function hasSessionForMode(mode: EntryMode): boolean {
  if (typeof window === "undefined") return false;

  try {
    const stored = localStorage.getItem(getStorageKey(mode));
    return stored !== null;
  } catch {
    return false;
  }
}

/**
 * Get info about a saved session without loading the full data
 */
export function getSessionInfo(mode: EntryMode): { exists: boolean; savedAt?: string; messageCount?: number } {
  if (typeof window === "undefined") return { exists: false };

  try {
    const stored = localStorage.getItem(getStorageKey(mode));
    if (!stored) return { exists: false };

    const parsed: StoredSession = JSON.parse(stored);
    return {
      exists: true,
      savedAt: parsed.savedAt,
      messageCount: parsed.session.messages?.length || 0,
    };
  } catch {
    return { exists: false };
  }
}

/**
 * Save the last active mode
 */
export function saveLastMode(mode: EntryMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_MODE_KEY, mode);
  } catch (error) {
    console.warn("Failed to save last mode:", error);
  }
}

/**
 * Get the last active mode
 */
export function getLastMode(): EntryMode | null {
  if (typeof window === "undefined") return null;
  try {
    const mode = localStorage.getItem(LAST_MODE_KEY);
    if (mode && ["critique", "interpret", "create"].includes(mode)) {
      return mode as EntryMode;
    }
    return null;
  } catch {
    return null;
  }
}
