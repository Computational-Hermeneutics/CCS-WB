"use client";

/**
 * Admin Modal
 *
 * Review and approve/reject project submissions to the library.
 * Only visible to users with is_admin = true.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProjects } from "@/cloud/context/ProjectsContext";
import { useSession } from "@/context/SessionContext";
import { cn } from "@/lib/utils";
import {
  X,
  Shield,
  BookOpen,
  Check,
  XCircle,
  Eye,
  Loader2,
  Clock,
  User,
  Search,
  FileCode,
  AlertTriangle,
  Pencil,
  Trash2,
  Copy,
  ArchiveX,
  Library,
  Users,
  ShieldCheck,
  ShieldOff,
  UserX,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/cloud/context/AuthContext";
import { getSupabaseClient } from "@/cloud/lib/supabase/client";
import type { LibraryProject } from "@/cloud/lib/supabase/types";
import type { EntryMode } from "@/types/session";

interface AdminUser {
  id: string;
  display_name: string | null;
  initials: string | null;
  affiliation: string | null;
  is_admin: boolean;
  created_at: string;
}

interface OrphanedProject {
  id: string;
  name: string;
  description: string | null;
  mode: string;
  created_at: string;
  updated_at: string;
}

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

export function AdminModal() {
  const router = useRouter();
  const {
    pendingSubmissions,
    isLoadingAdmin,
    isLoadingLibrary,
    showAdminModal,
    setShowAdminModal,
    fetchPendingSubmissions,
    fetchLibraryProjects,
    libraryProjects,
    approveProject,
    rejectProject,
    adminHardDeleteProject,
    adminRenameProject,
    deaccessionProject,
    adminDuplicateProject,
    loadProject,
    setViewingLibraryProjectId,
  } = useProjects();
  const { importSession, resetSession } = useSession();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectingProjectId, setRejectingProjectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "users" | "orphaned">("pending");
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deaccessionConfirmId, setDeaccessionConfirmId] = useState<string | null>(null);
  const [deleteUserConfirmId, setDeleteUserConfirmId] = useState<string | null>(null);
  const [deleteUserProjects, setDeleteUserProjects] = useState(false);
  const [orphanedProjects, setOrphanedProjects] = useState<OrphanedProject[]>([]);
  const [isLoadingOrphaned, setIsLoadingOrphaned] = useState(false);
  const [reassignProjectId, setReassignProjectId] = useState<string | null>(null);
  const [reassignToUserId, setReassignToUserId] = useState<string>("");

  // Fetch all users for admin management
  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsLoadingUsers(false);
      return;
    }

    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("id, display_name, initials, affiliation, is_admin, created_at")
      .order("is_admin", { ascending: false })
      .order("display_name", { ascending: true });

    if (error) {
      console.error("Failed to fetch users:", error);
      setError(`Failed to load users: ${error.message}`);
    } else if (data) {
      setUsers(data as AdminUser[]);
    }
    setIsLoadingUsers(false);
  };

  // Fetch orphaned projects (owner_id is null, but NOT library projects)
  const fetchOrphanedProjects = async () => {
    setIsLoadingOrphaned(true);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsLoadingOrphaned(false);
      return;
    }

    // Library projects intentionally have owner_id = null, so exclude them
    // Also exclude soft-deleted projects
    const { data, error } = await (supabase as any)
      .from("projects")
      .select("id, name, description, mode, created_at, updated_at, is_public")
      .is("owner_id", null)
      .is("deleted_at", null)  // Exclude soft-deleted projects
      .eq("is_public", false)  // Exclude library projects
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch orphaned projects:", error);
      setError(`Failed to load orphaned projects: ${error.message}`);
    } else if (data) {
      setOrphanedProjects(data as OrphanedProject[]);
    }
    setIsLoadingOrphaned(false);
  };

  // Reassign orphaned project to a user
  const handleReassignProject = async (projectId: string, newOwnerId: string) => {
    if (!newOwnerId) {
      setError("Please select a user to assign the project to");
      return;
    }

    setActionLoading(`reassign-${projectId}`);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setActionLoading(null);
      return;
    }

    const { error } = await (supabase as any)
      .from("projects")
      .update({ owner_id: newOwnerId })
      .eq("id", projectId);

    if (error) {
      setError(`Failed to reassign project: ${error.message}`);
    } else {
      // Remove from orphaned list
      setOrphanedProjects(prev => prev.filter(p => p.id !== projectId));
      setReassignProjectId(null);
      setReassignToUserId("");
    }

    setActionLoading(null);
  };

  // Delete orphaned project - permanently removes it
  const handleDeleteOrphanedProject = async (projectId: string) => {
    setActionLoading(`delete-orphan-${projectId}`);
    setError(null);

    const { error } = await adminHardDeleteProject(projectId);

    if (error) {
      setError(error.message);
    } else {
      setOrphanedProjects(prev => prev.filter(p => p.id !== projectId));
    }

    setDeleteConfirmId(null);
    setActionLoading(null);
  };

  // Toggle admin status for a user
  const handleToggleAdmin = async (userId: string, currentStatus: boolean) => {
    // Prevent self-removal
    if (userId === user?.id) {
      setError("Cannot remove your own admin status");
      return;
    }

    setActionLoading(`admin-${userId}`);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setActionLoading(null);
      return;
    }

    const { error } = await (supabase as any)
      .from("profiles")
      .update({ is_admin: !currentStatus })
      .eq("id", userId);

    if (error) {
      setError(error.message);
    } else {
      // Update local state
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, is_admin: !currentStatus } : u
      ));
    }

    setActionLoading(null);
  };

  // Delete a user (admin function)
  const handleDeleteUser = async (userId: string, deleteProjects: boolean) => {
    // Prevent self-deletion
    if (userId === user?.id) {
      setError("Cannot delete your own account");
      return;
    }

    setActionLoading(`deleteuser-${userId}`);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setActionLoading(null);
      return;
    }

    try {
      if (deleteProjects) {
        // First delete all user's projects (cascade will handle code_files, annotations, etc.)
        const { error: projectsError } = await (supabase as any)
          .from("projects")
          .delete()
          .eq("owner_id", userId);

        if (projectsError) {
          console.error("Failed to delete user projects:", projectsError);
          // Continue anyway - we'll still try to delete the profile
        }
      } else {
        // Transfer ownership of projects to anonymous (or null them out)
        // Set owner_id to null so projects become orphaned but not deleted
        const { error: transferError } = await (supabase as any)
          .from("projects")
          .update({ owner_id: null })
          .eq("owner_id", userId);

        if (transferError) {
          console.error("Failed to transfer user projects:", transferError);
        }
      }

      // Delete the user's profile
      const { error: profileError } = await (supabase as any)
        .from("profiles")
        .delete()
        .eq("id", userId);

      if (profileError) {
        setError(`Failed to delete user: ${profileError.message}`);
      } else {
        // Remove from local state
        setUsers(prev => prev.filter(u => u.id !== userId));
        setDeleteUserConfirmId(null);
        setDeleteUserProjects(false);
      }
    } catch (e) {
      setError(`Unexpected error: ${e}`);
    }

    setActionLoading(null);
  };

  // Fetch pending submissions and library projects when modal opens
  useEffect(() => {
    if (showAdminModal) {
      fetchPendingSubmissions();
      fetchLibraryProjects(); // Fetch library to check for duplicate names
      fetchUsers();
      fetchOrphanedProjects();
      setError(null);
    }
  }, [showAdminModal, fetchPendingSubmissions, fetchLibraryProjects]);

  // Check if a submission name matches an existing library project
  const getMatchingLibraryProject = (name: string) => {
    // Strip $ prefix from library project names for comparison
    const normalizedName = name.toLowerCase().trim();
    return libraryProjects.find(lp => {
      const libraryName = lp.name.startsWith("$") ? lp.name.slice(1) : lp.name;
      return libraryName.toLowerCase().trim() === normalizedName;
    });
  };

  if (!showAdminModal) return null;

  const handleClose = () => {
    setShowAdminModal(false);
    setSearchQuery("");
    setError(null);
    setRejectingProjectId(null);
    setRejectReason("");
    setRenamingProjectId(null);
    setRenameValue("");
    setDeleteConfirmId(null);
    setDeaccessionConfirmId(null);
    setDeleteUserConfirmId(null);
    setDeleteUserProjects(false);
    setReassignProjectId(null);
    setReassignToUserId("");
  };

  const handlePreview = async (project: LibraryProject) => {
    setActionLoading(`preview-${project.id}`);
    setError(null);

    // Clear any existing preview state first
    setViewingLibraryProjectId(null);

    // Reset current session before loading
    resetSession();

    // Use loadProject directly - admin RLS allows viewing submitted projects
    const { session, error: loadError } = await loadProject(project.id);

    if (loadError) {
      setError("Preview not available for this project");
      setActionLoading(null);
      return;
    }

    if (session) {
      // Set as viewing (read-only mode)
      setViewingLibraryProjectId(project.id);
      importSession(session);
      handleClose();
      router.push("/conversation");
    }

    setActionLoading(null);
  };

  const handleApprove = async (project: LibraryProject) => {
    setActionLoading(`approve-${project.id}`);
    setError(null);

    const { error } = await approveProject(project.id);

    if (error) {
      setError(error.message);
    }

    setActionLoading(null);
  };

  const handleStartReject = (project: LibraryProject) => {
    setRejectingProjectId(project.id);
    setRejectReason("");
    setError(null);
  };

  const handleCancelReject = () => {
    setRejectingProjectId(null);
    setRejectReason("");
  };

  const handleConfirmReject = async (project: LibraryProject) => {
    setActionLoading(`reject-${project.id}`);
    setError(null);

    const { error } = await rejectProject(project.id, rejectReason);

    if (error) {
      setError(error.message);
    } else {
      setRejectingProjectId(null);
      setRejectReason("");
    }

    setActionLoading(null);
  };

  // Admin rename handlers
  const handleStartRename = (project: LibraryProject) => {
    // Strip $ prefix for editing
    const displayName = project.name.replace(/^\$+/, "");
    setRenamingProjectId(project.id);
    setRenameValue(displayName);
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

    setActionLoading(`rename-${projectId}`);
    const { error } = await adminRenameProject(projectId, renameValue.trim());
    setActionLoading(null);

    if (error) {
      setError(error.message);
    } else {
      handleCancelRename();
    }
  };

  // Admin delete handler - permanently deletes project and all related data
  const handleDelete = async (projectId: string) => {
    setActionLoading(`delete-${projectId}`);
    setError(null);

    const { error } = await adminHardDeleteProject(projectId);

    if (error) {
      setError(error.message);
    } else {
      // Refresh the lists to ensure sync with server
      await fetchPendingSubmissions();
      await fetchLibraryProjects();
      await fetchOrphanedProjects();
    }

    setDeleteConfirmId(null);
    setActionLoading(null);
  };

  // Admin duplicate handler
  const handleDuplicate = async (project: LibraryProject) => {
    setActionLoading(`duplicate-${project.id}`);
    setError(null);

    const { error } = await adminDuplicateProject(project.id);

    if (error) {
      setError(error.message);
    }

    setActionLoading(null);
  };

  // Deaccession handler
  const handleDeaccession = async (projectId: string) => {
    setActionLoading(`deaccession-${projectId}`);
    setError(null);

    const { error } = await deaccessionProject(projectId);

    if (error) {
      setError(error.message);
    }

    setDeaccessionConfirmId(null);
    setActionLoading(null);
  };

  // Filter projects by search query
  const filteredPending = pendingSubmissions.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.owner?.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter library projects - only show APPROVED projects in admin Library tab
  // (libraryProjects includes both approved + submitted for the Library Modal)
  const filteredLibrary = libraryProjects.filter(project => {
    // Only show approved projects in the admin Library tab
    if (project.accession_status !== "approved") return false;
    const displayName = project.name.replace(/^\$+/, "");
    return displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.owner?.display_name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Filter users by search query
  const filteredUsers = users.filter(u =>
    u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.affiliation?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter orphaned projects by search query
  const filteredOrphaned = orphanedProjects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Strip $ prefix for display
  const displayName = (name: string) => name.replace(/^\$+/, "");

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Unknown";
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
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
      <div className="relative bg-popover rounded-sm shadow-lg border border-parchment max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden modal-content">
        {/* Header */}
        <div className="relative px-5 py-4 border-b border-parchment">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-burgundy/10 rounded-lg">
              <Shield className="h-5 w-5 text-burgundy" />
            </div>
            <div>
              <h2 className="font-serif text-ui-title text-ink">Library Management</h2>
              <p className="font-sans text-ui-xs text-slate flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-burgundy/10 text-burgundy text-[10px] font-medium">
                  <Shield className="h-2.5 w-2.5" />
                  Admin
                </span>
                Review submissions and manage library
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1.5 hover:bg-cream rounded-lg transition-colors"
          >
            <X className="h-4 w-4 text-slate" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 py-2 border-b border-parchment flex gap-2">
          <button
            onClick={() => setActiveTab("pending")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium transition-colors",
              activeTab === "pending"
                ? "bg-burgundy text-ivory"
                : "bg-cream text-slate hover:bg-parchment dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            Pending
            {pendingSubmissions.length > 0 && (
              <span className={cn(
                "ml-1 px-1.5 py-0.5 rounded-full text-[10px]",
                activeTab === "pending" ? "bg-ivory/30 text-ivory" : "bg-burgundy/20 text-burgundy"
              )}>
                {pendingSubmissions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("approved")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium transition-colors",
              activeTab === "approved"
                ? "bg-burgundy text-ivory"
                : "bg-cream text-slate hover:bg-parchment dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            )}
          >
            <Library className="h-3.5 w-3.5" />
            Library
            {libraryProjects.filter(p => p.accession_status === "approved").length > 0 && (
              <span className={cn(
                "ml-1 px-1.5 py-0.5 rounded-full text-[10px]",
                activeTab === "approved" ? "bg-ivory/30 text-ivory" : "bg-slate/20 text-slate"
              )}>
                {libraryProjects.filter(p => p.accession_status === "approved").length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium transition-colors",
              activeTab === "users"
                ? "bg-burgundy text-ivory"
                : "bg-cream text-slate hover:bg-parchment dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Users
            {users.filter(u => u.is_admin).length > 0 && (
              <span className={cn(
                "ml-1 px-1.5 py-0.5 rounded-full text-[10px]",
                activeTab === "users" ? "bg-ivory/30 text-ivory" : "bg-slate/20 text-slate"
              )}>
                {users.filter(u => u.is_admin).length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("orphaned")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium transition-colors",
              activeTab === "orphaned"
                ? "bg-burgundy text-ivory"
                : "bg-cream text-slate hover:bg-parchment dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            )}
          >
            <UserX className="h-3.5 w-3.5" />
            Orphaned
            {orphanedProjects.length > 0 && (
              <span className={cn(
                "ml-1 px-1.5 py-0.5 rounded-full text-[10px]",
                activeTab === "orphaned" ? "bg-ivory/30 text-ivory" : "bg-slate/20 text-slate"
              )}>
                {orphanedProjects.length}
              </span>
            )}
          </button>
        </div>

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-parchment">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === "pending" ? "Search submissions..." : activeTab === "approved" ? "Search library..." : activeTab === "users" ? "Search users..." : "Search orphaned projects..."}
              className={cn(
                "w-full pl-9 pr-3 py-2",
                "font-sans text-ui-base text-ink placeholder:text-slate/50",
                "bg-ivory dark:bg-slate-800 border border-parchment rounded-lg",
                "focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy"
              )}
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-5 mt-4 px-3 py-2 bg-burgundy/10 border border-burgundy/20 rounded-lg">
            <p className="font-sans text-ui-base text-burgundy">{error}</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Pending Tab */}
          {activeTab === "pending" && (
            <>
              {isLoadingAdmin ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-burgundy mb-2" />
                  <p className="font-sans text-ui-base text-slate">Loading submissions...</p>
                </div>
              ) : filteredPending.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-cream to-parchment/50 dark:from-slate-700 dark:to-slate-800 rounded-2xl mb-4 shadow-sm">
                    <BookOpen className="h-7 w-7 text-slate/40" />
                  </div>
                  <h3 className="font-serif text-ui-lg text-ink mb-2">
                    {searchQuery ? "No matching submissions" : "No pending submissions"}
                  </h3>
                  <p className="font-sans text-ui-xs text-slate max-w-[220px] mx-auto leading-relaxed">
                    {searchQuery
                      ? "Try a different search term"
                      : "All submissions have been reviewed"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredPending.map((project) => (
                    <div
                      key={project.id}
                      className="group p-4 rounded-xl border border-parchment bg-ivory dark:bg-slate-800/50 hover:border-burgundy/30 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Inline rename input */}
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
                                disabled={actionLoading === `rename-${project.id}`}
                                className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                                title="Save"
                              >
                                {actionLoading === `rename-${project.id}` ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                                ) : (
                                  <Check className="h-4 w-4 text-emerald-600" />
                                )}
                              </button>
                              <button
                                onClick={handleCancelRename}
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
                          {/* Owner info */}
                          <p className="font-sans text-ui-xs text-slate/60 mb-1 flex items-center gap-1">
                            <User className="h-2.5 w-2.5" />
                            <span>{project.owner?.display_name || "Unknown"}</span>
                            {project.owner?.affiliation && (
                              <span className="text-slate/40">
                                ({project.owner.affiliation})
                              </span>
                            )}
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
                              Submitted {formatDate(project.submitted_at)}
                            </span>
                            {getMatchingLibraryProject(project.name) && (
                              <span
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-ui-xs font-sans font-medium bg-amber-100 text-amber-700"
                                title={`Matches existing library project: ${getMatchingLibraryProject(project.name)?.name}`}
                              >
                                <AlertTriangle className="h-3 w-3" />
                                Update?
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => handleApprove(project)}
                            disabled={!!actionLoading || rejectingProjectId === project.id}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                              "font-sans text-ui-xs font-medium",
                              "bg-emerald-500 text-white hover:bg-emerald-600",
                              "transition-colors",
                              "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                          >
                            {actionLoading === `approve-${project.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            Approve
                          </button>
                          <button
                            onClick={() => handleStartReject(project)}
                            disabled={!!actionLoading || rejectingProjectId === project.id}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                              "font-sans text-ui-xs font-medium",
                              "bg-slate/10 text-slate hover:bg-burgundy/10 hover:text-burgundy",
                              "transition-colors",
                              "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                          {/* Admin tools row */}
                          <div className="flex items-center gap-1 pt-1 border-t border-parchment/50">
                            <button
                              onClick={() => handleStartRename(project)}
                              disabled={!!actionLoading || !!renamingProjectId}
                              title="Rename"
                              className="p-1.5 rounded hover:bg-cream dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate" />
                            </button>
                            <button
                              onClick={() => handleDuplicate(project)}
                              disabled={!!actionLoading}
                              title="Duplicate to my projects"
                              className="p-1.5 rounded hover:bg-cream dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                            >
                              {actionLoading === `duplicate-${project.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 text-slate" />
                              )}
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(project.id)}
                              disabled={!!actionLoading}
                              title="Delete"
                              className="p-1.5 rounded hover:bg-burgundy/10 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-burgundy/60" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Rejection reason input */}
                      {rejectingProjectId === project.id && (
                        <div className="mt-3 pt-3 border-t border-parchment">
                          <label className="block font-sans text-ui-xs text-slate mb-1.5">
                            Reason for rejection (optional):
                          </label>
                          <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Provide feedback for the submitter..."
                            rows={3}
                            className={cn(
                              "w-full px-3 py-2 rounded-lg",
                              "font-sans text-ui-xs text-ink placeholder:text-slate/50",
                              "bg-white border border-parchment",
                              "focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy",
                              "resize-none"
                            )}
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <button
                              onClick={handleCancelReject}
                              disabled={!!actionLoading}
                              className={cn(
                                "px-3 py-1.5 rounded-lg",
                                "font-sans text-ui-xs font-medium",
                                "bg-slate/10 text-slate hover:bg-slate/20",
                                "transition-colors"
                              )}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleConfirmReject(project)}
                              disabled={!!actionLoading}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                                "font-sans text-ui-xs font-medium",
                                "bg-burgundy text-white hover:bg-burgundy-dark",
                                "transition-colors",
                                "disabled:opacity-50 disabled:cursor-not-allowed"
                              )}
                            >
                              {actionLoading === `reject-${project.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5" />
                              )}
                              Confirm Reject
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Delete confirmation */}
                      {deleteConfirmId === project.id && (
                        <div className="mt-3 pt-3 border-t border-burgundy/20 bg-burgundy/5 -mx-4 -mb-4 px-4 pb-4 rounded-b-xl">
                          <p className="font-sans text-ui-xs text-burgundy mb-2">
                            Delete this submission? This cannot be undone.
                          </p>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium bg-slate/10 text-slate hover:bg-slate/20"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDelete(project.id)}
                              disabled={!!actionLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium bg-burgundy text-white hover:bg-burgundy-dark disabled:opacity-50"
                            >
                              {actionLoading === `delete-${project.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Users Tab */}
          {activeTab === "users" && (
            <>
              {isLoadingUsers ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-600 mb-2" />
                  <p className="font-sans text-ui-base text-slate">Loading users...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/30 dark:to-purple-800/30 rounded-2xl mb-4 shadow-sm">
                    <Users className="h-7 w-7 text-purple-600/40" />
                  </div>
                  <h3 className="font-serif text-ui-lg text-ink mb-2">
                    {searchQuery ? "No matching users" : "No users found"}
                  </h3>
                  <p className="font-sans text-ui-xs text-slate max-w-[220px] mx-auto leading-relaxed">
                    {searchQuery ? "Try a different search term" : "Users will appear here"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredUsers.map((u) => (
                    <div
                      key={u.id}
                      className={cn(
                        "group p-3 rounded-lg border transition-all flex items-center justify-between gap-3",
                        u.is_admin
                          ? "border-purple-200 bg-purple-50/50 dark:border-purple-700 dark:bg-purple-900/30"
                          : "border-parchment bg-ivory dark:bg-slate-800/50 hover:border-parchment-dark"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-serif text-ui-base text-ink truncate">
                            {u.display_name || "Unnamed User"}
                          </span>
                          {u.is_admin && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-sans font-medium bg-purple-500 text-white">
                              <ShieldCheck className="h-2.5 w-2.5" />
                              Admin
                            </span>
                          )}
                          {u.id === user?.id && (
                            <span className="text-[10px] font-sans text-slate/50">(you)</span>
                          )}
                        </div>
                        <p className="font-sans text-ui-xs text-slate/60 truncate">
                          {u.affiliation || "No affiliation"}
                          {u.created_at && ` · Joined ${new Date(u.created_at).toLocaleDateString()}`}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5">
                        {/* Admin toggle button */}
                        <button
                          onClick={() => handleToggleAdmin(u.id, u.is_admin)}
                          disabled={!!actionLoading || u.id === user?.id}
                          title={u.id === user?.id ? "Cannot modify your own admin status" : u.is_admin ? "Remove admin" : "Make admin"}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg",
                            "font-sans text-ui-xs font-medium transition-colors",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            u.id === user?.id
                              ? "bg-slate/10 text-slate/50 cursor-not-allowed"
                              : u.is_admin
                                ? "bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50"
                                : "bg-slate/10 text-slate hover:bg-purple-100 hover:text-purple-700 dark:hover:bg-purple-900/30 dark:hover:text-purple-400"
                          )}
                        >
                          {actionLoading === `admin-${u.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : u.is_admin ? (
                            <>
                              <ShieldOff className="h-3.5 w-3.5" />
                              Remove
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Make Admin
                            </>
                          )}
                        </button>

                        {/* Delete user button */}
                        <button
                          onClick={() => {
                            setDeleteUserConfirmId(u.id);
                            setDeleteUserProjects(false);
                          }}
                          disabled={!!actionLoading || u.id === user?.id}
                          title={u.id === user?.id ? "Cannot delete your own account" : "Delete user"}
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            u.id === user?.id
                              ? "text-slate/30 cursor-not-allowed"
                              : "text-burgundy/50 hover:bg-burgundy/10 hover:text-burgundy"
                          )}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Delete user confirmation */}
                      {deleteUserConfirmId === u.id && (
                        <div className="absolute inset-0 flex items-center justify-center bg-burgundy/5 dark:bg-burgundy/20 rounded-lg z-10">
                          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-burgundy/20 p-3 max-w-[280px]">
                            <p className="font-sans text-ui-xs text-burgundy font-medium mb-2">
                              Delete {u.display_name || "this user"}?
                            </p>
                            <label className="flex items-center gap-2 mb-3">
                              <input
                                type="checkbox"
                                checked={deleteUserProjects}
                                onChange={(e) => setDeleteUserProjects(e.target.checked)}
                                className="rounded border-parchment text-burgundy focus:ring-burgundy"
                              />
                              <span className="font-sans text-ui-xs text-slate">
                                Also delete their projects
                              </span>
                            </label>
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => {
                                  setDeleteUserConfirmId(null);
                                  setDeleteUserProjects(false);
                                }}
                                className="px-2.5 py-1 rounded font-sans text-ui-xs bg-slate/10 text-slate hover:bg-slate/20"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.id, deleteUserProjects)}
                                disabled={!!actionLoading}
                                className="flex items-center gap-1 px-2.5 py-1 rounded font-sans text-ui-xs font-medium bg-burgundy text-white hover:bg-burgundy-dark disabled:opacity-50"
                              >
                                {actionLoading === `deleteuser-${u.id}` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Library Tab */}
          {activeTab === "approved" && (
            <>
              {isLoadingLibrary ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-600 mb-2" />
                  <p className="font-sans text-ui-base text-slate">Loading library...</p>
                </div>
              ) : filteredLibrary.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/30 dark:to-emerald-800/30 rounded-2xl mb-4 shadow-sm">
                    <Library className="h-7 w-7 text-emerald-600/40" />
                  </div>
                  <h3 className="font-serif text-ui-lg text-ink mb-2">
                    {searchQuery ? "No matching projects" : "Library is empty"}
                  </h3>
                  <p className="font-sans text-ui-xs text-slate max-w-[220px] mx-auto leading-relaxed">
                    {searchQuery
                      ? "Try a different search term"
                      : "Approved projects will appear here"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLibrary.map((project) => (
                    <div
                      key={project.id}
                      className="group p-4 rounded-xl border border-parchment bg-ivory dark:bg-slate-800/50 hover:border-emerald-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Inline rename input */}
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
                                  "bg-ivory border border-emerald-500 rounded",
                                  "focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                )}
                              />
                              <button
                                onClick={() => handleSubmitRename(project.id)}
                                disabled={actionLoading === `rename-${project.id}`}
                                className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                                title="Save"
                              >
                                {actionLoading === `rename-${project.id}` ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                                ) : (
                                  <Check className="h-4 w-4 text-emerald-600" />
                                )}
                              </button>
                              <button
                                onClick={handleCancelRename}
                                className="p-1 rounded hover:bg-burgundy/10 transition-colors"
                                title="Cancel"
                              >
                                <X className="h-4 w-4 text-burgundy" />
                              </button>
                            </div>
                          ) : (
                            <h4 className="font-serif text-ui-base text-ink truncate" title={displayName(project.name)}>
                              {displayName(project.name)}
                            </h4>
                          )}
                          {/* Owner info */}
                          <p className="font-sans text-ui-xs text-slate/60 mb-1 flex items-center gap-1">
                            <User className="h-2.5 w-2.5" />
                            <span>{project.owner?.display_name || "Public"}</span>
                            {project.owner?.affiliation && (
                              <span className="text-slate/40">
                                ({project.owner.affiliation})
                              </span>
                            )}
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
                              Approved {formatDate(project.approved_at)}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => setDeaccessionConfirmId(project.id)}
                            disabled={!!actionLoading}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                              "font-sans text-ui-xs font-medium",
                              "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50",
                              "transition-colors",
                              "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                          >
                            <ArchiveX className="h-3.5 w-3.5" />
                            Deaccession
                          </button>
                          {/* Admin tools row */}
                          <div className="flex items-center gap-1 pt-1 border-t border-parchment/50">
                            <button
                              onClick={() => handleStartRename(project)}
                              disabled={!!actionLoading || !!renamingProjectId}
                              title="Rename"
                              className="p-1.5 rounded hover:bg-cream dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate" />
                            </button>
                            <button
                              onClick={() => handleDuplicate(project)}
                              disabled={!!actionLoading}
                              title="Duplicate to my projects"
                              className="p-1.5 rounded hover:bg-cream dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                            >
                              {actionLoading === `duplicate-${project.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 text-slate" />
                              )}
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(project.id)}
                              disabled={!!actionLoading}
                              title="Delete from library"
                              className="p-1.5 rounded hover:bg-burgundy/10 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-burgundy/60" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Deaccession confirmation */}
                      {deaccessionConfirmId === project.id && (
                        <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 -mx-4 -mb-4 px-4 pb-4 rounded-b-xl">
                          <p className="font-sans text-ui-xs text-amber-800 dark:text-amber-300 mb-2">
                            Move this project back to pending submissions? It will be removed from the public library.
                          </p>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setDeaccessionConfirmId(null)}
                              className="px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium bg-white text-slate hover:bg-slate/10"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDeaccession(project.id)}
                              disabled={!!actionLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                            >
                              {actionLoading === `deaccession-${project.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ArchiveX className="h-3.5 w-3.5" />
                              )}
                              Confirm
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Delete confirmation */}
                      {deleteConfirmId === project.id && (
                        <div className="mt-3 pt-3 border-t border-burgundy/20 bg-burgundy/5 -mx-4 -mb-4 px-4 pb-4 rounded-b-xl">
                          <p className="font-sans text-ui-xs text-burgundy mb-2">
                            Permanently delete this library project? This cannot be undone.
                          </p>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium bg-slate/10 text-slate hover:bg-slate/20"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDelete(project.id)}
                              disabled={!!actionLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium bg-burgundy text-white hover:bg-burgundy-dark disabled:opacity-50"
                            >
                              {actionLoading === `delete-${project.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Orphaned Projects Tab */}
          {activeTab === "orphaned" && (
            <>
              {isLoadingOrphaned ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-600 mb-2" />
                  <p className="font-sans text-ui-base text-slate">Loading orphaned projects...</p>
                </div>
              ) : filteredOrphaned.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-700/50 dark:to-slate-800/50 rounded-2xl mb-4 shadow-sm">
                    <UserX className="h-7 w-7 text-slate-600/40" />
                  </div>
                  <h3 className="font-serif text-ui-lg text-ink mb-2">
                    {searchQuery ? "No matching projects" : "No orphaned projects"}
                  </h3>
                  <p className="font-sans text-ui-xs text-slate max-w-[220px] mx-auto leading-relaxed">
                    {searchQuery
                      ? "Try a different search term"
                      : "Projects without owners will appear here when users are deleted"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredOrphaned.map((project) => (
                    <div
                      key={project.id}
                      className="group p-4 rounded-xl border border-parchment bg-ivory dark:bg-slate-800/50 hover:border-slate-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-serif text-ui-base text-ink truncate" title={project.name}>
                            {project.name}
                          </h4>
                          <p className="font-sans text-ui-xs text-slate/60 mb-1 flex items-center gap-1">
                            <UserX className="h-2.5 w-2.5" />
                            <span className="text-amber-600">No owner</span>
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
                              Updated {formatDate(project.updated_at)}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => {
                              setReassignProjectId(project.id);
                              setReassignToUserId("");
                            }}
                            disabled={!!actionLoading}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                              "font-sans text-ui-xs font-medium",
                              "bg-purple-500 text-white hover:bg-purple-600",
                              "transition-colors",
                              "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Reassign
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(project.id)}
                            disabled={!!actionLoading}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                              "font-sans text-ui-xs font-medium",
                              "bg-slate/10 text-slate hover:bg-burgundy/10 hover:text-burgundy",
                              "transition-colors",
                              "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Reassign dialog */}
                      {reassignProjectId === project.id && (
                        <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30 -mx-4 -mb-4 px-4 pb-4 rounded-b-xl">
                          <label className="block font-sans text-ui-xs text-purple-800 mb-1.5">
                            Assign to user:
                          </label>
                          <select
                            value={reassignToUserId}
                            onChange={(e) => setReassignToUserId(e.target.value)}
                            className={cn(
                              "w-full px-3 py-2 rounded-lg",
                              "font-sans text-ui-xs text-ink",
                              "bg-white border border-purple-200",
                              "focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                            )}
                          >
                            <option value="">Select a user...</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.display_name || "Unnamed"} {u.affiliation ? `(${u.affiliation})` : ""}
                              </option>
                            ))}
                          </select>
                          <div className="flex justify-end gap-2 mt-2">
                            <button
                              onClick={() => {
                                setReassignProjectId(null);
                                setReassignToUserId("");
                              }}
                              disabled={!!actionLoading}
                              className="px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium bg-white text-slate hover:bg-slate/10"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleReassignProject(project.id, reassignToUserId)}
                              disabled={!!actionLoading || !reassignToUserId}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50"
                            >
                              {actionLoading === `reassign-${project.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <UserPlus className="h-3.5 w-3.5" />
                              )}
                              Assign
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Delete confirmation */}
                      {deleteConfirmId === project.id && (
                        <div className="mt-3 pt-3 border-t border-burgundy/20 bg-burgundy/5 -mx-4 -mb-4 px-4 pb-4 rounded-b-xl">
                          <p className="font-sans text-ui-xs text-burgundy mb-2">
                            Permanently delete this orphaned project? This cannot be undone.
                          </p>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium bg-slate/10 text-slate hover:bg-slate/20"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDeleteOrphanedProject(project.id)}
                              disabled={!!actionLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium bg-burgundy text-white hover:bg-burgundy-dark disabled:opacity-50"
                            >
                              {actionLoading === `delete-orphan-${project.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-parchment">
          <p className="font-sans text-ui-xs text-slate/70 text-center">
            {activeTab === "pending"
              ? `${pendingSubmissions.length} submission${pendingSubmissions.length !== 1 ? "s" : ""} pending review`
              : activeTab === "approved"
                ? `${libraryProjects.filter(p => p.accession_status === "approved").length} project${libraryProjects.filter(p => p.accession_status === "approved").length !== 1 ? "s" : ""} in library`
                : activeTab === "users"
                  ? `${users.length} user${users.length !== 1 ? "s" : ""} · ${users.filter(u => u.is_admin).length} admin${users.filter(u => u.is_admin).length !== 1 ? "s" : ""}`
                  : `${orphanedProjects.length} orphaned project${orphanedProjects.length !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>
    </div>
  );
}
