/**
 * File System Abstraction Layer - Factory
 *
 * Exports the appropriate file system adapter based on the environment:
 * - Electron: ElectronFileSystemAdapter (future)
 * - Browser: BrowserFileSystemAdapter
 */

import { BrowserFileSystemAdapter } from "./browser-adapter";
import { ElectronFileSystemAdapter } from "./electron-adapter";
import type { FileSystemAdapter } from "./types";

// Re-export types
export * from "./types";

/**
 * Create the appropriate file system adapter for the current environment
 *
 * Priority:
 * 1. Electron adapter (if in Electron)
 * 2. Browser adapter (default)
 */
export function createFileSystemAdapter(): FileSystemAdapter {
  // Check for Electron first (future)
  const electronAdapter = new ElectronFileSystemAdapter();
  if (electronAdapter.isSupported()) {
    console.log("[FileSystem] Using Electron adapter");
    return electronAdapter;
  }

  // Default to browser adapter
  console.log("[FileSystem] Using Browser adapter");
  return new BrowserFileSystemAdapter();
}

/**
 * Singleton instance of the file system adapter
 * Create once and reuse
 */
let adapterInstance: FileSystemAdapter | null = null;

/**
 * Get the singleton file system adapter instance
 */
export function getFileSystemAdapter(): FileSystemAdapter {
  if (!adapterInstance) {
    adapterInstance = createFileSystemAdapter();
  }
  return adapterInstance;
}

/**
 * Reset the adapter instance (useful for testing)
 */
export function resetFileSystemAdapter(): void {
  adapterInstance = null;
}
