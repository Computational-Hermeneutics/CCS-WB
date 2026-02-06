"use client";

import { useState, useRef, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from "react";
import { useRouter } from "next/navigation";
import { useCollaborativeSession } from "@/hooks/useCollaborativeSession";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useWorkbenchChat } from "@/hooks/useWorkbenchChat";
import { useReferenceSearch } from "@/hooks/useReferenceSearch";
import { useAnnotationSuggestions } from "@/hooks/useAnnotationSuggestions";
import { useWorkbenchFileManagement } from "@/hooks/useWorkbenchFileManagement";
import { useWorkbenchProject } from "@/hooks/useWorkbenchProject";
import { useAnnotationReplies } from "@/hooks/useAnnotationReplies";
import { WorkbenchHeader } from "./WorkbenchHeader";
import { WorkbenchModals } from "./WorkbenchModals";
import { useUnsavedWarning } from "@/hooks/useUnsavedWarning";
import { useAISettings } from "@/context/AISettingsContext";
import { cn, generateId } from "@/lib/utils";
import type { Session } from "@/types";
import {
  X,
  Eye,
  Copy,
} from "lucide-react";
import { CodeEditorPanel, generateAnnotatedCode } from "@/components/code";
import { WorkbenchChatPanel } from "@/components/chat";
import { FloatingCCSPanel } from "@/components/ccs";
import { SaveStatusIndicator } from "@/components/ui/SaveStatusIndicator";
import { ConnectionStatus } from "@/components/ui/ConnectionStatus";
import { Toast } from "@/components/ui/Toast";
import { useConnectionHealth } from "@/hooks/useConnectionHealth";
import { UserMenu } from "@/components/auth/UserMenu";
import { useAppSettings } from "@/context/AppSettingsContext";
import { useAuth } from "@/context/AuthContext";
import { useProjects } from "@/context/ProjectsContext";
import { useProjectSync } from "@/hooks/useProjectSync";
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from "@/types/app-settings";
import { PROVIDER_CONFIGS } from "@/lib/ai/config";

interface WorkbenchLayoutProps {
  onNavigateHome: () => void;
  triggerSave?: boolean;
  onSaveTriggered?: () => void;
}

export interface WorkbenchLayoutRef {
  save: () => void;
  hasUnsavedChanges: () => boolean;
  getProjectName: () => string;
}

// Font size constants are imported from app-settings

// Languages for code critique (broader than create mode)
const CRITIQUE_LANGUAGES = [
  "",           // Empty = auto-detect / unspecified
  "Python",
  "JavaScript",
  "TypeScript",
  "Java",
  "C",
  "C++",
  "C#",
  "Go",
  "Rust",
  "Ruby",
  "PHP",
  "Swift",
  "Kotlin",
  "BASIC",
  "Lisp",
  "Scheme",
  "Haskell",
  "Perl",
  "COBOL",
  "Fortran",
  "Assembly",
  "SQL",
  "Shell",
  "Other",
] as const;

