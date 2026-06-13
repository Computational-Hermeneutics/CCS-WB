/**
 * Hook for project sharing and forking operations
 * Handles project forking and deletion with member protection
 */

import { useCallback } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Profile, MemberWithProfile, ProjectWithOwner } from "@/cloud/lib/supabase/types";

export interface ProjectSharingParams {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: Profile | null;
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
  refreshProjects: () => Promise<void>;
  onProjectDeleted?: (projectId: string, deletedProject: ProjectWithOwner | null) => void;
}

export interface ProjectSharingState {
  forkProjectForUser: (
    projectId: string,
    targetUserId: string,
    originalOwnerName?: string
  ) => Promise<{ projectId: string | null; error: Error | null }>;
  deleteProject: (
    projectId: string,
    membersToFork?: MemberWithProfile[]
  ) => Promise<{ error: Error | null }>;
}

/**
 * Custom hook for project sharing and forking operations
 */
export function useProjectSharing({
  supabase,
  user,
  profile,
  currentProjectId,
  setCurrentProjectId,
  refreshProjects,
  onProjectDeleted,
}: ProjectSharingParams): ProjectSharingState {
  // Fork a project for a specific user (used when owner deletes shared project)
  const forkProjectForUser = useCallback(
    async (
      projectId: string,
      targetUserId: string,
      originalOwnerName?: string
    ): Promise<{ projectId: string | null; error: Error | null }> => {
      if (!supabase) {
        return { projectId: null, error: new Error("Supabase not configured") };
      }

      try {
        // Fetch original project
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: originalProject, error: projectError } = await (supabase as any)
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .single();

        if (projectError || !originalProject) {
          return { projectId: null, error: new Error("Failed to fetch original project") };
        }

        // Create forked project name
        const forkSuffix = originalOwnerName
          ? ` - from ${originalOwnerName}`
          : " (fork)";
        const forkedName = `${originalProject.name}${forkSuffix}`;

        // Create new project for target user
        const newProjectId = crypto.randomUUID();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: createError } = await (supabase as any).from("projects").insert({
          id: newProjectId,
          name: forkedName,
          owner_id: targetUserId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (createError) {
          return { projectId: null, error: new Error("Failed to create forked project") };
        }

        // Copy all files
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: files, error: filesError } = await (supabase as any)
          .from("code_files")
          .select("*")
          .eq("project_id", projectId);

        if (filesError) {
          return { projectId: null, error: new Error("Failed to fetch files") };
        }

        // Create file ID mapping (old ID -> new ID)
        const fileIdMap: Record<string, string> = {};
        if (files && files.length > 0) {
          const newFiles = files.map(
            (file: { id: string; name: string; language: string; content: string }) => {
              const newFileId = crypto.randomUUID();
              fileIdMap[file.id] = newFileId;
              return {
                id: newFileId,
                project_id: newProjectId,
                name: file.name,
                language: file.language,
                content: file.content,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
            }
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: insertFilesError } = await (supabase as any)
            .from("code_files")
            .insert(newFiles);

          if (insertFilesError) {
            return { projectId: null, error: new Error("Failed to copy files") };
          }
        }

        // Copy all annotations
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: annotations, error: annotationsError } = await (supabase as any)
          .from("annotations")
          .select("*")
          .eq("project_id", projectId);

        if (annotationsError) {
          return { projectId: null, error: new Error("Failed to fetch annotations") };
        }

        // Create annotation ID mapping (old ID -> new ID)
        const annotationIdMap: Record<string, string> = {};
        if (annotations && annotations.length > 0) {
          const newAnnotations = annotations.map(
            (annotation: {
              id: string;
              file_id: string;
              user_id: string;
              added_by_initials: string;
              line_number: number;
              end_line_number: number | null;
              line_content: string | null;
              type: string;
              content: string;
            }) => {
              const newAnnotationId = crypto.randomUUID();
              annotationIdMap[annotation.id] = newAnnotationId;
              return {
                id: newAnnotationId,
                file_id: fileIdMap[annotation.file_id] || annotation.file_id,
                project_id: newProjectId,
                user_id: annotation.user_id,
                added_by_initials: annotation.added_by_initials,
                line_number: annotation.line_number,
                end_line_number: annotation.end_line_number,
                line_content: annotation.line_content,
                type: annotation.type,
                content: annotation.content,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
            }
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: insertAnnotationsError } = await (supabase as any)
            .from("annotations")
            .insert(newAnnotations);

          if (insertAnnotationsError) {
            return { projectId: null, error: new Error("Failed to copy annotations") };
          }
        }

        // Copy all replies
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: replies, error: repliesError } = await (supabase as any)
          .from("annotation_replies")
          .select("*")
          .eq("project_id", projectId);

        if (repliesError) {
          return { projectId: null, error: new Error("Failed to fetch replies") };
        }

        if (replies && replies.length > 0) {
          const newReplies = replies.map(
            (reply: {
              id: string;
              annotation_id: string;
              user_id: string;
              added_by_initials: string;
              content: string;
              profile_color: string | null;
            }) => ({
              id: crypto.randomUUID(),
              annotation_id: annotationIdMap[reply.annotation_id] || reply.annotation_id,
              project_id: newProjectId,
              user_id: reply.user_id,
              added_by_initials: reply.added_by_initials,
              content: reply.content,
              profile_color: reply.profile_color,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: insertRepliesError } = await (supabase as any)
            .from("annotation_replies")
            .insert(newReplies);

          if (insertRepliesError) {
            return { projectId: null, error: new Error("Failed to copy replies") };
          }
        }

        return { projectId: newProjectId, error: null };
      } catch (error) {
        console.error("forkProjectForUser: Exception", error);
        return { projectId: null, error: error as Error };
      }
    },
    [supabase]
  );

  // Delete a project (only owner can delete, protects library projects which have null owner_id)
  // Soft delete - moves project to trash (set deleted_at timestamp)
  // If project is shared, creates forks for all members before deleting
  const deleteProject = useCallback(
    async (projectId: string, membersToFork?: MemberWithProfile[]) => {
      if (!supabase || !user) {
        return { error: new Error("Not authenticated") };
      }

      try {
        // If members list provided, create forks for each member before deleting
        if (membersToFork && membersToFork.length > 0) {
          console.log(`Creating ${membersToFork.length} forks before deletion...`);

          // Get owner's display name for fork naming
          const ownerName =
            profile?.display_name || user.user_metadata?.name || "Previous Owner";

          // Create forks for all members in parallel
          const forkPromises = membersToFork.map((member) =>
            forkProjectForUser(projectId, member.user_id, ownerName)
          );

          const forkResults = await Promise.all(forkPromises);

          // Check if any forks failed
          const failedForks = forkResults.filter((result) => result.error);
          if (failedForks.length > 0) {
            console.error("Some forks failed:", failedForks);
            // Continue with deletion anyway - better to delete than block on fork failures
          }

          console.log(
            `Created ${forkResults.length - failedForks.length} forks successfully`
          );
        }

        // Soft delete: set deleted_at timestamp instead of actual deletion
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("projects")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", projectId)
          .eq("owner_id", user.id) // Only allow deletion if user is the owner
          .select()
          .single();

        if (error) {
          return { error: new Error(error.message) };
        }

        // Clear current project if it was deleted
        if (currentProjectId === projectId) {
          setCurrentProjectId(null);
        }

        // Notify parent about deletion (for state updates)
        if (onProjectDeleted) {
          onProjectDeleted(projectId, data as ProjectWithOwner);
        }

        // Refresh projects list
        await refreshProjects();

        return { error: null };
      } catch (error) {
        return { error: error as Error };
      }
    },
    [supabase, user, profile, currentProjectId, setCurrentProjectId, forkProjectForUser, onProjectDeleted, refreshProjects]
  );

  return {
    forkProjectForUser,
    deleteProject,
  };
}
