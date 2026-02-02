/**
 * IndexedDB setup for file system adapter
 *
 * Database: ccs-wb-filesystem
 * Stores:
 * - fileHandles: FileSystemFileHandle objects (keyed by handleId)
 * - fileMetadata: StoredFileMetadata objects (keyed by fileId)
 * - config: Auto-save configuration
 */

import type { StoredFileMetadata, AutoSaveConfig } from "./types";

const DB_NAME = "ccs-wb-filesystem";
const DB_VERSION = 1;

// Object store names
export const STORE_FILE_HANDLES = "fileHandles";
export const STORE_FILE_METADATA = "fileMetadata";
export const STORE_CONFIG = "config";

/**
 * Open the IndexedDB database
 * Creates stores if they don't exist
 */
export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create fileHandles store (handleId -> FileSystemFileHandle)
      if (!db.objectStoreNames.contains(STORE_FILE_HANDLES)) {
        db.createObjectStore(STORE_FILE_HANDLES);
      }

      // Create fileMetadata store (fileId -> StoredFileMetadata)
      if (!db.objectStoreNames.contains(STORE_FILE_METADATA)) {
        const metadataStore = db.createObjectStore(STORE_FILE_METADATA, { keyPath: "id" });
        // Index by mode for efficient filtering
        metadataStore.createIndex("mode", "mode", { unique: false });
        // Index by handleId for lookups
        metadataStore.createIndex("handleId", "handleId", { unique: true });
      }

      // Create config store (key-value pairs)
      if (!db.objectStoreNames.contains(STORE_CONFIG)) {
        db.createObjectStore(STORE_CONFIG);
      }
    };
  });
}

/**
 * Store a file handle in IndexedDB
 * @returns handleId for later retrieval
 */
export async function storeFileHandle(
  fileId: string,
  handle: FileSystemFileHandle
): Promise<string> {
  const db = await openDatabase();
  const handleId = `handle-${fileId}-${Date.now()}`;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_FILE_HANDLES], "readwrite");
    const store = transaction.objectStore(STORE_FILE_HANDLES);

    const request = store.put(handle, handleId);

    request.onsuccess = () => {
      db.close();
      resolve(handleId);
    };

    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to store file handle: ${request.error?.message}`));
    };
  });
}

/**
 * Retrieve a file handle from IndexedDB
 */
export async function retrieveFileHandle(
  handleId: string
): Promise<FileSystemFileHandle | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_FILE_HANDLES], "readonly");
    const store = transaction.objectStore(STORE_FILE_HANDLES);

    const request = store.get(handleId);

    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };

    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to retrieve file handle: ${request.error?.message}`));
    };
  });
}

/**
 * Remove a file handle from IndexedDB
 */
export async function removeFileHandle(handleId: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_FILE_HANDLES], "readwrite");
    const store = transaction.objectStore(STORE_FILE_HANDLES);

    const request = store.delete(handleId);

    request.onsuccess = () => {
      db.close();
      resolve();
    };

    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to remove file handle: ${request.error?.message}`));
    };
  });
}

/**
 * Store file metadata in IndexedDB
 */
export async function storeFileMetadata(metadata: StoredFileMetadata): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_FILE_METADATA], "readwrite");
    const store = transaction.objectStore(STORE_FILE_METADATA);

    const request = store.put(metadata);

    request.onsuccess = () => {
      db.close();
      resolve();
    };

    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to store file metadata: ${request.error?.message}`));
    };
  });
}

/**
 * Retrieve file metadata from IndexedDB
 */
export async function retrieveFileMetadata(
  fileId: string
): Promise<StoredFileMetadata | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_FILE_METADATA], "readonly");
    const store = transaction.objectStore(STORE_FILE_METADATA);

    const request = store.get(fileId);

    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };

    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to retrieve file metadata: ${request.error?.message}`));
    };
  });
}

/**
 * Update file metadata in IndexedDB
 */
export async function updateFileMetadata(
  fileId: string,
  updates: Partial<StoredFileMetadata>
): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_FILE_METADATA], "readwrite");
    const store = transaction.objectStore(STORE_FILE_METADATA);

    // Get existing metadata first
    const getRequest = store.get(fileId);

    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (!existing) {
        db.close();
        reject(new Error(`File metadata not found: ${fileId}`));
        return;
      }

      // Merge updates
      const updated = { ...existing, ...updates };

      const putRequest = store.put(updated);

      putRequest.onsuccess = () => {
        db.close();
        resolve();
      };

      putRequest.onerror = () => {
        db.close();
        reject(new Error(`Failed to update file metadata: ${putRequest.error?.message}`));
      };
    };

    getRequest.onerror = () => {
      db.close();
      reject(new Error(`Failed to get file metadata: ${getRequest.error?.message}`));
    };
  });
}

/**
 * List all file metadata for a specific mode
 */
export async function listFileMetadataByMode(
  mode: string
): Promise<StoredFileMetadata[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_FILE_METADATA], "readonly");
    const store = transaction.objectStore(STORE_FILE_METADATA);
    const index = store.index("mode");

    const request = index.getAll(mode);

    request.onsuccess = () => {
      db.close();
      resolve(request.result || []);
    };

    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to list file metadata: ${request.error?.message}`));
    };
  });
}

/**
 * Remove file metadata from IndexedDB
 */
export async function removeFileMetadata(fileId: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_FILE_METADATA], "readwrite");
    const store = transaction.objectStore(STORE_FILE_METADATA);

    const request = store.delete(fileId);

    request.onsuccess = () => {
      db.close();
      resolve();
    };

    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to remove file metadata: ${request.error?.message}`));
    };
  });
}

/**
 * Get auto-save configuration
 */
export async function getAutoSaveConfig(): Promise<AutoSaveConfig | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_CONFIG], "readonly");
    const store = transaction.objectStore(STORE_CONFIG);

    const request = store.get("autoSaveConfig");

    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };

    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to get auto-save config: ${request.error?.message}`));
    };
  });
}

/**
 * Set auto-save configuration
 */
export async function setAutoSaveConfig(config: AutoSaveConfig): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_CONFIG], "readwrite");
    const store = transaction.objectStore(STORE_CONFIG);

    const request = store.put(config, "autoSaveConfig");

    request.onsuccess = () => {
      db.close();
      resolve();
    };

    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to set auto-save config: ${request.error?.message}`));
    };
  });
}

/**
 * Clear all data from the database
 */
export async function clearAllData(): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORE_FILE_HANDLES, STORE_FILE_METADATA, STORE_CONFIG],
      "readwrite"
    );

    let errors: string[] = [];

    // Clear all stores
    const stores = [STORE_FILE_HANDLES, STORE_FILE_METADATA, STORE_CONFIG];
    stores.forEach((storeName) => {
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onerror = () => {
        errors.push(`Failed to clear ${storeName}: ${request.error?.message}`);
      };
    });

    transaction.oncomplete = () => {
      db.close();
      if (errors.length > 0) {
        reject(new Error(errors.join("; ")));
      } else {
        resolve();
      }
    };

    transaction.onerror = () => {
      db.close();
      reject(new Error(`Transaction failed: ${transaction.error?.message}`));
    };
  });
}
