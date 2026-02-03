"use client";

/**
 * Projects Modal
 *
 * Modal for viewing, creating, and managing shared projects.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProjects } from "@/context/ProjectsContext";
import { useAuth } from "@/context/AuthContext";
import { useSession } from "@/context/SessionContext";
import { cn } from "@/lib/utils";
import {
  X,
  Plus,
  Folder,
  Trash2,
  Loader2,
  Users,
  UserPlus,
  Clock,
  BookOpen,
  Sparkles,
  LogIn,
  LogOut,
  ChevronDown,
  FileText,
  FilePlus2,
  Crown,
  Pencil,
  Check,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import type { ProjectWithOwner, MemberWithProfile } from "@/lib/supabase/types";
import type { EntryMode, Session } from "@/types/session";
import { ConfirmDialog } from "../shared/ConfirmDialog";

const MODE_LABELS: Record<EntryMode, string> = {
  critique: "Critique",
  interpret: "Interpret",
  create: "Create",
};

const MODE_COLORS: Record<EntryMode, string> = {
  critique: "bg-burgundy/10 text-burgundy",
  interpret: "bg-blue-100 text-blue-700",
  create: "bg-emerald-100 text-emerald-700",
};

export function ProjectsModal() {
  const router = useRouter();
  const { user } = useAuth();
  const { session, importSession, resetSession } = useSession();
  const {
    projects,
    isLoading,
    currentProjectId,
    showProjectsModal,
    setShowProjectsModal,
    createProject,
    loadProject,
    saveProject,
    deleteProject,
    renameProject,
    setCurrentProjectId,
    setShowMembersModal,
    setMembersModalProjectId,
    getProjectMembers,
    refreshProjects,
    // Trash
    trashedProjects,
    isLoadingTrash,
    fetchTrashedProjects,
    restoreProject,
    permanentlyDeleteProject,
    emptyTrash,
  } = useProjects();

  // Tab state: "projects" or "trash"
  const [activeTab, setActiveTab] = useState<"projects" | "trash">("projects");

  // Refresh projects when modal opens (handles stale state from Safari suspension)
  useEffect(() => {
    if (showProjectsModal) {
      refreshProjects();
      setActiveTab("projects"); // Reset to projects tab when modal opens
    }
  }, [showProjectsModal, refreshProjects]);

  // Fetch trashed projects when switching to trash tab
  useEffect(() => {
    if (showProjectsModal && activeTab === "trash") {
      fetchTrashedProjects();
    }
  }, [showProjectsModal, activeTab, fetchTrashedProjects]);

  const [isCreating, setIsCreating] = useState(false);
  const [saveCurrentSession, setSaveCurrentSession] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewProjectMenu, setShowNewProjectMenu] = useState(false);
  const [deleteConfirmProject, setDeleteConfirmProject] = useState<ProjectWithOwner | null>(null);
  const [deleteConfirmMembers, setDeleteConfirmMembers] = useState<MemberWithProfile[]>([]);
  const [permanentDeleteConfirmProject, setPermanentDeleteConfirmProject] = useState<ProjectWithOwner | null>(null);
  const [emptyTrashConfirm, setEmptyTrashConfirm] = useState(false);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRenamingLoading, setIsRenamingLoading] = useState(false);

  if (!showProjectsModal) return null;

  const handleClose = () => {
    setShowProjectsModal(false);
    setIsCreating(false);
    setSaveCurrentSession(false);
    setNewProjectName("");
    setNewProjectDescription("");
    setError(null);
    setShowNewProjectMenu(false);
    setRenamingProjectId(null);
    setRenameValue("");
    setActiveTab("projects");
    setPermanentDeleteConfirmProject(null);
    setEmptyTrashConfirm(false);
  };

  const handleCreate = async () => {
    if (!newProjectName.trim()) {
      setError("Project name is required");
      return;
    }

    setActionLoading("create");
    setError(null);

    // If already in a project, save it first before creating new one
    if (currentProjectId) {
      console.log("Saving current project before creating new one:", currentProjectId);
      await saveProject(currentProjectId, session);
      setCurrentProjectId(null);
      // Only reset if NOT copying current session to new project
      if (!saveCurrentSession) {
        resetSession();
      }
    }

    const { project, initialSession, error } = await createProject(
      newProjectName.trim(),
      newProjectDescription.trim() || undefined,
      session.mode
    );

    if (error) {
      setError(error.message);
    } else if (project) {
      if (saveCurrentSession) {
        // Save current session to the new project (overwrites README template)
        await saveProject(project.id, session);
      } else {
        // Use the initialSession returned by createProject (contains README)
        // This avoids a race condition where loadProject might run before DB commits
        console.log("handleCreate: using initialSession", {
          hasSession: !!initialSession,
          fileCount: initialSession?.codeFiles?.length,
          files: initialSession?.codeFiles?.map((f: { name: string }) => f.name),
        });
        if (initialSession) {
          // Cast to Session - importSession will merge with defaults for missing fields
          importSession(initialSession as Session);
        }
      }
      setCurrentProjectId(project.id);
      setIsCreating(false);
      setSaveCurrentSession(false);
      setNewProjectName("");
      setNewProjectDescription("");
      handleClose();
      // Navigate to conversation page to work on the project
      router.push("/conversation");
    }

    setActionLoading(null);
  };

  const handleLoad = async (project: ProjectWithOwner) => {
    setActionLoading(`load-${project.id}`);
    setError(null);

    // If already in a different project, save and leave it first
    if (currentProjectId && currentProjectId !== project.id) {
      console.log("Leaving current project before joining new one:", currentProjectId);
      await saveProject(currentProjectId, session);
      setCurrentProjectId(null);
      resetSession();
    }

    const { session: loadedSession, error } = await loadProject(project.id);

    if (error) {
      setError(error.message);
    } else if (loadedSession) {
      importSession(loadedSession);
      handleClose();
      // Navigate to conversation page to show the loaded project
      router.push("/conversation");
    }

    setActionLoading(null);
  };

  const handleDeleteClick = async (project: ProjectWithOwner) => {
    // Check if project has members before showing delete confirmation
    const { members, error } = await getProjectMembers(project.id);

    if (error) {
      console.error("Error fetching members:", error);
    }

    setDeleteConfirmProject(project);
    setDeleteConfirmMembers(members || []);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmProject) return;

    const projectId = deleteConfirmProject.id;
    const membersToFork = deleteConfirmMembers.length > 0 ? deleteConfirmMembers : undefined;

    setDeleteConfirmProject(null);
    setDeleteConfirmMembers([]);
    setActionLoading(`delete-${projectId}`);
    setError(null);

    const { error } = await deleteProject(projectId, membersToFork);

    if (error) {
      setError(error.message);
    }

    setActionLoading(null);
  };

  const handleStartRename = (project: ProjectWithOwner) => {
    setRenamingProjectId(project.id);
    setRenameValue(project.name);
  };

  const handleCancelRename = () => {
    setRenamingProjectId(null);
    setRenameValue("");
  };

  const handleSubmitRename = async (projectId: string) => {
    if (!renameValue.trim()) {
      handleCancelRename();
      return;
    }

    setIsRenamingLoading(true);
    const { error } = await renameProject(projectId, renameValue.trim());
    setIsRenamingLoading(false);

    if (error) {
      setError(error.message);
    } else {
      handleCancelRename();
    }
  };

  // Trash handlers
  const handleRestore = async (project: ProjectWithOwner) => {
    setActionLoading(`restore-${project.id}`);
    setError(null);

    const { error } = await restoreProject(project.id);

    if (error) {
      setError(error.message);
    }

    setActionLoading(null);
  };

  const handlePermanentDeleteClick = (project: ProjectWithOwner) => {
    setPermanentDeleteConfirmProject(project);
  };

  const handlePermanentDeleteConfirm = async () => {
    if (!permanentDeleteConfirmProject) return;

    setPermanentDeleteConfirmProject(null);
    setActionLoading(`perm-delete-${permanentDeleteConfirmProject.id}`);
    setError(null);

    const { error } = await permanentlyDeleteProject(permanentDeleteConfirmProject.id);

    if (error) {
      setError(error.message);
    }

    setActionLoading(null);
  };

  const handleEmptyTrashClick = () => {
    setEmptyTrashConfirm(true);
  };

  const handleEmptyTrashConfirm = async () => {
    setEmptyTrashConfirm(false);
    setActionLoading("empty-trash");
    setError(null);

    const { error } = await emptyTrash();

    if (error) {
      setError(error.message);
    }

    setActionLoading(null);
  };

  const isOwner = (project: ProjectWithOwner) => project.owner_id === user?.id;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-popover rounded-sm shadow-lg border border-parchment max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden modal-content">
        {/* Header */}
        <div className="relative px-5 py-4 bg-gradient-to-r from-cream to-ivory border-b border-parchment">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-burgundy/10 rounded-lg">
              <BookOpen className="h-5 w-5 text-burgundy" />
            </div>
            <div>
              <h2 className="font-serif text-ui-title text-ink">Projects</h2>
              <p className="font-sans text-ui-xs text-slate">
                Save and share your analysis sessions
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1.5 hover:bg-parchment/50 rounded-lg transition-colors"
          >
            <X className="h-4 w-4 text-slate" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-parchment">
          <button
            onClick={() => setActiveTab("projects")}
            className={cn(
              "flex-1 px-4 py-2.5 font-sans text-ui-base font-medium transition-colors",
              activeTab === "projects"
                ? "text-burgundy border-b-2 border-burgundy bg-cream/30"
                : "text-slate hover:text-ink hover:bg-cream/20"
            )}
          >
            <Folder className="h-4 w-4 inline mr-2" />
            Projects
          </button>
          <button
            onClick={() => setActiveTab("trash")}
            className={cn(
              "flex-1 px-4 py-2.5 font-sans text-ui-base font-medium transition-colors",
              activeTab === "trash"
                ? "text-burgundy border-b-2 border-burgundy bg-cream/30"
                : "text-slate hover:text-ink hover:bg-cream/20"
            )}
          >
            <Trash2 className="h-4 w-4 inline mr-2" />
            Trash
            {trashedProjects.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-ui-xs bg-burgundy/10 text-burgundy rounded-full">
                {trashedProjects.length}
              </span>
            )}
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-5 mt-4 px-3 py-2 bg-burgundy/10 border border-burgundy/20 rounded-lg">
            <p className="font-sans text-ui-base text-burgundy">{error}</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === "projects" ? (
            <>
              {/* Create new project form */}
              {isCreating ? (
            <div className="mb-5 p-4 bg-gradient-to-b from-cream/80 to-cream/40 rounded-xl border border-parchment shadow-sm">
              <h3 className="font-serif text-ui-base text-ink mb-4 flex items-center gap-2">
                <div className="p-1.5 bg-burgundy/10 rounded-lg">
                  <Sparkles className="h-3.5 w-3.5 text-burgundy" />
                </div>
                Create New Project
              </h3>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                className={cn(
                  "w-full px-3 py-2.5 mb-3",
                  "font-sans text-ui-base text-ink placeholder:text-slate/50",
                  "bg-ivory border border-parchment rounded-lg",
                  "focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy",
                  "shadow-sm"
                )}
                autoFocus
              />
              <textarea
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                placeholder="Brief description (optional)"
                rows={2}
                className={cn(
                  "w-full px-3 py-2.5 mb-3",
                  "font-sans text-ui-base text-ink placeholder:text-slate/50",
                  "bg-ivory border border-parchment rounded-lg",
                  "focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy",
                  "resize-none shadow-sm"
                )}
              />

              {/* Show what content will be included */}
              <div className="mb-4 px-3 py-2 bg-cream/50 rounded-lg border border-parchment">
                <p className="font-sans text-ui-xs text-slate">
                  {saveCurrentSession ? (
                    <>
                      <FileText className="inline h-3 w-3 mr-1 text-burgundy" />
                      Will include your current code files and annotations
                    </>
                  ) : (
                    <>
                      <FilePlus2 className="inline h-3 w-3 mr-1 text-burgundy" />
                      Will create an empty project
                    </>
                  )}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={actionLoading === "create"}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-2.5",
                    "font-sans text-ui-base font-medium text-ivory",
                    "bg-burgundy rounded-lg hover:bg-burgundy-dark",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "transition-all shadow-sm hover:shadow"
                  )}
                >
                  {actionLoading === "create" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setSaveCurrentSession(false);
                    setNewProjectName("");
                    setNewProjectDescription("");
                  }}
                  className={cn(
                    "px-4 py-2.5",
                    "font-sans text-ui-base text-slate",
                    "bg-ivory border border-parchment rounded-lg hover:bg-cream hover:border-parchment-dark",
                    "transition-colors"
                  )}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-5">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsCreating(true)}
                  disabled={!!currentProjectId}
                  title={currentProjectId ? "Leave current project first" : undefined}
                  className={cn(
                    "flex items-center justify-center gap-2 px-4 py-3",
                    "font-sans text-ui-base font-medium text-ivory",
                    "bg-burgundy rounded-xl",
                    "hover:bg-burgundy-dark transition-all shadow-sm hover:shadow",
                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-burgundy"
                  )}
                >
                  <Plus className="h-4 w-4" />
                  New Project
                </button>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={saveCurrentSession}
                      onChange={(e) => setSaveCurrentSession(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={cn(
                      "w-4 h-4 border-2 rounded transition-all",
                      saveCurrentSession
                        ? "bg-burgundy border-burgundy"
                        : "bg-ivory border-parchment-dark group-hover:border-burgundy/50"
                    )}>
                      {saveCurrentSession && (
                        <svg className="w-full h-full text-ivory" viewBox="0 0 16 16" fill="none">
                          <path d="M4 8L7 11L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="font-sans text-ui-xs text-slate group-hover:text-ink transition-colors">
                    populate with current session
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Projects list */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-burgundy mb-2" />
              <p className="font-sans text-ui-base text-slate">Loading projects...</p>
            </div>
          ) : projects.length === 0 && !isCreating ? (
            <div className="text-center py-8 px-4">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-cream to-parchment/50 rounded-2xl mb-4 shadow-sm">
                <Folder className="h-7 w-7 text-burgundy/40" />
              </div>
              <h3 className="font-serif text-ui-lg text-ink mb-2">No projects yet</h3>
              <p className="font-sans text-ui-xs text-slate max-w-[220px] mx-auto leading-relaxed">
                Create a project to save your code analysis and share it with collaborators
              </p>
            </div>
          ) : projects.length === 0 ? null : (
            <div className="space-y-3">
              <p className="font-sans text-ui-xs text-slate uppercase tracking-wide mb-2">
                Your Projects
              </p>
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={cn(
                    "group p-4 rounded-xl border transition-all",
                    currentProjectId === project.id
                      ? "bg-burgundy/5 border-burgundy/30 shadow-sm"
                      : "bg-ivory border-parchment hover:border-parchment-dark hover:shadow-sm"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {renamingProjectId === project.id ? (
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSubmitRename(project.id);
                              if (e.key === "Escape") handleCancelRename();
                            }}
                            autoFocus
                            className={cn(
                              "flex-1 px-2 py-1 font-serif text-ui-base text-ink",
                              "bg-ivory border border-burgundy rounded",
                              "focus:outline-none focus:ring-2 focus:ring-burgundy/20"
                            )}
                          />
                          <button
                            onClick={() => handleSubmitRename(project.id)}
                            disabled={isRenamingLoading}
                            className="p-1 rounded hover:bg-emerald-100 transition-colors"
                            title="Save"
                          >
                            {isRenamingLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                            ) : (
                              <Check className="h-4 w-4 text-emerald-600" />
                            )}
                          </button>
                          <button
                            onClick={handleCancelRename}
                            disabled={isRenamingLoading}
                            className="p-1 rounded hover:bg-burgundy/10 transition-colors"
                            title="Cancel"
                          >
                            <X className="h-4 w-4 text-burgundy" />
                          </button>
                        </div>
                      ) : (
                        <h4 className="font-serif text-ui-base text-ink truncate" title={project.name}>
                          {project.name}
                        </h4>
                      )}
                      {/* Owner indicator */}
                      <p className="font-sans text-ui-xs text-slate/60 mb-1 flex items-center gap-1">
                        {isOwner(project) ? (
                          <>
                            <Crown className="h-2.5 w-2.5 text-amber-600" />
                            <span>You own this project</span>
                          </>
                        ) : project.owner ? (
                          <>
                            <Users className="h-2.5 w-2.5" />
                            <span>Shared by {project.owner.display_name}</span>
                          </>
                        ) : null}
                      </p>
                      {project.description && (
                        <p className="font-sans text-ui-xs text-slate mb-2 line-clamp-2">
                          {project.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-ui-xs font-sans font-medium",
                          MODE_COLORS[project.mode as EntryMode] || "bg-slate/10 text-slate"
                        )}>
                          {MODE_LABELS[project.mode as EntryMode] || project.mode}
                        </span>
                        <span className="flex items-center gap-1 text-ui-xs text-slate/60 font-sans">
                          <Clock className="h-3 w-3" />
                          {formatDate(project.updated_at)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      {currentProjectId === project.id ? (
                        <button
                          onClick={async () => {
                            // Save before leaving (includes README update)
                            await saveProject(currentProjectId, session);
                            setCurrentProjectId(null);
                            resetSession();
                            handleClose();
                          }}
                          disabled={!!actionLoading}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                            "font-sans text-ui-xs font-medium",
                            "bg-slate/10 text-slate hover:bg-slate/20",
                            "transition-colors",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          Leave
                        </button>
                      ) : (
                        <button
                          onClick={() => handleLoad(project)}
                          disabled={!!actionLoading || !!currentProjectId}
                          title={currentProjectId ? "Leave current project first" : undefined}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                            "font-sans text-ui-xs font-medium",
                            "bg-burgundy text-ivory hover:bg-burgundy-dark",
                            "transition-colors",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                        >
                          {actionLoading === `load-${project.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <LogIn className="h-3.5 w-3.5" />
                          )}
                          Join
                        </button>
                      )}
                      {/* Rename button (owner only) */}
                      {isOwner(project) && renamingProjectId !== project.id && (
                        <button
                          onClick={() => handleStartRename(project)}
                          disabled={!!actionLoading || !!renamingProjectId}
                          title="Rename project"
                          className={cn(
                            "p-2 rounded-lg hover:bg-cream transition-colors",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                        >
                          <Pencil className="h-4 w-4 text-slate" />
                        </button>
                      )}
                      {/* Members button (owner only) */}
                      {isOwner(project) && (
                        <button
                          onClick={() => {
                            setMembersModalProjectId(project.id);
                            setShowMembersModal(true);
                          }}
                          disabled={!!actionLoading}
                          title="Manage members"
                          className={cn(
                            "p-2 rounded-lg hover:bg-cream transition-colors",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                        >
                          <UserPlus className="h-4 w-4 text-slate" />
                        </button>
                      )}
                      {/* Delete button (owner only) */}
                      {isOwner(project) && (
                        <button
                          onClick={() => handleDeleteClick(project)}
                          disabled={!!actionLoading}
                          title="Delete project"
                          className={cn(
                            "p-2 rounded-lg hover:bg-burgundy/10 transition-colors",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                        >
                          {actionLoading === `delete-${project.id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin text-burgundy" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-burgundy/60" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
            </>
          ) : (
            /* Trash tab content */
            <>
              {/* Empty Trash button */}
              {trashedProjects.length > 0 && (
                <div className="mb-5">
                  <button
                    onClick={handleEmptyTrashClick}
                    disabled={actionLoading === "empty-trash"}
                    className={cn(
                      "flex items-center justify-center gap-2 px-4 py-2.5",
                      "font-sans text-ui-base font-medium",
                      "bg-burgundy/10 text-burgundy rounded-lg",
                      "hover:bg-burgundy/20 transition-colors",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {actionLoading === "empty-trash" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Empty Trash
                  </button>
                </div>
              )}

              {/* Trashed projects list */}
              {isLoadingTrash ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-burgundy mb-2" />
                  <p className="font-sans text-ui-base text-slate">Loading trash...</p>
                </div>
              ) : trashedProjects.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-cream to-parchment/50 rounded-2xl mb-4 shadow-sm">
                    <Trash2 className="h-7 w-7 text-slate/40" />
                  </div>
                  <h3 className="font-serif text-ui-lg text-ink mb-2">Trash is empty</h3>
                  <p className="font-sans text-ui-xs text-slate max-w-[220px] mx-auto leading-relaxed">
                    Deleted projects will appear here for recovery
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="font-sans text-ui-xs text-slate uppercase tracking-wide mb-2">
                    Deleted Projects
                  </p>
                  {trashedProjects.map((project) => (
                    <div
                      key={project.id}
                      className="group p-4 rounded-xl border border-parchment bg-ivory/50 hover:border-parchment-dark transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-serif text-ui-base text-ink/70 truncate" title={project.name}>
                            {project.name}
                          </h4>
                          {project.description && (
                            <p className="font-sans text-ui-xs text-slate/60 mb-2 line-clamp-2">
                              {project.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-ui-xs font-sans font-medium opacity-60",
                              MODE_COLORS[project.mode as EntryMode] || "bg-slate/10 text-slate"
                            )}>
                              {MODE_LABELS[project.mode as EntryMode] || project.mode}
                            </span>
                            <span className="flex items-center gap-1 text-ui-xs text-slate/50 font-sans">
                              <Clock className="h-3 w-3" />
                              Deleted {formatDate(project.updated_at)}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleRestore(project)}
                            disabled={!!actionLoading}
                            title="Restore project"
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                              "font-sans text-ui-xs font-medium",
                              "bg-emerald-500 text-white hover:bg-emerald-600",
                              "transition-colors",
                              "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                          >
                            {actionLoading === `restore-${project.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Restore
                          </button>
                          <button
                            onClick={() => handlePermanentDeleteClick(project)}
                            disabled={!!actionLoading}
                            title="Delete permanently"
                            className={cn(
                              "p-2 rounded-lg hover:bg-burgundy/10 transition-colors",
                              "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                          >
                            {actionLoading === `perm-delete-${project.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin text-burgundy" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-burgundy" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-parchment bg-cream/30">
          <p className="font-sans text-ui-xs text-slate/70 text-center flex items-center justify-center gap-1">
            {activeTab === "projects" ? (
              <>
                <Users className="h-3 w-3" />
                Projects sync to the cloud for collaboration
              </>
            ) : (
              <>
                <AlertTriangle className="h-3 w-3" />
                Restore projects or delete them permanently
              </>
            )}
          </p>
        </div>
      </div>

      {/* Move to trash confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmProject !== null}
        title={`Move "${deleteConfirmProject?.name}" to trash?`}
        message={
          deleteConfirmMembers.length > 0
            ? `This project is shared with ${deleteConfirmMembers.length} ${deleteConfirmMembers.length === 1 ? "collaborator" : "collaborators"}. Each will automatically receive their own copy:\n\n${deleteConfirmMembers.map(m => `• ${m.profile?.display_name || "Unknown"} (${m.profile?.initials || "?"})`).join("\n")}\n\nYour copy will be moved to the Trash tab where you can restore it.`
            : "You can restore it from the Trash tab."
        }
        variant="danger"
        confirmLabel="Move to Trash"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteConfirmProject(null);
          setDeleteConfirmMembers([]);
        }}
      />

      {/* Permanent delete confirmation dialog */}
      <ConfirmDialog
        isOpen={permanentDeleteConfirmProject !== null}
        title={`Permanently delete "${permanentDeleteConfirmProject?.name}"?`}
        message="This cannot be undone. All files and annotations will be permanently removed."
        variant="danger"
        confirmLabel="Delete Forever"
        onConfirm={handlePermanentDeleteConfirm}
        onCancel={() => setPermanentDeleteConfirmProject(null)}
      />

      {/* Empty trash confirmation dialog */}
      <ConfirmDialog
        isOpen={emptyTrashConfirm}
        title="Empty trash?"
        message={`Permanently delete ${trashedProjects.length} project${trashedProjects.length !== 1 ? "s" : ""}? This cannot be undone.`}
        variant="danger"
        confirmLabel="Empty Trash"
        onConfirm={handleEmptyTrashConfirm}
        onCancel={() => setEmptyTrashConfirm(false)}
      />
    </div>
  );
}
