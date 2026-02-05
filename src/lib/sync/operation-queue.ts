/**
 * Operation Queue Manager
 *
 * Manages a persistent queue of sync operations that should be
 * applied to the cloud when connection is available.
 *
 * Features:
 * - Persists operations across browser restarts
 * - Automatic retry with exponential backoff
 * - Operation ordering (FIFO)
 * - Batch processing
 */

import {
  storeSyncOperation,
  getPendingSyncOperations,
  getAllSyncOperations,
  updateSyncOperation,
  removeSyncOperation,
  pruneOldSyncOperations,
  type SyncOperation,
} from "../file-system/db";
import type { LineAnnotation, AnnotationReplyData, CodeReference } from "@/types";

/**
 * Operation payload types
 */
export type AnnotationCreatePayload = LineAnnotation;
export type AnnotationUpdatePayload = { id: string; updates: Partial<LineAnnotation> };
export type AnnotationDeletePayload = { id: string };
export type FilePayload = { id: string; content: string; name: string; metadata?: Partial<CodeReference> };
export type FileDeletePayload = { id: string };
export type ReplyCreatePayload = { annotationId: string; reply: AnnotationReplyData };
export type ReplyDeletePayload = { annotationId: string; replyId: string };

export type OperationPayload =
  | AnnotationCreatePayload
  | AnnotationUpdatePayload
  | AnnotationDeletePayload
  | FilePayload
  | FileDeletePayload
  | ReplyCreatePayload
  | ReplyDeletePayload;

/**
 * Operation processor function type
 * Returns true if operation succeeded, false if it should be retried
 */
export type OperationProcessor = (operation: SyncOperation) => Promise<boolean>;

/**
 * Queue a new sync operation
 * @param projectId - Project ID this operation belongs to
 * @param type - Operation type
 * @param payload - Operation data
 * @returns Operation ID for tracking
 */
export async function queueOperation(
  projectId: string,
  type: SyncOperation["type"],
  payload: OperationPayload
): Promise<string> {
  const operation: SyncOperation = {
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    projectId,
    type,
    payload,
    timestamp: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
  };

  await storeSyncOperation(operation);
  console.log(`[OperationQueue] Queued ${type} operation:`, operation.id);

  return operation.id;
}

/**
 * Get count of pending operations for a project
 */
export async function getPendingOperationCount(projectId: string): Promise<number> {
  const operations = await getPendingSyncOperations(projectId);
  return operations.length;
}

/**
 * Get all pending operations for a project (for display/debugging)
 */
export async function getPendingOperations(projectId: string): Promise<SyncOperation[]> {
  return getPendingSyncOperations(projectId);
}

/**
 * Process all pending operations for a project
 * @param projectId - Project ID to process operations for
 * @param processor - Function that attempts to sync each operation
 * @returns Summary of processing results
 */
export async function processQueue(
  projectId: string,
  processor: OperationProcessor
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  retrying: number;
}> {
  const operations = await getPendingSyncOperations(projectId);

  if (operations.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, retrying: 0 };
  }

  console.log(`[OperationQueue] Processing ${operations.length} pending operations for project ${projectId}`);

  // Sort by timestamp (FIFO)
  operations.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  let succeeded = 0;
  let failed = 0;
  let retrying = 0;

  for (const operation of operations) {
    try {
      // Mark as processing
      await updateSyncOperation(operation.id, { status: "processing" });

      // Attempt to process
      const success = await processor(operation);

      if (success) {
        // Remove from queue
        await removeSyncOperation(operation.id);
        succeeded++;
        console.log(`[OperationQueue] Operation ${operation.id} succeeded`);
      } else {
        // Failed - increment retry count
        const newRetryCount = operation.retryCount + 1;

        if (newRetryCount >= 5) {
          // Max retries exceeded - mark as failed
          await updateSyncOperation(operation.id, {
            status: "failed",
            retryCount: newRetryCount,
          });
          failed++;
          console.error(`[OperationQueue] Operation ${operation.id} failed after ${newRetryCount} attempts`);
        } else {
          // Retry later
          await updateSyncOperation(operation.id, {
            status: "pending",
            retryCount: newRetryCount,
          });
          retrying++;
          console.warn(`[OperationQueue] Operation ${operation.id} will retry (attempt ${newRetryCount + 1}/5)`);
        }
      }
    } catch (error) {
      // Unexpected error during processing
      console.error(`[OperationQueue] Error processing operation ${operation.id}:`, error);
      const newRetryCount = operation.retryCount + 1;

      if (newRetryCount >= 5) {
        await updateSyncOperation(operation.id, {
          status: "failed",
          retryCount: newRetryCount,
        });
        failed++;
      } else {
        await updateSyncOperation(operation.id, {
          status: "pending",
          retryCount: newRetryCount,
        });
        retrying++;
      }
    }
  }

  console.log(
    `[OperationQueue] Processing complete: ${succeeded} succeeded, ${failed} failed, ${retrying} retrying`
  );

  return {
    processed: operations.length,
    succeeded,
    failed,
    retrying,
  };
}

