/**
 * Browser File System Adapter
 *
 * Implements file system operations using:
 * - File System Access API (Chrome/Edge/Safari 15.2+)
 * - IndexedDB for handle persistence
 *
 * Strategy:
 * 1. Request write handle on first save (shows native file picker)
 * 2. Store handle in IndexedDB
 * 3. Subsequent saves write directly to the file
 * 4. Permissions persist across sessions (for most browsers)
 */

import type { EntryMode } from "@/types";
import type { FileSystemAdapter, FileHandle, StoredFileMetadata } from "./types";
import {
  storeFileHandle,
  retrieveFileHandle,
  removeFileHandle,
  storeFileMetadata,
  retrieveFileMetadata,
  updateFileMetadata,
  listFileMetadataByMode,
  removeFileMetadata,
  clearAllData,
} from "./db";

/**
 * Check if File System Access API is supported
 */
function isFileSystemAccessAPISupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "showSaveFilePicker" in window &&
    typeof window.showSaveFilePicker === "function"
  );
}

/**
 * Browser implementation of FileSystemAdapter
 */
export class BrowserFileSystemAdapter implements FileSystemAdapter {
  /**
   * Check if this adapter is supported in the current environment
   */
  isSupported(): boolean {
    // Check for File System Access API
    if (isFileSystemAccessAPISupported()) {
      console.log("[BrowserAdapter] File System Access API supported");
      return true;
    }

    // Check for IndexedDB (fallback)
    if (typeof window !== "undefined" && "indexedDB" in window) {
      console.log("[BrowserAdapter] IndexedDB fallback available");
      return true;
    }

    return false;
  }

  /**
   * Request write access to a file
   * Shows native file picker
   */
  async requestWriteHandle(name: string): Promise<FileHandle | null> {
    if (!isFileSystemAccessAPISupported()) {
      throw new Error("File System Access API not supported");
    }

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: "CCS Session File",
            accept: { "application/json": [".ccs"] },
          },
        ],
      });

      console.log("[BrowserAdapter] File handle obtained:", handle.name);
      return handle;
    } catch (error) {
      // User cancelled the picker
      if (error instanceof Error && error.name === "AbortError") {
        console.log("[BrowserAdapter] User cancelled file picker");
        return null;
      }

      console.error("[BrowserAdapter] Error requesting file handle:", error);
      throw error;
    }
  }

  /**
   * Save content to an existing file handle
   */
  async saveToHandle(handle: FileHandle, content: string): Promise<void> {
    if (typeof handle === "string") {
      throw new Error("String handles not supported in browser adapter");
    }

    try {
      // Request write permission (may prompt user)
      const permission = await handle.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        const requestResult = await handle.requestPermission({ mode: "readwrite" });
        if (requestResult !== "granted") {
          throw new Error("Write permission denied");
        }
      }

      // Create a writable stream
      const writable = await handle.createWritable();

      // Write the content
      await writable.write(content);

      // Close the stream
      await writable.close();

      console.log("[BrowserAdapter] File saved successfully:", handle.name);
    } catch (error) {
      console.error("[BrowserAdapter] Error saving to file handle:", error);
      throw error;
    }
  }

  /**
   * Store a file handle in IndexedDB
   */
  async storeHandle(fileId: string, handle: FileHandle): Promise<string> {
    if (typeof handle === "string") {
      throw new Error("String handles not supported in browser adapter");
    }

    try {
      const handleId = await storeFileHandle(fileId, handle);
      console.log("[BrowserAdapter] File handle stored:", handleId);
      return handleId;
    } catch (error) {
      console.error("[BrowserAdapter] Error storing file handle:", error);
      throw error;
    }
  }

  /**
   * Retrieve a file handle from IndexedDB
   */
  async retrieveHandle(handleId: string): Promise<FileHandle | null> {
    try {
      const handle = await retrieveFileHandle(handleId);

      if (!handle) {
        console.log("[BrowserAdapter] File handle not found:", handleId);
        return null;
      }

      // Check if we still have permission
      const permission = await handle.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        console.log("[BrowserAdapter] Permission denied for handle:", handleId);
        // Try to request permission
        const requestResult = await handle.requestPermission({ mode: "readwrite" });
        if (requestResult !== "granted") {
          return null;
        }
      }

      console.log("[BrowserAdapter] File handle retrieved:", handle.name);
      return handle;
    } catch (error) {
      console.error("[BrowserAdapter] Error retrieving file handle:", error);
      return null;
    }
  }

  /**
   * Remove a file handle from IndexedDB
   */
  async removeHandle(handleId: string): Promise<void> {
    try {
      await removeFileHandle(handleId);
      console.log("[BrowserAdapter] File handle removed:", handleId);
    } catch (error) {
      console.error("[BrowserAdapter] Error removing file handle:", error);
      throw error;
    }
  }

  /**
   * Get metadata about a stored file
   */
  async getMetadata(fileId: string): Promise<StoredFileMetadata | null> {
    try {
      const metadata = await retrieveFileMetadata(fileId);
      return metadata;
    } catch (error) {
      console.error("[BrowserAdapter] Error getting metadata:", error);
      return null;
    }
  }

  /**
   * Update metadata for a stored file
   */
  async updateMetadata(fileId: string, updates: Partial<StoredFileMetadata>): Promise<void> {
    try {
      await updateFileMetadata(fileId, updates);
      console.log("[BrowserAdapter] Metadata updated for:", fileId);
    } catch (error) {
      console.error("[BrowserAdapter] Error updating metadata:", error);
      throw error;
    }
  }

  /**
   * List all stored files for a mode
   */
  async listFiles(mode: EntryMode): Promise<StoredFileMetadata[]> {
    try {
      const files = await listFileMetadataByMode(mode);
      console.log(`[BrowserAdapter] Found ${files.length} files for mode:`, mode);
      return files;
    } catch (error) {
      console.error("[BrowserAdapter] Error listing files:", error);
      return [];
    }
  }

  /**
   * Clear all stored handles and metadata
   */
  async clearAll(): Promise<void> {
    try {
      await clearAllData();
      console.log("[BrowserAdapter] All data cleared");
    } catch (error) {
      console.error("[BrowserAdapter] Error clearing data:", error);
      throw error;
    }
  }

  /**
   * Create metadata for a new file
   */
  async createMetadata(
    fileId: string,
    name: string,
    handleId: string,
    mode: EntryMode,
    size: number
  ): Promise<StoredFileMetadata> {
    const metadata: StoredFileMetadata = {
      id: fileId,
      name,
      handleId,
      lastSaved: new Date().toISOString(),
      isDirty: false,
      size,
      mode,
    };

    await storeFileMetadata(metadata);
    return metadata;
  }

  /**
   * Remove both handle and metadata
   */
  async removeFile(fileId: string): Promise<void> {
    try {
      // Get metadata to find handleId
      const metadata = await retrieveFileMetadata(fileId);

      if (metadata) {
        // Remove handle
        await removeFileHandle(metadata.handleId);
      }

      // Remove metadata
      await removeFileMetadata(fileId);

      console.log("[BrowserAdapter] File removed:", fileId);
    } catch (error) {
      console.error("[BrowserAdapter] Error removing file:", error);
      throw error;
    }
  }
}
