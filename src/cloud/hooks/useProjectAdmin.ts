/**
 * Hook for admin operations
 * Handles library submissions, approvals, rejections, and admin CRUD
 */

import { useState, useCallback } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  Profile,
  LibraryProject,
  Project,
  CodeFile,
  Annotation,
  AccessionStatus,
  AnnotationType,
} from "@/cloud/lib/supabase/types";
import { fetchProfilesByIds, handleProjectError } from "@/lib/projects-utils";

export interface ProjectAdminParams {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  refreshProjects: () => Promise<void>;
}

export interface ProjectAdminState {
  pendingSubmissions: LibraryProject[];
  isLoadingAdmin: boolean;
  fetchPendingSubmissions: () => Promise<void>;
  approveProject: (projectId: string) => Promise<{ error: Error | null }>;
  rejectProject: (projectId: string, reason?: string) => Promise<{ error: Error | null }>;
  adminDeleteProject: (projectId: string) => Promise<{ error: Error | null }>;
  adminHardDeleteProject: (projectId: string) => Promise<{ error: Error | null }>;
  adminRenameProject: (projectId: string, newName: string) => Promise<{ error: Error | null }>;
  deaccessionProject: (projectId: string) => Promise<{ error: Error | null }>;
  adminDuplicateProject: (projectId: string) => Promise<{
    project: Project | null;
    error: Error | null;
  }>;
}

/**
 * Custom hook for admin operations
 */
