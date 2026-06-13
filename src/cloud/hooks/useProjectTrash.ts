/**
 * Hook for project trash management
 * Handles soft delete, restore, permanent delete, and empty trash operations
 */

import { useState, useCallback } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { ProjectWithOwner } from "@/cloud/lib/supabase/types";
import { sanitizeProjectName } from "@/lib/projects-utils";

export interface ProjectTrashParams {
  supabase: SupabaseClient | null;
  user: User | null;
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
  refreshProjects: () => Promise<void>;
}

export interface ProjectTrashState {
  // State
  trashedProjects: ProjectWithOwner[];
  isLoadingTrash: boolean;

  // Functions
  renameProject: (projectId: string, newName: string) => Promise<{ error: Error | null }>;
  fetchTrashedProjects: () => Promise<void>;
  restoreProject: (projectId: string) => Promise<{ error: Error | null }>;
  permanentlyDeleteProject: (projectId: string) => Promise<{ error: Error | null }>;
  emptyTrash: () => Promise<{ error: Error | null }>;
}

/**
 * Custom hook for trash management
 */
export function useProjectTrash({
  supabase,
  user,
  currentProjectId,
  setCurrentProjectId,
  refreshProjects,
}: ProjectTrashParams): ProjectTrashState {
  const [trashedProjects, setTrashedProjects] = useState<ProjectWithOwner[]>([]);
  const [isLoadingTrash, setIsLoadingTrash] = useState(false);

  // Rename a project (only owner can rename)
  const renameProject = useCallback(
    async (projectId: string, newName: string) => {
      if (!supabase || !user) {
        return { error: new Error("Not authenticated") };
      }

      // Strip leading $ characters (reserved for library namespace) and trim
      const sanitizedName = newName.replace(/^\$+/, "").trim();

      if (!sanitizedName) {
        return { error: new Error("Project name cannot be empty") };
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("projects")
          .update({ name: sanitizedName, updated_at: new Date().toISOString() })
          .eq("id", projectId)
          .eq("owner_id", user.id); // Only allow rename if user is the owner

        if (error) {
          return { error: new Error(error.message) };
        }

        // Refresh projects list to show updated name
        await refreshProjects();

        return { error: null };
      } catch (error) {
        return { error: error as Error };
      }
    },
    [supabase, user, refreshProjects]
  );

  // Fetch trashed projects (soft-deleted projects owned by user)
  const fetchTrashedProjects = useCallback(async () => {
    if (!supabase || !user) {
      setTrashedProjects([]);
      return;
    }

    setIsLoadingTrash(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("projects")
        .select("*")
        .eq("owner_id", user.id)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (error) {
        console.error("Error fetching trashed projects:", error.message);
        setTrashedProjects([]);
      } else {
        setTrashedProjects(data || []);
      }
    } catch (error) {
      console.error("Error fetching trashed projects:", error);
      setTrashedProjects([]);
    } finally {
      setIsLoadingTrash(false);
    }
  }, [supabase, user]);

  // Restore a project from trash (set deleted_at back to null)
  const restoreProject = useCallback(
    async (projectId: string) => {
      if (!supabase || !user) {
        return { error: new Error("Not authenticated") };
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("projects")
          .update({ deleted_at: null })
          .eq("id", projectId)
          .eq("owner_id", user.id);

        if (error) {
          return { error: new Error(error.message) };
        }

        // Remove from trashedProjects in local state
        setTrashedProjects((prev) => prev.filter((p) => p.id !== projectId));

        // Refresh main projects list to include restored project
        await refreshProjects();

        return { error: null };
      } catch (error) {
        return { error: error as Error };
      }
    },
    [supabase, user, refreshProjects]
  );

  // Permanently delete a project (actual database deletion)
  const permanentlyDeleteProject = useCallback(
    async (projectId: string) => {
      if (!supabase || !user) {
        return { error: new Error("Not authenticated") };
      }

      try {
        // Delete annotations first (FK constraint)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("annotations").delete().eq("project_id", projectId);

        // Delete code files
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("code_files").delete().eq("project_id", projectId);

        // Delete project memberships
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("project_members").delete().eq("project_id", projectId);

        // Delete project invites
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("project_invites").delete().eq("project_id", projectId);

        // Delete the project itself
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("projects")
          .delete()
          .eq("id", projectId)
          .eq("owner_id", user.id);

        if (error) {
          return { error: new Error(error.message) };
        }

        // Clear currentProjectId if it matches the deleted project (defensive check)
        if (currentProjectId === projectId) {
          setCurrentProjectId(null);
        }

        // Remove from trashedProjects in local state
        setTrashedProjects((prev) => prev.filter((p) => p.id !== projectId));

        return { error: null };
      } catch (error) {
        return { error: error as Error };
      }
    },
    [supabase, user, currentProjectId, setCurrentProjectId]
  );

  // Empty trash - permanently delete all trashed projects
  const emptyTrash = useCallback(async () => {
    if (!supabase || !user) {
      return { error: new Error("Not authenticated") };
    }

    try {
      // Get all trashed project IDs
      const trashedIds = trashedProjects.map((p) => p.id);

      if (trashedIds.length === 0) {
        return { error: null };
      }

      // Delete annotations for all trashed projects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("annotations").delete().in("project_id", trashedIds);

      // Delete code files for all trashed projects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("code_files").delete().in("project_id", trashedIds);

      // Delete project memberships for all trashed projects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("project_members")
        .delete()
        .in("project_id", trashedIds);

      // Delete project invites for all trashed projects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("project_invites")
        .delete()
        .in("project_id", trashedIds);

      // Delete all trashed projects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("projects")
        .delete()
        .in("id", trashedIds)
        .eq("owner_id", user.id);

      if (error) {
        return { error: new Error(error.message) };
      }

      // Clear currentProjectId if it was among the trashed projects (defensive check)
      if (currentProjectId && trashedIds.includes(currentProjectId)) {
        setCurrentProjectId(null);
      }

      // Clear trashedProjects in local state
      setTrashedProjects([]);

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }, [supabase, user, trashedProjects, currentProjectId, setCurrentProjectId]);

  return {
    // State
    trashedProjects,
    isLoadingTrash,

    // Functions
    renameProject,
    fetchTrashedProjects,
    restoreProject,
    permanentlyDeleteProject,
    emptyTrash,
  };
}
