/**
 * Hook for library operations
 * Handles browsing, loading, copying, and submitting projects to the library
 */

import { useState, useCallback } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Profile, LibraryProject, Project } from "@/cloud/lib/supabase/types";
import type { Session } from "@/types/session";
import { fetchProfilesByIds, remapIds, handleProjectError } from "@/lib/projects-utils";

export interface ProjectLibraryParams {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: Profile | null;
  loadProject: (projectId: string) => Promise<{
    session: Session | null;
    error: Error | null;
  }>;
}

export interface ProjectLibraryState {
  libraryProjects: LibraryProject[];
  isLoadingLibrary: boolean;
  fetchLibraryProjects: () => Promise<void>;
  loadLibraryProject: (projectId: string) => Promise<{
    session: Session | null;
    error: Error | null;
  }>;
  copyLibraryProject: (
    projectId: string,
    newName?: string
  ) => Promise<{ project: Project | null; error: Error | null }>;
  submitForReview: (projectId: string) => Promise<{ error: Error | null }>;
}

/**
 * Custom hook for library operations
 */
export function useProjectLibrary({
  supabase,
  user,
  profile,
  loadProject,
}: ProjectLibraryParams): ProjectLibraryState {
  const [libraryProjects, setLibraryProjects] = useState<LibraryProject[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  // Fetch library projects (approved + submitted public projects)
  const fetchLibraryProjects = useCallback(async () => {
    if (!supabase) {
      console.log("fetchLibraryProjects: Supabase not configured, skipping");
      return;
    }

    setIsLoadingLibrary(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("projects")
        .select("*")
        .is("deleted_at", null)
        .in("accession_status", ["approved", "submitted"])
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // Fetch profiles for non-approved projects (approved ones have owner_id = null)
      const projectsWithOwners = data || [];
      const ownerIds = projectsWithOwners
        .map((p: { owner_id: string | null }) => p.owner_id)
        .filter((id: string | null): id is string => id !== null);

      let profilesMap = new Map<string, Profile>();
      if (ownerIds.length > 0) {
        profilesMap = await fetchProfilesByIds(supabase, ownerIds);
      }

      const libraryWithProfiles: LibraryProject[] = projectsWithOwners.map(
        (project: {
          id: string;
          name: string;
          description: string | null;
          owner_id: string | null;
          mode: string;
          accession_status: string | null;
          updated_at: string;
          session_data: Record<string, unknown> | null;
        }) => ({
          ...project,
          profile: project.owner_id ? profilesMap.get(project.owner_id) || null : null,
        })
      );

      setLibraryProjects(libraryWithProfiles);
    } catch (error) {
      console.error("Error fetching library projects:", error);
    } finally {
      setIsLoadingLibrary(false);
    }
  }, [supabase]);

  // Load library project in read-only mode
  const loadLibraryProject = useCallback(
    async (projectId: string) => {
      if (!supabase || !user || !profile) {
        return { session: null, error: new Error("Not authenticated") };
      }

      try {
        // Use the loadProject from CRUD hook
        const result = await loadProject(projectId);
        if (result.error || !result.session) {
          return result;
        }

        // Mark as read-only for library projects
        const sessionWithReadOnly = {
          ...result.session,
          isReadOnly: true,
        };

        return { session: sessionWithReadOnly, error: null };
      } catch (error) {
        return { session: null, error: handleProjectError(error, "loadLibraryProject") };
      }
    },
    [supabase, user, profile, loadProject]
  );

  // Copy library project to user's account
  const copyLibraryProject = useCallback(
    async (projectId: string, newName?: string) => {
      if (!supabase || !user || !profile) {
        return { project: null, error: new Error("Not authenticated") };
      }

      try {
        // Load the library project
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: sourceProject, error: projectError } = await (supabase as any)
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .single();

        if (projectError || !sourceProject) {
          return { project: null, error: new Error("Source project not found") };
        }

        // Load files, annotations, and replies in parallel
        const [filesResult, annotationsResult, repliesResult] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from("code_files").select("*").eq("project_id", projectId),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from("annotations").select("*").eq("project_id", projectId),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("annotation_replies")
            .select("*")
            .eq("project_id", projectId),
        ]);

        if (filesResult.error) throw filesResult.error;
        if (annotationsResult.error) throw annotationsResult.error;
        if (repliesResult.error) throw repliesResult.error;

        const sourceFiles = filesResult.data || [];
        const sourceAnnotations = annotationsResult.data || [];
        const sourceReplies = repliesResult.data || [];

        // Generate new IDs
        const newProjectId = crypto.randomUUID();
        const fileIdMap = new Map<string, string>();
        const annotationIdMap = new Map<string, string>();

        sourceFiles.forEach((file: { id: string }) => {
          fileIdMap.set(file.id, crypto.randomUUID());
        });
        sourceAnnotations.forEach((annotation: { id: string }) => {
          annotationIdMap.set(annotation.id, crypto.randomUUID());
        });

        // Create new project
        const copyName =
          newName || `Copy of ${sourceProject.name.replace(/^\$/, "")}`;
        const now = new Date().toISOString();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newProject, error: createError } = await (supabase as any)
          .from("projects")
          .insert({
            id: newProjectId,
            name: copyName,
            description: sourceProject.description,
            owner_id: user.id,
            mode: sourceProject.mode,
            session_data: sourceProject.session_data,
            accession_status: "draft",
            created_at: now,
            updated_at: now,
          })
          .select()
          .single();

        if (createError || !newProject) {
          return { project: null, error: new Error(createError?.message || "Failed to create project") };
        }

        // Add user as project member
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("project_members").insert({
          project_id: newProjectId,
          user_id: user.id,
          role: "owner",
          joined_at: now,
        });

        // Copy files with new IDs
        const newFiles = sourceFiles.map(
          (file: {
            id: string;
            filename: string;
            language: string;
            content: string;
            original_content: string;
            display_order: number;
          }) => ({
            id: fileIdMap.get(file.id),
            project_id: newProjectId,
            filename: file.filename,
            language: file.language,
            content: file.content,
            original_content: file.original_content,
            uploaded_by: user.id,
            display_order: file.display_order,
            updated_at: now,
          })
        );

        // Copy annotations with new IDs
        const newAnnotations = sourceAnnotations.map(
          (annotation: {
            id: string;
            file_id: string;
            line_number: number;
            end_line_number: number | null;
            line_content: string | null;
            type: string;
            content: string;
          }) => ({
            id: annotationIdMap.get(annotation.id),
            file_id: fileIdMap.get(annotation.file_id),
            project_id: newProjectId,
            user_id: user.id,
            line_number: annotation.line_number,
            end_line_number: annotation.end_line_number,
            line_content: annotation.line_content,
            type: annotation.type,
            content: annotation.content,
            updated_at: now,
          })
        );

        // Copy replies with new IDs
        const newReplies = sourceReplies.map(
          (reply: {
            annotation_id: string;
            user_id: string;
            content: string;
            profile_color: string | null;
          }) => ({
            id: crypto.randomUUID(),
            annotation_id: annotationIdMap.get(reply.annotation_id),
            project_id: newProjectId,
            user_id: user.id,
            content: reply.content,
            profile_color: profile.profile_color || null,
            created_at: now,
            updated_at: now,
          })
        );

        // Insert all data in parallel
        await Promise.all([
          newFiles.length > 0
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (supabase as any).from("code_files").insert(newFiles)
            : Promise.resolve(),
          newAnnotations.length > 0
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (supabase as any).from("annotations").insert(newAnnotations)
            : Promise.resolve(),
          newReplies.length > 0
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (supabase as any).from("annotation_replies").insert(newReplies)
            : Promise.resolve(),
        ]);

        // Return the new project (caller can load it if needed)
        return { project: newProject, error: null };
      } catch (error) {
        return { project: null, error: handleProjectError(error, "copyLibraryProject") };
      }
    },
    [supabase, user, profile, loadProject]
  );

  // Submit project for library review
  const submitForReview = useCallback(
    async (projectId: string) => {
      if (!supabase || !user) {
        return { error: new Error("Not authenticated") };
      }

      try {
        const now = new Date().toISOString();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("projects")
          .update({
            accession_status: "submitted",
            is_public: true, // Required for admin panel to show submission
            submitted_at: now, // Required for ordering in admin panel
            updated_at: now,
          })
          .eq("id", projectId)
          .eq("owner_id", user.id);

        if (error) {
          return { error: new Error(error.message) };
        }

        return { error: null };
      } catch (error) {
        return { error: handleProjectError(error, "submitForReview") };
      }
    },
    [supabase, user]
  );

  return {
    libraryProjects,
    isLoadingLibrary,
    fetchLibraryProjects,
    loadLibraryProject,
    copyLibraryProject,
    submitForReview,
  };
}
