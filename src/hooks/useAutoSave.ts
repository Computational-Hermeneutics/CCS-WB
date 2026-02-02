/**
 * Auto-Save Hook
 *
 * Provides auto-save functionality using the file system adapter.
 * Integrates with SessionContext for state management.
 *
 * Features:
 * - Debounced auto-save (1 second by default)
 * - Manual save trigger
 * - Save status tracking
 * - Error handling with retry
 * - File handle management
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { getFileSystemAdapter } from "@/lib/file-system";
import { storeFileMetadata } from "@/lib/file-system/db";
import type { SaveStatus, StoredFileMetadata } from "@/lib/file-system/types";

/**
 * Auto-save hook options
 */
export interface UseAutoSaveOptions {
  enabled?: boolean;
  debounceMs?: number;
  onSaveSuccess?: (timestamp: string) => void;
  onSaveError?: (error: Error) => void;
}

/**
 * Auto-save hook return type
 */
export interface UseAutoSaveReturn {
  saveStatus: SaveStatus;
  lastSaved: string | null;
  isDirty: boolean;
  save: () => Promise<void>;
  requestNewFile: (suggestedName: string) => Promise<boolean>;
  isSupported: boolean;
}

/**
 * Hook for auto-saving session to native file system
 *
 * @param options - Auto-save configuration options
 * @returns Auto-save state and functions
 */
export function useAutoSave(options: UseAutoSaveOptions = {}): UseAutoSaveReturn {
  const { enabled = true, debounceMs = 1000, onSaveSuccess, onSaveError } = options;

  const {
    session,
    markDirty,
    markClean,
    setFileHandle,
    removeFileHandle,
  } = useSession();

  const adapter = getFileSystemAdapter();

  // Save status state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSaved, setLastSaved] = useState<string | null>(
    session.lastSaved || null
  );

  // Track if adapter is supported
  const [isSupported] = useState(() => adapter.isSupported());

  // Debounce timer
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastModifiedRef = useRef<string>(session.lastModified);
  const isSavingRef = useRef(false);

  /**
   * Save session to file system
   */
  const saveToFileSystem = useCallback(async (): Promise<void> => {
    if (!enabled || !isSupported || isSavingRef.current) {
      return;
    }

    // Check if we have a file handle for this session
    const sessionFileId = session.id;
    const handleId = session.fileHandles?.[sessionFileId];

    if (!handleId) {
      console.log("[useAutoSave] No file handle for session, skipping auto-save");
      return;
    }

    isSavingRef.current = true;
    setSaveStatus("saving");

    try {
      // Retrieve the file handle
      const handle = await adapter.retrieveHandle(handleId);

      if (!handle) {
        throw new Error("File handle no longer available - permissions may have been revoked");
      }

      // Serialize session to JSON
      const sessionJson = JSON.stringify(session, null, 2);

      // Save to file
      await adapter.saveToHandle(handle, sessionJson);

      // Update metadata
      const now = new Date().toISOString();
      await adapter.updateMetadata(sessionFileId, {
        lastSaved: now,
        isDirty: false,
        size: sessionJson.length,
      });

      // Update state
      setLastSaved(now);
      markClean(now);
      setSaveStatus("saved");

      if (onSaveSuccess) {
        onSaveSuccess(now);
      }

      console.log("[useAutoSave] Session saved successfully");

      // Reset to idle after 2 seconds
      setTimeout(() => {
        setSaveStatus("idle");
      }, 2000);
    } catch (error) {
      console.error("[useAutoSave] Save failed:", error);
      setSaveStatus("error");

      if (onSaveError && error instanceof Error) {
        onSaveError(error);
      }

      // Reset to idle after 5 seconds
      setTimeout(() => {
        setSaveStatus("idle");
      }, 5000);
    } finally {
      isSavingRef.current = false;
    }
  }, [
    enabled,
    isSupported,
    session,
    adapter,
    markClean,
    onSaveSuccess,
    onSaveError,
  ]);

  /**
   * Manual save trigger
   */
  const save = useCallback(async (): Promise<void> => {
    // Cancel any pending debounced save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    await saveToFileSystem();
  }, [saveToFileSystem]);

  /**
   * Request a new file from the user
   * Shows native file picker
   */
  const requestNewFile = useCallback(
    async (suggestedName: string): Promise<boolean> => {
      if (!isSupported) {
        console.error("[useAutoSave] File system adapter not supported");
        return false;
      }

      try {
        // Request file handle
        const handle = await adapter.requestWriteHandle(suggestedName);

        if (!handle) {
          // User cancelled
          return false;
        }

        // Save session immediately to the new file
        const sessionJson = JSON.stringify(session, null, 2);
        await adapter.saveToHandle(handle, sessionJson);

        // Store handle in IndexedDB
        const handleId = await adapter.storeHandle(session.id, handle);

        // Create metadata
        const now = new Date().toISOString();
        const metadata: StoredFileMetadata = {
          id: session.id,
          name: typeof handle === "string" ? handle : handle.name,
          handleId,
          lastSaved: now,
          isDirty: false,
          size: sessionJson.length,
          mode: session.mode,
        };
        await storeFileMetadata(metadata);

        // Update SessionContext
        setFileHandle(session.id, handleId);
        markClean(now);

        setLastSaved(now);
        setSaveStatus("saved");

        console.log("[useAutoSave] New file created and saved:", handleId);

        // Reset to idle after 2 seconds
        setTimeout(() => {
          setSaveStatus("idle");
        }, 2000);

        return true;
      } catch (error) {
        console.error("[useAutoSave] Failed to create new file:", error);

        if (onSaveError && error instanceof Error) {
          onSaveError(error);
        }

        return false;
      }
    },
    [isSupported, adapter, session, setFileHandle, markClean, onSaveError]
  );

  /**
   * Auto-save effect - triggers when session changes
   */
  useEffect(() => {
    if (!enabled || !isSupported) {
      return;
    }

    // Check if session has changed since last save
    if (
      session.lastModified !== lastModifiedRef.current &&
      session.isDirty
    ) {
      lastModifiedRef.current = session.lastModified;

      // Cancel any existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new debounce timer
      debounceTimerRef.current = setTimeout(() => {
        saveToFileSystem();
      }, debounceMs);
    }

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled, isSupported, session, debounceMs, saveToFileSystem]);

  return {
    saveStatus,
    lastSaved,
    isDirty: session.isDirty || false,
    save,
    requestNewFile,
    isSupported,
  };
}