export const WorkbenchLayout = forwardRef<WorkbenchLayoutRef, WorkbenchLayoutProps>(function WorkbenchLayout({
  onNavigateHome,
  triggerSave = false,
  onSaveTriggered,
}, ref) {
  const {
    session,
    addMessage,
    updateMessage,
    addCode,
    removeCode,
    updateCode,
    reorderCodeFiles,
    updateSettings,
    importSession,
    setLanguageOverride,
    setExperienceLevel,
    switchMode,
    clearModeSession,
    hasSavedSession,
    setCodeContent,
    removeCodeContent,
    addLineAnnotation,
    updateLineAnnotation,
    removeLineAnnotation,
    clearLineAnnotations,
    pushReply,
    deleteReply,
    // Display settings
    updatePanelLayoutSettings,
    // Collaborative features
    isInProject,
    isCollaborationConnected,
    refreshFromCloud,
    saveAllToCloud,
    resetSession,
    newRemoteAnnotationIds,
    // Auto-save
    markClean,
    // File trash
    trashedFiles,
    isLoadingFileTrash,
    loadTrashedFiles,
    restoreFileFromTrash,
    permanentlyDeleteFileFromTrash,
    emptyAllFileTrash,
  } = useCollaborativeSession();
  const { settings: aiSettings, getRequestHeaders, isConfigured: isAIConfigured, connectionStatus, setConnectionStatus, isAiReady } = useAISettings();
  const { settings: appSettings, getFontSizes, setModeCodeFontSize, setModeChatFontSize, getDisplayName, profile } = useAppSettings();
  const { isAuthenticated, setShowLoginModal, profile: authProfile, user, isAdmin } = useAuth();
  const {
    currentProjectId,
    projects,
    isLoading: isLoadingProjects,
    saveProject,
    loadProject,
    createProject,
    setCurrentProjectId,
    setShowMembersModal,
    setMembersModalProjectId,
    refreshProjects,
    setShowLibraryModal,
    viewingLibraryProjectId,
    setViewingLibraryProjectId,
    copyLibraryProject,
    submitForReview,
    setShowAdminModal,
    pendingSubmissions,
    fetchPendingSubmissions,
    renameProject,
    getProjectMembers,
  } = useProjects();
  const { markLocalUpdate } = useProjectSync();
  const aiEnabled = aiSettings.aiEnabled;

  // Track whether we've shown the connection lost toast to prevent loop
  const connectionLostToastShownRef = useRef(false);

  // Connection health monitoring for cloud projects
  const connectionHealth = useConnectionHealth({
    projectId: currentProjectId,
    enabled: !!currentProjectId && isAuthenticated,
    onConnectionLost: () => {
      console.log("[WorkbenchLayout] Connection lost");
      // Only show toast once until connection is restored
      if (!connectionLostToastShownRef.current) {
        connectionLostToastShownRef.current = true;
        setConnectionToast({
          show: true,
          type: "error",
          message: "Connection to cloud project lost. Changes saved locally.",
        });
      }
    },
    onConnectionRestored: () => {
      console.log("[WorkbenchLayout] Connection restored, triggering refresh");
      // Reset the flag so we can show error toast again if connection is lost in future
      connectionLostToastShownRef.current = false;
      setConnectionToast({
        show: true,
        type: "success",
        message: "Connection to cloud project restored.",
      });
      refreshFromCloud();
    },
  });

  // Auto-save hooks
  const autoSave = useAutoSave({
    enabled: true,
    onSaveSuccess: (timestamp) => {
      console.log("[WorkbenchLayout] Auto-save successful:", timestamp);
    },
    onSaveError: (error) => {
      console.error("[WorkbenchLayout] Auto-save failed:", error);
      // Could show a toast notification here
    },
  });

  // Warn before closing with unsaved changes
  useUnsavedWarning(autoSave.isDirty, true);

  // Auto-save for cloud projects when session becomes dirty
  useEffect(() => {
    if (!currentProjectId || !session.isDirty) {
      return;
    }

    console.log('[WorkbenchLayout] Cloud project dirty, scheduling auto-save');

    // Debounce auto-save by 2 seconds
    const timer = setTimeout(async () => {
      console.log('[WorkbenchLayout] Auto-saving cloud project:', currentProjectId);
      try {
        const { error } = await saveProject(currentProjectId, session);
        if (error) {
          console.error('[WorkbenchLayout] Cloud auto-save failed:', error);
        } else {
          console.log('[WorkbenchLayout] Cloud auto-save successful');
          // Mark session as clean to prevent immediate re-save
          markClean();
        }
      } catch (err) {
        console.error('[WorkbenchLayout] Cloud auto-save error:', err);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [currentProjectId, session.isDirty, saveProject, markClean]);

  // Refresh cloud connection when tab becomes visible after being hidden
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && currentProjectId && isAuthenticated) {
        console.log('[WorkbenchLayout] Tab became visible, refreshing cloud connection');
        try {
          // Refresh projects list to get latest data
          await refreshProjects();
          // Refresh current session from cloud
          if (refreshFromCloud) {
            const result = await refreshFromCloud();
            if (result.success) {
              console.log('[WorkbenchLayout] Cloud refresh successful');
            } else {
              console.warn('[WorkbenchLayout] Cloud refresh failed:', result.error);
            }
          }
        } catch (err) {
          console.error('[WorkbenchLayout] Error refreshing on visibility:', err);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentProjectId, isAuthenticated, refreshProjects, refreshFromCloud]);

  const router = useRouter();

  // Get font sizes from app settings for critique mode
  const { codeFontSize, chatFontSize } = getFontSizes("critique");

  // Compute AI provider display name for chat panel header
  const aiProviderDisplayName = PROVIDER_CONFIGS[aiSettings.provider]?.name || aiSettings.provider;

  // Get effective language for API context: session override > global default
  const effectiveLanguage = session.languageOverride || appSettings.defaultLanguage || "";

  // State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<"profile" | "code" | "appearance" | "ai" | "about">("appearance");
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [showSendContextModal, setShowSendContextModal] = useState(false);
  const [showFontSizePopover, setShowFontSizePopover] = useState(false);
  const [showHelpPopover, setShowHelpPopover] = useState(false);
  const [connectionToast, setConnectionToast] = useState<{
    show: boolean;
    type: "success" | "error" | "reconnect";
    message: React.ReactNode;
  } | null>(null);
  const [isCCSPanelMinimized, setIsCCSPanelMinimized] = useState(false);


  // Auto-clear success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);



  // Panel layout settings from session (per-project)
  // Use defaults as fallback for old sessions that don't have displaySettings
  const DEFAULT_CODE_PANEL_WIDTH = 70;
  const panelLayout = session.displaySettings?.panelLayout ?? {
    codePanelWidth: DEFAULT_CODE_PANEL_WIDTH,
    chatCollapsed: false,
    annotationFullScreen: false,
  };
  const codePanelWidth = panelLayout.codePanelWidth;
  const chatCollapsed = panelLayout.chatCollapsed;
  const annotationFullScreen = panelLayout.annotationFullScreen;

  // Wrapper functions to update panel layout through session
  const setCodePanelWidth = (width: number) => updatePanelLayoutSettings({ codePanelWidth: width });
  const setChatCollapsed = (collapsed: boolean) => updatePanelLayoutSettings({ chatCollapsed: collapsed });
  const setAnnotationFullScreen = (fullScreen: boolean) => updatePanelLayoutSettings({ annotationFullScreen: fullScreen });

  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Track if user has manually resized the panel (disables auto-extend for 80-column files)
  const userHasManuallyResized = useRef(false);

  // Cleanup: clear library preview state when leaving critique mode
  useEffect(() => {
    return () => {
      // When unmounting (navigating away), clear preview state
      if (viewingLibraryProjectId) {
        setViewingLibraryProjectId(null);
        resetSession();
      }
    };
  }, [viewingLibraryProjectId, setViewingLibraryProjectId, resetSession]);

  // Create a Map from session.codeContents for compatibility with existing code
  const codeContents = useMemo(() => new Map(Object.entries(session.codeContents)), [session.codeContents]);

  // Chat functionality (messages, input, code extraction, guided prompts)
  const {
    input, setInput,
    isLoading,
    copiedMessageId,
    favouriteMessages, setFavouriteMessages,
    showChatSearch, setShowChatSearch,
    chatSearchQuery, setChatSearchQuery,
    showGuidedPrompts, setShowGuidedPrompts,
    messagesEndRef,
    inputRef,
    chatSearchInputRef,
    handleSend,
    handleKeyDown,
    handleCopyMessage,
    handleToggleFavourite,
    handleExtractCodeToFiles,
    handleSaveResponseAsMarkdown,
    handleSelectGuidedPrompt,
    handleCCSMethodGuidance,
    autoTestConnection,
    annotatedCodeContext,
  } = useWorkbenchChat({
    session,
    addMessage,
    updateMessage,
    addCode,
    setCodeContent,
    getRequestHeaders,
    isAiReady,
    connectionStatus,
    setConnectionStatus,
    aiSettings,
    effectiveLanguage,
    codeContents,
    setShowSettingsModal,
    setSettingsTab,
    setShowAIPanel,
    setSuccessMessage,
  });

  // Reference search (literature search, results, adding references as files)
  const {
    showSearchModal, setShowSearchModal,
    searchQuery, setSearchQuery,
    isSearchingLiterature,
    searchResults,
    showResultsModal, setShowResultsModal,
    selectedReferences, setSelectedReferences,
    handleSearchLiterature,
    getSuggestedSearchTerms,
    executeSearchLiterature,
    handleAddSelectedReferences,
    dismissResults,
  } = useReferenceSearch({
    session,
    addCode,
    setCodeContent,
    getRequestHeaders,
    setSuccessMessage,
  });

  // File management (upload, paste, delete, rename, duplicate, revert, local trash)
  const {
    selectedFileId, setSelectedFileId,
    originalContents,
    showCodeInput, setShowCodeInput,
    codeInputText, setCodeInputText,
    codeInputName, setCodeInputName,
    codeInputLanguage, setCodeInputLanguage,
    localTrashedFiles,
    fileInputRef,
    storeOriginalContent,
    commitOriginalContent,
    handleRevertFile,
    handleCommitFile,
    handleFileChange,
    handleCodeSubmit,
    handleDeleteFile,
    handleRenameFile,
    handleDuplicateFile,
    handleLocalLoadTrashedFiles,
    handleLocalRestoreFile,
    handleLocalPermanentlyDeleteFile,
    handleLocalEmptyTrash,
    initializeOriginalContents,
  } = useWorkbenchFileManagement({
    session,
    addCode,
    removeCode,
    updateCode,
    setCodeContent,
    addLineAnnotation,
    clearLineAnnotations,
    isInProject,
    codeContents,
    onFileAdded: () => { userHasManuallyResized.current = false; },
  });

  // Annotation suggestions (AI-powered annotation generation and review)
  const {
    showAnnotationSuggestionsModal, setShowAnnotationSuggestionsModal,
    annotationModalMode, setAnnotationModalMode,
    selectedAnnotationTypes, setSelectedAnnotationTypes,
    annotationSuggestions,
    currentSuggestionIndex, setCurrentSuggestionIndex,
    selectedAnnotations, setSelectedAnnotations,
    isRequestingAnnotations,
    handleRequestAnnotationSuggestions,
    handleAddSelectedAnnotations,
    handleAddCurrentSuggestion,
    handleDiscardCurrentSuggestion,
    dismissAnnotationSuggestions,
  } = useAnnotationSuggestions({
    selectedFileId,
    session,
    codeContents,
    isAiReady,
    aiSettings,
    getRequestHeaders,
    autoTestConnection,
    setShowAIPanel,
    setSuccessMessage,
    addLineAnnotation,
  });

  // Project management (save/load, cloud, export, rename, lifecycle)
  const {
    projectName, setProjectName,
    showSaveModal, setShowSaveModal,
    saveModalName, setSaveModalName,
    showExportModal, setShowExportModal,
    showNewProjectModal, setShowNewProjectModal,
    isCreatingProject, setIsCreatingProject,
    newProjectName, setNewProjectName,
    populateWithSession, setPopulateWithSession,
    cloudActionLoading, setCloudActionLoading,
    showCloudMenu, setShowCloudMenu,
    showSaveDropdown, setShowSaveDropdown,
    isSavingToCloud,
    isRefreshingFromCloud,
    isDownloadingZip,
    showProjectInfo, setShowProjectInfo,
    projectMemberCount,
    projectMembers,
    isRenaming, setIsRenaming,
    renameValue, setRenameValue,
    isRenamingLoading,
    sessionLoadInputRef,
    renameInputRef,
    projectInfoRef,
    currentProject,
    projectNameRef,
    handleSaveSession,
    handleSaveAs,
    handleSaveAsMarkdown,
    handleSaveToCloud,
    handleRefreshFromCloud,
    handleDownloadZip,
    handleStartRename,
    handleCancelRename,
    handleSubmitRename,
    handleLoadProject,
    handleCreateProject,
    handleConfirmSave,
    handleNewProject,
    hasUnsavedChanges,
    handleLoadSession,
    handleExportJSON,
    handleExportText,
    handleExportPDF,
  } = useWorkbenchProject({
    session,
    autoSave,
    codeContents,
    codePanelWidth,
    chatCollapsed,
    profile,
    importSession,
    clearModeSession,
    isInProject,
    refreshFromCloud,
    saveAllToCloud,
    currentProjectId,
    projects,
    saveProject,
    loadProject,
    createProject,
    setCurrentProjectId,
    renameProject,
    getProjectMembers,
    refreshProjects,
    fetchPendingSubmissions,
    markLocalUpdate,
    isAuthenticated,
    isAdmin,
    setFavouriteMessages,
    setCodePanelWidth,
    setChatCollapsed,
    initializeOriginalContents,
    setShowSettingsModal,
    setSuccessMessage,
    DEFAULT_CODE_PANEL_WIDTH,
  });

  // --- Annotation replies hook ---
  const {
    expandedAnnotationId,
    replyInputOpenFor,
    handleToggleReplies,
    handleOpenReplyInput,
    handleCloseReplyInput,
    handleAddReply,
    handleDeleteReply,
    handleDeleteAnnotation,
  } = useAnnotationReplies({
    session,
    pushReply,
    deleteReply,
    removeLineAnnotation,
    user,
    projects,
    currentProjectId,
  });

  // Check if cloud project was restored on page load
  useEffect(() => {
    if (currentProjectId && currentProject) {
      const wasRestored = localStorage.getItem("ccs-project-just-restored") === "true";
      if (wasRestored) {
        setConnectionToast({
          show: true,
          type: "reconnect",
          message: (
            <>
              Reconnected to cloud project: <strong>{currentProject.name}</strong>
            </>
          ),
        });
        localStorage.removeItem("ccs-project-just-restored");
      }
    }
  }, [currentProjectId, currentProject]);

  // Reset layout to defaults when session changes
  const prevSessionIdRef = useRef(session.id);

  useEffect(() => {
    if (session.id !== prevSessionIdRef.current) {
      setCodePanelWidth(DEFAULT_CODE_PANEL_WIDTH);
      prevSessionIdRef.current = session.id;
    }
  }, [session.id]);

  // Handle panel resize dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    // Mark that user has manually resized - disables auto-extend for 80-column files
    userHasManuallyResized.current = true;
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

      // Clamp between 15% and 85% (allows chat to get very small)
      setCodePanelWidth(Math.min(85, Math.max(15, newWidth)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      // Prevent text selection while dragging
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging]);


  // Global keyboard shortcuts

  // Expose functions to parent via ref
  useImperativeHandle(ref, () => ({
    save: handleSaveSession,
    hasUnsavedChanges,
    getProjectName: () => projectNameRef.current,
  }), [handleSaveSession, hasUnsavedChanges]);

  // Handle save trigger from parent (prop-based approach as backup)
  useEffect(() => {
    if (triggerSave) {
      handleSaveSession();
      onSaveTriggered?.();
    }
  }, [triggerSave, handleSaveSession, onSaveTriggered]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + S - Save project
      if (isMod && e.key === 's') {
        e.preventDefault();
        handleSaveSession();
        return;
      }

      // Cmd/Ctrl + O - Open/Load project
      if (isMod && e.key === 'o') {
        e.preventDefault();
        sessionLoadInputRef.current?.click();
        return;
      }

      // Cmd/Ctrl + E - Export
      if (isMod && e.key === 'e') {
        e.preventDefault();
        setShowExportModal(true);
        return;
      }

      // Cmd/Ctrl + / - Focus input
      if (isMod && e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }

      // Cmd/Ctrl + - - Decrease font size
      if (isMod && e.key === '-') {
        e.preventDefault();
        if (chatFontSize > FONT_SIZE_MIN) {
          setModeChatFontSize("critique", chatFontSize - 1);
        }
        return;
      }

      // Cmd/Ctrl + = or + - Increase font size
      if (isMod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        if (chatFontSize < FONT_SIZE_MAX) {
          setModeChatFontSize("critique", chatFontSize + 1);
        }
        return;
      }

      // Cmd/Ctrl + Shift + F - Toggle chat search
      if (isMod && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        setShowChatSearch(prev => !prev);
        if (!showChatSearch) {
          setTimeout(() => chatSearchInputRef.current?.focus(), 50);
        } else {
          setChatSearchQuery("");
        }
        return;
      }

      // Escape - Close popovers/modals
      if (e.key === 'Escape') {
        setShowFontSizePopover(false);
        setShowGuidedPrompts(false);
        setShowSendContextModal(false);
        setShowCodeInput(false);
        setShowSettingsModal(false);
        setShowExportModal(false);
        setShowChatSearch(false);
        setChatSearchQuery("");
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleSaveSession]);

  // Close dropdowns and panels when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Close dropdowns if clicking outside of them
      if (!target.closest('[data-dropdown]')) {
        setShowModeDropdown(false);
        setShowFontSizePopover(false);
        setShowCloudMenu(false);
        setShowProjectInfo(false);
        setIsCreatingProject(false);
        setNewProjectName("");
        setIsRenaming(false);
        setRenameValue("");
      }
      // Close code input panel if clicking outside of it
      if (!target.closest('[data-code-input]')) {
        setShowCodeInput(false);
      }
      // Close guided prompts if clicking outside
      if (!target.closest('[data-guided-prompts]')) {
        setShowGuidedPrompts(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  // Detect if we're on alpha/test deployment for visual indicator
  const [isAlphaVersion, setIsAlphaVersion] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      setIsAlphaVersion(
        hostname.includes('alpha') ||
        hostname.includes('test') ||
        hostname.includes('staging')
      );
    }
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Floating CCS Guidance Panel - only in Learn Methods mode */}
      <FloatingCCSPanel
        isEnabled={session.mode === 'interpret'}
        annotationCount={session.lineAnnotations?.length || 0}
        hasOnlyTechnicalAnnotations={false}
        onInvokeCCSSkill={handleCCSMethodGuidance}
        aiEnabled={aiEnabled}
        isMinimized={isCCSPanelMinimized}
        onMinimize={setIsCCSPanelMinimized}
      />

      {/* Header */}
      <WorkbenchHeader
        session={session}
        switchMode={switchMode}
        clearModeSession={clearModeSession}
        hasSavedSession={hasSavedSession}
        showModeDropdown={showModeDropdown}
        setShowModeDropdown={setShowModeDropdown}
        onNavigateHome={onNavigateHome}
        isAlphaVersion={isAlphaVersion}
        currentProjectId={currentProjectId}
        currentProject={currentProject}
        projectName={projectName}
        setProjectName={setProjectName}
        showProjectInfo={showProjectInfo}
        setShowProjectInfo={setShowProjectInfo}
        projectInfoRef={projectInfoRef}
        viewingLibraryProjectId={viewingLibraryProjectId}
        isRenaming={isRenaming}
        renameValue={renameValue}
        setRenameValue={setRenameValue}
        isRenamingLoading={isRenamingLoading}
        renameInputRef={renameInputRef}
        handleStartRename={handleStartRename}
        handleCancelRename={handleCancelRename}
        handleSubmitRename={handleSubmitRename}
        showSaveDropdown={showSaveDropdown}
        setShowSaveDropdown={setShowSaveDropdown}
        handleSaveSession={handleSaveSession}
        handleSaveAs={handleSaveAs}
        handleSaveAsMarkdown={handleSaveAsMarkdown}
        handleLoadSession={handleLoadSession}
        sessionLoadInputRef={sessionLoadInputRef}
        setShowNewProjectModal={setShowNewProjectModal}
        setShowExportModal={setShowExportModal}
        autoSave={autoSave}
        showCloudMenu={showCloudMenu}
        setShowCloudMenu={setShowCloudMenu}
        cloudActionLoading={cloudActionLoading}
        setCloudActionLoading={setCloudActionLoading}
        isCreatingProject={isCreatingProject}
        setIsCreatingProject={setIsCreatingProject}
        newProjectName={newProjectName}
        setNewProjectName={setNewProjectName}
        populateWithSession={populateWithSession}
        setPopulateWithSession={setPopulateWithSession}
        handleCreateProject={handleCreateProject}
        handleLoadProject={handleLoadProject}
        handleRefreshFromCloud={handleRefreshFromCloud}
        handleDownloadZip={handleDownloadZip}
        isSavingToCloud={isSavingToCloud}
        isDownloadingZip={isDownloadingZip}
        isRefreshingFromCloud={isRefreshingFromCloud}
        projects={projects}
        isLoadingProjects={isLoadingProjects}
        setCurrentProjectId={setCurrentProjectId}
        resetSession={resetSession}
        saveProject={saveProject}
        submitForReview={submitForReview}
        setMembersModalProjectId={setMembersModalProjectId}
        setShowMembersModal={setShowMembersModal}
        setShowLibraryModal={setShowLibraryModal}
        isAuthenticated={isAuthenticated}
        user={user}
        isAdmin={isAdmin}
        setShowLoginModal={setShowLoginModal}
        setShowAdminModal={setShowAdminModal}
        pendingSubmissions={pendingSubmissions}
        connectionHealth={connectionHealth}
        isCCSPanelMinimized={isCCSPanelMinimized}
        setIsCCSPanelMinimized={setIsCCSPanelMinimized}
        showHelpPopover={showHelpPopover}
        setShowHelpPopover={setShowHelpPopover}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        setShowSettingsModal={setShowSettingsModal}
        aiEnabled={aiEnabled}
      />

      {/* Connection status toast notifications */}
      {connectionToast?.show && (
        <Toast
          type={connectionToast.type}
          message={connectionToast.message}
          duration={5000}
          onClose={() => setConnectionToast(null)}
        />
      )}

      {/* Read-only library project banner */}
      {viewingLibraryProjectId && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="font-sans text-[11px] text-amber-800 dark:text-amber-200">
              Viewing read-only library project
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const { project } = await copyLibraryProject(viewingLibraryProjectId);
                if (project) {
                  // Load the copied project
                  const { session: newSession } = await loadProject(project.id);
                  if (newSession) {
                    importSession(newSession);
                    setCurrentProjectId(project.id);
                  }
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-burgundy text-ivory rounded-lg font-sans text-[11px] font-medium hover:bg-burgundy-dark transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy to My Projects
            </button>
            <button
              onClick={() => {
                setViewingLibraryProjectId(null);
                resetSession();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate/10 text-slate rounded-lg font-sans text-[11px] font-medium hover:bg-slate/20 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Close
            </button>
          </div>
        </div>
      )}

      {/* Main layout - two or three panels depending on AI enabled */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {/* Left + Center: Code Editor Panel */}
        <div
          className={cn(
            (!aiEnabled || chatCollapsed || annotationFullScreen) && "flex-1",
            aiEnabled && !chatCollapsed && !annotationFullScreen && "border-r border-parchment"
          )}
          style={aiEnabled && !chatCollapsed && !annotationFullScreen ? { width: `${codePanelWidth}%` } : undefined}
        >
          <CodeEditorPanel
            codeFiles={session.codeFiles}
            codeContents={codeContents}
            originalContents={originalContents}
            onCodeContentChange={(fileId, content) => {
              setCodeContent(fileId, content);
            }}
            onDeleteFile={handleDeleteFile}
            onRenameFile={handleRenameFile}
            onDuplicateFile={handleDuplicateFile}
            onRevertFile={handleRevertFile}
            onCommitFile={handleCommitFile}
            onLoadCode={() => fileInputRef.current?.click()}
            onLoadSampleProject={(projectData) => {
              // Import the sample project as the current session
              // BUT preserve the user's current mode (don't let sample override it)
              const currentMode = session.mode;
              const sampleData = projectData as unknown as Session;

              // Convert sample file IDs to UUIDs for cloud saving
              // Sample projects use IDs like "file-1", "file-2" which can't be saved to database
              const idMap = new Map<string, string>(); // old ID -> new UUID
              const convertedCodeFiles = sampleData.codeFiles.map(file => {
                // Check if ID is not a UUID (e.g., "file-1", "file-2")
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(file.id);
                if (isUUID) {
                  return file;
                }
                // Generate new UUID for this file
                const newId = generateId();
                idMap.set(file.id, newId);
                console.log(`[LoadSample] Converting file ID: ${file.id} → ${newId}`);
                return { ...file, id: newId };
              });

              // Convert codeContents keys to use new UUIDs
              const convertedCodeContents: Record<string, string> = {};
              Object.entries(sampleData.codeContents || {}).forEach(([oldId, content]) => {
                const newId = idMap.get(oldId) || oldId;
                convertedCodeContents[newId] = content;
              });

              // Convert annotation codeFileId references to use new UUIDs
              const convertedAnnotations = (sampleData.lineAnnotations || []).map(ann => {
                const newFileId = idMap.get(ann.codeFileId) || ann.codeFileId;
                return { ...ann, codeFileId: newFileId };
              });

              importSession({
                ...sampleData,
                mode: currentMode, // Keep user's current mode
                codeFiles: convertedCodeFiles,
                codeContents: convertedCodeContents,
                lineAnnotations: convertedAnnotations,
              });
              // Reset manual resize flag
              userHasManuallyResized.current = false;
              // Note: importSession handles restoring all files, annotations, and messages
              // README.md will be auto-selected by CodeEditorPanel's useEffect
            }}
            onAddNewFile={() => {
              // Generate unique filename (untitled.md, untitled-2.md, etc.)
              const existingNames = new Set(session.codeFiles.map(f => f.name.toLowerCase()));
              let filename = "untitled.md";
              let counter = 2;
              while (existingNames.has(filename.toLowerCase())) {
                filename = `untitled-${counter}.md`;
                counter++;
              }
              // Create new blank markdown file
              const fileId = addCode({
                name: filename,
                language: "markdown",
                source: "created",
                size: 0,
              });
              // Set empty content
              setCodeContent(fileId, "");
              storeOriginalContent(fileId, "");
            }}
            onReorderFiles={reorderCodeFiles}
            onUpdateFileLanguage={(fileId, language) => updateCode(fileId, { language })}
            onSelectedFileChange={setSelectedFileId}
            isFullScreen={annotationFullScreen}
            onToggleFullScreen={() => setAnnotationFullScreen(!annotationFullScreen)}
            onRequestMinPanelWidth={(minWidth) => {
              // Auto-extend panel for 80-column punch card files
              // Only extend if user hasn't manually resized (respect user choice)
              if (!userHasManuallyResized.current && minWidth > codePanelWidth) {
                setCodePanelWidth(Math.min(85, minWidth));
              }
            }}
            userInitials={profile.initials}
            onAddLineAnnotation={addLineAnnotation}
            onUpdateLineAnnotation={updateLineAnnotation}
            onRemoveLineAnnotation={handleDeleteAnnotation}
            onClearLineAnnotations={clearLineAnnotations}
            newRemoteAnnotationIds={newRemoteAnnotationIds}
            expandedAnnotationId={expandedAnnotationId}
            onToggleReplies={handleToggleReplies}
            onAddReply={handleAddReply}
            onDeleteReply={handleDeleteReply}
            replyInputOpenFor={replyInputOpenFor}
            onOpenReplyInput={handleOpenReplyInput}
            onCloseReplyInput={handleCloseReplyInput}
            isInProject={isInProject}
            readOnly={!!viewingLibraryProjectId}
            sharedProjectMemberCount={projectMemberCount}
            sharedProjectMembers={projectMembers}
            // File trash props - use cloud trash when in project, local trash otherwise
            trashedFiles={isInProject ? trashedFiles : localTrashedFiles.map(f => ({
              id: f.id,
              name: f.name,
              language: f.language,
              deletedAt: f.deletedAt,
            }))}
            isLoadingFileTrash={isInProject ? isLoadingFileTrash : false}
            onLoadTrashedFiles={isInProject ? loadTrashedFiles : handleLocalLoadTrashedFiles}
            onRestoreFile={isInProject ? restoreFileFromTrash : handleLocalRestoreFile}
            onPermanentlyDeleteFile={isInProject ? permanentlyDeleteFileFromTrash : handleLocalPermanentlyDeleteFile}
            onEmptyFileTrash={isInProject ? emptyAllFileTrash : handleLocalEmptyTrash}
          />
        </div>

        {/* Resizable divider - only show when AI enabled, chat not collapsed, and not fullscreen */}
        {aiEnabled && !chatCollapsed && !annotationFullScreen && (
          <div
            onMouseDown={handleMouseDown}
            className={cn(
              "w-1 cursor-col-resize hover:bg-burgundy/30 transition-colors flex-shrink-0",
              isDragging && "bg-burgundy/30"
            )}
          />
        )}

        {/* Right: Chat Panel */}
        {aiEnabled && (
          <WorkbenchChatPanel
            annotationFullScreen={annotationFullScreen}
            chatCollapsed={chatCollapsed}
            setChatCollapsed={setChatCollapsed}
            showChatSearch={showChatSearch}
            setShowChatSearch={setShowChatSearch}
            chatSearchQuery={chatSearchQuery}
            setChatSearchQuery={setChatSearchQuery}
            chatSearchInputRef={chatSearchInputRef}
            session={session}
            codeContents={codeContents}
            messagesEndRef={messagesEndRef}
            inputRef={inputRef}
            input={input}
            setInput={setInput}
            handleKeyDown={handleKeyDown}
            isLoading={isLoading}
            copiedMessageId={copiedMessageId}
            handleCopyMessage={handleCopyMessage}
            handleExtractCodeToFiles={handleExtractCodeToFiles}
            handleSaveResponseAsMarkdown={handleSaveResponseAsMarkdown}
            handleToggleFavourite={handleToggleFavourite}
            favouriteMessages={favouriteMessages}
            getDisplayName={getDisplayName}
            chatFontSize={chatFontSize}
            showFontSizePopover={showFontSizePopover}
            setShowFontSizePopover={setShowFontSizePopover}
            setModeChatFontSize={setModeChatFontSize}
            showGuidedPrompts={showGuidedPrompts}
            setShowGuidedPrompts={setShowGuidedPrompts}
            handleSelectGuidedPrompt={handleSelectGuidedPrompt}
            setAnnotationModalMode={setAnnotationModalMode}
            setShowAnnotationSuggestionsModal={setShowAnnotationSuggestionsModal}
            isRequestingAnnotations={isRequestingAnnotations}
            setShowSendContextModal={setShowSendContextModal}
            handleSearchLiterature={handleSearchLiterature}
            isSearchingLiterature={isSearchingLiterature}
            handleSend={handleSend}
            isAiReady={isAiReady}
            connectionStatus={connectionStatus}
            aiProviderDisplayName={aiProviderDisplayName}
          />
        )}

        {/* Hidden file input - outside aiEnabled conditional so it works when AI is disabled */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* All Modals */}
      <WorkbenchModals
        showSettingsModal={showSettingsModal}
        setShowSettingsModal={setShowSettingsModal}
        settingsTab={settingsTab}
        showAIPanel={showAIPanel}
        setShowAIPanel={setShowAIPanel}
        showSearchModal={showSearchModal}
        setShowSearchModal={setShowSearchModal}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        executeSearchLiterature={executeSearchLiterature}
        getSuggestedSearchTerms={getSuggestedSearchTerms}
        showAnnotationSuggestionsModal={showAnnotationSuggestionsModal}
        dismissAnnotationSuggestions={dismissAnnotationSuggestions}
        annotationModalMode={annotationModalMode}
        selectedAnnotationTypes={selectedAnnotationTypes}
        setSelectedAnnotationTypes={setSelectedAnnotationTypes}
        handleRequestAnnotationSuggestions={handleRequestAnnotationSuggestions}
        isRequestingAnnotations={isRequestingAnnotations}
        currentSuggestionIndex={currentSuggestionIndex}
        annotationSuggestions={annotationSuggestions}
        handleDiscardCurrentSuggestion={handleDiscardCurrentSuggestion}
        handleAddCurrentSuggestion={handleAddCurrentSuggestion}
        showResultsModal={showResultsModal}
        setShowResultsModal={setShowResultsModal}
        searchResults={searchResults}
        selectedReferences={selectedReferences}
        setSelectedReferences={setSelectedReferences}
        dismissResults={dismissResults}
        handleAddSelectedReferences={handleAddSelectedReferences}
        successMessage={successMessage}
        showExportModal={showExportModal}
        setShowExportModal={setShowExportModal}
        handleExportJSON={handleExportJSON}
        handleExportText={handleExportText}
        handleExportPDF={handleExportPDF}
        showSaveModal={showSaveModal}
        setShowSaveModal={setShowSaveModal}
        saveModalName={saveModalName}
        setSaveModalName={setSaveModalName}
        handleConfirmSave={handleConfirmSave}
        showNewProjectModal={showNewProjectModal}
        setShowNewProjectModal={setShowNewProjectModal}
        handleNewProject={handleNewProject}
        showSendContextModal={showSendContextModal}
        setShowSendContextModal={setShowSendContextModal}
        session={session}
        annotatedCodeContext={annotatedCodeContext}
      />
    </div>
  );
});
