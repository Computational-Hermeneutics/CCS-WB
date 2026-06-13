"use client";

/**
 * Projects Context
 *
 * Manages shared projects stored in Supabase.
 * Orchestrates domain-specific hooks for CRUD, trash, members, library, and admin operations.
 */

import React, { createContext, useContext, useCallback } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "@/cloud/lib/supabase/client";
import { useAuth } from "./AuthContext";
import type {
  Project,
  ProjectWithOwner,
  MemberWithProfile,
  MemberRole,
  LibraryProject,
} from "@/cloud/lib/supabase/types";
import type { Session, EntryMode } from "@/types/session";

// Import all domain hooks
import { useProjectCRUD } from "@/cloud/hooks/useProjectCRUD";
import { useProjectSave } from "@/cloud/hooks/useProjectSave";
import { useProjectSharing } from "@/cloud/hooks/useProjectSharing";
import { useProjectTrash } from "@/cloud/hooks/useProjectTrash";
import { useProjectMembers } from "@/cloud/hooks/useProjectMembers";
import { useProjectLibrary } from "@/cloud/hooks/useProjectLibrary";
import { useProjectAdmin } from "@/cloud/hooks/useProjectAdmin";
import { useProjectModals } from "@/cloud/hooks/useProjectModals";

interface ProjectsContextValue {
  // State
  projects: ProjectWithOwner[];
  isLoading: boolean;
  currentProjectId: string | null;

  // Project CRUD
  createProject: (
    name: string,
    description?: string,
    mode?: EntryMode
  ) => Promise<{
    project: Project | null;
    initialSession: Partial<Session> | null;
    error: Error | null;
  }>;
  loadProject: (projectId: string) => Promise<{ session: Session | null; error: Error | null }>;
  saveProject: (projectId: string, session: Session) => Promise<{ error: Error | null }>;
  deleteProject: (
    projectId: string,
    membersToFork?: MemberWithProfile[]
  ) => Promise<{ error: Error | null }>;
  renameProject: (projectId: string, newName: string) => Promise<{ error: Error | null }>;

  // Trash
  trashedProjects: ProjectWithOwner[];
  isLoadingTrash: boolean;
  fetchTrashedProjects: () => Promise<void>;
  restoreProject: (projectId: string) => Promise<{ error: Error | null }>;
  permanentlyDeleteProject: (projectId: string) => Promise<{ error: Error | null }>;
  emptyTrash: () => Promise<{ error: Error | null }>;

  // Project management
  refreshProjects: () => Promise<void>;
  setCurrentProjectId: (id: string | null) => void;

  // Member management
  getProjectMembers: (
    projectId: string
  ) => Promise<{ members: MemberWithProfile[]; error: Error | null }>;
  createInviteLink: (
    projectId: string,
    role: "editor" | "viewer"
  ) => Promise<{ inviteUrl: string | null; error: Error | null }>;
  removeMember: (projectId: string, userId: string) => Promise<{ error: Error | null }>;
  updateMemberRole: (
    projectId: string,
    userId: string,
    role: MemberRole
  ) => Promise<{ error: Error | null }>;
  joinProjectByInvite: (
    token: string
  ) => Promise<{ project: Project | null; error: Error | null }>;

  // Modal state
  showProjectsModal: boolean;
  setShowProjectsModal: (show: boolean) => void;
  showMembersModal: boolean;
  setShowMembersModal: (show: boolean) => void;
  membersModalProjectId: string | null;
  setMembersModalProjectId: (id: string | null) => void;

  // Library state
  libraryProjects: LibraryProject[];
  isLoadingLibrary: boolean;
  showLibraryModal: boolean;
  setShowLibraryModal: (show: boolean) => void;
  viewingLibraryProjectId: string | null;
  setViewingLibraryProjectId: (id: string | null) => void;

  // Library functions
  fetchLibraryProjects: () => Promise<void>;
  loadLibraryProject: (
    projectId: string
  ) => Promise<{ session: Session | null; error: Error | null }>;
  copyLibraryProject: (
    projectId: string,
    newName?: string
  ) => Promise<{ project: Project | null; error: Error | null }>;
  submitForReview: (projectId: string) => Promise<{ error: Error | null }>;

  // Admin state
  pendingSubmissions: LibraryProject[];
  isLoadingAdmin: boolean;
  showAdminModal: boolean;
  setShowAdminModal: (show: boolean) => void;

