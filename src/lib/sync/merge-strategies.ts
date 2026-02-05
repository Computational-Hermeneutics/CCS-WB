/**
 * Merge Strategies
 *
 * Functions to merge remote state with local pending operations
 * without losing data.
 *
 * Strategy:
 * - Annotations: Additive (support multiple annotations per line, no conflicts)
 * - Files: Detect conflicts when same file edited locally and remotely
 * - Last-write-wins by default with conflict detection
 */

import type {
  LineAnnotation,
  CodeReference,
  AnnotationReplyData,
} from "@/types";
import type { SyncOperation } from "../file-system/db";

/**
 * Conflict detected during merge
 */
export interface MergeConflict {
  type: "file_content";
  entityId: string;
  entityName: string;
  description: string;
  localValue: unknown;
  remoteValue: unknown;
}

/**
 * Result of a merge operation
 */
export interface MergeResult<T> {
  merged: T;
  conflicts: MergeConflict[];
}

/**
 * Merge remote annotations with pending operations
 *
 * Strategy: ADDITIVE - no conflicts
 * - Annotations support multiple per line
 * - Add local pending annotations to remote annotations
 * - Update/delete operations applied to remote state
 * - Result contains all annotations (remote + local changes)
 *
 * @param remoteAnnotations - Annotations from cloud
 * @param pendingOperations - Pending sync operations
 * @param localAnnotations - Current local annotations (for detecting truly local-only)
 * @returns Merged annotations with no conflicts
 */
export function mergeAnnotations(
  remoteAnnotations: LineAnnotation[],
  pendingOperations: SyncOperation[],
  localAnnotations: LineAnnotation[]
): MergeResult<LineAnnotation[]> {
  // Start with remote annotations
  let merged = [...remoteAnnotations];

  // Track which local annotations have already been synced
  const remoteIds = new Set(remoteAnnotations.map((a) => a.id));

  // Process pending operations in chronological order
  const annotationOps = pendingOperations.filter((op) =>
    ["annotation_create", "annotation_update", "annotation_delete"].includes(op.type)
  );

  annotationOps.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  for (const op of annotationOps) {
    switch (op.type) {
      case "annotation_create": {
        const annotation = op.payload as LineAnnotation;
        // Only add if not already in remote (truly local-only)
        if (!remoteIds.has(annotation.id)) {
          merged.push(annotation);
        }
        break;
      }

      case "annotation_update": {
        const { id, updates } = op.payload as { id: string; updates: Partial<LineAnnotation> };
        const index = merged.findIndex((a) => a.id === id);
        if (index !== -1) {
          merged[index] = { ...merged[index], ...updates };
        }
        break;
      }

      case "annotation_delete": {
        const { id } = op.payload as { id: string };
        merged = merged.filter((a) => a.id !== id);
        break;
      }
    }
  }

  // Add truly local-only annotations (not in remote, not in pending ops)
  const pendingIds = new Set(
    annotationOps
      .filter((op) => op.type === "annotation_create")
      .map((op) => (op.payload as LineAnnotation).id)
  );

  for (const localAnnotation of localAnnotations) {
    if (!remoteIds.has(localAnnotation.id) && !pendingIds.has(localAnnotation.id)) {
      merged.push(localAnnotation);
    }
  }

  return {
    merged,
    conflicts: [], // No conflicts for annotations (additive strategy)
  };
}

/**
 * Merge remote files with pending operations
 *
 * Strategy: CONFLICT DETECTION
 * - If file content changed both locally and remotely → conflict
 * - If file deleted remotely but edited locally → conflict
 * - Otherwise apply pending operations
 *
 * @param remoteFiles - Files from cloud
 * @param remoteContents - File contents from cloud
 * @param pendingOperations - Pending sync operations
 * @param localFiles - Current local files
 * @param localContents - Current local file contents
 * @returns Merged files and contents with conflict detection
 */
