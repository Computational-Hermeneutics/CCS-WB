"use client";

import { memo, type RefObject } from "react";
import { cn } from "@/lib/utils";
import type { Session, EntryMode } from "@/types";
import { MODE_LABELS } from "@/lib/export";
import type { UseAutoSaveReturn } from "@/hooks/useAutoSave";
import { SaveStatusIndicator } from "@/components/ui/SaveStatusIndicator";
import { UserMenu } from "@/components/auth/UserMenu";
import {
  ChevronDown,
  Cloud,
  Shield,
  Users,
  FileCode,
  MessageSquareText,
  Calendar,
  Loader2,
  Check,
  Download,
  Pencil,
  UserPlus,
  HardDrive,
  FilePlus2,
  Save,
  FolderOpen,
  GitMerge,
  CloudOff,
  CloudCog,
  Plus,
  Library,
  UploadCloud,
  User,
  LogOut,
  LogIn,
  RefreshCw,
  HelpCircle,
  X,
  Settings,
  Eye,
} from "lucide-react";

const MODE_COLORS: Record<string, string> = {
  critique: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  interpret: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  create: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
};

const MODE_DISPLAY_NAMES: Record<string, string> = {
  critique: "Analyze Code",
  interpret: "Learn Methods",
  create: "Create Code",
};

const displayProjectName = (name: string) => name.replace(/^\$+/, "");

interface WorkbenchHeaderProps {
  // Session & mode
  session: Session;
  switchMode: (mode: "critique" | "interpret" | "create") => void;
  clearModeSession: (mode: "critique" | "interpret" | "create") => void;
  hasSavedSession: (mode: EntryMode) => boolean;
  showModeDropdown: boolean;
  setShowModeDropdown: (show: boolean) => void;
  onNavigateHome: () => void;
  isAlphaVersion: boolean;

  // Project info
  currentProjectId: string | null;
  currentProject: any;
  projectName: string;
  setProjectName: (name: string) => void;
  showProjectInfo: boolean;
  setShowProjectInfo: (show: boolean) => void;
  projectInfoRef: RefObject<HTMLDivElement | null>;
  viewingLibraryProjectId: string | null;

  // Rename
  isRenaming: boolean;
  renameValue: string;
  setRenameValue: (value: string) => void;
  isRenamingLoading: boolean;
  renameInputRef: RefObject<HTMLInputElement | null>;
  handleStartRename: () => void;
  handleCancelRename: () => void;
  handleSubmitRename: () => void;

  // Save/Load
  showSaveDropdown: boolean;
  setShowSaveDropdown: (show: boolean) => void;
  handleSaveSession: () => void;
  handleSaveAs: () => void;
  handleSaveAsMarkdown: () => void;
  handleLoadSession: (e: React.ChangeEvent<HTMLInputElement>) => void;
  sessionLoadInputRef: RefObject<HTMLInputElement | null>;
  handleMergeAnnotationsFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  mergeAnnotationsInputRef: RefObject<HTMLInputElement | null>;
  setShowNewProjectModal: (show: boolean) => void;
  setShowExportModal: (show: boolean) => void;
  autoSave: UseAutoSaveReturn;

  // Cloud menu
  showCloudMenu: boolean;
  setShowCloudMenu: (show: boolean) => void;
  cloudActionLoading: string | null;
  setCloudActionLoading: (loading: string | null) => void;
  isCreatingProject: boolean;
  setIsCreatingProject: (creating: boolean) => void;
  newProjectName: string;
  setNewProjectName: (name: string) => void;
  populateWithSession: boolean;
  setPopulateWithSession: (populate: boolean) => void;
  handleCreateProject: () => void;
  handleLoadProject: (projectId: string) => void;
  handleRefreshFromCloud: () => void;
  handleDownloadZip: () => void;
  isSavingToCloud: boolean;
  isDownloadingZip: boolean;
  isRefreshingFromCloud: boolean;
  projects: any[];
  isLoadingProjects: boolean;
  setCurrentProjectId: (id: string | null) => void;
  resetSession: () => void;
  saveProject: (id: string, session: Session) => Promise<{ error?: any }>;
  submitForReview: (projectId: string) => Promise<{ error?: any }>;

  // Members
  setMembersModalProjectId: (id: string) => void;
  setShowMembersModal: (show: boolean) => void;
  setShowLibraryModal: (show: boolean) => void;

  // Auth & admin
  isAuthenticated: boolean;
  user: any;
  isAdmin: boolean;
  setShowLoginModal: (show: boolean) => void;
  setShowAdminModal: (show: boolean) => void;
  pendingSubmissions: any[];

  // Connection health
  connectionHealth: { health: { status: string; pendingOperations: number } };

  // UI state
  isCCSPanelMinimized: boolean;
  setIsCCSPanelMinimized: (minimized: boolean) => void;
  showHelpPopover: boolean;
  setShowHelpPopover: (show: boolean) => void;
  settingsTab: string;
  setSettingsTab: (tab: "profile" | "code" | "appearance" | "ai" | "about") => void;
  setShowSettingsModal: (show: boolean) => void;
  aiEnabled: boolean;
}