  // Admin functions
  fetchPendingSubmissions: () => Promise<void>;
  approveProject: (projectId: string) => Promise<{ error: Error | null }>;
  rejectProject: (projectId: string, reason?: string) => Promise<{ error: Error | null }>;
  adminDeleteProject: (projectId: string) => Promise<{ error: Error | null }>;
  adminHardDeleteProject: (projectId: string) => Promise<{ error: Error | null }>;
  adminRenameProject: (projectId: string, newName: string) => Promise<{ error: Error | null }>;
  deaccessionProject: (projectId: string) => Promise<{ error: Error | null }>;
  adminDuplicateProject: (
    projectId: string
  ) => Promise<{ project: Project | null; error: Error | null }>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, profile } = useAuth();
  const isSupabaseEnabled = isSupabaseConfigured();
  const supabase = isSupabaseEnabled ? getSupabaseClient() : null;

  // Initialize all domain hooks
  const crud = useProjectCRUD({
    supabase,
    user,
    profile,
    isAuthenticated,
  });

  const save = useProjectSave({
    supabase,
    user,
    currentProjectId: crud.currentProjectId,
    updateProjectTimestamp: useCallback(
      (projectId: string, timestamp: string) => {
        // Update the timestamp in the projects list after save
        crud.refreshProjects();
      },
      [crud]
    ),
  });

  const sharing = useProjectSharing({
    supabase,
    user,
    profile,
    currentProjectId: crud.currentProjectId,
    setCurrentProjectId: crud.setCurrentProjectId,
    refreshProjects: crud.refreshProjects,
  });

  const trash = useProjectTrash({
    supabase,
    user,
    currentProjectId: crud.currentProjectId,
    setCurrentProjectId: crud.setCurrentProjectId,
    refreshProjects: crud.refreshProjects,
  });

  const members = useProjectMembers({
    supabase,
    user,
    profile,
    refreshProjects: crud.refreshProjects,
  });

  const library = useProjectLibrary({
    supabase,
    user,
    profile,
    loadProject: crud.loadProject,
  });

  const admin = useProjectAdmin({
    supabase,
    user,
    profile,
    isAuthenticated,
    refreshProjects: crud.refreshProjects,
  });

  const modals = useProjectModals();

  // Combine all exports into context value
  const value: ProjectsContextValue = {
    // CRUD
    projects: crud.projects,
    isLoading: crud.isLoading,
    currentProjectId: crud.currentProjectId,
    setCurrentProjectId: crud.setCurrentProjectId,
    refreshProjects: crud.refreshProjects,
    createProject: crud.createProject,
    loadProject: crud.loadProject,

    // Save
    saveProject: save.saveProject,

    // Sharing
    deleteProject: sharing.deleteProject,

    // Trash
    trashedProjects: trash.trashedProjects,
    isLoadingTrash: trash.isLoadingTrash,
    fetchTrashedProjects: trash.fetchTrashedProjects,
    restoreProject: trash.restoreProject,
    permanentlyDeleteProject: trash.permanentlyDeleteProject,
    emptyTrash: trash.emptyTrash,
    renameProject: trash.renameProject,

    // Members
    getProjectMembers: members.getProjectMembers,
    createInviteLink: members.createInviteLink,
    removeMember: members.removeMember,
    updateMemberRole: members.updateMemberRole,
    joinProjectByInvite: members.joinProjectByInvite,

    // Library
    libraryProjects: library.libraryProjects,
    isLoadingLibrary: library.isLoadingLibrary,
    fetchLibraryProjects: library.fetchLibraryProjects,
    loadLibraryProject: library.loadLibraryProject,
    copyLibraryProject: library.copyLibraryProject,
    submitForReview: library.submitForReview,

    // Admin
    pendingSubmissions: admin.pendingSubmissions,
    isLoadingAdmin: admin.isLoadingAdmin,
    fetchPendingSubmissions: admin.fetchPendingSubmissions,
    approveProject: admin.approveProject,
    rejectProject: admin.rejectProject,
    adminDeleteProject: admin.adminDeleteProject,
    adminHardDeleteProject: admin.adminHardDeleteProject,
    adminRenameProject: admin.adminRenameProject,
    deaccessionProject: admin.deaccessionProject,
    adminDuplicateProject: admin.adminDuplicateProject,

    // Modals
    showProjectsModal: modals.showProjectsModal,
    setShowProjectsModal: modals.setShowProjectsModal,
    showMembersModal: modals.showMembersModal,
    setShowMembersModal: modals.setShowMembersModal,
    membersModalProjectId: modals.membersModalProjectId,
    setMembersModalProjectId: modals.setMembersModalProjectId,
    showLibraryModal: modals.showLibraryModal,
    setShowLibraryModal: modals.setShowLibraryModal,
    viewingLibraryProjectId: modals.viewingLibraryProjectId,
    setViewingLibraryProjectId: modals.setViewingLibraryProjectId,
    showAdminModal: modals.showAdminModal,
    setShowAdminModal: modals.setShowAdminModal,
  };

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error("useProjects must be used within a ProjectsProvider");
  }
  return context;
}