export function useProjectAdmin({
  supabase,
  user,
  profile,
  isAuthenticated,
  refreshProjects,
}: ProjectAdminParams): ProjectAdminState {
  const [pendingSubmissions, setPendingSubmissions] = useState<LibraryProject[]>([]);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);

  // Fetch projects pending admin review
  const fetchPendingSubmissions = useCallback(async () => {
    if (!supabase || !isAuthenticated) return;

    setIsLoadingAdmin(true);

    try {
      // Fetch submitted projects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: projectsData, error: projectsError } = await (supabase as any)
        .from("projects")
        .select("*")
        .eq("is_public", true)
        .is("deleted_at", null)
        .eq("accession_status", "submitted")
        .order("submitted_at", { ascending: true });

      if (projectsError) {
        console.error("Error fetching pending submissions:", projectsError);
        return;
      }

      const projects = projectsData || [];

      // Fetch owner profiles separately
      const ownerIds = [
        ...new Set(projects.map((p: Project) => p.owner_id).filter(Boolean)),
      ];

      let profilesMap = new Map<string, Profile>();
      if (ownerIds.length > 0) {
        profilesMap = await fetchProfilesByIds(supabase, ownerIds as string[]);
      }

      // Combine projects with owner info
      const submissionsWithOwners = projects.map((p: Project) => ({
        ...p,
        profile: p.owner_id ? profilesMap.get(p.owner_id) || null : null,
      }));

      setPendingSubmissions(submissionsWithOwners);
    } catch (error) {
      console.error("Error fetching pending submissions:", error);
    } finally {
      setIsLoadingAdmin(false);
    }
  }, [supabase, isAuthenticated]);

  // Approve a submitted project (admin only)
  // - Adds $ prefix to name (library namespace)
  // - Sets owner_id to null (public/community ownership)
  const approveProject = useCallback(
    async (projectId: string) => {
      if (!supabase || !user) {
        return { error: new Error("Not authenticated") };
      }

      try {
        // Fetch the submitted project with all data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: sourceProject, error: projectError } = await (supabase as any)
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .eq("accession_status", "submitted")
          .single();

        if (projectError || !sourceProject) {
          return { error: new Error("Project not found or not in submitted status") };
        }

        const baseName = sourceProject.name.replace(/^\$+/, "");
        const libraryName = `$${baseName}`;

        // Check for existing approved library project with same name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existingProjects } = await (supabase as any)
          .from("projects")
          .select("id, name")
          .eq("accession_status", "approved")
          .is("deleted_at", null);

        // Find duplicate by comparing base names (strip $ prefix)
        const duplicate = existingProjects?.find((p: { name: string }) => {
          const existingBaseName = p.name.replace(/^\$+/, "");
          return existingBaseName === baseName;
        });

        // If duplicate exists, soft-delete the old version (replace workflow)
        if (duplicate) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("projects")
            .update({
              deleted_at: new Date().toISOString(),
            })
            .eq("id", duplicate.id);
        }

        // Fetch files and annotations from the submitted project
        const [filesRes, annotationsRes] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from("code_files").select("*").eq("project_id", projectId),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from("annotations").select("*").eq("project_id", projectId),
        ]);

        const files = filesRes.data || [];
        const annotations = annotationsRes.data || [];

        // Create library copy with new ID
        const libraryProjectId = crypto.randomUUID();
        const now = new Date().toISOString();

        const libraryProject = {
          id: libraryProjectId,
          name: libraryName,
          description: sourceProject.description,
          mode: sourceProject.mode,
          session_data: sourceProject.session_data,
          owner_id: null, // No owner - community owned
          is_public: true,
          accession_status: "approved" as AccessionStatus,
          approved_at: now,
          approved_by: user.id,
          created_at: now,
          updated_at: now,
        };

        // Insert library project
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insertError } = await (supabase as any)
          .from("projects")
          .insert(libraryProject);

        if (insertError) {
          return { error: new Error(insertError.message) };
        }

        // Copy files to library project
        if (files.length > 0) {
          const libraryFiles = files.map(
            (f: {
              id: string;
              filename: string;
              language: string | null;
              content: string;
              original_content: string | null;
              uploaded_by: string | null;
            }) => ({
              id: crypto.randomUUID(),
              project_id: libraryProjectId,
              filename: f.filename,
              language: f.language,
              content: f.content,
              original_content: f.original_content,
              uploaded_by: f.uploaded_by,
              created_at: now,
              updated_at: now,
            })
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("code_files").insert(libraryFiles);
        }

        // Copy annotations to library project (with new file IDs mapping)
        if (annotations.length > 0 && files.length > 0) {
          // Need to get the new file IDs that were just inserted
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: newFiles } = await (supabase as any)
            .from("code_files")
            .select("id, filename")
            .eq("project_id", libraryProjectId);

          // Map by filename since we can't track UUIDs through insert
          const fileNameToIdMap = new Map<string, string>();
          newFiles?.forEach((f: { id: string; filename: string }) => {
            fileNameToIdMap.set(f.filename, f.id);
          });

          const libraryAnnotations = annotations
            .map(
              (a: {
                id: string;
                file_id: string;
                user_id: string | null;
                line_number: number;
                end_line_number: number | null;
                line_content: string | null;
                type: AnnotationType;
                content: string;
              }) => {
                // Find the original file name
                const originalFile = files.find(
                  (f: { id: string; filename: string }) => f.id === a.file_id
                );
                if (!originalFile) return null;

                // Get new file ID by filename
                const newFileId = fileNameToIdMap.get(originalFile.filename);
                if (!newFileId) return null;

                return {
                  id: crypto.randomUUID(),
                  project_id: libraryProjectId,
                  file_id: newFileId,
                  user_id: a.user_id,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  added_by_initials: (a as any).added_by_initials || null,
                  line_number: a.line_number,
                  end_line_number: a.end_line_number,
                  line_content: a.line_content,
                  type: a.type,
                  content: a.content,
                  created_at: now,
                  updated_at: now,
                };
              }
            )
            .filter(Boolean);

          if (libraryAnnotations.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from("annotations").insert(libraryAnnotations);
          }
        }

        // Return the original project to the user as a draft
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("projects")
          .update({
            is_public: false,
            accession_status: "draft" as AccessionStatus,
            submitted_at: null,
          })
          .eq("id", projectId);

        // Remove from pending list
        setPendingSubmissions((prev) => prev.filter((p) => p.id !== projectId));

        return { error: null };
      } catch (error) {
        return { error: handleProjectError(error, "approveProject") };
      }
    },
    [supabase, user]
  );

  // Reject a submitted project (admin only)
  // Returns project to owner as draft so they can edit and resubmit
  const rejectProject = useCallback(
    async (projectId: string, reason?: string) => {
      if (!supabase || !user) {
        return { error: new Error("Not authenticated") };
      }

      try {
        // Reset to draft status - owner keeps the project
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error, data } = await (supabase as any)
          .from("projects")
          .update({
            is_public: false,
            accession_status: "draft" as AccessionStatus,
            submitted_at: null,
          })
          .eq("id", projectId)
          .eq("accession_status", "submitted")
          .select();

        if (error) {
          return { error: new Error(error.message) };
        }

        // Check if update actually affected any rows
        if (!data || data.length === 0) {
          return { error: new Error("Project not found or not in submitted status") };
        }

        // If a reason was provided, create LIBRARY_REJECT.md in the project
        if (reason && reason.trim()) {
          const rejectContent = `# Library Submission Rejected

**Date:** ${new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}

## Reason for Rejection

${reason.trim()}

---

*You may address these concerns and resubmit your project for review.*
`;

          // Check if LIBRARY_REJECT.md already exists
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: existingFile } = await (supabase as any)
            .from("code_files")
            .select("id")
            .eq("project_id", projectId)
            .eq("filename", "LIBRARY_REJECT.md")
            .maybeSingle();

          if (existingFile) {
            // Update existing file
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
              .from("code_files")
              .update({
                content: rejectContent,
                original_content: rejectContent,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingFile.id);
          } else {
            // Create new file
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from("code_files").insert({
              id: crypto.randomUUID(),
              project_id: projectId,
              filename: "LIBRARY_REJECT.md",
              content: rejectContent,
              original_content: rejectContent,
              language: "markdown",
              display_order: 999, // Put at end of file list
              uploaded_by: user.id,
            });
          }
        }

        // Remove from pending list
        setPendingSubmissions((prev) => prev.filter((p) => p.id !== projectId));

        return { error: null };
      } catch (error) {
        return { error: handleProjectError(error, "rejectProject") };
      }
    },
    [supabase, user]
  );

  // Admin soft delete - marks project as deleted but keeps data
  const adminDeleteProject = useCallback(
    async (projectId: string) => {
      if (!supabase || !user) {
        return { error: new Error("Not authenticated") };
      }

      try {
        // Soft delete by setting deleted_at
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error, data } = await (supabase as any)
          .from("projects")
          .update({
            deleted_at: new Date().toISOString(),
          })
          .eq("id", projectId)
          .select();

        if (error) {
          return { error: new Error(error.message) };
        }

        // Check if update actually affected any rows
        if (!data || data.length === 0) {
          return { error: new Error("Project not found or could not be deleted") };
        }

        // Remove from pending list
        setPendingSubmissions((prev) => prev.filter((p) => p.id !== projectId));

        return { error: null };
      } catch (error) {
        return { error: handleProjectError(error, "adminDeleteProject") };
      }
    },
    [supabase, user]
  );

  // Admin hard delete - permanently removes project and all related data
  const adminHardDeleteProject = useCallback(
    async (projectId: string) => {
      if (!supabase || !user) {
        return { error: new Error("Not authenticated") };
      }

      try {
        // Delete in order due to FK constraints
        await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from("annotations").delete().eq("project_id", projectId),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from("code_files").delete().eq("project_id", projectId),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from("project_members").delete().eq("project_id", projectId),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from("project_invites").delete().eq("project_id", projectId),
        ]);

        // Delete the project itself
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("projects")
          .delete()
          .eq("id", projectId);

        if (error) {
          return { error: new Error(error.message) };
        }

        // Remove from pending list
        setPendingSubmissions((prev) => prev.filter((p) => p.id !== projectId));

        return { error: null };
      } catch (error) {
        return { error: handleProjectError(error, "adminHardDeleteProject") };
      }
    },
    [supabase, user]
  );

  // Admin rename - can rename any project
  const adminRenameProject = useCallback(
    async (projectId: string, newName: string) => {
      if (!supabase || !user) {
        return { error: new Error("Not authenticated") };
      }

      // Strip $ prefix (reserved for library namespace)
      const sanitizedName = newName.replace(/^\$+/, "").trim();
      if (!sanitizedName) {
        return { error: new Error("Project name cannot be empty") };
      }

      try {
        // Admin RLS should allow updating any project
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("projects")
          .update({ name: sanitizedName, updated_at: new Date().toISOString() })
          .eq("id", projectId);

        if (error) {
          return { error: new Error(error.message) };
        }

        // Update pending submissions state
        setPendingSubmissions((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, name: sanitizedName } : p))
        );

        return { error: null };
      } catch (error) {
        return { error: handleProjectError(error, "adminRenameProject") };
      }
    },
    [supabase, user]
  );

  // Deaccession - move approved project back to submitted (removes from library)
  const deaccessionProject = useCallback(
    async (projectId: string) => {
      if (!supabase || !user) {
        return { error: new Error("Not authenticated") };
      }

      try {
        // Get original project name (strip $ prefix if present)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: project } = await (supabase as any)
          .from("projects")
          .select("name, owner_id")
          .eq("id", projectId)
          .single();

        if (!project) {
          return { error: new Error("Project not found") };
        }

        // Strip $ namespace prefix if present
        const cleanName = project.name.replace(/^\$+/, "");

        // Move back to submitted status
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("projects")
          .update({
            name: cleanName,
            is_public: true, // Keep public but change status
            accession_status: "submitted" as AccessionStatus,
            approved_at: null,
            approved_by: null,
          })
          .eq("id", projectId);

        if (error) {
          return { error: new Error(error.message) };
        }

        return { error: null };
      } catch (error) {
        return { error: handleProjectError(error, "deaccessionProject") };
      }
    },
    [supabase, user]
  );

  // Admin duplicate - create a copy of a project (for variants or backups)
  const adminDuplicateProject = useCallback(
    async (projectId: string) => {
      if (!supabase || !user) {
        return { project: null, error: new Error("Not authenticated") };
      }

      try {
        // Fetch source project
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: sourceProject, error: projectError } = await (supabase as any)
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .single();

        if (projectError || !sourceProject) {
          return { project: null, error: new Error("Project not found") };
        }

        // Fetch files and annotations
        const [filesRes, annotationsRes] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from("code_files").select("*").eq("project_id", projectId),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from("annotations").select("*").eq("project_id", projectId),
        ]);

        const files = filesRes.data || [];
        const annotations = annotationsRes.data || [];

        // Create new project
        const newProjectId = crypto.randomUUID();
        const baseName = sourceProject.name.replace(/^\$+/, "");
        const newName = `${baseName} (Copy)`;

        const newProject = {
          id: newProjectId,
          name: newName,
          description: sourceProject.description,
          mode: sourceProject.mode,
          owner_id: user.id, // Admin becomes owner of copy
          is_public: false,
          accession_status: "draft" as AccessionStatus,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insertError } = await (supabase as any)
          .from("projects")
          .insert(newProject);

        if (insertError) {
          return { project: null, error: new Error(insertError.message) };
        }

        // Add admin as project member
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("project_members").insert({
          project_id: newProjectId,
          user_id: user.id,
          role: "owner",
          joined_at: new Date().toISOString(),
        });

        // Copy files with new IDs
        const fileIdMap = new Map<string, string>();
        const newFiles = files.map((f: CodeFile) => {
          const newId = crypto.randomUUID();
          fileIdMap.set(f.id, newId);
          return {
            ...f,
            id: newId,
            project_id: newProjectId,
          };
        });

        if (newFiles.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("code_files").insert(newFiles);
        }

        // Copy annotations with remapped file IDs
        const newAnnotations = annotations.map((a: Annotation) => ({
          ...a,
          id: crypto.randomUUID(),
          file_id: fileIdMap.get(a.file_id) || a.file_id,
          project_id: newProjectId,
          user_id: user.id,
        }));

        if (newAnnotations.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("annotations").insert(newAnnotations);
        }

        // Refresh projects list
        await refreshProjects();

        return { project: newProject as Project, error: null };
      } catch (error) {
        return { project: null, error: handleProjectError(error, "adminDuplicateProject") };
      }
    },
    [supabase, user, refreshProjects]
  );

  return {
    pendingSubmissions,
    isLoadingAdmin,
    fetchPendingSubmissions,
    approveProject,
    rejectProject,
    adminDeleteProject,
    adminHardDeleteProject,
    adminRenameProject,
    deaccessionProject,
    adminDuplicateProject,
  };
}
