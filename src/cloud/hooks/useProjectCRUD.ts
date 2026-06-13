/**
 * Hook for project CRUD operations (Create, Read, Update, Delete basics)
 * Manages projects list, current project state, and core project operations
 */

import { useState, useEffect, useCallback } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  Project,
  ProjectWithOwner,
  Profile,
  Annotation as AnnotationType,
  CodeFile,
} from "@/cloud/lib/supabase/types";
import type { Session, EntryMode } from "@/types/session";
import { DEFAULT_DISPLAY_SETTINGS } from "@/types/session";
import { isSessionExpiredError } from "@/lib/projects-utils";

export interface ProjectCRUDParams {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
}

export interface ProjectCRUDState {
  // State
  projects: ProjectWithOwner[];
  isLoading: boolean;
  currentProjectId: string | null;

  // Functions
  setCurrentProjectId: (id: string | null) => void;
  fetchProjects: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  createProject: (
    name: string,
    description?: string,
    mode?: EntryMode
  ) => Promise<{
    project: Project | null;
    initialSession: Partial<Session> | null;
    error: Error | null;
  }>;
  loadProject: (projectId: string) => Promise<{
    session: Session | null;
    error: Error | null;
  }>;
}

/**
 * Custom hook for project CRUD operations
 */
export function useProjectCRUD({
  supabase,
  user,
  profile,
  isAuthenticated,
}: ProjectCRUDParams): ProjectCRUDState {
  const [projects, setProjects] = useState<ProjectWithOwner[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentProjectIdState, setCurrentProjectIdState] = useState<string | null>(null);

  // Wrapper for setCurrentProjectId that persists to localStorage
  const setCurrentProjectId = useCallback((id: string | null) => {
    setCurrentProjectIdState(id);
    try {
      if (id) {
        localStorage.setItem("ccs-current-project-id", id);
      } else {
        localStorage.removeItem("ccs-current-project-id");
      }
    } catch (err) {
      console.warn("Failed to persist currentProjectId:", err);
    }
  }, []);

  // Restore currentProjectId from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ccs-current-project-id");
      if (saved) {
        setCurrentProjectIdState(saved);
        // Set flag to show restoration banner
        localStorage.setItem("ccs-project-just-restored", "true");
      }
    } catch (err) {
      console.warn("Failed to restore currentProjectId:", err);
    }
  }, []);

  // Fetch user's projects (owned + shared) - OPTIMIZED: parallel queries
  const fetchProjects = useCallback(async () => {
    if (!supabase || !user) {
      setProjects([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Timeout to prevent infinite loading (Safari suspension issue)
    const loadingTimeout = setTimeout(() => {
      console.warn("fetchProjects: Loading timeout reached, forcing isLoading=false");
      setIsLoading(false);
    }, 10000);

    try {
      // Run owned and shared queries in parallel
      const [ownedResult, sharedResult] = await Promise.all([
        // Get projects the user owns (excluding trashed)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("projects")
          .select("*")
          .eq("owner_id", user.id)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false }),
        // Get project IDs shared with the user
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("project_members")
          .select("project_id")
          .eq("user_id", user.id),
      ]);

      const { data: ownedProjects, error: ownedError } = ownedResult;
      const { data: sharedProjects, error: sharedError } = sharedResult;

      if (ownedError && Object.keys(ownedError).length > 0) {
        console.error("Error fetching owned projects:", ownedError.message);
        // Check if it's an auth error
        if (isSessionExpiredError(ownedError)) {
          console.warn("Session expired while fetching projects - projects list may be stale");
        }
      }
      if (sharedError && Object.keys(sharedError).length > 0) {
        console.error("Error fetching shared projects:", sharedError.message);
      }

      // Fetch shared project details if any (only IDs not already owned)
      const owned = ownedProjects || [];
      const ownedIds = new Set(owned.map((p: Project) => p.id));
      const sharedIds = (sharedProjects || [])
        .map((p: { project_id: string }) => p.project_id)
        .filter((id: string) => !ownedIds.has(id));

      let sharedProjectDetails: Project[] = [];
      if (sharedIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: sharedData } = await (supabase as any)
          .from("projects")
          .select("*")
          .in("id", sharedIds)
          .is("deleted_at", null); // Exclude trashed projects
        sharedProjectDetails = sharedData || [];
      }

      // Combine (already deduplicated by filtering sharedIds)
      const allProjects = [...owned, ...sharedProjectDetails];

      // Sort by updated_at
      allProjects.sort((a: Project, b: Project) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );

      setProjects(allProjects);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      clearTimeout(loadingTimeout);
      setIsLoading(false);
    }
  }, [supabase, user]);

  // Refresh is just an alias for fetchProjects (for clarity in other hooks)
  const refreshProjects = useCallback(async () => {
    await fetchProjects();
  }, [fetchProjects]);

  // Fetch projects when user changes
  useEffect(() => {
    if (isAuthenticated) {
      fetchProjects();
    } else {
      setProjects([]);
      setCurrentProjectId(null);
    }
  }, [isAuthenticated, fetchProjects, setCurrentProjectId]);

  // Refresh projects when session is refreshed after inactivity
  useEffect(() => {
    const handleSessionRefreshed = () => {
      console.log("useProjectCRUD: Session refreshed, reloading projects");
      if (isAuthenticated) {
        fetchProjects();
      }
    };

    window.addEventListener("auth-session-refreshed", handleSessionRefreshed);
    return () => {
      window.removeEventListener("auth-session-refreshed", handleSessionRefreshed);
    };
  }, [isAuthenticated, fetchProjects]);

  // Create a new project
  const createProject = useCallback(
    async (name: string, description?: string, mode: EntryMode = "critique") => {
      if (!supabase || !user) {
        return {
          project: null,
          initialSession: null,
          error: new Error("Not authenticated"),
        };
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("projects")
          .insert({
            name,
            description: description || null,
            owner_id: user.id,
            mode,
            session_data: null,
          })
          .select()
          .single();

        if (error) {
          return {
            project: null,
            initialSession: null,
            error: new Error(error.message),
          };
        }

        const project = data as Project;

        // Get creator name from user metadata
        const creatorName =
          user.user_metadata?.full_name || user.email?.split("@")[0] || "Unknown";
        const today = new Date().toISOString().split("T")[0];

        // Create README.md template
        const readmeContent = `# ${name}

## Project Information

| Field | Value |
|-------|-------|
| **Creator** | ${creatorName} |
| **Version** | 1.0 |
| **Created** | ${today} |

## Description

${description || "_Add a description of the project and its purpose here._"}

## Code Files

## Analysis Notes

_Record observations, questions, and insights from your critical code analysis:_

-

## References

_Add relevant references, documentation links, or related scholarship:_

-
`;

        // Insert README.md into code_files table
        const readmeId = crypto.randomUUID();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: fileError } = await (supabase as any)
          .from("code_files")
          .insert({
            id: readmeId,
            project_id: project.id,
            filename: "README.md",
            language: "markdown",
            content: readmeContent,
            original_content: readmeContent,
            uploaded_by: user.id,
          });

        if (fileError) {
          console.error("Error creating README.md:", fileError);
          // Don't fail project creation if README fails
        } else {
          console.log(
            "createProject: README.md created successfully with id:",
            readmeId
          );
        }

        // Add to local state instead of full refresh
        setProjects((prev) => [project as ProjectWithOwner, ...prev]);

        // Build initial session with the README we just created
        // This avoids a race condition where loadProject might run before the DB commits
        const initialSession = !fileError
          ? {
              codeFiles: [
                {
                  id: readmeId,
                  name: "README.md",
                  language: "markdown",
                  source: "shared" as const,
                  size: readmeContent.length,
                  uploadedAt: new Date().toISOString(),
                },
              ],
              codeContents: { [readmeId]: readmeContent },
              lineAnnotations: [],
              messages: [],
              mode,
            }
          : null;

        return { project, initialSession, error: null };
      } catch (error) {
        return {
          project: null,
          initialSession: null,
          error: error as Error,
        };
      }
    },
    [supabase, user]
  );

  // Load a project's session data - OPTIMIZED: parallel queries
  // Files and annotations are loaded from their respective tables (code_files, annotations)
  // NOT from session_data, which only stores other session state (messages, mode, etc.)
  const loadProject = useCallback(
    async (projectId: string) => {
      if (!supabase) {
        return {
          session: null,
          error: new Error("Supabase not configured"),
        };
      }

      try {
        // Fetch project, files, and annotations in parallel
        const [projectResult, filesResult, annotationsResult] = await Promise.all([
          // Project metadata
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from("projects").select("*").eq("id", projectId).single(),
          // Code files (with display_order)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("code_files")
            .select("*")
            .eq("project_id", projectId)
            .order("display_order", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true }),
          // Annotations
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("annotations")
            .select("*")
            .eq("project_id", projectId)
            .order("created_at", { ascending: true }),
        ]);

        const { data: projectData, error: projectError } = projectResult;
        let { data: codeFilesData, error: filesError } = filesResult;
        const { data: annotationsData, error: annotationsError } = annotationsResult;

        if (projectError) {
          // Check if it's an auth error (session expired)
          if (isSessionExpiredError(projectError)) {
            console.error(
              "Authentication error loading project - session may have expired:",
              projectError
            );
            return {
              session: null,
              error: new Error(
                "Your session has expired. Please refresh the page to sign in again."
              ),
            };
          }
          return { session: null, error: new Error(projectError.message) };
        }

        // Fallback: if display_order column doesn't exist yet, query without it
        if (filesError) {
          console.warn(
            "Fetching code files with display_order failed, trying without:",
            filesError
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fallback = await (supabase as any)
            .from("code_files")
            .select("*")
            .eq("project_id", projectId)
            .order("created_at", { ascending: true });
          codeFilesData = fallback.data;
          filesError = fallback.error;
        }

        if (filesError) {
          console.error("Error fetching code files:", filesError);
        }

        if (annotationsError) {
          console.error("Error fetching annotations:", annotationsError);
        }

        // Build codeFiles and codeContents from database
        const codeFiles = (codeFilesData || []).map(
          (row: {
            id: string;
            filename: string;
            language: string | null;
            content: string;
            created_at: string;
          }) => ({
            id: row.id,
            name: row.filename,
            language: row.language || "plaintext",
            source: "shared" as const,
            size: row.content?.length || 0,
            uploadedAt: row.created_at,
          })
        );

        const codeContents: Record<string, string> = {};
        for (const row of codeFilesData || []) {
          codeContents[row.id] = row.content || "";
        }

        // Fetch replies for all annotations
        const annotationIds = (annotationsData || []).map((a: { id: string }) => a.id);
        let repliesData: Array<{
          annotation_id: string;
          id: string;
          content: string;
          created_at: string;
          added_by_initials: string | null;
          profile_color: string | null;
        }> = [];

        // Build replies map with profile colors
        const repliesMap: Record<
          string,
          Array<{
            id: string;
            content: string;
            createdAt: string;
            addedBy?: string;
            profileColor?: string;
          }>
        > = {};

        if (annotationIds.length > 0) {
          // Fetch replies with profile_color stored in the table
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any)
            .from("annotation_replies")
            .select(
              "id, annotation_id, content, created_at, added_by_initials, profile_color"
            )
            .in("annotation_id", annotationIds)
            .order("created_at", { ascending: true });

          repliesData = data || [];

          repliesData.forEach(
            (reply: {
              annotation_id: string;
              id: string;
              content: string;
              created_at: string;
              added_by_initials: string | null;
              profile_color: string | null;
            }) => {
              if (!repliesMap[reply.annotation_id]) {
                repliesMap[reply.annotation_id] = [];
              }
              repliesMap[reply.annotation_id].push({
                id: reply.id,
                content: reply.content,
                createdAt: reply.created_at,
                addedBy: reply.added_by_initials || undefined,
                profileColor: reply.profile_color || undefined,
              });
            }
          );
        }

        // Build lineAnnotations from database
        const lineAnnotations = (annotationsData || []).map(
          (row: {
            id: string;
            file_id: string;
            line_number: number;
            end_line_number: number | null;
            line_content: string | null;
            type: string;
            content: string;
            created_at: string;
            user_id: string | null;
            added_by_initials: string | null;
          }) => ({
            id: row.id,
            codeFileId: row.file_id,
            lineNumber: row.line_number,
            endLineNumber: row.end_line_number || undefined,
            lineContent: row.line_content || "",
            type: row.type as
              | "observation"
              | "question"
              | "metaphor"
              | "pattern"
              | "context"
              | "critique",
            content: row.content,
            createdAt: row.created_at,
            addedBy: row.added_by_initials || undefined,
            replies: repliesMap[row.id] || undefined,
          })
        );

        // Build session: use session_data for other fields, but override files/annotations from tables
        const baseSession = projectData.session_data || {};
        const session: Session = {
          id: baseSession.id || projectId,
          mode: baseSession.mode || projectData.mode || "critique",
          experienceLevel: baseSession.experienceLevel,
          languageOverride: baseSession.languageOverride,
          messages: baseSession.messages || [],
          codeFiles,
          codeContents,
          lineAnnotations,
          analysisResults: baseSession.analysisResults || [],
          references: baseSession.references || [],
          critiqueArtifacts: baseSession.critiqueArtifacts || [],
          settings: baseSession.settings || { teachMeMode: false },
          displaySettings: baseSession.displaySettings || DEFAULT_DISPLAY_SETTINGS,
          currentPhase: baseSession.currentPhase || "opening",
          feedbackEscalation: baseSession.feedbackEscalation || 0,
          createdAt: baseSession.createdAt || projectData.created_at,
          lastModified: baseSession.lastModified || projectData.updated_at,
          createState: baseSession.createState,
        };

        console.log(
          `loadProject: Loaded ${codeFiles.length} files, ${lineAnnotations.length} annotations from database`
        );

        setCurrentProjectId(projectId);
        return { session, error: null };
      } catch (error) {
        return { session: null, error: error as Error };
      }
    },
    [supabase, setCurrentProjectId]
  );

  return {
    // State
    projects,
    isLoading,
    currentProjectId: currentProjectIdState,

    // Functions
    setCurrentProjectId,
    fetchProjects,
    refreshProjects,
    createProject,
    loadProject,
  };
}
