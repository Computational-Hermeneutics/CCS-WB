/**
 * File System Abstraction Layer Types
 *
 * Provides a unified interface for file operations across different platforms:
 * - Browser: File System Access API + IndexedDB fallback
 * - Electron: Native fs/dialog APIs (future)
 */

import type { EntryMode } from "@/types";

/**
 * Opaque handle to a native file system file
 * In browsers, this is FileSystemFileHandle
 * In Electron, this would be a file path string
 */
export type FileHandle = FileSystemFileHandle | string;

/**
 * Metadata about a stored file
 */
export interface StoredFileMetadata {
  id: string;              // Session file ID
  name: string;            // File name
  handleId: string;        // IndexedDB key for retrieving the file handle
  lastSaved: string;       // ISO timestamp of last save
  isDirty: boolean;        // Has unsaved changes
  size: number;            // File size in bytes
  mode: EntryMode;         // Which mode this file belongs to
}

/**
 * Auto-save configuration
 */
export interface AutoSaveConfig {
  enabled: boolean;
  debounceMs: number;      // Debounce time before auto-save triggers
  showNotifications: boolean; // Show toast notifications on save
}

/**
 * Default auto-save configuration
 */
export const DEFAULT_AUTO_SAVE_CONFIG: AutoSaveConfig = {
  enabled: true,
  debounceMs: 1000,        // 1 second debounce (matches SessionContext)
  showNotifications: false, // Don't spam user with save notifications
};

/**
 * Save status states
 */
export type SaveStatus =
  | 'idle'                 // No unsaved changes
  | 'dirty'                // Has unsaved changes
  | 'saving'               // Currently saving
  | 'saved'                // Recently saved successfully
  | 'error';               // Save failed

/**
 * File System Adapter Interface
 *
 * All file system operations must go through an adapter implementing this interface.
 * This allows the same code to work in browsers (using File System Access API or IndexedDB)
 * and in Electron (using native fs APIs).
 */
export interface FileSystemAdapter {
  /**
   * Check if this adapter is supported in the current environment
   */
  isSupported(): boolean;

  /**
   * Request write access to a file
   * Shows native file picker in browsers
   *
   * @param name - Suggested file name
   * @returns File handle or null if user cancelled
   */
  requestWriteHandle(name: string): Promise<FileHandle | null>;

  /**
   * Save content to an existing file handle
   *
   * @param handle - File handle obtained from requestWriteHandle
   * @param content - File content to save
   */
  saveToHandle(handle: FileHandle, content: string): Promise<void>;

  /**
   * Store a file handle in persistent storage for later retrieval
   *
   * @param fileId - Session file ID
   * @param handle - File handle to store
   * @returns handleId for later retrieval
   */
  storeHandle(fileId: string, handle: FileHandle): Promise<string>;

  /**
   * Retrieve a previously stored file handle
   *
   * @param handleId - Handle ID from storeHandle
   * @returns File handle or null if not found/permission denied
   */
  retrieveHandle(handleId: string): Promise<FileHandle | null>;

  /**
   * Remove a stored file handle
   *
   * @param handleId - Handle ID to remove
   */
  removeHandle(handleId: string): Promise<void>;

  /**
   * Get metadata about a stored file
   *
   * @param fileId - Session file ID
   * @returns Metadata or null if not found
   */
  getMetadata(fileId: string): Promise<StoredFileMetadata | null>;

  /**
   * Update metadata for a stored file
   *
   * @param fileId - Session file ID
   * @param updates - Partial metadata to update
   */
  updateMetadata(fileId: string, updates: Partial<StoredFileMetadata>): Promise<void>;

  /**
   * List all stored files for a mode
   *
   * @param mode - Entry mode to filter by
   * @returns Array of file metadata
   */
  listFiles(mode: EntryMode): Promise<StoredFileMetadata[]>;

  /**
   * Clear all stored handles and metadata
   * Useful for cleanup/reset
   */
  clearAll(): Promise<void>;
}
