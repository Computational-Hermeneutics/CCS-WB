"use client";

/**
 * useAnnotationsSync Hook
 *
 * Syncs annotations between local session state and Supabase for real-time collaboration.
 * Uses a hybrid approach: polling (5s interval) as reliable baseline, with Realtime
 * subscriptions as an accelerator for instant updates when available.
 *
 * RESILIENCE: Failed operations are queued to IndexedDB and retried automatically.
 */

import { useEffect, useCallback, useRef } from "react";
import { getSupabaseClient, isSupabaseConfigured, recordSuccessfulRequest, recordFailedRequest } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useProjects } from "@/context/ProjectsContext";
import type { LineAnnotation } from "@/types/session";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { queueOperation, processQueue, getPendingOperations, type OperationProcessor } from "@/lib/sync/operation-queue";

interface AnnotationRow {
  id: string;
  file_id: string;
  project_id: string;
  user_id: string | null;
  added_by_initials: string | null;
  line_number: number;
  end_line_number: number | null;
  line_content: string | null;
  type: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface UseAnnotationsSyncOptions {
  /** Local annotations from session */
  localAnnotations: LineAnnotation[];
  /** Callback to update local annotations when remote changes arrive */
  onRemoteChange: (annotations: LineAnnotation[]) => void;
  /** Map of local codeFileId to Supabase file_id (if synced) */
  fileIdMap: Record<string, string>;
  /** Whether sync is enabled */
  enabled?: boolean;
}

/**
 * Convert Supabase annotation row to local LineAnnotation format
 */
function rowToAnnotation(row: AnnotationRow, codeFileId: string): LineAnnotation {
  return {
    id: row.id,
    codeFileId,
    lineNumber: row.line_number,
    endLineNumber: row.end_line_number ?? undefined,
    lineContent: row.line_content ?? "",
    type: row.type as LineAnnotation["type"],
    content: row.content,
    createdAt: row.created_at,
    addedBy: row.added_by_initials ?? undefined,
  };
}

/**
 * Convert local LineAnnotation to Supabase insert format
 */
function annotationToRow(
  annotation: LineAnnotation,
  fileId: string,
  projectId: string,
  userId: string | null
): Omit<AnnotationRow, "created_at" | "updated_at"> {
  return {
    id: annotation.id,
    file_id: fileId,
    project_id: projectId,
    user_id: userId,
    added_by_initials: annotation.addedBy || null,
    line_number: annotation.lineNumber,
    end_line_number: annotation.endLineNumber ?? null,
    line_content: annotation.lineContent || null,
    type: annotation.type,
    content: annotation.content,
  };
}

/**
 * Retry a database operation with exponential backoff
 * Tries 3 times: immediately, after 2s, after 4s
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${operationName} timeout after 10s`)), 10000)
      );

      const result = await Promise.race([operation(), timeoutPromise]);
      return result;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;

      if (isLastAttempt) {
        console.error(`${operationName}: All ${maxRetries} attempts failed`, error);
        throw error;
      }

      // Exponential backoff: 2s, 4s
      const delayMs = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`${operationName}: Failed after ${maxRetries} attempts`);
}

export function useAnnotationsSync({
  localAnnotations,
  onRemoteChange,
  fileIdMap,
  enabled = true,
}: UseAnnotationsSyncOptions) {
  const { user, isAuthenticated, profile } = useAuth();
  const { currentProjectId } = useProjects();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Track last known state to avoid redundant fetches
  const lastStateRef = useRef<{
    annotationsCount: number;
    annotationsLastUpdated: string;
    repliesCount: number;
    repliesLastUpdated: string;
  } | null>(null);

  // Store callback in ref to prevent infinite loops
  const onRemoteChangeRef = useRef(onRemoteChange);
  onRemoteChangeRef.current = onRemoteChange;

  // Store fileIdMap in ref to prevent subscription churn
  const fileIdMapRef = useRef(fileIdMap);
  fileIdMapRef.current = fileIdMap;

  // Store localAnnotations in ref to access during merge
  const localAnnotationsRef = useRef(localAnnotations);
  localAnnotationsRef.current = localAnnotations;

  // Track recently pushed annotation IDs to preserve during replication lag
  // Maps annotation ID -> timestamp of successful push
  const recentlyPushedRef = useRef<Map<string, number>>(new Map());

  // Track annotation IDs we've seen in remote to distinguish "not replicated yet" from "deleted"
  // If an annotation was in remote before and is now gone, it was deleted
  // If an annotation was never in remote, it's just not replicated yet
  const seenInRemoteRef = useRef<Set<string>>(new Set());

  const supabase = isSupabaseConfigured() ? getSupabaseClient() : null;

  // Helper to check if a string is a valid UUID
  const isValidUUID = (id: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  };

  // Fetch all annotations for the current project's files
  const fetchRemoteAnnotations = useCallback(async (): Promise<LineAnnotation[]> => {
    const currentFileIdMap = fileIdMapRef.current;
    if (!supabase || !currentProjectId || Object.keys(currentFileIdMap).length === 0) {
      return [];
    }

    const fileIds = Object.values(currentFileIdMap);

    // Skip if any file ID is not a valid UUID (e.g., sample projects with "file-1", "file-2")
    if (fileIds.some(id => !isValidUUID(id))) {
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("annotations")
      .select("*")
      .in("file_id", fileIds)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching annotations:", error);
      return [];
    }

    // Convert to local format, mapping file_id back to codeFileId
    const reverseMap = Object.fromEntries(
      Object.entries(currentFileIdMap).map(([k, v]) => [v, k])
    );

    return (data || []).map((row: AnnotationRow) =>
      rowToAnnotation(row, reverseMap[row.file_id] || row.file_id)
    );
  }, [supabase, currentProjectId]);

  // Helper to fetch and update annotations
  const fetchAndUpdate = useCallback(async () => {
    const currentFileIdMap = fileIdMapRef.current;
    if (!supabase || !currentProjectId || Object.keys(currentFileIdMap).length === 0) {
      return;
    }

    const fileIds = Object.values(currentFileIdMap);

    // Skip if any file ID is not a valid UUID (e.g., sample projects with "file-1", "file-2")
    if (fileIds.some(id => !isValidUUID(id))) {
      return;
    }

    // Quick check: has anything changed since last fetch?
    try {
      // Check annotations
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: annotationsCount, data: recentAnnotation, error: annotationsError } = await (supabase as any)
        .from("annotations")
        .select("updated_at", { count: "exact", head: false })
        .in("file_id", fileIds)
        .order("updated_at", { ascending: false })
        .limit(1);

      // Check replies (only for annotations in current files, matching actual fetch scope)
      // First get annotation IDs for current files
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: currentAnnotations } = await (supabase as any)
        .from("annotations")
        .select("id")
        .in("file_id", fileIds);

      const currentAnnotationIds = currentAnnotations?.map((a: { id: string }) => a.id) || [];

      // Now check replies only for those annotations
      let repliesCount = 0;
      let recentReply: Array<{ updated_at: string }> | null = null;
      let repliesError = null;

      if (currentAnnotationIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (supabase as any)
          .from("annotation_replies")
          .select("updated_at", { count: "exact", head: false })
          .in("annotation_id", currentAnnotationIds)
          .order("updated_at", { ascending: false })
          .limit(1);
        repliesCount = result.count || 0;
        recentReply = result.data;
        repliesError = result.error;
      }

      if (!annotationsError && !repliesError) {
        const currentAnnotationsCount = annotationsCount || 0;
        const currentAnnotationsLastUpdated = recentAnnotation?.[0]?.updated_at || "";
        const currentRepliesCount = repliesCount || 0;
        const currentRepliesLastUpdated = recentReply?.[0]?.updated_at || "";
        const lastState = lastStateRef.current;

        // If neither annotations nor replies changed, skip the full fetch
        if (lastState &&
            lastState.annotationsCount === currentAnnotationsCount &&
            lastState.annotationsLastUpdated === currentAnnotationsLastUpdated &&
            lastState.repliesCount === currentRepliesCount &&
            lastState.repliesLastUpdated === currentRepliesLastUpdated) {
          return; // No changes, skip fetch
        }

        // Log when changes detected (helps diagnose intermittent issues)
        if (lastState) {
          const changes = [];
          if (lastState.annotationsCount !== currentAnnotationsCount) changes.push(`annotations: ${lastState.annotationsCount} → ${currentAnnotationsCount}`);
          if (lastState.annotationsLastUpdated !== currentAnnotationsLastUpdated) changes.push(`annotation time: ${lastState.annotationsLastUpdated.slice(11, 19)} → ${currentAnnotationsLastUpdated.slice(11, 19)}`);
          if (lastState.repliesCount !== currentRepliesCount) changes.push(`replies: ${lastState.repliesCount} → ${currentRepliesCount}`);
          if (lastState.repliesLastUpdated !== currentRepliesLastUpdated) changes.push(`reply time: ${lastState.repliesLastUpdated.slice(11, 19)} → ${currentRepliesLastUpdated.slice(11, 19)}`);
          console.log("Sync: Changes detected -", changes.join(", "));
        }
      }
    } catch (err) {
      // If state check fails, proceed with full fetch anyway
      console.warn("State check failed, proceeding with full fetch:", err);
    }

    const reverseMap = Object.fromEntries(
      Object.entries(currentFileIdMap).map(([k, v]) => [v, k])
    );

    try {
      // Fetch annotations with timeout
      const annotationsPromise = (supabase as any)
        .from("annotations")
        .select("*")
        .in("file_id", fileIds)
        .order("created_at", { ascending: true });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Query timeout after 10s")), 10000)
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await Promise.race([annotationsPromise, timeoutPromise]) as any;

      if (error) {
        console.error("fetchAndUpdate: Error fetching annotations:", error);
        console.error("fetchAndUpdate: Error details:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          fileIds,
        });
        return;
      }

      const annotations = data || [];
      const annotationIds = annotations.map((a: AnnotationRow) => a.id);

      // Fetch replies for all annotations with profile colors and updated_at
      let repliesMap: Record<string, Array<{
        id: string;
        content: string;
        created_at: string;
        updated_at: string;
        added_by_initials: string | null;
        profile_color: string | null;
      }>> = {};

      if (annotationIds.length > 0) {
        // Fetch replies with profile_color and updated_at for state tracking
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: repliesData, error: repliesError } = await (supabase as any)
          .from("annotation_replies")
          .select("id, annotation_id, content, created_at, updated_at, added_by_initials, profile_color")
          .in("annotation_id", annotationIds)
          .order("created_at", { ascending: true });

        if (repliesError) {
          console.error("Error fetching replies:", repliesError);
        }

        if (repliesData) {
          repliesData.forEach((reply: {
            annotation_id: string;
            id: string;
            content: string;
            created_at: string;
            updated_at: string;
            added_by_initials: string | null;
            profile_color: string | null;
          }) => {
            if (!repliesMap[reply.annotation_id]) {
              repliesMap[reply.annotation_id] = [];
            }
            repliesMap[reply.annotation_id].push({
              id: reply.id,
              content: reply.content,
              created_at: reply.created_at,
              updated_at: reply.updated_at,
              added_by_initials: reply.added_by_initials,
              profile_color: reply.profile_color,
            });
          });
        }
      }

      const remoteAnnotations = annotations.map((row: AnnotationRow) => {
        const annotation = rowToAnnotation(row, reverseMap[row.file_id] || row.file_id);
        // Attach replies to annotation
        const replies = repliesMap[row.id];
        if (replies) {
          annotation.replies = replies.map(r => ({
            id: r.id,
            content: r.content,
            createdAt: r.created_at,
            addedBy: r.added_by_initials || undefined,
            profileColor: r.profile_color || undefined,
          }));
        }
        return annotation;
      });

      // Update state ref for next comparison
      const annotationsMaxUpdated = annotations.length > 0
        ? annotations.reduce((max: string, row: AnnotationRow) =>
            row.updated_at > max ? row.updated_at : max, annotations[0].updated_at)
        : "";

      const allReplies = Object.values(repliesMap).flat();
      const repliesMaxUpdated = allReplies.length > 0
        ? allReplies.reduce((max: string, reply: { updated_at: string }) =>
            reply.updated_at > max ? reply.updated_at : max, allReplies[0].updated_at)
        : "";

      lastStateRef.current = {
        annotationsCount: annotations.length,
        annotationsLastUpdated: annotationsMaxUpdated,
        repliesCount: allReplies.length,
        repliesLastUpdated: repliesMaxUpdated,
      };

      // CRITICAL: Additive merge for annotations
      // Annotations are additive - combine remote and local annotations
      const currentLocal = localAnnotationsRef.current || [];
      const remoteIds = new Set(remoteAnnotations.map((a: LineAnnotation) => a.id));

      // Track which annotation IDs we've seen in remote
      remoteAnnotations.forEach((a: LineAnnotation) => seenInRemoteRef.current.add(a.id));

      // Preserve local annotations that either:
      // 1. Haven't been replicated to remote yet (not in remoteIds, never seen in remote)
      // 2. Were recently pushed (within last 15 seconds) but not in remote yet (replication lag)
      const now = Date.now();
      const REPLICATION_LAG_GRACE_PERIOD = 15000; // 15 seconds

      const localOnly = currentLocal.filter((local: LineAnnotation) => {
        // Already in remote - don't duplicate
        if (remoteIds.has(local.id)) return false;

        // Was seen in remote before but now gone - it was deleted, remove it
        if (seenInRemoteRef.current.has(local.id)) return false;

        // Never seen in remote - either:
        // - Just created locally (not replicated yet)
        // - Recently pushed (within grace period)
        const recentlyPushedTime = recentlyPushedRef.current.get(local.id);
        if (recentlyPushedTime && now - recentlyPushedTime < REPLICATION_LAG_GRACE_PERIOD) {
          return true; // Within grace period
        }

        // Not in remote, never seen in remote, not recently pushed - probably new local annotation
        return true;
      });

      // Clean up old entries from recentlyPushedRef
      for (const [id, timestamp] of recentlyPushedRef.current.entries()) {
        if (now - timestamp > REPLICATION_LAG_GRACE_PERIOD) {
          recentlyPushedRef.current.delete(id);
        }
      }

      // Merge: remote annotations + local-only annotations
      const merged = [...remoteAnnotations, ...localOnly];

      onRemoteChangeRef.current(merged);
    } catch (err) {
      console.error("Error in fetchAndUpdate:", err);
    }
  }, [supabase, currentProjectId]);

  // Push a new or updated annotation to Supabase
  // Returns true if successful, false if failed (and queued for retry)
  const pushAnnotation = useCallback(
    async (annotation: LineAnnotation): Promise<boolean> => {
      if (!supabase || !enabled || !isAuthenticated || !currentProjectId) {
        return false;
      }

      const currentFileIdMap = fileIdMapRef.current;
      const fileId = currentFileIdMap[annotation.codeFileId];
      if (!fileId) {
        console.warn("No Supabase file_id for annotation:", annotation.codeFileId);
        return false;
      }

      // Skip if file ID is not a valid UUID (e.g., sample projects)
      if (!isValidUUID(fileId)) {
        return false;
      }

      // Mark that we're making an update (to skip processing our own changes)
      lastUpdateRef.current = Date.now();

      // Check if this annotation exists and was created by someone else
      // If so, create a new annotation instead of updating (preserves original)
      let annotationToSave = annotation;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing, error: fetchError } = await (supabase as any)
          .from("annotations")
          .select("user_id, added_by_initials")
          .eq("id", annotation.id)
          .maybeSingle();

        if (!fetchError && existing && existing.user_id !== user?.id) {
          // Annotation exists and was created by someone else
          // Create a new annotation instead of updating

          // Fetch the original content to include in the new annotation
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: originalAnnotation } = await (supabase as any)
            .from("annotations")
            .select("content")
            .eq("id", annotation.id)
            .single();

          const originalContent = originalAnnotation?.content || "";
          const newContent = annotation.content;

          // Extract only the latest content (after any existing brackets) to prevent nesting
          // If content is "[old] text", extract just "text"
          // If content is "text", use "text"
          const editHistoryRegex = /^\[.*?\]\s*/;
          const latestContent = originalContent.replace(editHistoryRegex, "").trim();

