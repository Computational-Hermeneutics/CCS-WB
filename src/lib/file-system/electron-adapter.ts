/**
 * Electron File System Adapter (Stub)
 *
 * This is a stub implementation for future Electron support.
 * When implemented, it will use Electron's native fs and dialog APIs
 * instead of File System Access API and IndexedDB.
 *
 * Implementation notes for future:
 * - Use electron.ipcRenderer to communicate with main process
 * - Main process uses fs module for file operations
 * - dialog.showSaveDialog for file pickers
 * - Store file paths as strings instead of FileSystemFileHandle
 * - No need for IndexedDB - can use fs directly
 */

import type { EntryMode } from "@/types";
import type { FileSystemAdapter, FileHandle, StoredFileMetadata } from "./types";

/**
 * Electron implementation of FileSystemAdapter
 *
 * NOT YET IMPLEMENTED - All methods throw errors
 */
export class ElectronFileSystemAdapter implements FileSystemAdapter {
  /**
   * Check if running in Electron environment
   */
  isSupported(): boolean {
    // Check for Electron's window.electron or process.versions.electron
    if (typeof window !== "undefined") {
      return (
        "electron" in window ||
        (typeof process !== "undefined" &&
          process.versions &&
          "electron" in process.versions)
      );
    }
    return false;
  }

  async requestWriteHandle(_name: string): Promise<FileHandle | null> {
    throw new Error("Electron adapter not yet implemented");
  }

  async saveToHandle(_handle: FileHandle, _content: string): Promise<void> {
    throw new Error("Electron adapter not yet implemented");
  }

  async storeHandle(_fileId: string, _handle: FileHandle): Promise<string> {
    throw new Error("Electron adapter not yet implemented");
  }

  async retrieveHandle(_handleId: string): Promise<FileHandle | null> {
    throw new Error("Electron adapter not yet implemented");
  }

  async removeHandle(_handleId: string): Promise<void> {
    throw new Error("Electron adapter not yet implemented");
  }

  async getMetadata(_fileId: string): Promise<StoredFileMetadata | null> {
    throw new Error("Electron adapter not yet implemented");
  }

  async updateMetadata(
    _fileId: string,
    _updates: Partial<StoredFileMetadata>
  ): Promise<void> {
    throw new Error("Electron adapter not yet implemented");
  }

  async listFiles(_mode: EntryMode): Promise<StoredFileMetadata[]> {
    throw new Error("Electron adapter not yet implemented");
  }

  async clearAll(): Promise<void> {
    throw new Error("Electron adapter not yet implemented");
  }
}
