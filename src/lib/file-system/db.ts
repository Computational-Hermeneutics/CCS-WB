/**
 * IndexedDB setup for file system adapter
 *
 * Database: ccs-wb-filesystem
 * Stores:
 * - fileHandles: FileSystemFileHandle objects (keyed by handleId)
 * - fileMetadata: StoredFileMetadata objects (keyed by fileId)
 * - config: Auto-save configuration
 * - syncOperations: Queued sync operations for resilience (keyed by id)
 */

import type { StoredFileMetadata, AutoSaveConfig } from "./types";

const DB_NAME = "ccs-wb-filesystem";
const DB_VERSION = 2; // Incremented for syncOperations store

// Object store names
export const STORE_FILE_HANDLES = "fileHandles";
export const STORE_FILE_METADATA = "fileMetadata";
export const STORE_CONFIG = "config";
export const STORE_SYNC_OPERATIONS = "syncOperations";

// Sync operation types
export interface SyncOperation {
  id: string;
  projectId: string;
  type: 'annotation_create' | 'annotation_update' | 'annotation_delete' |
        'file_save' | 'file_delete' | 'reply_create' | 'reply_delete';
  payload: unknown;
  timestamp: string;
  retryCount: number;
  status: 'pending' | 'processing' | 'failed';
}

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

      // Create syncOperations store (id -> SyncOperation)
      if (!db.objectStoreNames.contains(STORE_SYNC_OPERATIONS)) {
        const syncStore = db.createObjectStore(STORE_SYNC_OPERATIONS, { keyPath: "id" });
        // Index by projectId for efficient filtering
        syncStore.createIndex("projectId", "projectId", { unique: false });
        // Index by status for finding pending operations
        syncStore.createIndex("status", "status", { unique: false });
        // Compound index for projectId + status queries
        syncStore.createIndex("projectStatus", ["projectId", "status"], { unique: false });
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
 * Store a sync operation in IndexedDB
 */
export async function storeSyncOperation(operation: SyncOperation): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_SYNC_OPERATIONS], "readwrite");
    const store = transaction.objectStore(STORE_SYNC_OPERATIONS);

    const request = store.put(operation);

    request.onsuccess = () => {
      db.close();
      resolve();
    };

    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to store sync operation: ${request.error?.message}`));
    };
  });
}

/**
 * Get all pending sync operations for a project
 */
export async function getPendingSyncOperations(projectId: string): Promise<SyncOperation[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_SYNC_OPERATIONS], "readonly");
    const store = transaction.objectStore(STORE_SYNC_OPERATIONS);
    const index = store.index("projectStatus");

    const request = index.getAll([projectId, "pending"]);

    request.onsuccess = () => {
      db.close();
      resolve(request.result || []);
    };

    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to get pending sync operations: ${request.error?.message}`));
    };
  });
}

/**
 * Get all sync operations for a project (all statuses)
 */
export async function getAllSyncOperations(projectId: string): Promise<SyncOperation[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_SYNC_OPERATIONS], "readonly");
    const store = transaction.objectStore(STORE_SYNC_OPERATIONS);
    const index = store.index("projectId");

    const request = index.getAll(projectId);

    request.onsuccess = () => {
      db.close();
      resolve(request.result || []);
    };

    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to get sync operations: ${request.error?.message}`));
    };
  });
}

/**
 * Update a sync operation's status
 */
export async function updateSyncOperation(
  operationId: string,
  updates: Partial<SyncOperation>
): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_SYNC_OPERATIONS], "readwrite");
    const store = transaction.objectStore(STORE_SYNC_OPERATIONS);

    // Get existing operation first
    const getRequest = store.get(operationId);

    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (!existing) {
        db.close();
        reject(new Error(`Sync operation not found: ${operationId}`));
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
        reject(new Error(`Failed to update sync operation: ${putRequest.error?.message}`));
      };
    };

    getRequest.onerror = () => {
      db.close();
      reject(new Error(`Failed to get sync operation: ${getRequest.error?.message}`));
    };
  });
}

/**
 * Remove a sync operation from IndexedDB
 */
export async function removeSyncOperation(operationId: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_SYNC_OPERATIONS], "readwrite");
    const store = transaction.objectStore(STORE_SYNC_OPERATIONS);

    const request = store.delete(operationId);

    request.onsuccess = () => {
      db.close();
      resolve();
    };

    request.onerror = () => {
      db.close();
      reject(new Error(`Failed to remove sync operation: ${request.error?.message}`));
    };
  });
}

/**
 * Clear old sync operations (older than 24 hours)
 */
export async function pruneOldSyncOperations(): Promise<number> {
  const db = await openDatabase();
  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_SYNC_OPERATIONS], "readwrite");
    const store = transaction.objectStore(STORE_SYNC_OPERATIONS);

    const getAllRequest = store.getAll();
    let removedCount = 0;

    getAllRequest.onsuccess = () => {
      const operations: SyncOperation[] = getAllRequest.result || [];

      operations.forEach((op) => {
        if (op.timestamp < cutoffTime && op.status !== "pending") {
          const deleteRequest = store.delete(op.id);
          deleteRequest.onsuccess = () => {
            removedCount++;
          };
        }
      });
    };

    transaction.oncomplete = () => {
      db.close();
      resolve(removedCount);
    };

    transaction.onerror = () => {
      db.close();
      reject(new Error(`Failed to prune old sync operations: ${transaction.error?.message}`));
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
      [STORE_FILE_HANDLES, STORE_FILE_METADATA, STORE_CONFIG, STORE_SYNC_OPERATIONS],
      "readwrite"
    );

    let errors: string[] = [];

    // Clear all stores
    const stores = [STORE_FILE_HANDLES, STORE_FILE_METADATA, STORE_CONFIG, STORE_SYNC_OPERATIONS];
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
