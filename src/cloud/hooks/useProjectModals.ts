/**
 * Hook for managing project-related modal states
 */

import { useState } from "react";

export interface ProjectModalsState {
  // Projects modal
  showProjectsModal: boolean;
  setShowProjectsModal: (show: boolean) => void;

  // Members modal
  showMembersModal: boolean;
  setShowMembersModal: (show: boolean) => void;
  membersModalProjectId: string | null;
  setMembersModalProjectId: (id: string | null) => void;

  // Library modal
  showLibraryModal: boolean;
  setShowLibraryModal: (show: boolean) => void;
  viewingLibraryProjectId: string | null;
  setViewingLibraryProjectId: (id: string | null) => void;

  // Admin modal
  showAdminModal: boolean;
  setShowAdminModal: (show: boolean) => void;
}

/**
 * Custom hook for managing all project-related modal states
 * Centralizes UI state management for various project modals
 */
export function useProjectModals(): ProjectModalsState {
  // Projects modal state
  const [showProjectsModal, setShowProjectsModal] = useState(false);

  // Members modal state
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [membersModalProjectId, setMembersModalProjectId] = useState<string | null>(null);

  // Library modal state
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [viewingLibraryProjectId, setViewingLibraryProjectId] = useState<string | null>(null);

  // Admin modal state
  const [showAdminModal, setShowAdminModal] = useState(false);

  return {
    // Projects modal
    showProjectsModal,
    setShowProjectsModal,

    // Members modal
    showMembersModal,
    setShowMembersModal,
    membersModalProjectId,
    setMembersModalProjectId,

    // Library modal
    showLibraryModal,
    setShowLibraryModal,
    viewingLibraryProjectId,
    setViewingLibraryProjectId,

    // Admin modal
    showAdminModal,
    setShowAdminModal,
  };
}