          // Generate new UUID for the new annotation with original text in square brackets
          annotationToSave = {
            ...annotation,
            id: crypto.randomUUID(),
            addedBy: profile?.initials || user?.user_metadata?.initials || undefined,
            content: `[${latestContent}] ${newContent}`,
          };
        }
      } catch (err) {
        // Continue with original annotation if check fails
      }

      const row = annotationToRow(annotationToSave, fileId, currentProjectId, user?.id ?? null);

      try {
        // Retry with exponential backoff
        await retryWithBackoff(
          async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any)
              .from("annotations")
              .upsert(row, { onConflict: "id" })
              .select();

            if (error) {
              console.error("pushAnnotation: Database error:", error);
              throw error;
            }

            return data;
          },
          "pushAnnotation"
        );

        // Trigger a fetch to update annotations across clients
        setTimeout(() => {
          fetchAndUpdate();
        }, 200);

        // Record successful request
        recordSuccessfulRequest();

        // Track this annotation as recently pushed to preserve during replication lag
        recentlyPushedRef.current.set(annotationToSave.id, Date.now());

        return true; // Success
      } catch (err) {
        console.error("pushAnnotation: All retry attempts failed:", err);

        // Record failed request
        if (err instanceof Error) {
          recordFailedRequest(err);
        }

        // Queue operation for later retry
        if (currentProjectId) {
          try {
            await queueOperation(currentProjectId, "annotation_create", annotationToSave);
            console.log("[useAnnotationsSync] Queued annotation for later sync:", annotationToSave.id);
          } catch (queueError) {
            console.error("[useAnnotationsSync] Failed to queue annotation:", queueError);
          }
        }
        return false; // Failed and queued
      }
    },
    [supabase, enabled, isAuthenticated, currentProjectId, user?.id, profile, fetchAndUpdate]
  );

  // Delete an annotation from Supabase
  const deleteAnnotation = useCallback(
    async (annotationId: string): Promise<{ success: boolean; error?: string }> => {
      if (!supabase || !enabled || !isAuthenticated) {
        return { success: false, error: "Not authenticated" };
      }

      // Mark that we're making an update (to skip processing our own changes)
      lastUpdateRef.current = Date.now();

      try {
        // Retry with exponential backoff
        const data = await retryWithBackoff(
          async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error, data } = await (supabase as any)
              .from("annotations")
              .delete()
              .eq("id", annotationId)
              .select();

            if (error) {
              console.error("deleteAnnotation: Database error:", error);
              throw error;
            }

            return data;
          },
          "deleteAnnotation"
        );

        // Check if anything was actually deleted (RLS may have blocked it)
        if (!data || data.length === 0) {
          console.warn("deleteAnnotation: No rows deleted (permission denied by RLS)");
          // Immediately restore the annotation in UI by fetching
          setTimeout(() => fetchAndUpdate(), 0);
          return { success: false, error: "Permission denied: You cannot delete this annotation" };
        }

        // Trigger a fetch to update annotations across clients
        setTimeout(() => fetchAndUpdate(), 200);

        // Record successful request
        recordSuccessfulRequest();
        return { success: true };
      } catch (err) {
        console.error("deleteAnnotation: All retry attempts failed:", err);

        // Record failed request
        if (err instanceof Error) {
          recordFailedRequest(err);
        }

        // Queue operation for later retry
        if (currentProjectId) {
          try {
            await queueOperation(currentProjectId, "annotation_delete", { id: annotationId });
            console.log("[useAnnotationsSync] Queued annotation delete for later sync:", annotationId);
          } catch (queueError) {
            console.error("[useAnnotationsSync] Failed to queue annotation delete:", queueError);
          }
        }

        // Restore the annotation in UI
        setTimeout(() => fetchAndUpdate(), 0);
        return { success: false, error: err instanceof Error ? err.message : "Delete failed" };
      }
    },
    [supabase, enabled, isAuthenticated, currentProjectId, fetchAndUpdate]
  );

  // Push a new reply to an annotation
  const pushReply = useCallback(
    async (annotationId: string, content: string, replyId?: string) => {
      if (!supabase || !enabled || !isAuthenticated || !currentProjectId) {
        console.warn("pushReply: Preconditions not met", { supabase: !!supabase, enabled, isAuthenticated, currentProjectId });
        return;
      }

      const userInitials = user?.user_metadata?.initials || user?.email?.substring(0, 3).toUpperCase();

      const row = {
        id: replyId || crypto.randomUUID(),
        annotation_id: annotationId,
        project_id: currentProjectId,
        user_id: user?.id || null,
        added_by_initials: userInitials || null,
        profile_color: profile?.profile_color || null,
        content,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      try {
        // Retry with exponential backoff
        await retryWithBackoff(
          async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any)
              .from("annotation_replies")
              .upsert(row, { onConflict: "id" })
              .select();

            if (error) {
              console.error("pushReply: Database error:", error);
              throw error;
            }

            return data;
          },
          "pushReply"
        );

        // Trigger a fetch to update replies
        lastUpdateRef.current = Date.now();
        setTimeout(() => {
          fetchAndUpdate();
        }, 200);

        // Record successful request
        recordSuccessfulRequest();
      } catch (err) {
        console.error("pushReply: All retry attempts failed:", err);

        // Record failed request
        if (err instanceof Error) {
          recordFailedRequest(err);
        }

        // Queue operation for later retry
        if (currentProjectId) {
          try {
            await queueOperation(currentProjectId, "reply_create", {
              annotationId,
              reply: {
                id: row.id,
                content: row.content,
                createdAt: row.created_at,
                addedBy: row.added_by_initials || undefined,
                profileColor: row.profile_color || undefined,
              },
            });
            console.log("[useAnnotationsSync] Queued reply for later sync:", row.id);
          } catch (queueError) {
            console.error("[useAnnotationsSync] Failed to queue reply:", queueError);
          }
        }
      }
    },
    [supabase, enabled, isAuthenticated, currentProjectId, user, profile, fetchAndUpdate]
  );

  // Delete a reply from an annotation
  const deleteReply = useCallback(
    async (replyId: string): Promise<{ success: boolean; error?: string }> => {
      if (!supabase || !enabled || !isAuthenticated) {
        return { success: false, error: "Not authenticated" };
      }

      try {
        // Retry with exponential backoff
        const data = await retryWithBackoff(
          async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error, data } = await (supabase as any)
              .from("annotation_replies")
              .delete()
              .eq("id", replyId)
              .select();

            if (error) {
              console.error("deleteReply: Database error:", error);
              throw error;
            }

            return data;
          },
          "deleteReply"
        );

        // Check if anything was actually deleted (RLS may have blocked it)
        if (!data || data.length === 0) {
          console.warn("deleteReply: No rows deleted (permission denied by RLS)");
          // Immediately restore the reply in UI by fetching
          setTimeout(() => fetchAndUpdate(), 0);
          return { success: false, error: "Permission denied: You cannot delete this reply" };
        }

        // Trigger a fetch to update replies
        lastUpdateRef.current = Date.now();
        setTimeout(() => fetchAndUpdate(), 200);

        // Record successful request
        recordSuccessfulRequest();
        return { success: true };
      } catch (err) {
        console.error("deleteReply: All retry attempts failed:", err);

        // Record failed request
        if (err instanceof Error) {
          recordFailedRequest(err);
        }

        // Queue operation for later retry (need to get annotation ID from database)
        if (currentProjectId && supabase) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: replyData } = await (supabase as any)
              .from("annotation_replies")
              .select("annotation_id")
              .eq("id", replyId)
              .maybeSingle();

            if (replyData) {
              await queueOperation(currentProjectId, "reply_delete", {
                annotationId: replyData.annotation_id,
                replyId,
              });
              console.log("[useAnnotationsSync] Queued reply delete for later sync:", replyId);
            }
          } catch (queueError) {
            console.error("[useAnnotationsSync] Failed to queue reply delete:", queueError);
          }
        }

        // Restore the reply in UI
        setTimeout(() => fetchAndUpdate(), 0);
        return { success: false, error: err instanceof Error ? err.message : "Delete failed" };
      }
    },
    [supabase, enabled, isAuthenticated, currentProjectId, fetchAndUpdate]
  );

  // Create operation processor for queued operations
  const processQueuedOperation: OperationProcessor = useCallback(
    async (operation) => {
      if (!supabase || !currentProjectId || !user?.id) {
        return false;
      }

      try {
        const currentFileIdMap = fileIdMapRef.current;

        switch (operation.type) {
          case "annotation_create": {
            const annotation = operation.payload as LineAnnotation;
            const fileId = currentFileIdMap[annotation.codeFileId];
            if (!fileId) {
              console.warn("[useAnnotationsSync] No file ID for queued annotation:", annotation.codeFileId);
              return false;
            }

            const row = annotationToRow(annotation, fileId, currentProjectId, user?.id ?? null);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
              .from("annotations")
              .upsert(row, { onConflict: "id" })
              .select();

            if (error) throw error;
            console.log("[useAnnotationsSync] Processed queued annotation:", annotation.id);
            return true;
          }

          case "annotation_delete": {
            const { id } = operation.payload as { id: string };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
              .from("annotations")
              .delete()
              .eq("id", id);

            if (error) throw error;
            console.log("[useAnnotationsSync] Processed queued annotation delete:", id);
            return true;
          }

          case "reply_create": {
            const { annotationId, reply } = operation.payload as {
              annotationId: string;
              reply: { id: string; content: string; createdAt: string; addedBy?: string; profileColor?: string };
            };

            const row = {
              id: reply.id,
              annotation_id: annotationId,
              project_id: currentProjectId,
              user_id: user?.id || null,
              added_by_initials: reply.addedBy || null,
              profile_color: reply.profileColor || null,
              content: reply.content,
              created_at: reply.createdAt,
              updated_at: new Date().toISOString(),
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
              .from("annotation_replies")
              .upsert(row, { onConflict: "id" })
              .select();

            if (error) throw error;
            console.log("[useAnnotationsSync] Processed queued reply:", reply.id);
            return true;
          }

          case "reply_delete": {
            const { replyId } = operation.payload as { annotationId: string; replyId: string };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
              .from("annotation_replies")
              .delete()
              .eq("id", replyId);

            if (error) throw error;
            console.log("[useAnnotationsSync] Processed queued reply delete:", replyId);
            return true;
          }

          default:
            console.warn("[useAnnotationsSync] Unknown operation type:", operation.type);
            return false;
        }
      } catch (error) {
        console.error("[useAnnotationsSync] Failed to process queued operation:", error);
        return false;
      }
    },
    [supabase, currentProjectId, user?.id]
  );

  // Process pending operations from queue
  const processQueuedOperations = useCallback(async () => {
    if (!currentProjectId) {
      return;
    }

    try {
      const result = await processQueue(currentProjectId, processQueuedOperation);
      if (result.processed > 0) {
        console.log(
          `[useAnnotationsSync] Queue processing: ${result.succeeded} succeeded, ${result.failed} failed, ${result.retrying} retrying`
        );
        // Fetch remote state after processing queue
        setTimeout(() => fetchAndUpdate(), 500);
      }
    } catch (error) {
      console.error("[useAnnotationsSync] Error processing queue:", error);
    }
  }, [currentProjectId, processQueuedOperation, fetchAndUpdate]);

  // Polling interval (5 seconds) - reliable baseline for sync
  // Also handles visibility change to resume sync when tab becomes active (Safari suspension fix)
  useEffect(() => {
    if (!supabase || !enabled || !currentProjectId) {
      return;
    }

    // Initial: process queue then fetch
    const initialTimeoutId = setTimeout(async () => {
      await processQueuedOperations();
      await fetchAndUpdate();
    }, 100);

    // Poll every 5 seconds
    const intervalId = setInterval(async () => {
      // Skip if we just made an update (to avoid processing our own changes)
      const timeSinceLastUpdate = Date.now() - lastUpdateRef.current;
      if (timeSinceLastUpdate < 2000) return;

      const currentFileIdMap = fileIdMapRef.current;
      if (Object.keys(currentFileIdMap).length > 0) {
        // Process queue before fetching remote
        await processQueuedOperations();
        await fetchAndUpdate();
      }
    }, 5000);

    // Resume sync immediately when tab becomes visible (fixes Safari suspension)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        console.log("Tab became visible, processing queue and triggering annotation sync");
        const currentFileIdMap = fileIdMapRef.current;
        if (Object.keys(currentFileIdMap).length > 0) {
          // Process queue first, then fetch
          await processQueuedOperations();
          await fetchAndUpdate();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(initialTimeoutId);
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [supabase, enabled, currentProjectId, processQueuedOperations, fetchAndUpdate]);

  // Realtime subscription disabled due to persistent "mismatch between server and client bindings" error
  // Polling (5s) provides reliable sync. Re-enable Realtime once Supabase issue is resolved.
  // See: https://github.com/supabase/realtime/issues
  /*
  useEffect(() => {
    if (!supabase || !enabled || !currentProjectId) {
      return;
    }

    let channel: RealtimeChannel | null = null;

    try {
      const channelName = `annotations-${currentProjectId}-${Date.now()}`;

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "annotations",
          },
          (payload) => {
            const newRecord = payload.new as AnnotationRow | undefined;
            const oldRecord = payload.old as AnnotationRow | undefined;

            const recordProjectId = newRecord?.project_id || oldRecord?.project_id;
            if (recordProjectId !== currentProjectId) {
              return;
            }

            if (newRecord?.user_id === user?.id) {
              return;
            }

            console.log("Realtime: Annotation change detected, triggering fetch");
            fetchAndUpdate();
          }
        )
        .subscribe((status) => {
          console.log("Annotations subscription status:", status);
          if (status === "CHANNEL_ERROR") {
            console.warn("Realtime channel error - polling will continue as fallback");
          }
        });

      channelRef.current = channel;
    } catch (err) {
      console.error("Error setting up Realtime subscription:", err);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (err) {
          console.error("Error removing channel:", err);
        }
        channelRef.current = null;
      }
    };
  }, [supabase, enabled, currentProjectId, user?.id, fetchAndUpdate]);
  */

  return {
    pushAnnotation,
    deleteAnnotation,
    pushReply,
    deleteReply,
    fetchRemoteAnnotations,
    isConnected: !!channelRef.current,
  };
}