export function mergeFiles(
  remoteFiles: CodeReference[],
  remoteContents: Record<string, string>,
  pendingOperations: SyncOperation[],
  localFiles: CodeReference[],
  localContents: Record<string, string>
): MergeResult<{
  files: CodeReference[];
  contents: Record<string, string>;
}> {
  let mergedFiles = [...remoteFiles];
  let mergedContents = { ...remoteContents };
  const conflicts: MergeConflict[] = [];

  // Get pending file operations
  const fileOps = pendingOperations.filter((op) =>
    ["file_save", "file_delete"].includes(op.type)
  );

  fileOps.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Track remote file IDs
  const remoteIds = new Set(remoteFiles.map((f) => f.id));

  for (const op of fileOps) {
    switch (op.type) {
      case "file_save": {
        const { id, content, name, metadata } = op.payload as {
          id: string;
          content: string;
          name: string;
          metadata?: Partial<CodeReference>;
        };

        const remoteFile = remoteFiles.find((f) => f.id === id);
        const localFile = localFiles.find((f) => f.id === id);

        if (remoteFile) {
          // File exists in remote
          const remoteContent = remoteContents[id];
          const hasRemoteContentChanged = remoteContent !== localContents[id];
          const hasLocalContentChanged = content !== remoteContent;

          if (hasRemoteContentChanged && hasLocalContentChanged) {
            // CONFLICT: Both local and remote changed
            conflicts.push({
              type: "file_content",
              entityId: id,
              entityName: name,
              description: "File was modified both locally and remotely",
              localValue: content,
              remoteValue: remoteContent,
            });
            // Don't apply change - let user resolve
            continue;
          }

          // No conflict - apply local change
          mergedContents[id] = content;
          const fileIndex = mergedFiles.findIndex((f) => f.id === id);
          if (fileIndex !== -1 && metadata) {
            mergedFiles[fileIndex] = { ...mergedFiles[fileIndex], ...metadata };
          }
        } else {
          // New local file - add it
          if (localFile) {
            mergedFiles.push(localFile);
            mergedContents[id] = content;
          }
        }
        break;
      }

      case "file_delete": {
        const { id } = op.payload as { id: string };
        const remoteFile = remoteFiles.find((f) => f.id === id);
        const localFile = localFiles.find((f) => f.id === id);

        if (remoteFile) {
          const remoteContent = remoteContents[id];
          const localContent = localContents[id];

          // Check if file was modified remotely since local decided to delete
          if (remoteContent !== localContent) {
            // CONFLICT: Remote modified, local wants to delete
            conflicts.push({
              type: "file_content",
              entityId: id,
              entityName: remoteFile.name,
              description: "File was deleted locally but modified remotely",
              localValue: null,
              remoteValue: remoteContent,
            });
            // Don't delete - let user resolve
            continue;
          }

          // No conflict - apply deletion
          mergedFiles = mergedFiles.filter((f) => f.id !== id);
          delete mergedContents[id];
        }
        break;
      }
    }
  }

  // Add truly local-only files (not in remote, not in pending ops)
  const pendingFileIds = new Set(
    fileOps
      .filter((op) => op.type === "file_save")
      .map((op) => (op.payload as any).id)
  );

  for (const localFile of localFiles) {
    if (!remoteIds.has(localFile.id) && !pendingFileIds.has(localFile.id)) {
      mergedFiles.push(localFile);
      mergedContents[localFile.id] = localContents[localFile.id];
    }
  }

  return {
    merged: {
      files: mergedFiles,
      contents: mergedContents,
    },
    conflicts,
  };
}

/**
 * Merge remote annotation replies with pending operations
 *
 * Strategy: ADDITIVE - no conflicts
 * - Replies are additions to annotations
 * - Add local pending replies
 * - Delete operations applied
 *
 * @param remoteAnnotations - Annotations with replies from cloud
 * @param pendingOperations - Pending sync operations
 * @param localAnnotations - Current local annotations (for truly local-only replies)
 * @returns Annotations with merged replies
 */
export function mergeReplies(
  remoteAnnotations: LineAnnotation[],
  pendingOperations: SyncOperation[],
  localAnnotations: LineAnnotation[]
): MergeResult<LineAnnotation[]> {
  let merged = JSON.parse(JSON.stringify(remoteAnnotations)) as LineAnnotation[];

  // Process pending reply operations
  const replyOps = pendingOperations.filter((op) =>
    ["reply_create", "reply_delete"].includes(op.type)
  );

  replyOps.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  for (const op of replyOps) {
    switch (op.type) {
      case "reply_create": {
        const { annotationId, reply } = op.payload as {
          annotationId: string;
          reply: AnnotationReplyData;
        };

        const annotation = merged.find((a) => a.id === annotationId);
        if (annotation) {
          if (!annotation.replies) {
            annotation.replies = [];
          }

          // Only add if not already present (check by ID)
          const existingReplyIds = new Set(annotation.replies.map((r) => r.id));
          if (!existingReplyIds.has(reply.id)) {
            annotation.replies.push(reply);
          }
        }
        break;
      }

      case "reply_delete": {
        const { annotationId, replyId } = op.payload as {
          annotationId: string;
          replyId: string;
        };

        const annotation = merged.find((a) => a.id === annotationId);
        if (annotation && annotation.replies) {
          annotation.replies = annotation.replies.filter((r) => r.id !== replyId);
        }
        break;
      }
    }
  }

  // Add truly local-only replies
  for (const localAnnotation of localAnnotations) {
    const remoteAnnotation = merged.find((a) => a.id === localAnnotation.id);

    if (remoteAnnotation && localAnnotation.replies) {
      const remoteReplyIds = new Set(
        remoteAnnotation.replies?.map((r) => r.id) || []
      );

      for (const localReply of localAnnotation.replies) {
        if (!remoteReplyIds.has(localReply.id)) {
          if (!remoteAnnotation.replies) {
            remoteAnnotation.replies = [];
          }
          remoteAnnotation.replies.push(localReply);
        }
      }
    }
  }

  return {
    merged,
    conflicts: [], // No conflicts for replies (additive strategy)
  };
}

/**
 * Detect all conflicts between local and remote state
 * considering pending operations
 *
 * @returns All detected conflicts
 */
export function detectConflicts(
  localFiles: CodeReference[],
  localContents: Record<string, string>,
  localAnnotations: LineAnnotation[],
  remoteFiles: CodeReference[],
  remoteContents: Record<string, string>,
  remoteAnnotations: LineAnnotation[],
  pendingOperations: SyncOperation[]
): MergeConflict[] {
  // Only files can have conflicts (annotations are additive)
  const fileResult = mergeFiles(
    remoteFiles,
    remoteContents,
    pendingOperations,
    localFiles,
    localContents
  );

  return fileResult.conflicts;
}
