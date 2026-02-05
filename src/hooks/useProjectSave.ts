/**
 * Hook for saving project session data
 * Handles bulk upserts of files and annotations, orphan cleanup
 */

import { useCallback } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Session } from "@/types/session";
import type { ProjectWithOwner } from "@/lib/supabase/types";

export interface ProjectSaveParams {
  supabase: SupabaseClient | null;
  user: User | null;
  currentProjectId: string | null;
  updateProjectTimestamp: (projectId: string, timestamp: string) => void;
}

export interface ProjectSaveState {
  saveProject: (projectId: string, session: Session) => Promise<{ error: Error | null }>;
}

/**
 * Custom hook for project save operations
 * Performs bulk upserts for files and annotations, cleans up orphans
 */
export function useProjectSave({
  supabase,
  user,
  currentProjectId,
  updateProjectTimestamp,
}: ProjectSaveParams): ProjectSaveState {
  // Save session to a project - OPTIMIZED: bulk upserts + parallel queries
  // Files and annotations are saved to their respective tables (code_files, annotations)
  // session_data only stores other session state (messages, mode, settings, etc.)
  const saveProject = useCallback(
    async (projectId: string, session: Session) => {
      console.log("saveProject: Starting save to", projectId);
      if (!supabase || !user) {
        console.error("saveProject: Supabase not configured or not authenticated");
        return { error: new Error("Supabase not configured or not authenticated") };
      }

      try {
        const now = new Date().toISOString();

        // Helper to check if a string is a valid UUID
        const isValidUUID = (id: string): boolean => {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          return uuidRegex.test(id);
        };

        // Check if any file IDs are not valid UUIDs (e.g., sample projects with "file-1", "file-2")
        // Skip saving files/annotations for sample projects - they should be explicitly saved by user
        const hasNonUUIDFiles = session.codeFiles.some(f => !isValidUUID(f.id));
        if (hasNonUUIDFiles) {
          console.log("saveProject: Skipping auto-save for sample project (non-UUID file IDs detected)");
          // Update project metadata only (to record last access time)
          const sessionDataWithoutFiles = {
            ...session,
            codeFiles: [],
            codeContents: {},
            lineAnnotations: [],
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("projects")
            .update({
              session_data: sessionDataWithoutFiles,
              mode: session.mode,
              updated_at: now,
            })
            .eq("id", projectId);

          console.log("saveProject: Sample project metadata updated");
          updateProjectTimestamp(projectId, now);
          return { error: null };
        }

        // Build bulk data for files (skip README update - too expensive for every save)
        // IMPORTANT: Deduplicate by file ID to prevent "ON CONFLICT DO UPDATE" errors
        // Keep only the last occurrence of each file (most recent version)
        const seenIds = new Set<string>();
        const filesData = session.codeFiles
          .slice() // Create a copy to avoid mutating original
          .reverse() // Start from end to keep last occurrence
          .map((file, i) => {
            const content = session.codeContents[file.id];
            if (content === undefined) return null;

            // Skip if we've already processed this ID
            if (seenIds.has(file.id)) {
              console.log(`saveProject: Skipping duplicate file ID: ${file.id} (${file.name})`);
              return null;
            }
            seenIds.add(file.id);

            return {
              id: file.id,
              project_id: projectId,
              filename: file.name,
              language: file.language || "plaintext",
              content: content,
              original_content: content,
              uploaded_by: user.id,
              display_order: session.codeFiles.length - 1 - i, // Adjust order since we reversed
              updated_at: now,
            };
          })
          .filter(Boolean)
          .reverse(); // Reverse back to original order

        // Fetch existing annotations to determine which belong to current user vs others
        // IMPORTANT: Only save annotations created by the current user to avoid RLS violations
        // Members cannot update annotations they didn't create (403 error)
        const [userAnnotationsResult, allAnnotationsResult] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("annotations")
            .select("id")
            .eq("project_id", projectId)
            .eq("user_id", user.id),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("annotations")
            .select("id")
            .eq("project_id", projectId),
        ]);

        const userOwnedAnnotationIds = new Set<string>(
          (userAnnotationsResult.data || []).map((a: { id: string }) => a.id)
        );
        const allAnnotationIds = new Set<string>(
          (allAnnotationsResult.data || []).map((a: { id: string }) => a.id)
        );

        // Filter to only include annotations that are either:
        // 1. New annotations (not in database yet)
        // 2. Existing annotations owned by current user
        const annotationsData = session.lineAnnotations
          .filter((annotation) => {
            const existsInDatabase = allAnnotationIds.has(annotation.id);
            const ownedByUser = userOwnedAnnotationIds.has(annotation.id);

            // Include if: new annotation OR user's existing annotation
            return !existsInDatabase || ownedByUser;
          })
          .map((annotation) => ({
            id: annotation.id,
            file_id: annotation.codeFileId,
            project_id: projectId,
            user_id: user.id,
            line_number: annotation.lineNumber,
            end_line_number: annotation.endLineNumber || null,
            line_content: annotation.lineContent || null,
            type: annotation.type,
            content: annotation.content,
            updated_at: now,
          }));

        // Session data without files/annotations (stored separately)
        const sessionDataWithoutFiles = {
          ...session,
          codeFiles: [],
          codeContents: {},
          lineAnnotations: [],
        };

        const projectUpdateData = {
          session_data: sessionDataWithoutFiles,
          mode: session.mode,
          updated_at: now,
        };

        // Run all upserts and fetches in parallel
        console.log(
          `saveProject: Bulk saving ${filesData.length} files, ${annotationsData.length} annotations`
        );

        const [filesUpsertResult, annotationsUpsertResult, projectUpdateResult, existingFilesResult] =
          await Promise.all([
            // Bulk upsert files
            filesData.length > 0
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (supabase as any).from("code_files").upsert(filesData, { onConflict: "id" })
              : Promise.resolve({ error: null }),
            // Bulk upsert annotations
            annotationsData.length > 0
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (supabase as any)
                  .from("annotations")
                  .upsert(annotationsData, { onConflict: "id" })
              : Promise.resolve({ error: null }),
            // Update project metadata
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any)
              .from("projects")
              .update(projectUpdateData)
              .eq("id", projectId)
              .select(),
            // Get existing file IDs for deletion check
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any).from("code_files").select("id").eq("project_id", projectId),
            // Note: existingAnnotationsResult already fetched above as allAnnotationsResult
          ]);

        if (filesUpsertResult.error) {
          console.error("saveProject: Error bulk saving files", filesUpsertResult.error);
        }
        if (annotationsUpsertResult.error) {
          console.error(
            "saveProject: Error bulk saving annotations",
            annotationsUpsertResult.error
          );
        }
        if (projectUpdateResult.error) {
          console.error("saveProject: Error updating project", projectUpdateResult.error);
          return { error: new Error(projectUpdateResult.error.message) };
        }

        // Calculate orphans to delete
        const sessionFileIds = new Set(session.codeFiles.map((f) => f.id));
        const filesToDelete = (existingFilesResult.data || [])
          .filter((f: { id: string }) => !sessionFileIds.has(f.id))
          .map((f: { id: string }) => f.id);

        // Only delete annotations created by the current user (already fetched above)
        // Cannot delete other users' annotations (RLS will block it)
        const sessionAnnotationIds = new Set(session.lineAnnotations.map((a) => a.id));

        // Delete only user's own annotations that are no longer in session
        const annotationsToDelete = Array.from(userOwnedAnnotationIds).filter(
          (id: string) => !sessionAnnotationIds.has(id)
        );

        // Delete orphans in parallel (if any)
        if (filesToDelete.length > 0 || annotationsToDelete.length > 0) {
          console.log(
            `saveProject: Deleting ${filesToDelete.length} orphan files, ${annotationsToDelete.length} orphan annotations`
          );
          await Promise.all([
            filesToDelete.length > 0
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (supabase as any).from("code_files").delete().in("id", filesToDelete)
              : Promise.resolve(),
            annotationsToDelete.length > 0
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (supabase as any).from("annotations").delete().in("id", annotationsToDelete)
              : Promise.resolve(),
          ]);
        }

        console.log("saveProject: Success");

        // Update local state timestamp via callback
        updateProjectTimestamp(projectId, now);

        return { error: null };
      } catch (error) {
        console.error("saveProject: Exception", error);
        return { error: error as Error };
      }
    },
    [supabase, user, updateProjectTimestamp]
  );

  return {
    saveProject,
  };
}