export const WorkbenchHeader = memo(function WorkbenchHeader(props: WorkbenchHeaderProps) {
  const {
    // Session & mode
    session,
    switchMode,
    clearModeSession,
    hasSavedSession,
    showModeDropdown,
    setShowModeDropdown,
    onNavigateHome,
    isAlphaVersion,

    // Project info
    currentProjectId,
    currentProject,
    projectName,
    setProjectName,
    showProjectInfo,
    setShowProjectInfo,
    projectInfoRef,
    viewingLibraryProjectId,

    // Rename
    isRenaming,
    renameValue,
    setRenameValue,
    isRenamingLoading,
    renameInputRef,
    handleStartRename,
    handleCancelRename,
    handleSubmitRename,

    // Save/Load
    showSaveDropdown,
    setShowSaveDropdown,
    handleSaveSession,
    handleSaveAs,
    handleSaveAsMarkdown,
    handleLoadSession,
    sessionLoadInputRef,
    handleMergeAnnotationsFile,
    mergeAnnotationsInputRef,
    setShowNewProjectModal,
    setShowExportModal,
    autoSave,

    // Cloud menu
    showCloudMenu,
    setShowCloudMenu,
    cloudActionLoading,
    setCloudActionLoading,
    isCreatingProject,
    setIsCreatingProject,
    newProjectName,
    setNewProjectName,
    populateWithSession,
    setPopulateWithSession,
    handleCreateProject,
    handleLoadProject,
    handleRefreshFromCloud,
    handleDownloadZip,
    isSavingToCloud,
    isDownloadingZip,
    isRefreshingFromCloud,
    projects,
    isLoadingProjects,
    setCurrentProjectId,
    resetSession,
    saveProject,
    submitForReview,

    // Members
    setMembersModalProjectId,
    setShowMembersModal,
    setShowLibraryModal,

    // Auth & admin
    isAuthenticated,
    user,
    isAdmin,
    setShowLoginModal,
    setShowAdminModal,
    pendingSubmissions,

    // Connection health
    connectionHealth,

    // UI state
    isCCSPanelMinimized,
    setIsCCSPanelMinimized,
    showHelpPopover,
    setShowHelpPopover,
    settingsTab,
    setSettingsTab,
    setShowSettingsModal,
    aiEnabled,
  } = props;

  return (
    <header className="border-b border-parchment bg-background px-2 sm:px-4 py-1 grid grid-cols-[auto_1fr_auto] items-center gap-2 z-10 relative min-w-0">
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        <button
          onClick={onNavigateHome}
          className={cn(
            "font-display text-sm transition-colors",
            isAlphaVersion
              ? "text-yellow-600 hover:text-yellow-700 dark:text-yellow-500 dark:hover:text-yellow-400"
              : "text-ink hover:text-burgundy"
          )}
          title={isAlphaVersion ? "Alpha Test Version" : undefined}
        >
          <span className="hidden sm:inline">CCS Workbench</span>
          <span className="sm:hidden">CCS-WB</span>
        </button>
        {/* Mode badge - clickable to switch */}
        <div className="relative" data-dropdown>
          <button
            onClick={() => setShowModeDropdown(!showModeDropdown)}
            className={cn(
              "font-sans text-[10px] px-2 py-0.5 border rounded-sm transition-colors flex items-center gap-1",
              MODE_COLORS[session.mode] || "bg-slate-100 text-slate-700",
              "hover:opacity-80"
            )}
            title={`${MODE_DISPLAY_NAMES[session.mode] || session.mode} - Click to switch modes`}
          >
            {MODE_DISPLAY_NAMES[session.mode] || session.mode}
            <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", showModeDropdown && "rotate-180")} strokeWidth={1.5} />
          </button>
          {showModeDropdown && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-popover rounded-sm shadow-lg border border-parchment p-1 z-50">
              {(["critique", "interpret", "create"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    if (mode !== session.mode) {
                      switchMode(mode);
                    }
                    setShowModeDropdown(false);
                  }}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-[11px] rounded-sm transition-colors flex items-center justify-between",
                    session.mode === mode ? "bg-burgundy/10 text-burgundy" : "text-ink hover:bg-cream"
                  )}
                >
                  <span>{MODE_DISPLAY_NAMES[mode] || mode}</span>
                  {hasSavedSession(mode) && mode !== session.mode && (
                    <span className="text-[9px] text-slate-muted">(saved)</span>
                  )}
                </button>
              ))}
              <div className="border-t border-parchment mt-1 pt-1">
                <button
                  onClick={() => {
                    clearModeSession(session.mode);
                    setShowModeDropdown(false);
                  }}
                  className="w-full text-left px-2 py-1.5 text-[11px] text-slate-muted hover:text-error hover:bg-cream rounded-sm transition-colors"
                >
                  Clear Current Session
                </button>
              </div>
            </div>
          )}
        </div>
        {/* Experience level removed - now auto-derived from mode */}
      </div>

      {/* Center: Project/session name - shows cloud project name when connected, otherwise local session name */}
      {currentProjectId ? (
        // Cloud project: clickable name with info dropdown
        <div className="hidden sm:flex justify-center min-w-0" data-dropdown ref={projectInfoRef as React.RefObject<HTMLDivElement>}>
          <button
            onClick={() => setShowProjectInfo(!showProjectInfo)}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-sm transition-colors max-w-[220px]",
              showProjectInfo ? "bg-cream" : "hover:bg-cream"
            )}
            title="Click for project info"
          >
            <Cloud className="h-2.5 w-2.5 text-slate-muted flex-shrink-0" strokeWidth={1.5} />
            <div className="flex flex-col items-start min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-mono text-[10px] text-ink font-medium truncate max-w-[120px]">
                  {currentProject?.name || "Cloud Project"}
                </span>
              </div>
              {/* Owner initials or Public indicator and sync status */}
              <div className="flex items-center gap-1.5">
                {viewingLibraryProjectId ? (
                  <span className="font-sans text-[8px] text-emerald-600 font-medium">Public</span>
                ) : currentProject?.owner?.initials ? (
                  <span className="font-sans text-[8px] text-slate/60">{currentProject.owner.initials}</span>
                ) : null}
                {/* Inline sync status */}
                {isAuthenticated && (
                  <div className="flex items-center gap-0.5">
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full flex-shrink-0",
                      connectionHealth.health.status === "connected" && "bg-green-500",
                      connectionHealth.health.status === "reconnecting" && "bg-orange-500",
                      connectionHealth.health.status === "degraded" && "bg-yellow-500",
                      connectionHealth.health.status === "disconnected" && "bg-red-500"
                    )} />
                    <span className="font-sans text-[7px] text-slate/60 whitespace-nowrap">
                      {connectionHealth.health.status === "connected" && connectionHealth.health.pendingOperations > 0 ? "syncing" :
                       connectionHealth.health.status === "connected" ? "synced" :
                       connectionHealth.health.status === "reconnecting" ? "reconnecting" :
                       connectionHealth.health.status === "degraded" ? "slow" :
                       "offline"}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <ChevronDown className={cn("h-2.5 w-2.5 text-slate transition-transform flex-shrink-0", showProjectInfo && "rotate-180")} strokeWidth={1.5} />
          </button>

          {/* Project Info Dropdown */}
          {showProjectInfo && currentProject && (
            <div className={cn(
              "absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50",
              "w-[280px] py-2 px-3",
              "bg-card rounded-lg shadow-lg border border-parchment"
            )}>
              {/* Owner */}
              <div className="flex items-center gap-2 mb-2 text-[11px]">
                {user?.id === currentProject.owner_id ? (
                  <>
                    <Shield className="h-3 w-3 text-slate" />
                    <span className="text-ink font-medium">You own this project</span>
                  </>
                ) : currentProject.owner ? (
                  <>
                    <Users className="h-3 w-3 text-slate" />
                    <span className="text-slate">
                      Shared by <span className="text-ink">{currentProject.owner.display_name}</span>
                      {currentProject.owner.affiliation && (
                        <span className="text-slate/60"> ({currentProject.owner.affiliation})</span>
                      )}
                    </span>
                  </>
                ) : null}
              </div>

              {/* Description */}
              {currentProject.description && (
                <p className="text-[11px] text-slate mb-2 line-clamp-2">
                  {currentProject.description}
                </p>
              )}

              {/* Stats */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate/70 mb-2 py-2 border-t border-b border-parchment">
                <span className="flex items-center gap-1">
                  <FileCode className="h-3 w-3" />
                  {session.codeFiles.length} files
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquareText className="h-3 w-3" />
                  {session.lineAnnotations?.length || 0} annotations
                </span>
                <span className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium",
                  MODE_COLORS[currentProject.mode as keyof typeof MODE_COLORS] || "bg-slate/10 text-slate"
                )}>
                  {MODE_LABELS[currentProject.mode as keyof typeof MODE_LABELS] || currentProject.mode}
                </span>
              </div>

              {/* Dates */}
              <div className="flex flex-col gap-1 text-[10px] text-slate/70 mb-2">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Created: {new Date(currentProject.created_at).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Modified: {new Date(currentProject.updated_at).toLocaleDateString()}
                </span>
              </div>

              {/* Save status */}
              <div className="mb-3 pb-2 border-b border-parchment">
                <div className="text-[10px] text-slate-muted mb-0.5">Status:</div>
                <div className="text-[11px]">
                  {isSavingToCloud ? (
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Saving to cloud...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-green-600">
                      <Check className="h-3 w-3" />
                      <span>Saved to cloud</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {/* Download ZIP - available to all users */}
                <button
                  onClick={handleDownloadZip}
                  disabled={isDownloadingZip}
                  className={cn(
                    "w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded",
                    "text-[11px] font-medium text-slate",
                    "bg-slate/10 hover:bg-slate/20 transition-colors",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {isDownloadingZip ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  Download ZIP
                </button>

                {/* Rename Project - owners only */}
                {user?.id === currentProject.owner_id && (
                  isRenaming ? (
                    <div className="flex flex-col gap-1.5">
                      <input
                        ref={renameInputRef as React.RefObject<HTMLInputElement>}
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSubmitRename();
                          if (e.key === "Escape") handleCancelRename();
                        }}
                        placeholder="Project name"
                        className={cn(
                          "w-full px-2 py-1.5 rounded",
                          "text-[11px] text-ink",
                          "bg-card border border-parchment",
                          "focus:outline-none focus:ring-1 focus:ring-burgundy/30 focus:border-burgundy"
                        )}
                        disabled={isRenamingLoading}
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={handleCancelRename}
                          disabled={isRenamingLoading}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded",
                            "text-[10px] font-medium text-slate",
                            "bg-slate/10 hover:bg-slate/20 transition-colors",
                            "disabled:opacity-50"
                          )}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSubmitRename}
                          disabled={isRenamingLoading || !renameValue.trim()}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded",
                            "text-[10px] font-medium text-white",
                            "bg-burgundy hover:bg-burgundy-dark transition-colors",
                            "disabled:opacity-50"
                          )}
                        >
                          {isRenamingLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleStartRename}
                      className={cn(
                        "w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded",
                        "text-[11px] font-medium text-slate",
                        "bg-slate/10 hover:bg-slate/20 transition-colors"
                      )}
                    >
                      <Pencil className="h-3 w-3" />
                      Rename
                    </button>
                  )
                )}

                {/* Manage Members - owners only */}
                {user?.id === currentProject.owner_id && (
                  <button
                    onClick={() => {
                      setShowProjectInfo(false);
                      setMembersModalProjectId(currentProject.id);
                      setShowMembersModal(true);
                    }}
                    className={cn(
                      "w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded",
                      "text-[11px] font-medium text-burgundy",
                      "bg-burgundy/10 hover:bg-burgundy/20 transition-colors"
                    )}
                  >
                    <UserPlus className="h-3 w-3" />
                    Manage Members
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Local session: editable name with .ccs extension and local indicator
        <div className="hidden sm:flex justify-center min-w-0">
          <div className="relative" data-dropdown>
            <button
              onClick={() => {
                // Toggle dropdown if file is saved, otherwise rename
                if (autoSave.isSupported && session.fileHandles?.[session.id]) {
                  setShowProjectInfo(!showProjectInfo);
                } else {
                  const newName = prompt("Rename project:", projectName || "Untitled");
                  if (newName !== null && newName.trim()) {
                    setProjectName(newName.trim());
                  }
                }
              }}
              className="flex hover:bg-cream px-2 py-0.5 rounded-sm transition-colors items-center gap-1.5 min-w-0 max-w-[280px]"
              title={autoSave.isSupported && session.fileHandles?.[session.id] ? "Click for file info" : "Local session (click to rename)"}
            >
              <HardDrive className="h-3 w-3 text-slate-muted flex-shrink-0" strokeWidth={1.5} />
              <div className="flex items-center gap-1 min-w-0">
                {projectName ? (
                  <>
                    <span className="font-mono text-[10px] text-ink truncate">
                      {projectName.replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "-").toLowerCase()}.ccs
                    </span>
                    {autoSave.isSupported && session.fileHandles?.[session.id] && (
                      <span className="text-[9px] text-slate-muted whitespace-nowrap">
                        – saved to my computer
                      </span>
                    )}
                  </>
                ) : (
                  <span className="font-mono text-[10px] text-slate-muted italic whitespace-nowrap">
                    untitled.ccs
                  </span>
                )}
              </div>
            </button>
            {/* File info dropdown (only shown when file is saved) */}
            {showProjectInfo && autoSave.isSupported && session.fileHandles?.[session.id] && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 w-[280px] py-2 px-3 bg-card rounded-lg shadow-lg border border-parchment">
                {/* Filename */}
                <div className="mb-2">
                  <div className="text-[10px] text-slate-muted mb-0.5">Name:</div>
                  <div className="font-mono text-[11px] text-ink">
                    {projectName ? `${projectName.replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "-").toLowerCase()}.ccs` : "untitled.ccs"}
                  </div>
                </div>
                {/* Location (generic - API doesn't expose full path) */}
                <div className="mb-2">
                  <div className="text-[10px] text-slate-muted mb-0.5">Place:</div>
                  <div className="text-[11px] text-slate flex items-center gap-1">
                    <HardDrive className="h-3 w-3" strokeWidth={1.5} />
                    <span>Saved to my computer</span>
                  </div>
                  <div className="text-[9px] text-slate-muted mt-0.5">
                    (Browser security prevents showing full path)
                  </div>
                </div>
                {/* Save status */}
                <div className="mb-2">
                  <div className="text-[10px] text-slate-muted mb-0.5">Status:</div>
                  <div className="text-[11px]">
                    <SaveStatusIndicator
                      status={autoSave.saveStatus}
                      lastSaved={autoSave.lastSaved}
                      isDirty={autoSave.isDirty}
                      inline={false}
                    />
                  </div>
                </div>
                {/* Last saved timestamp */}
                {autoSave.lastSaved && (
                  <div>
                    <div className="text-[10px] text-slate-muted mb-0.5">Last saved:</div>
                    <div className="text-[11px] text-slate">
                      {new Date(autoSave.lastSaved).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
        {/* CCS Methods Panel Toggle - only show in Learn Methods mode */}
        {session.mode === 'interpret' && (
          <>
            <button
              onClick={() => setIsCCSPanelMinimized(!isCCSPanelMinimized)}
              className="p-2 md:p-1.5 text-slate hover:text-burgundy transition-colors"
              title={isCCSPanelMinimized ? "Show CCS Methods Guide" : "Hide CCS Methods Guide"}
            >
              {isCCSPanelMinimized ? (
                <Library className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <Library className="h-4 w-4" strokeWidth={2.5} />
              )}
            </button>
            <div className="w-px h-4 bg-parchment mx-0.5" />
          </>
        )}
        <input
          ref={sessionLoadInputRef as React.RefObject<HTMLInputElement>}
          type="file"
          className="hidden"
          accept=".ccs,.json"
          onChange={handleLoadSession}
        />
        <input
          ref={mergeAnnotationsInputRef as React.RefObject<HTMLInputElement>}
          type="file"
          className="hidden"
          accept=".ccs,.json"
          onChange={handleMergeAnnotationsFile}
        />
        <button
          onClick={() => setShowNewProjectModal(true)}
          disabled={!!currentProjectId}
          className={cn(
            "hidden sm:block p-2 md:p-1.5 transition-colors",
            currentProjectId
              ? "text-slate/40 cursor-not-allowed"
              : "text-slate hover:text-ink"
          )}
          title={currentProjectId ? "Exit cloud project to create new local session" : "New project"}
        >
          <FilePlus2 className="h-4 w-4" strokeWidth={1.5} />
        </button>
        {/* Save button with dropdown for Save/Save As */}
        <div className="relative" data-dropdown>
          <button
            onClick={() => setShowSaveDropdown(!showSaveDropdown)}
            className="p-2 md:p-1.5 text-slate hover:text-ink"
            title="Save session"
          >
            <Save className="h-4 w-4" strokeWidth={1.5} />
          </button>
          {showSaveDropdown && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-popover rounded-sm shadow-lg border border-parchment p-1 z-50">
              <button
                onClick={() => {
                  handleSaveSession();
                  setShowSaveDropdown(false);
                }}
                className="w-full text-left px-2 py-1.5 text-[11px] rounded-sm transition-colors text-ink hover:bg-cream"
              >
                Save
              </button>
              <button
                onClick={handleSaveAs}
                className="w-full text-left px-2 py-1.5 text-[11px] rounded-sm transition-colors text-ink hover:bg-cream"
              >
                Save As...
              </button>
              <div className="border-t border-parchment my-1" />
              <button
                onClick={handleSaveAsMarkdown}
                className="w-full text-left px-2 py-1.5 text-[11px] rounded-sm transition-colors text-ink hover:bg-cream"
              >
                <div>Save as Markdown...</div>
                <div className="text-[9px] text-slate-muted">– saved to my computer</div>
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => sessionLoadInputRef.current?.click()}
          disabled={!!currentProjectId}
          className={cn(
            "hidden sm:block p-2 md:p-1.5 transition-colors",
            currentProjectId
              ? "text-slate/40 cursor-not-allowed"
              : "text-slate hover:text-ink"
          )}
          title={currentProjectId ? "Exit cloud project to load local session" : "Load session"}
        >
          <FolderOpen className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => mergeAnnotationsInputRef.current?.click()}
          className="hidden sm:block p-2 md:p-1.5 text-slate hover:text-ink transition-colors"
          title="Merge annotations from a collaborator's .ccs file (additive; nothing is overwritten)"
        >
          <GitMerge className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <div className="hidden sm:block w-px h-4 bg-parchment mx-1" />
        <button onClick={() => setShowExportModal(true)} className="p-2 md:p-1.5 text-slate hover:text-ink" title="Export session log">
          <Download className="h-4 w-4" strokeWidth={1.5} />
        </button>
        {/* Cloud projects button */}
        <div className="relative" data-dropdown>
          <button
            onClick={() => {
              if (!isAuthenticated) {
                setShowLoginModal(true);
              } else {
                setShowCloudMenu(!showCloudMenu);
              }
            }}
            className={cn(
              "p-2 md:p-1.5 rounded-sm transition-colors",
              showCloudMenu
                ? "bg-cream"
                : "hover:bg-cream"
            )}
            title={
              !isAuthenticated
                ? "Sign in to collaborate"
                : currentProjectId
                  ? `Connected to ${currentProject?.name || "cloud project"}`
                  : "Not connected to cloud project"
            }
          >
            {/* CloudOff = logged out, Cloud = logged in, CloudCog = connected to project */}
            {!isAuthenticated ? (
              <CloudOff className="h-4 w-4 text-slate/40" strokeWidth={1.5} />
            ) : currentProjectId ? (
              <CloudCog className="h-4 w-4 text-ink" strokeWidth={1.5} />
            ) : (
              <Cloud className="h-4 w-4 text-slate" strokeWidth={1.5} />
            )}
          </button>
          {showCloudMenu && isAuthenticated && (
            <div className="absolute top-full right-0 mt-1 z-50 min-w-[220px] max-w-[280px] w-[280px] bg-popover rounded-sm shadow-lg border border-parchment p-1">
              {/* New Project section at top */}
              {isCreatingProject ? (
                <div className="px-2 py-2 border-b border-parchment">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Project name"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCreateProject();
                      } else if (e.key === "Escape") {
                        setIsCreatingProject(false);
                        setNewProjectName("");
                      }
                    }}
                    className={cn(
                      "w-full px-2 py-1 mb-2 text-[11px] text-ink",
                      "bg-cream border border-parchment rounded-sm",
                      "focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy"
                    )}
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={handleCreateProject}
                      disabled={!newProjectName.trim() || cloudActionLoading === "create"}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-sm",
                        "text-[11px]",
                        "bg-burgundy/10 text-burgundy hover:bg-burgundy/20",
                        "transition-colors disabled:opacity-50"
                      )}
                    >
                      {cloudActionLoading === "create" ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        "Create"
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setIsCreatingProject(false);
                        setNewProjectName("");
                      }}
                      className={cn(
                        "px-2 py-1.5 rounded-sm text-[11px]",
                        "text-slate-muted hover:text-ink hover:bg-cream",
                        "transition-colors"
                      )}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-2 py-1.5 flex items-center justify-between gap-2 border-b border-parchment">
                  <label className="flex items-center gap-1.5 cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={populateWithSession}
                        onChange={(e) => setPopulateWithSession(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className={cn(
                        "w-3 h-3 border rounded-sm transition-all",
                        populateWithSession
                          ? "bg-burgundy border-burgundy"
                          : "bg-cream border-parchment-dark group-hover:border-burgundy/50"
                      )}>
                        {populateWithSession && (
                          <svg className="w-full h-full text-ivory" viewBox="0 0 16 16" fill="none">
                            <path d="M4 8L7 11L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-[9px] text-slate-muted group-hover:text-ink transition-colors">
                      Keep current project
                    </span>
                  </label>
                  <button
                    onClick={() => setIsCreatingProject(true)}
                    disabled={!!currentProjectId}
                    title={currentProjectId ? "Leave current project first" : undefined}
                    className={cn(
                      "flex items-center justify-center gap-1 px-2 py-1.5 rounded-sm",
                      "text-[11px]",
                      "bg-burgundy/10 text-burgundy hover:bg-burgundy/20",
                      "transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    <Plus className="h-2.5 w-2.5" />
                    New
                  </button>
                </div>
              )}

              {/* Divider before projects list */}
              <div className="border-t border-parchment my-1" />

              {/* Browse Library button */}
              <button
                onClick={() => {
                  setShowLibraryModal(true);
                  setShowCloudMenu(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-sm",
                  "text-[11px] text-slate hover:text-ink hover:bg-cream",
                  "transition-colors"
                )}
              >
                <Library className="h-3 w-3" />
                Browse Library
              </button>

              {/* Submit to Library button - only for project owners with a current project */}
              {currentProjectId && currentProject && user?.id === currentProject.owner_id && (
                <button
                  onClick={async () => {
                    if (!currentProjectId) return;
                    setCloudActionLoading("submit-library");
                    const { error } = await submitForReview(currentProjectId);
                    if (error) {
                      console.error("Error submitting to library:", error);
                    }
                    setCloudActionLoading(null);
                    setShowCloudMenu(false);
                  }}
                  disabled={cloudActionLoading === "submit-library" || currentProject.accession_status !== "draft"}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-sm",
                    "text-[11px] transition-colors",
                    currentProject.accession_status === "draft"
                      ? "text-slate hover:text-ink hover:bg-cream"
                      : "text-slate/50 cursor-not-allowed",
                    "disabled:opacity-50"
                  )}
                  title={
                    currentProject.accession_status === "submitted"
                      ? "Already submitted for review"
                      : currentProject.accession_status === "approved"
                      ? "Already in library"
                      : "Submit this project to the public library"
                  }
                >
                  {cloudActionLoading === "submit-library" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <UploadCloud className="h-3 w-3" />
                  )}
                  {currentProject.accession_status === "submitted"
                    ? "Pending Review"
                    : currentProject.accession_status === "approved"
                    ? "In Library"
                    : "Submit to Library"}
                </button>
              )}

              {/* Divider before projects list */}
              <div className="border-t border-parchment my-1" />

              {/* Projects list */}
              <div className="max-h-[200px] overflow-y-auto">
                {isLoadingProjects ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-muted" />
                  </div>
                ) : projects.length === 0 ? (
                  <div className="px-2 py-3 text-center">
                    <p className="text-[11px] text-slate-muted">No projects yet</p>
                  </div>
                ) : (
                  projects.map((project) => {
                    const isCurrentProject = currentProjectId === project.id;
                    const isOwner = user?.id === project.owner_id;
                    return (
                      <div
                        key={project.id}
                        className={cn(
                          "flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm",
                          isCurrentProject
                            ? "bg-burgundy/15 border-l-2 border-burgundy"
                            : "hover:bg-cream"
                        )}
                      >
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          {/* Owner/member indicator */}
                          {isOwner ? (
                            <Shield className="h-2.5 w-2.5 text-slate/40 flex-shrink-0" />
                          ) : (
                            <User className="h-2.5 w-2.5 text-slate/40 flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "text-[11px] truncate font-medium",
                                  isCurrentProject ? "text-burgundy" : "text-ink"
                                )}
                                title={displayProjectName(project.name)}
                              >
                                {displayProjectName(project.name)}
                              </span>
                              {isCurrentProject && (
                                <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[8px] font-medium bg-burgundy text-white">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            {!isOwner && project.owner && (
                              <span className="text-[9px] text-slate-muted">
                                by {project.owner.display_name || project.owner.initials}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {/* Owner actions - only show for current project */}
                          {isCurrentProject && isOwner && (
                            <div className="flex items-center gap-1 mr-1.5 border-r border-parchment pr-2">
                              <button
                                onClick={() => {
                                  setMembersModalProjectId(project.id);
                                  setShowMembersModal(true);
                                  setShowCloudMenu(false);
                                }}
                                className={cn(
                                  "flex items-center justify-center p-1 rounded",
                                  "text-slate/40 hover:text-burgundy hover:bg-burgundy/5",
                                  "transition-colors cursor-pointer"
                                )}
                                title="Manage members"
                              >
                                <Users className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          {/* Join/Leave button */}
                          {isCurrentProject ? (
                            <button
                              onClick={async () => {
                                // Save using saveProject (includes README update)
                                if (currentProjectId) {
                                  await saveProject(currentProjectId, session);
                                }
                                setCurrentProjectId(null);
                                resetSession();
                                setShowCloudMenu(false);
                              }}
                              className={cn(
                                "flex items-center justify-center gap-1 px-2 py-1.5 rounded-sm",
                                "text-[11px] text-slate-muted hover:text-error hover:bg-cream",
                                "transition-colors"
                              )}
                            >
                              <LogOut className="h-2.5 w-2.5" />
                              Leave
                            </button>
                          ) : (
                            <button
                              onClick={() => handleLoadProject(project.id)}
                              disabled={!!cloudActionLoading || !!currentProjectId}
                              title={currentProjectId ? "Leave current project first" : undefined}
                              className={cn(
                                "flex items-center justify-center gap-1 px-2 py-1.5 rounded-sm",
                                "text-[11px] bg-burgundy/10 text-burgundy hover:bg-burgundy/20",
                                "dark:bg-burgundy/20 dark:text-burgundy-light dark:hover:bg-burgundy/30",
                                "transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              )}
                            >
                              {cloudActionLoading === `load-${project.id}` ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                <LogIn className="h-2.5 w-2.5" />
                              )}
                              Join
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Refresh icon (only when in a project) */}
              {currentProjectId && (
                <>
                  <div className="border-t border-parchment mt-1" />
                  <div className="flex items-center justify-center px-2 py-1.5">
                    <button
                      onClick={() => {
                        handleRefreshFromCloud();
                        setShowCloudMenu(false);
                      }}
                      disabled={isRefreshingFromCloud}
                      title="Refresh from cloud"
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-1 rounded-sm",
                        "text-[10px] text-slate-muted hover:text-ink",
                        "hover:bg-cream transition-colors",
                        "disabled:opacity-50"
                      )}
                    >
                      {isRefreshingFromCloud ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-2.5 w-2.5" />
                      )}
                      Refresh
                    </button>
                  </div>
                </>
              )}

              {/* Admin button - only for admins, at bottom of menu */}
              {isAdmin && (
                <>
                  <div className="border-t border-parchment my-1" />
                  <button
                    onClick={() => {
                      setShowAdminModal(true);
                      setShowCloudMenu(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm",
                      "text-[11px] text-slate hover:text-ink hover:bg-cream",
                      "transition-colors"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Shield className="h-3 w-3" />
                      Admin Panel
                    </span>
                    {pendingSubmissions.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                        {pendingSubmissions.length}
                      </span>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="hidden sm:block w-px h-4 bg-parchment mx-1" />
        {/* Help button - opens help popover (hidden on narrow screens) */}
        <div className="relative hidden sm:block">
          <button
            onClick={() => setShowHelpPopover(!showHelpPopover)}
            className={cn(
              "p-1.5 rounded-sm text-slate hover:text-ink hover:bg-cream transition-colors",
              showHelpPopover && "bg-cream text-ink"
            )}
            title="Interface guide"
          >
            <HelpCircle className="h-4 w-4" strokeWidth={1.5} />
          </button>
          {showHelpPopover && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowHelpPopover(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-80 bg-cream border border-parchment rounded-md shadow-lg p-4 text-xs">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-ink text-sm">Interface Guide</h3>
                  <button onClick={() => setShowHelpPopover(false)} className="text-slate hover:text-ink">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="space-y-3 text-slate-muted">
                  <div>
                    <h4 className="font-medium text-ink text-[11px] uppercase tracking-wide mb-1">Left Panel: Files</h4>
                    <p>File tree with colour-coded types. Click to select. Annotation summary at bottom shows counts by type.</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-ink text-[11px] uppercase tracking-wide mb-1">Centre Panel: Code Editor</h4>
                    <p><strong>Edit mode:</strong> Modify code directly.<br/>
                    <strong>Annotate mode:</strong> Click any line to add annotations (Obs, Q, Met, Pat, Ctx, Crit). Annotations fade until hovered.</p>
                  </div>
                  {aiEnabled && (
                    <div>
                      <h4 className="font-medium text-ink text-[11px] uppercase tracking-wide mb-1">Right Panel: AI Chat</h4>
                      <p>Dialogue with AI assistant. Guided prompts suggest phase-appropriate questions.</p>
                    </div>
                  )}
                  {aiEnabled && (
                    <div>
                      <h4 className="font-medium text-ink text-[11px] uppercase tracking-wide mb-1">AI Auto-Annotation (✨)</h4>
                      <p><strong>Sparkles button</strong> in annotation toolbar requests AI-suggested annotations.<br/>
                      <strong>Two-stage workflow:</strong> (1) Select annotation types to generate, (2) Review suggestions one-by-one with Add/Discard buttons.<br/>
                      <strong>Mode-specific:</strong> Analyze mode critiques, Learn mode teaches methods, Create mode suggests expansions.</p>
                    </div>
                  )}
                  <div>
                    <h4 className="font-medium text-ink text-[11px] uppercase tracking-wide mb-1">Annotation Types</h4>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <span><strong>Obs</strong> - Observation</span>
                      <span><strong>Q</strong> - Question</span>
                      <span><strong>Met</strong> - Metaphor</span>
                      <span><strong>Pat</strong> - Pattern</span>
                      <span><strong>Ctx</strong> - Context</span>
                      <span><strong>Crit</strong> - Critique</span>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-ink text-[11px] uppercase tracking-wide mb-1">Local vs Cloud Mode</h4>
                    <p className="mb-1.5"><strong>Local mode</strong> (💾 icon, italic filenames): Working on your device only. Changes saved locally as .ccs files. No internet required.</p>
                    <p><strong>Cloud mode</strong> (☁️ icon, normal filenames): Connected to a shared project. Changes sync automatically. Collaborate with others in real-time.</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-ink text-[11px] uppercase tracking-wide mb-1">Collaborating on Annotations</h4>
                    <p className="mb-1.5">There are two ways to collaborate, at different levels of complexity. Most people want the first.</p>
                    <p className="mb-1.5"><strong>1. Merge annotations (simple).</strong> The merge button (next to <em>Load session</em>) imports a collaborator&apos;s <code>.ccs</code> file into your session. You each annotate the same code separately, then combine. No sign-in, no internet, nothing of yours is overwritten. After merging, your session is the combined master and you&apos;ll be prompted to save it back out. This is the recommended workflow.</p>
                    <p><strong>2. Cloud sync (advanced).</strong> Real-time shared projects with sign-in and live sync — more powerful but heavier, and it needs a configured cloud backend. Configure (or turn off) in <strong>Settings → Cloud</strong>; when off, CCS-WB is a clean local-only workbench and no data is sent to or fetched from the cloud. Merge annotations (option 1) keeps working regardless of this switch.</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-ink text-[11px] uppercase tracking-wide mb-1">Shortcuts</h4>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <span><strong>⌘S</strong> - Save project</span>
                      <span><strong>⌘O</strong> - Open project</span>
                      <span><strong>⌘E</strong> - Export log</span>
                      <span><strong>⌘/</strong> - Focus chat</span>
                      <span><strong>⌘F</strong> - Search code</span>
                      <span><strong>⌘⇧F</strong> - Search chat</span>
                    </div>
                  </div>
                  {/* Easter egg hint */}
                  <p className="text-[9px] text-slate-muted/50 italic mt-2 pt-2 border-t border-parchment/50">
                    It looks like you&apos;re reading the help.{" "}
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent("toggle-clippy"))}
                      className="underline hover:text-slate-muted cursor-pointer"
                    >
                      Would you like help with that?
                    </button>
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
        {/* Settings button - opens full settings modal */}
        <button
          onClick={() => {
            setSettingsTab("appearance");
            setShowSettingsModal(true);
          }}
          className="p-2 md:p-1.5 rounded-sm text-slate hover:text-ink hover:bg-cream transition-colors"
          title="Settings"
        >
          <Settings className="h-4 w-4" strokeWidth={1.5} />
        </button>
        {/* User menu - shows avatar dropdown when logged in */}
        <UserMenu
          className="ml-1"
          onProfileClick={() => {
            setSettingsTab("profile");
            setShowSettingsModal(true);
          }}
        />
      </div>
    </header>
  );
});
