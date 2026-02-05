"use client";

/**
 * useCollaborativeSession Hook
 *
 * Wraps SessionContext with real-time collaboration features.
 * Syncs annotations and code files to Supabase when a project is active.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { useProjects } from "@/context/ProjectsContext";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/context/AppSettingsContext";
import { useAnnotationsSync } from "./useAnnotationsSync";
import { useCodeFilesSync, type TrashedCodeFile } from "./useCodeFilesSync";
import type { LineAnnotation, CodeReference } from "@/types/session";

// Local CodeFile interface for sync
interface CodeFile {
  id: string;
  name: string;
  language: string;
  content: string;
  originalContent?: string;
}

interface PendingDeletion {
  id: string;
  file_id: string;
  project_id: string;
  requested_by: string | null;
  filename: string;
  created_at: string;
  expires_at: string;
}

// Simple hash for change detection
function hashContentSimple(content: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(content.length, 1000); i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash |= 0;
  }
  return `${content.length}:${hash}`;
}

export function useCollaborativeSession() {
  const sessionContext = useSession();
  const { currentProjectId } = useProjects();
  const { user, profile: authProfile } = useAuth();
  const { profile: appProfile, getDisplayName } = useAppSettings();
  const [pendingFileDeletions, setPendingFileDeletions] = useState<PendingDeletion[]>([]);
  // Track annotation IDs that just arrived from remote (for animation)
  const [newRemoteAnnotationIds, setNewRemoteAnnotationIds] = useState<Set<string>>(new Set());
  // File trash state
  const [trashedFiles, setTrashedFiles] = useState<TrashedCodeFile[]>([]);
  const [isLoadingFileTrash, setIsLoadingFileTrash] = useState(false);

  // Get user initials - prefer manually-set app profile initials (from Settings), fall back to auth profile (auto-generated)
  // If profile hasn't loaded yet, generate fallback initials from user metadata or email
  // getDisplayName() returns initials > name from AppSettings, with proper empty string handling
  const appInitials = getDisplayName();
  const fallbackInitials = user
    ? (user.user_metadata?.full_name || user.email?.split("@")[0] || "User")
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 3)
    : undefined;
  const userInitials = appInitials || authProfile?.initials || fallbackInitials;

  // Track annotation IDs we know are synced (from remote or pushed by us)
  const syncedAnnotationIdsRef = useRef<Set<string>>(new Set());
  // Track file state for sync (id -> {name, content hash})
  const syncedFilesRef = useRef<Map<string, { name: string; contentHash: string }>>(new Map());
  // Track newly added file IDs that need syncing once content is set
  const pendingNewFilesRef = useRef<Set<string>>(new Set());

  // Track whether we're in a project
  const isInProject = !!currentProjectId;

  // Track the last project ID to detect project changes
  const lastProjectIdRef = useRef<string | null>(null);

  // Initialize sync tracking when joining a project or when project changes
  // This ensures files loaded from database are marked as "already synced"
  useEffect(() => {
    if (currentProjectId !== lastProjectIdRef.current) {
      lastProjectIdRef.current = currentProjectId;

      if (currentProjectId) {
        // Joining a project - initialize sync tracking from current session state
        console.log("useCollaborativeSession: Initializing sync tracking for project", currentProjectId);

        // Clear old tracking
        syncedFilesRef.current.clear();
        syncedAnnotationIdsRef.current.clear();
        pendingNewFilesRef.current.clear();

        // Mark all current files as synced (they came from DB via loadProject)
        const currentFiles = sessionContext.session.codeFiles;
        const currentContents = sessionContext.session.codeContents;
        for (const file of currentFiles) {
          const content = currentContents[file.id];
          if (content !== undefined) {
            syncedFilesRef.current.set(file.id, {
              name: file.name,
              contentHash: hashContentSimple(content),
            });
          }
        }

        // Mark all current annotations as synced
        for (const annotation of sessionContext.session.lineAnnotations) {
          syncedAnnotationIdsRef.current.add(annotation.id);
        }

        console.log(`useCollaborativeSession: Initialized with ${syncedFilesRef.current.size} files, ${syncedAnnotationIdsRef.current.size} annotations`);
      } else {
        // Left project - clear tracking
        console.log("useCollaborativeSession: Clearing sync tracking (left project)");
        syncedFilesRef.current.clear();
        syncedAnnotationIdsRef.current.clear();
        pendingNewFilesRef.current.clear();
      }
    }
  }, [currentProjectId, sessionContext.session.codeFiles, sessionContext.session.codeContents, sessionContext.session.lineAnnotations]);

  // Build file ID map (local id -> local id for now, can be extended for DB sync)
  const fileIdMap = Object.fromEntries(
    sessionContext.session.codeFiles.map((f) => [f.id, f.id])
  );

  // Ref for animation timeout cleanup
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle remote annotation changes
  const handleRemoteAnnotationChange = useCallback(
    (annotations: LineAnnotation[]) => {
      const remoteIds = new Set(annotations.map((a) => a.id));

      // Get local annotations
      const localAnnotations = sessionContext.session.lineAnnotations;
      const localIds = new Set(localAnnotations.map(a => a.id));

      // Detect truly NEW annotations (in remote but not in local)
      const newIds = annotations
        .filter(a => !localIds.has(a.id))
        .map(a => a.id);

      // If there are new remote annotations, trigger animation
      if (newIds.length > 0) {
        console.log("handleRemoteAnnotationChange: New remote annotations:", newIds);
        setNewRemoteAnnotationIds(new Set(newIds));

        // Clear the animation after it completes (1.5 seconds)
        if (animationTimeoutRef.current) {
          clearTimeout(animationTimeoutRef.current);
        }
        animationTimeoutRef.current = setTimeout(() => {
          setNewRemoteAnnotationIds(new Set());
        }, 1500);
      }

      // Detect reply changes (added or deleted)
      const replyChanges = annotations
        .map(remote => {
          const local = localAnnotations.find(l => l.id === remote.id);
          if (!local) return null;
          const localReplyCount = local.replies?.length || 0;
          const remoteReplyCount = remote.replies?.length || 0;
          if (localReplyCount !== remoteReplyCount) {
            return {
              annotationId: remote.id,
              localCount: localReplyCount,
              remoteCount: remoteReplyCount,
              change: remoteReplyCount > localReplyCount ? 'added' : 'deleted'
            };
          }
          return null;
        })
        .filter(Boolean);

      if (replyChanges.length > 0) {
        console.log("handleRemoteAnnotationChange: Reply changes detected:", replyChanges);
      }

      // Mark all remote annotations as synced
      annotations.forEach(a => syncedAnnotationIdsRef.current.add(a.id));

      // Keep only local annotations that:
      // 1. Don't exist in remote (not yet synced to server), AND
      // 2. Haven't been synced before (truly new local additions)
      // This ensures deleted remote annotations are removed locally
      const localOnly = localAnnotations.filter((a) =>
        !remoteIds.has(a.id) && !syncedAnnotationIdsRef.current.has(a.id)
      );

      // Remove deleted annotations from synced tracking
      for (const id of syncedAnnotationIdsRef.current) {
        if (!remoteIds.has(id)) {
          syncedAnnotationIdsRef.current.delete(id);
        }
      }

      // Merge: truly-local-only + all remote
      const merged = [...localOnly, ...annotations];

      // Update session by importing (this will replace all annotations)
      sessionContext.importSession({
        ...sessionContext.session,
        lineAnnotations: merged,
      });
    },
    [sessionContext]
  );

  // Use annotations sync
  const {
    pushAnnotation,
    deleteAnnotation: deleteAnnotationFromDb,
    pushReply,
    deleteReply,
    fetchRemoteAnnotations,
    isConnected: annotationsConnected,
  } = useAnnotationsSync({
    localAnnotations: sessionContext.session.lineAnnotations,
    onRemoteChange: handleRemoteAnnotationChange,
    fileIdMap,
    enabled: isInProject,
  });

  // Handle file added or updated by collaborator
  const handleFileAddedOrUpdated = useCallback(
    (file: CodeFile) => {
      const currentSession = sessionContext.session;
      const existingFile = currentSession.codeFiles.find((f) => f.id === file.id);
      const contentHash = hashContentSimple(file.content);

      if (existingFile) {
        // Update existing file (rename or content change)
        const updatedFiles = currentSession.codeFiles.map((f) =>
          f.id === file.id
            ? { ...f, name: file.name, language: file.language }
            : f
        );

        sessionContext.importSession({
          ...currentSession,
          codeFiles: updatedFiles,
          codeContents: {
            ...currentSession.codeContents,
            [file.id]: file.content,
          },
        });
      } else {
        // Add new file with its original ID (preserves collaborator's ID)
        sessionContext.importSession({
          ...currentSession,
          codeFiles: [
            ...currentSession.codeFiles,
            {
              id: file.id,
              name: file.name,
              language: file.language,
              source: "shared",
              size: file.content.length,
              uploadedAt: new Date().toISOString(),
            },
          ],
          codeContents: {
            ...currentSession.codeContents,
            [file.id]: file.content,
          },
        });
      }

      // Mark this file as synced so we don't push it back to Supabase
      syncedFilesRef.current.set(file.id, { name: file.name, contentHash });
    },
    [sessionContext]
  );

  // Handle file deleted by collaborator
  const handleFileDeleted = useCallback(
    (fileId: string) => {
      const currentSession = sessionContext.session;
      const exists = currentSession.codeFiles.some((f) => f.id === fileId);
      if (!exists) return;

      // Remove file locally
      const updatedFiles = currentSession.codeFiles.filter((f) => f.id !== fileId);
      const { [fileId]: _, ...updatedContents } = currentSession.codeContents;

      sessionContext.importSession({
        ...currentSession,
        codeFiles: updatedFiles,
        codeContents: updatedContents,
      });

      // Remove from synced tracking
      syncedFilesRef.current.delete(fileId);
    },
    [sessionContext]
  );

  // Handle deletion request from collaborator
  const handleDeletionRequested = useCallback((deletion: PendingDeletion) => {
    console.log("handleDeletionRequested:", deletion.filename);
    setPendingFileDeletions((prev) => [...prev, deletion]);
  }, []);

  // Handle deletion rejected
  const handleDeletionRejected = useCallback((fileId: string) => {
    console.log("handleDeletionRejected:", fileId);
    // File was restored, nothing to do locally
  }, []);

  // Use code files sync
  const {
    saveCodeFile,
    deleteCodeFile,
    requestFileDeletion,
    confirmDeletion,
    rejectDeletion,
    fetchCodeFiles,
    pendingDeletions,
    isConnected: filesConnected,
    // File trash functions
    fetchTrashedFiles,
    restoreFile,
    permanentlyDeleteFile,
    emptyFileTrash,
  } = useCodeFilesSync({
    onFileAdded: handleFileAddedOrUpdated,
    onFileDeleted: handleFileDeleted,
    onDeletionRequested: handleDeletionRequested,
    onDeletionRejected: handleDeletionRejected,
    enabled: isInProject,
  });

  // Update pending deletions from hook
  useEffect(() => {
    setPendingFileDeletions(pendingDeletions);
  }, [pendingDeletions]);

  // Wrapped addLineAnnotation that syncs to Supabase
  const addLineAnnotation = useCallback(
    (annotation: Omit<LineAnnotation, "id" | "createdAt">) => {
      // Add user initials if in a project and initials are available
      console.log("addLineAnnotation:", { isInProject, userInitials, authInitials: authProfile?.initials, appInitials: appProfile?.initials });
      const annotationWithAuthor = isInProject && userInitials
        ? { ...annotation, addedBy: userInitials }
        : annotation;

      // Add locally first
      sessionContext.addLineAnnotation(annotationWithAuthor);

      // If in project, sync to Supabase
      // The annotation doesn't have id yet, so we need to get it after adding
      // This is handled by the effect below
    },
    [sessionContext, isInProject, userInitials, authProfile?.initials, appProfile?.initials]
  );

  // Wrapped removeLineAnnotation that syncs to Supabase
  const removeLineAnnotation = useCallback(
    async (id: string) => {
      console.log("removeLineAnnotation:", { id, isInProject });

      // If in project, check permission before removing
      if (isInProject) {
        console.log("removeLineAnnotation: calling deleteAnnotationFromDb");
        const result = await deleteAnnotationFromDb(id);

        if (!result.success) {
          console.warn("Failed to delete annotation:", result.error);
          // Don't remove locally - the sync will restore it from server
          return;
        }
      }

      // Remove locally (only if not in project OR deletion succeeded)
      sessionContext.removeLineAnnotation(id);
    },
    [sessionContext, isInProject, deleteAnnotationFromDb]
  );

  // Wrapped updateLineAnnotation that syncs to Supabase
  const updateLineAnnotation = useCallback(
    (id: string, updates: Partial<Omit<LineAnnotation, "id" | "codeFileId" | "createdAt">>) => {
      // Find the annotation BEFORE updating (state update is async)
      const annotation = sessionContext.session.lineAnnotations.find(a => a.id === id);
      console.log("updateLineAnnotation:", { id, updates, isInProject, foundAnnotation: !!annotation });

      // Update locally
      sessionContext.updateLineAnnotation(id, updates);

      // If in project, push the updated annotation
      if (isInProject && annotation) {
        // Apply updates to get the new state
        const updated = { ...annotation, ...updates };
        console.log("updateLineAnnotation: pushing to Supabase", updated);
        pushAnnotation(updated as LineAnnotation);
      }
    },
    [sessionContext, isInProject, pushAnnotation]
  );

  // Sync new local annotations to Supabase
  useEffect(() => {
    if (!isInProject) return;

    // Find annotations that haven't been synced yet
    const unsyncedAnnotations = sessionContext.session.lineAnnotations.filter(
      a => !syncedAnnotationIdsRef.current.has(a.id)
    );

    if (unsyncedAnnotations.length === 0) return;

    // Debounce syncing
    const timeoutId = setTimeout(async () => {
      console.log(`Syncing ${unsyncedAnnotations.length} new local annotations`);

      for (const annotation of unsyncedAnnotations) {
        const success = await pushAnnotation(annotation);
        // Only mark as synced if push succeeded
        // Failed annotations will be retried on next render
        if (success) {
          syncedAnnotationIdsRef.current.add(annotation.id);
        }
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [isInProject, sessionContext.session.lineAnnotations, pushAnnotation]);

  // Wrapped addCode that marks files for syncing
  const addCode = useCallback(
    (code: Omit<CodeReference, "id" | "uploadedAt">) => {
      const id = sessionContext.addCode(code);
      console.log("addCode: Added file locally", id, code.name, "isInProject:", isInProject);

      // Mark this file as pending sync (will sync when content is set)
      if (isInProject) {
        console.log("addCode: Marking file as pending sync");
        pendingNewFilesRef.current.add(id);
      }

      return id;
    },
    [sessionContext, isInProject]
  );

  // Wrapped setCodeContent - syncs content changes to cloud
  const setCodeContent = useCallback(
    (fileId: string, content: string) => {
      sessionContext.setCodeContent(fileId, content);
    },
    [sessionContext]
  );

  // Ref for debounce timer to prevent it being cleared on every render
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync file content changes to Supabase (debounced for typing)
  useEffect(() => {
    if (!isInProject) return;

    const currentFiles = sessionContext.session.codeFiles;
    const currentContents = sessionContext.session.codeContents;

    // Find files that need syncing: new files or changed content
    const toSync: Array<{ file: typeof currentFiles[0]; content: string; isNew: boolean }> = [];

    for (const file of currentFiles) {
      const content = currentContents[file.id];
      if (content === undefined) continue;

      const contentHash = hashContentSimple(content);
      const synced = syncedFilesRef.current.get(file.id);
      const isPending = pendingNewFilesRef.current.has(file.id);

      if (isPending) {
        // New file that has content now - sync it
        console.log("syncEffect: New file ready to sync:", file.name, file.id);
        toSync.push({ file, content, isNew: true });
      } else if (synced && (synced.name !== file.name || synced.contentHash !== contentHash)) {
        // Existing file with changed content
        toSync.push({ file, content, isNew: false });
      }
    }

    if (toSync.length === 0) return;

    // Clear previous timeout
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    // Use shorter delay for new files, longer for content edits
    const hasNewFiles = toSync.some(f => f.isNew);
    const delay = hasNewFiles ? 100 : 1000;

    // Debounce content syncing
    syncTimeoutRef.current = setTimeout(() => {
      console.log("syncEffect: Syncing", toSync.length, "file(s) to cloud");
      for (const { file, content, isNew } of toSync) {
        // Remove from pending before sync to avoid duplicate syncs
        if (isNew) {
          pendingNewFilesRef.current.delete(file.id);
        }

        saveCodeFile({
          id: file.id,
          name: file.name,
          language: file.language || "plaintext",
          content,
          originalContent: content,
        }).then(() => {
          console.log("syncEffect: Synced", file.name, isNew ? "(new)" : "(updated)");
          syncedFilesRef.current.set(file.id, {
            name: file.name,
            contentHash: hashContentSimple(content),
          });
        }).catch((err) => {
          console.error("syncEffect: Failed to sync", file.name, err);
          // Re-add to pending if sync failed for new files
          if (isNew) {
            pendingNewFilesRef.current.add(file.id);
          }
        });
      }
    }, delay);

    return () => {
      // Don't clear the timeout on unmount - let it finish
    };
  }, [isInProject, sessionContext.session.codeFiles, sessionContext.session.codeContents, saveCodeFile]);

  // Sync a single code file to Supabase
  const syncCodeFile = useCallback(
    async (fileId: string) => {
      if (!isInProject) return;

      const file = sessionContext.session.codeFiles.find((f) => f.id === fileId);
      const content = sessionContext.session.codeContents[fileId];

      if (file && content) {
        await saveCodeFile({
          id: fileId,
          name: file.name,
          language: file.language || "plaintext",
          content,
          originalContent: content,
        });
      }
    },
    [isInProject, sessionContext.session.codeFiles, sessionContext.session.codeContents, saveCodeFile]
  );

  // Save all files to cloud (call before leaving project)
  const saveAllToCloud = useCallback(async () => {
    if (!isInProject) {
      console.log("saveAllToCloud: Not in project");
      return { success: false, error: "Not in a project" };
    }

    console.log("saveAllToCloud: Starting save of all files...");
    const currentFiles = sessionContext.session.codeFiles;
    const currentContents = sessionContext.session.codeContents;

    let savedCount = 0;
    let errorCount = 0;

    for (const file of currentFiles) {
      const content = currentContents[file.id];
      if (content === undefined) {
        console.log("saveAllToCloud: Skipping file without content:", file.name);
        continue;
      }

      try {
        const result = await saveCodeFile({
          id: file.id,
          name: file.name,
          language: file.language || "plaintext",
          content,
          originalContent: content,
        });

        if (result.error) {
          console.error("saveAllToCloud: Failed to save", file.name, result.error);
          errorCount++;
        } else {
          console.log("saveAllToCloud: Saved", file.name);
          savedCount++;
          // Update synced tracking
          syncedFilesRef.current.set(file.id, {
            name: file.name,
            contentHash: hashContentSimple(content),
          });
          // Clear from pending if it was there
          pendingNewFilesRef.current.delete(file.id);
        }
      } catch (err) {
        console.error("saveAllToCloud: Error saving", file.name, err);
        errorCount++;
      }
    }

    console.log(`saveAllToCloud: Completed. Saved: ${savedCount}, Errors: ${errorCount}`);
    return { success: errorCount === 0, savedCount, errorCount };
  }, [isInProject, sessionContext.session.codeFiles, sessionContext.session.codeContents, saveCodeFile]);

  // Wrapped removeCode that syncs deletion
  const removeCode = useCallback(
    async (codeId: string) => {
      console.log("removeCode: Deleting file", codeId, "isInProject:", isInProject);

      // Get file info before removing (for trash display)
      const file = sessionContext.session.codeFiles.find(f => f.id === codeId);
      const content = sessionContext.session.codeContents[codeId];

      // Remove from tracking first
      syncedFilesRef.current.delete(codeId);
      pendingNewFilesRef.current.delete(codeId);

      if (isInProject) {
        // Delete from database (soft delete - sets deleted_at)
        console.log("removeCode: Calling deleteCodeFile for", codeId);
        const result = await deleteCodeFile(codeId);
        if (result.error) {
          console.error("removeCode: Failed to delete from cloud:", result.error);
          // Still remove locally, but the file may reappear on refresh
        } else {
          console.log("removeCode: Successfully deleted from cloud");
          // Add to trash state immediately so it shows in trash UI
          if (file) {
            const trashedFile: TrashedCodeFile = {
              id: codeId,
              name: file.name,
              language: file.language || "plaintext",
              deletedAt: new Date().toISOString(),
            };
            setTrashedFiles(prev => [trashedFile, ...prev]);
            console.log("removeCode: Added to trash state");
          }
        }
      } else {
        // Local file (not in project) - add to trash with content for restoration
        if (file) {
          const trashedFile: TrashedCodeFile = {
            id: codeId,
            name: file.name,
            language: file.language || "plaintext",
            deletedAt: new Date().toISOString(),
            content: content || "",
            isLocal: true,
          };
          setTrashedFiles(prev => [trashedFile, ...prev]);
          console.log("removeCode: Added local file to trash state with content");
        }
      }

      // Remove locally
      sessionContext.removeCode(codeId);
      console.log("removeCode: Removed locally");
    },
    [sessionContext, isInProject, deleteCodeFile]
  );

  // Confirm a pending file deletion
  const confirmFileDeletion = useCallback(
    async (deletion: PendingDeletion) => {
      await confirmDeletion(deletion.id, deletion.file_id);
      setPendingFileDeletions((prev) => prev.filter((d) => d.id !== deletion.id));

      // Remove file locally if it exists
      const file = sessionContext.session.codeFiles.find((f) => f.id === deletion.file_id);
      if (file) {
        sessionContext.removeCode(deletion.file_id);
      }
    },
    [confirmDeletion, sessionContext]
  );

  // Reject a pending file deletion
  const rejectFileDeletion = useCallback(
    async (deletion: PendingDeletion) => {
      await rejectDeletion(deletion.id, deletion.file_id);
      setPendingFileDeletions((prev) => prev.filter((d) => d.id !== deletion.id));
    },
    [rejectDeletion]
  );

  // Fetch trashed files for current project
  const loadTrashedFiles = useCallback(async () => {
    if (!isInProject) return;
    setIsLoadingFileTrash(true);
    try {
      const files = await fetchTrashedFiles();
      setTrashedFiles(files);
    } finally {
      setIsLoadingFileTrash(false);
    }
  }, [isInProject, fetchTrashedFiles]);

  // Restore a file from trash
  const restoreFileFromTrash = useCallback(
    async (fileId: string) => {
      // Find the trashed file
      const trashedFile = trashedFiles.find(f => f.id === fileId);

      // Handle local files (not in project)
      if (trashedFile?.isLocal) {
        // Restore locally by re-adding the file
        const content = trashedFile.content || "";
        const newId = sessionContext.addCode({
          name: trashedFile.name,
          language: trashedFile.language,
          size: content.length,
        });
        // Set the content
        sessionContext.setCodeContent(newId, content);
        // Remove from trash state
        setTrashedFiles(prev => prev.filter(f => f.id !== fileId));
        console.log("restoreFileFromTrash: Restored local file", trashedFile.name);
        return { error: null };
      }

      // Handle project files
      if (!isInProject) {
        return { error: new Error("Not in a project") };
      }
      const result = await restoreFile(fileId);
      if (!result.error) {
        // Remove from local trash state
        setTrashedFiles(prev => prev.filter(f => f.id !== fileId));
        // Refresh files to get the restored file
        const files = await fetchCodeFiles();
        // Add restored file to session
        const restoredFile = files.find(f => f.id === fileId);
        if (restoredFile) {
          handleFileAddedOrUpdated(restoredFile);
        }
      }
      return result;
    },
    [isInProject, restoreFile, fetchCodeFiles, handleFileAddedOrUpdated, trashedFiles, sessionContext]
  );

  // Permanently delete a file from trash
  const permanentlyDeleteFileFromTrash = useCallback(
    async (fileId: string) => {
      // Find the trashed file
      const trashedFile = trashedFiles.find(f => f.id === fileId);

      // Handle local files - just remove from trash state
      if (trashedFile?.isLocal) {
        setTrashedFiles(prev => prev.filter(f => f.id !== fileId));
        console.log("permanentlyDeleteFileFromTrash: Permanently deleted local file", trashedFile.name);
        return { error: null };
      }

      // Handle project files
      if (!isInProject) {
        return { error: new Error("Not in a project") };
      }
      const result = await permanentlyDeleteFile(fileId);
      if (!result.error) {
        setTrashedFiles(prev => prev.filter(f => f.id !== fileId));
      }
      return result;
    },
    [isInProject, permanentlyDeleteFile, trashedFiles]
  );

  // Empty all files from trash
  const emptyAllFileTrash = useCallback(async () => {
    // Check if we have any local files in trash
    const localFiles = trashedFiles.filter(f => f.isLocal);
    const projectFiles = trashedFiles.filter(f => !f.isLocal);

    // If not in project, just clear local files
    if (!isInProject) {
      if (localFiles.length > 0) {
        setTrashedFiles([]);
        console.log("emptyAllFileTrash: Cleared local trash files");
        return { error: null };
      }
      return { error: new Error("Not in a project and no local files in trash") };
    }

    // In project - empty project trash and also clear local files
    const result = await emptyFileTrash();
    if (!result.error) {
      setTrashedFiles([]);
    } else {
      // Even if project trash fails, clear local files
      setTrashedFiles(projectFiles);
    }
    return result;
  }, [isInProject, emptyFileTrash, trashedFiles]);

  // Refresh from cloud with smart merge - preserves local pending changes
  const refreshFromCloud = useCallback(async () => {
    if (!isInProject) {
      console.log("refreshFromCloud: Not in a project, skipping");
      return { success: false, error: "Not in a project" };
    }

    console.log("refreshFromCloud: Starting smart refresh with merge...");

    try {
      if (!currentProjectId) {
        return { success: false, error: "No current project ID" };
      }

      // Fetch remote annotations
      const remoteAnnotations = await fetchRemoteAnnotations();
      console.log(`refreshFromCloud: Fetched ${remoteAnnotations.length} remote annotations`);

      // Fetch remote files
      const remoteFiles = await fetchCodeFiles();
      console.log(`refreshFromCloud: Fetched ${remoteFiles.length} remote files`);

      // Get pending operations from queue
      const { getPendingOperations } = await import("@/lib/sync/operation-queue");
      const pendingOps = await getPendingOperations(currentProjectId);
      console.log(`refreshFromCloud: Found ${pendingOps.length} pending operations`);

      // Prepare remote state for merging
      const remoteCodeFiles = remoteFiles.map(f => ({
        id: f.id,
        name: f.name,
        language: f.language,
        source: "shared" as const,
        size: f.content.length,
        uploadedAt: new Date().toISOString(),
      }));

      const remoteCodeContents: Record<string, string> = {};
      remoteFiles.forEach(f => {
        remoteCodeContents[f.id] = f.content;
      });

      // Get current local state
      const localCodeFiles = sessionContext.session.codeFiles;
      const localCodeContents = sessionContext.session.codeContents;
      const localAnnotations = sessionContext.session.lineAnnotations;

      // Merge annotations (additive strategy - no conflicts)
      const { mergeAnnotations, mergeFiles, mergeReplies } = await import("@/lib/sync/merge-strategies");

      const annotationsResult = mergeAnnotations(
        remoteAnnotations,
        pendingOps,
        localAnnotations
      );
      console.log(`refreshFromCloud: Merged ${annotationsResult.merged.length} annotations (${annotationsResult.conflicts.length} conflicts)`);

      // Merge annotation replies
      const repliesResult = mergeReplies(
        annotationsResult.merged,
        pendingOps,
        localAnnotations
      );
      console.log(`refreshFromCloud: Merged replies (${repliesResult.conflicts.length} conflicts)`);

      // Merge files (with conflict detection)
      const filesResult = mergeFiles(
        remoteCodeFiles,
        remoteCodeContents,
        pendingOps,
        localCodeFiles,
        localCodeContents
      );

      if (filesResult.conflicts.length > 0) {
        console.warn(`refreshFromCloud: ${filesResult.conflicts.length} file conflicts detected:`, filesResult.conflicts);
        // For now, just log conflicts. In Phase 5.3, we'll show a modal.
        // Use remote version when there's a conflict (last-write-wins)
      }

      // Update synced tracking for annotations
      syncedAnnotationIdsRef.current.clear();
      repliesResult.merged.forEach(a => syncedAnnotationIdsRef.current.add(a.id));

      // Update synced tracking for files
      syncedFilesRef.current.clear();
      Object.entries(filesResult.merged.contents).forEach(([fileId, content]) => {
        const file = filesResult.merged.files.find(f => f.id === fileId);
        if (file) {
          syncedFilesRef.current.set(fileId, {
            name: file.name,
            contentHash: hashContentSimple(content),
          });
        }
      });

      // Apply merged state (preserves local changes!)
      sessionContext.importSession({
        ...sessionContext.session,
        codeFiles: filesResult.merged.files,
        codeContents: filesResult.merged.contents,
        lineAnnotations: repliesResult.merged,
      });

      // NOTE: We do NOT remove pending operations from the queue here.
      // The individual sync hooks (useAnnotationsSync, useCodeFilesSync) will
      // process and push them to Supabase during their normal polling cycle.
      // The merge above just ensures pending operations are reflected in local state.

      console.log("refreshFromCloud: Smart refresh completed successfully");
      return { success: true, error: null, conflicts: filesResult.conflicts };
    } catch (err) {
      console.error("refreshFromCloud: Error", err);
      return { success: false, error: String(err) };
    }
  }, [isInProject, fetchRemoteAnnotations, fetchCodeFiles, sessionContext, currentProjectId]);

  return {
    // All original session context values
    ...sessionContext,

    // Overridden methods with sync
    addLineAnnotation,
    updateLineAnnotation,
    removeLineAnnotation,
    addCode,
    setCodeContent,
    removeCode,

    // New collaboration methods
    fetchRemoteAnnotations,
    fetchCodeFiles,
    confirmFileDeletion,
    rejectFileDeletion,
    refreshFromCloud,
    saveAllToCloud,

    // Annotation reply methods
    pushReply,
    deleteReply,

    // File trash methods
    loadTrashedFiles,
    restoreFileFromTrash,
    permanentlyDeleteFileFromTrash,
    emptyAllFileTrash,

    // Collaboration state
    isInProject,
    isCollaborationConnected: annotationsConnected || filesConnected,
    pendingFileDeletions,
    // Animation state for remote annotations (IDs that just arrived)
    newRemoteAnnotationIds,
    // File trash state
    trashedFiles,
    isLoadingFileTrash,
  };
}