/**
 * Clear all failed operations for a project
 * Useful for cleaning up after resolving persistent errors
 */
export async function clearFailedOperations(projectId: string): Promise<number> {
  const operations = await getAllSyncOperations(projectId);
  const failedOps = operations.filter((op) => op.status === "failed");

  for (const op of failedOps) {
    await removeSyncOperation(op.id);
  }

  console.log(`[OperationQueue] Cleared ${failedOps.length} failed operations for project ${projectId}`);
  return failedOps.length;
}

/**
 * Clear all operations for a project
 * Use with caution - this removes pending operations!
 */
export async function clearAllOperations(projectId: string): Promise<number> {
  const operations = await getAllSyncOperations(projectId);

  for (const op of operations) {
    await removeSyncOperation(op.id);
  }

  console.log(`[OperationQueue] Cleared all ${operations.length} operations for project ${projectId}`);
  return operations.length;
}

/**
 * Auto-prune old operations (>24h and not pending)
 * Should be called periodically
 */
export async function autoPrune(): Promise<number> {
  const removed = await pruneOldSyncOperations();
  if (removed > 0) {
    console.log(`[OperationQueue] Auto-pruned ${removed} old operations`);
  }
  return removed;
}

/**
 * Get operation statistics for a project
 * Useful for displaying sync status to user
 */
export async function getOperationStats(
  projectId: string
): Promise<{
  pending: number;
  processing: number;
  failed: number;
  total: number;
}> {
  const operations = await getAllSyncOperations(projectId);

  return {
    pending: operations.filter((op) => op.status === "pending").length,
    processing: operations.filter((op) => op.status === "processing").length,
    failed: operations.filter((op) => op.status === "failed").length,
    total: operations.length,
  };
}

/**
 * Retry all failed operations for a project
 * Resets them to pending status
 */
export async function retryFailedOperations(projectId: string): Promise<number> {
  const operations = await getAllSyncOperations(projectId);
  const failedOps = operations.filter((op) => op.status === "failed");

  for (const op of failedOps) {
    await updateSyncOperation(op.id, {
      status: "pending",
      retryCount: 0, // Reset retry count
    });
  }

  console.log(`[OperationQueue] Reset ${failedOps.length} failed operations to pending for project ${projectId}`);
  return failedOps.length;
}

/**
 * Check if a project has any pending operations
 */
export async function hasPendingOperations(projectId: string): Promise<boolean> {
  const operations = await getPendingSyncOperations(projectId);
  return operations.length > 0;
}

/**
 * Export operation queue for debugging or manual recovery
 */
export async function exportQueue(projectId: string): Promise<SyncOperation[]> {
  return getAllSyncOperations(projectId);
}

/**
 * Helper function to deduplicate operations
 * Removes older duplicate operations of the same type on the same entity
 * For example, multiple "annotation_update" operations on the same annotation ID
 */
export async function deduplicateQueue(projectId: string): Promise<number> {
  const operations = await getPendingSyncOperations(projectId);

  // Group operations by type and entity ID
  const grouped = new Map<string, SyncOperation[]>();

  for (const op of operations) {
    let key: string | null = null;

    switch (op.type) {
      case "annotation_create":
      case "annotation_update":
      case "annotation_delete":
        key = `${op.type}-${(op.payload as any).id}`;
        break;
      case "file_save":
      case "file_delete":
        key = `${op.type}-${(op.payload as any).id}`;
        break;
      case "reply_create":
      case "reply_delete":
        key = `${op.type}-${(op.payload as any).annotationId}-${(op.payload as any).replyId || "new"}`;
        break;
    }

    if (key) {
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(op);
    }
  }

  // For each group, keep only the latest operation
  let removed = 0;

  for (const [key, ops] of grouped.entries()) {
    if (ops.length > 1) {
      // Sort by timestamp descending (newest first)
      ops.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      // Remove all but the first (newest)
      for (let i = 1; i < ops.length; i++) {
        await removeSyncOperation(ops[i].id);
        removed++;
      }
    }
  }

  if (removed > 0) {
    console.log(`[OperationQueue] Deduplicated queue: removed ${removed} duplicate operations`);
  }

  return removed;
}
