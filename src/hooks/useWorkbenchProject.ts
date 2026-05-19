/**
 * Project management hook extracted from WorkbenchLayout
 * Handles save/load, cloud operations, export, rename, and project lifecycle
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { Session, EntryMode } from "@/types";
import type { LineAnnotation } from "@/types/session";
import type { UseAutoSaveReturn } from "@/hooks/useAutoSave";
import { computeAnnotationMerge, describeMerge } from "@/lib/sync/file-merge";
import { generateAnnotatedCode } from "@/components/code";
import {
  generateSessionLog,
  exportSessionLogJSON,
  exportSessionLogText,
  exportSessionLogMarkdown,
  exportSessionLogPDF,
} from "@/lib/export";
import JSZip from "jszip";

interface UseWorkbenchProjectParams {
  session: Session;
  autoSave: UseAutoSaveReturn;
  codeContents: Map<string, string>;
  codePanelWidth: number;
  chatCollapsed: boolean;
  profile: any;
  // From useCollaborativeSession
  importSession: (data: any) => void;
  mergeLineAnnotations: (payload: { toAdd: LineAnnotation[]; replyMerges: Array<{ annotationId: string; newReplies: import("@/types/session").AnnotationReplyData[] }> }) => void;
  clearModeSession: (mode: EntryMode) => void;
  isInProject: boolean;
  refreshFromCloud: () => Promise<{ success?: boolean; error?: any }>;
  saveAllToCloud: () => Promise<{ error?: any }>;
  // From useProjects
  currentProjectId: string | null;
  projects: any[];
  saveProject: (id: string, session: Session) => Promise<{ error?: any }>;
  loadProject: (id: string) => Promise<{ session: Session | null; error: Error | null }>;
  createProject: (name: string, description?: string, mode?: EntryMode) => Promise<{ project?: any; initialSession?: any; error?: any }>;
  setCurrentProjectId: (id: string | null) => void;
  renameProject: (id: string, name: string) => Promise<{ error?: any }>;
  getProjectMembers: (id: string) => Promise<{ members?: any[] }>;
  refreshProjects: () => void;
  fetchPendingSubmissions: () => void;
  // From useProjectSync
  markLocalUpdate: () => void;
  // From useAuth
  isAuthenticated: boolean;
  isAdmin: boolean;
  // External state setters (cross-hook callbacks)
  setFavouriteMessages: (fn: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  setCodePanelWidth: (width: number) => void;
  setChatCollapsed: (collapsed: boolean) => void;
  initializeOriginalContents: (contents: Map<string, string>) => void;
  setShowSettingsModal: (show: boolean) => void;
  setSuccessMessage: (msg: string | null) => void;
  DEFAULT_CODE_PANEL_WIDTH: number;
}

export function useWorkbenchProject({
  session,
  autoSave,
  codeContents,
  codePanelWidth,
  chatCollapsed,
  profile,
  importSession,
  mergeLineAnnotations,
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
  setSuccessMessage,
  DEFAULT_CODE_PANEL_WIDTH,
}: UseWorkbenchProjectParams) {
  // State
  const [projectName, setProjectName] = useState<string>("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [populateWithSession, setPopulateWithSession] = useState(false);
  const [cloudActionLoading, setCloudActionLoading] = useState<string | null>(null);
  const [showCloudMenu, setShowCloudMenu] = useState(false);
  const [showSaveDropdown, setShowSaveDropdown] = useState(false);
  const [isSavingToCloud, setIsSavingToCloud] = useState(false);
  const [isRefreshingFromCloud, setIsRefreshingFromCloud] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const [projectMemberCount, setProjectMemberCount] = useState<number>(0);
  const [projectMembers, setProjectMembers] = useState<Array<{ user_id: string; initials?: string; avatar_url?: string; display_name?: string; role: string }>>([]);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isRenamingLoading, setIsRenamingLoading] = useState(false);

  // Refs
  const sessionLoadInputRef = useRef<HTMLInputElement>(null);
  const mergeAnnotationsInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const projectInfoRef = useRef<HTMLDivElement>(null);

  // Derived
  const currentProject = useMemo(() =>
    currentProjectId ? projects.find((p: any) => p.id === currentProjectId) : null,
    [currentProjectId, projects]
  );

  // Session ref for hasUnsavedChanges
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Project name ref for imperative handle
  const projectNameRef = useRef(projectName);
  projectNameRef.current = projectName;

  // Sync project name with saved filename when available
  useEffect(() => {
    if (autoSave.savedFileName && !projectName) {
      setProjectName(autoSave.savedFileName);
    }
  }, [autoSave.savedFileName, projectName]);

  // Refresh projects when cloud menu opens
  useEffect(() => {
    if (showCloudMenu && isAuthenticated) {
      refreshProjects();
    }
  }, [showCloudMenu, isAuthenticated, refreshProjects]);

  // Poll pending submissions for admin badge
  useEffect(() => {
    if (!isAdmin || !isAuthenticated) return;
    fetchPendingSubmissions();
    const interval = setInterval(() => {
      fetchPendingSubmissions();
    }, 60000);
    return () => clearInterval(interval);
  }, [isAdmin, isAuthenticated, fetchPendingSubmissions]);

  // Fetch project members
  useEffect(() => {
    if (!currentProjectId || !isAuthenticated) {
      setProjectMemberCount(0);
      setProjectMembers([]);
      return;
    }

    const fetchMembers = async () => {
      const { members } = await getProjectMembers(currentProjectId);
      const memberList = members || [];
      setProjectMemberCount(memberList.length);
      setProjectMembers(memberList.map((m: any) => ({
        user_id: m.user_id,
        initials: m.profile?.initials || undefined,
        avatar_url: m.profile?.avatar_url || undefined,
        display_name: m.profile?.display_name || m.profile?.initials || 'Member',
        role: m.role
      })));
    };

    fetchMembers();
  }, [currentProjectId, isAuthenticated, getProjectMembers]);

  // Reset project state when session changes
  const prevSessionIdRef = useRef(session.id);
  useEffect(() => {
    if (session.id !== prevSessionIdRef.current) {
      setProjectName("");
      prevSessionIdRef.current = session.id;
    }
  }, [session.id]);

  // Save session
  const handleSaveSession = useCallback(async () => {
    if (currentProjectId) {
      setIsSavingToCloud(true);
      try {
        console.log("[handleSaveSession] Saving to cloud:", currentProjectId);
        markLocalUpdate();
        const { error } = await saveProject(currentProjectId, session);
        if (error) {
          console.error("Failed to save to cloud:", error);
        } else {
          console.log("[handleSaveSession] Saved to cloud successfully");
        }
      } finally {
        setIsSavingToCloud(false);
      }
      return;
    }

    if (autoSave.isSupported) {
      const sessionFileId = session.id;
      const hasFileHandle = session.fileHandles?.[sessionFileId];

      if (hasFileHandle) {
        await autoSave.save();
      } else {
        const suggestedName = `${(projectName || "untitled").replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "-").toLowerCase()}.ccs`;
        const savedFileName = await autoSave.requestNewFile(suggestedName);
        if (savedFileName) {
          setProjectName(savedFileName);
        }
      }
    } else {
      setSaveModalName(projectName || "Untitled");
      setShowSaveModal(true);
    }
  }, [projectName, session.id, session.fileHandles, autoSave, currentProjectId, saveProject, markLocalUpdate]);

  // Save As
  const handleSaveAs = useCallback(async () => {
    if (currentProjectId || !autoSave.isSupported) {
      setSaveModalName(projectName || currentProject?.name || "Untitled");
      setShowSaveModal(true);
      setShowSaveDropdown(false);
      return;
    }

    const suggestedName = `${(projectName || "untitled").replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "-").toLowerCase()}.ccs`;
    const savedFileName = await autoSave.requestNewFile(suggestedName);
    if (savedFileName) {
      setProjectName(savedFileName);
    }
    setShowSaveDropdown(false);
  }, [projectName, autoSave, currentProjectId, currentProject]);

  // Save as Markdown
  const handleSaveAsMarkdown = useCallback(() => {
    const log = generateSessionLog(session, projectName, codeContents, generateAnnotatedCode, profile);
    exportSessionLogMarkdown(log, projectName);
    setShowSaveDropdown(false);
  }, [session, projectName, codeContents, profile]);

  // Save to cloud
  const handleSaveToCloud = useCallback(async () => {
    if (!currentProjectId) return;
    setIsSavingToCloud(true);
    try {
      console.log("handleSaveToCloud: Saving to Supabase", currentProjectId);
      markLocalUpdate();
      const { error } = await saveProject(currentProjectId, session);
      if (error) {
        console.error("Failed to save to cloud:", error);
      } else {
        console.log("handleSaveToCloud: Saved successfully");
      }
    } finally {
      setIsSavingToCloud(false);
    }
  }, [currentProjectId, session, saveProject, markLocalUpdate]);

  // Refresh from cloud
  const handleRefreshFromCloud = useCallback(async () => {
    if (!currentProjectId) return;
    setIsRefreshingFromCloud(true);
    try {
      console.log("handleRefreshFromCloud: Refreshing from Supabase", currentProjectId);
      const { success, error } = await refreshFromCloud();
      if (error) {
        console.error("Failed to refresh from cloud:", error);
      } else if (success) {
        console.log("handleRefreshFromCloud: Refreshed successfully");
      }
    } finally {
      setIsRefreshingFromCloud(false);
    }
  }, [currentProjectId, refreshFromCloud]);

  // Download project as ZIP
  const handleDownloadZip = useCallback(async () => {
    if (!currentProject) return;
    setIsDownloadingZip(true);
    try {
      const zip = new JSZip();

      for (const file of session.codeFiles) {
        const content = codeContents.get(file.id) || "";
        zip.file(file.name, content);
      }

      if (session.lineAnnotations && session.lineAnnotations.length > 0) {
        const annotationsByFile = new Map<string, typeof session.lineAnnotations>();
        for (const annotation of session.lineAnnotations) {
          const existing = annotationsByFile.get(annotation.codeFileId) || [];
          existing.push(annotation);
          annotationsByFile.set(annotation.codeFileId, existing);
        }

        let annotationsContent = `# Annotations for ${currentProject.name}\n\n`;
        annotationsContent += `Generated: ${new Date().toISOString()}\n\n`;

        for (const file of session.codeFiles) {
          const fileAnnotations = annotationsByFile.get(file.id);
          if (fileAnnotations && fileAnnotations.length > 0) {
            annotationsContent += `## ${file.name}\n\n`;
            const sorted = [...fileAnnotations].sort((a, b) => a.lineNumber - b.lineNumber);
            for (const ann of sorted) {
              annotationsContent += `**Line ${ann.lineNumber}** [${ann.type}]${ann.addedBy ? ` (${ann.addedBy})` : ""}\n`;
              annotationsContent += `> ${ann.content}\n\n`;
            }
          }
        }

        zip.file("annotations.md", annotationsContent);
      }

      const metadata = {
        name: currentProject.name,
        description: currentProject.description || "",
        mode: currentProject.mode,
        created_at: currentProject.created_at,
        updated_at: currentProject.updated_at,
        exported_at: new Date().toISOString(),
        files: session.codeFiles.length,
        annotations: session.lineAnnotations?.length || 0,
      };
      zip.file("project.json", JSON.stringify(metadata, null, 2));

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentProject.name.replace(/[^a-z0-9]/gi, "_")}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setShowProjectInfo(false);
    } catch (error) {
      console.error("Failed to create ZIP:", error);
    } finally {
      setIsDownloadingZip(false);
    }
  }, [currentProject, session.codeFiles, session.lineAnnotations, codeContents]);

  // Rename handlers
  const handleStartRename = useCallback(() => {
    if (currentProject) {
      setRenameValue(currentProject.name);
      setIsRenaming(true);
      setTimeout(() => renameInputRef.current?.focus(), 0);
    }
  }, [currentProject]);

  const handleCancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameValue("");
  }, []);

  const handleSubmitRename = useCallback(async () => {
    if (!currentProject || !renameValue.trim() || renameValue.trim() === currentProject.name) {
      setIsRenaming(false);
      return;
    }
    setIsRenamingLoading(true);
    try {
      const { error } = await renameProject(currentProject.id, renameValue.trim());
      if (error) {
        console.error("Failed to rename project:", error);
      } else {
        setIsRenaming(false);
        setRenameValue("");
      }
    } finally {
      setIsRenamingLoading(false);
    }
  }, [currentProject, renameValue, renameProject]);

  // Load a cloud project
  const handleLoadProject = useCallback(async (projectId: string) => {
    setCloudActionLoading(`load-${projectId}`);
    try {
      const { session: loadedSession, error } = await loadProject(projectId);
      if (error) {
        console.error("Failed to load project:", error);
      } else if (loadedSession) {
        importSession(loadedSession);
      }
      setShowCloudMenu(false);
    } finally {
      setCloudActionLoading(null);
    }
  }, [loadProject, importSession]);

  // Create a new cloud project
  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) return;
    setCloudActionLoading("create");
    try {
      const { project, initialSession, error } = await createProject(
        newProjectName.trim(),
        undefined,
        session.mode
      );

      if (error) {
        console.error("Failed to create project:", error);
      } else if (project) {
        if (populateWithSession) {
          await saveProject(project.id, session);
        } else if (initialSession) {
          importSession(initialSession as Session);
        }
        setCurrentProjectId(project.id);
        markLocalUpdate();
      }

      setNewProjectName("");
      setIsCreatingProject(false);
      setPopulateWithSession(false);
      setShowCloudMenu(false);
    } finally {
      setCloudActionLoading(null);
    }
  }, [newProjectName, session, createProject, saveProject, setCurrentProjectId, markLocalUpdate, populateWithSession, importSession]);

  // Confirm save from modal (download as .ccs file)
  const handleConfirmSave = useCallback(() => {
    const name = saveModalName.trim();
    if (!name) return;

    setProjectName(name);

    const exportData = {
      ...session,
      projectName: name,
      codeContentsMap: session.codeContents,
      exportedAt: new Date().toISOString(),
      version: "1.3",
      layoutState: {
        codePanelWidth,
        chatCollapsed,
      },
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeFileName = name.replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "-").toLowerCase();
    a.download = `${safeFileName}.ccs`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setShowSaveModal(false);
  }, [session, saveModalName, codePanelWidth, chatCollapsed]);

  // New project
  const handleNewProject = useCallback(() => {
    clearModeSession(session.mode);
    setProjectName("");
    setFavouriteMessages(new Set());
    setCodePanelWidth(DEFAULT_CODE_PANEL_WIDTH);
    setChatCollapsed(false);
    setShowNewProjectModal(false);
  }, [clearModeSession, session.mode, setFavouriteMessages, setCodePanelWidth, setChatCollapsed, DEFAULT_CODE_PANEL_WIDTH]);

  // Has unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    const currentSession = sessionRef.current;
    const hasUserMessages = currentSession.messages.some(m => m.role === 'user');
    const hasCode = currentSession.codeFiles.length > 0;
    const hasAnalysis = currentSession.analysisResults.length > 0;
    const hasRefs = currentSession.references.length > 0;
    const hasOutputs = currentSession.critiqueArtifacts.length > 0;
    const hasAnnotations = currentSession.lineAnnotations.length > 0;
    return hasUserMessages || hasCode || hasAnalysis || hasRefs || hasOutputs || hasAnnotations;
  }, []);

  // Load session from .ccs file
  const handleLoadSession = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedData = JSON.parse(content);

        if (!importedData.id) {
          throw new Error("Invalid session file format");
        }

        importSession(importedData);

        if (importedData.projectName) {
          setProjectName(importedData.projectName);
        }

        // Store loaded code contents as original contents for modification tracking
        const loadedContents = importedData.codeContents || importedData.codeContentsMap || {};
        const newOriginals = new Map<string, string>();
        Object.entries(loadedContents).forEach(([fileId, contentVal]) => {
          if (typeof contentVal === 'string') {
            newOriginals.set(fileId, contentVal);
          }
        });
        initializeOriginalContents(newOriginals);

        // Restore favourite messages
        const favourites = new Set<string>(
          importedData.messages?.filter((m: { isFavourite?: boolean }) => m.isFavourite).map((m: { id: string }) => m.id) || []
        );
        setFavouriteMessages(favourites);

        // Restore layout state if present (v1.3+)
        if (importedData.layoutState) {
          if (typeof importedData.layoutState.codePanelWidth === 'number') {
            setCodePanelWidth(importedData.layoutState.codePanelWidth);
          }
          if (typeof importedData.layoutState.chatCollapsed === 'boolean') {
            setChatCollapsed(importedData.layoutState.chatCollapsed);
          }
        }
      } catch (error) {
        console.error("Load error:", error);
        alert("Failed to load session. Please check the file format.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }, [importSession, setFavouriteMessages, setCodePanelWidth, setChatCollapsed, initializeOriginalContents]);

  // Merge annotations from another collaborator's .ccs file into the
  // current session (asynchronous file-based collaboration, tier A).
  // Additive only: never deletes or overwrites local annotations.
  const handleMergeAnnotationsFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedData = JSON.parse(content);

        if (!importedData || typeof importedData !== "object") {
          throw new Error("Invalid .ccs file");
        }

        const summary = computeAnnotationMerge(
          {
            codeFiles: session.codeFiles,
            codeContents: session.codeContents,
            lineAnnotations: session.lineAnnotations,
          },
          importedData
        );

        if (
          summary.toAdd.length === 0 &&
          summary.repliesAdded === 0
        ) {
          alert(
            `Nothing to merge. ${describeMerge(summary)}` +
              (summary.unmatchedFiles.length > 0
                ? `\n\nUnmatched files: ${summary.unmatchedFiles.join(", ")}`
                : "")
          );
          return;
        }

        const proceed = window.confirm(
          `Merge annotations from "${file.name}"?\n\n${describeMerge(summary)}` +
            (summary.unmatchedFiles.length > 0
              ? `\n\nFiles in the import with no match here (skipped): ${summary.unmatchedFiles.join(", ")}`
              : "") +
            `\n\nThis only adds annotations; nothing local is changed or removed.`
        );
        if (!proceed) return;

        mergeLineAnnotations({ toAdd: summary.toAdd, replyMerges: summary.replyMerges });
        setSuccessMessage(
          `Merged ${summary.toAdd.length} annotation${summary.toAdd.length === 1 ? "" : "s"}` +
            (summary.repliesAdded > 0 ? ` and ${summary.repliesAdded} repl${summary.repliesAdded === 1 ? "y" : "ies"}` : "") +
            (summary.flaggedForReview > 0 ? ` (${summary.flaggedForReview} flagged for review)` : "")
        );
      } catch (error) {
        console.error("Merge error:", error);
        alert("Failed to merge annotations. Please check the file is a valid .ccs export.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }, [session.codeFiles, session.codeContents, session.lineAnnotations, mergeLineAnnotations, setSuccessMessage]);

  // Export handlers
  const handleExportJSON = useCallback(() => {
    const log = generateSessionLog(session, projectName, codeContents, generateAnnotatedCode, profile);
    exportSessionLogJSON(log, projectName);
    setShowExportModal(false);
  }, [session, projectName, codeContents, profile]);

  const handleExportText = useCallback(() => {
    const log = generateSessionLog(session, projectName, codeContents, generateAnnotatedCode, profile);
    exportSessionLogText(log, projectName);
    setShowExportModal(false);
  }, [session, projectName, codeContents, profile]);

  const handleExportPDF = useCallback(() => {
    const log = generateSessionLog(session, projectName, codeContents, generateAnnotatedCode, profile);
    const annotationIndent = session.displaySettings?.annotations?.indent ?? 56;
    exportSessionLogPDF(log, projectName, annotationIndent);
    setShowExportModal(false);
  }, [session, projectName, codeContents, profile]);

  return {
    // State
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
    // Refs
    sessionLoadInputRef,
    mergeAnnotationsInputRef,
    renameInputRef,
    projectInfoRef,
    // Derived
    currentProject,
    projectNameRef,
    // Handlers
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
    handleMergeAnnotationsFile,
    handleExportJSON,
    handleExportText,
    handleExportPDF,
  };
}
