/**
 * File management hook extracted from WorkbenchLayout
 * Handles file upload, paste, delete, rename, duplicate, revert, and local trash
 */

import { useState, useRef, useCallback, useEffect } from "react";
import type { CodeReference, Session, LineAnnotation } from "@/types";
import { parseAnnotatedMarkdown } from "@/components/code";

interface LocalTrashedFile {
  id: string;
  name: string;
  language: string;
  content: string;
  deletedAt: string;
}

const LOCAL_TRASH_STORAGE_KEY = "ccs-wb-local-trash";

interface UseWorkbenchFileManagementParams {
  session: Session;
  addCode: (code: Omit<CodeReference, "id" | "uploadedAt">) => string;
  removeCode: (id: string) => void;
  updateCode: (id: string, updates: Partial<CodeReference>) => void;
  setCodeContent: (fileId: string, content: string) => void;
  addLineAnnotation: (annotation: Omit<LineAnnotation, "id" | "createdAt">) => void;
  clearLineAnnotations: (codeFileId: string) => void;
  isInProject: boolean;
  codeContents: Map<string, string>;
  onFileAdded?: () => void;
}

export function useWorkbenchFileManagement({
  session,
  addCode,
  removeCode,
  updateCode,
  setCodeContent,
  addLineAnnotation,
  clearLineAnnotations,
  isInProject,
  codeContents,
  onFileAdded,
}: UseWorkbenchFileManagementParams) {
  // State
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [originalContents, setOriginalContents] = useState<Map<string, string>>(new Map());
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInputText, setCodeInputText] = useState("");
  const [codeInputName, setCodeInputName] = useState("");
  const [codeInputLanguage, setCodeInputLanguage] = useState("");

  // Local file trash (for when not in cloud mode)
  const [localTrashedFiles, setLocalTrashedFiles] = useState<LocalTrashedFile[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(LOCAL_TRASH_STORAGE_KEY);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (e) {
        console.error("Failed to load local trash from localStorage:", e);
      }
    }
    return [];
  });

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Store codeContents in a ref so session-change effect can access latest without deps
  const sessionCodeContentsRef = useRef(session.codeContents);
  sessionCodeContentsRef.current = session.codeContents;

  // Reset file state when session changes
  const prevSessionIdRef = useRef(session.id);
  useEffect(() => {
    if (session.id !== prevSessionIdRef.current) {
      // Initialize originalContents from the loaded session's codeContents
      const loadedContents = new Map(Object.entries(sessionCodeContentsRef.current));
      setOriginalContents(loadedContents);
      prevSessionIdRef.current = session.id;
    }
  }, [session.id]);

  // Persist local trash to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_TRASH_STORAGE_KEY, JSON.stringify(localTrashedFiles));
    } catch (e) {
      console.error("Failed to save local trash to localStorage:", e);
    }
  }, [localTrashedFiles]);

  // Helper to store original content when a file is first added
  const storeOriginalContent = useCallback((fileId: string, content: string) => {
    setOriginalContents(prev => {
      const next = new Map(prev);
      if (!next.has(fileId)) {
        next.set(fileId, content);
      }
      return next;
    });
  }, []);

  // Commit current content as the new original (overwrites existing)
  const commitOriginalContent = useCallback((fileId: string, content: string) => {
    setOriginalContents(prev => {
      const next = new Map(prev);
      next.set(fileId, content);
      return next;
    });
  }, []);

  // Revert a file to its original content and clear annotations
  const handleRevertFile = useCallback((fileId: string) => {
    const original = originalContents.get(fileId);
    if (original !== undefined) {
      setCodeContent(fileId, original);
      clearLineAnnotations(fileId);
    }
  }, [originalContents, setCodeContent, clearLineAnnotations]);

  // Commit current changes as the new base version
  const handleCommitFile = useCallback((fileId: string) => {
    const current = codeContents.get(fileId);
    if (current !== undefined) {
      commitOriginalContent(fileId, current);
    }
  }, [codeContents, commitOriginalContent]);

  // Handle file upload
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const extension = file.name.split(".").pop()?.toLowerCase() || "";

        // Check if this is a CCS annotated markdown file
        if (extension === "md" && text.startsWith("---")) {
          const parsed = parseAnnotatedMarkdown(text);
          if (parsed) {
            const { metadata, code } = parsed;
            const originalName = metadata.filename || file.name.replace(/-annotated\.md$/, "");

            const fileId = addCode({
              name: originalName,
              language: metadata.language || undefined,
              source: "upload",
              size: code.length,
            });

            setCodeContent(fileId, code);
            storeOriginalContent(fileId, code);

            // Restore annotations
            for (const ann of metadata.annotations) {
              const lines = code.split("\n");
              const lineContent = lines[ann.line - 1] || "";

              addLineAnnotation({
                codeFileId: fileId,
                lineNumber: ann.line,
                lineContent,
                type: ann.type,
                content: ann.content,
                addedBy: ann.addedBy,
              });
            }

            onFileAdded?.();
            return;
          }
        }

        // Regular file upload - not CCS annotated
        const languageMap: Record<string, string> = {
          js: "javascript", ts: "typescript", py: "python", rb: "ruby",
          c: "c", cpp: "cpp", h: "c", java: "java", go: "go", rs: "rust",
          lisp: "lisp", scm: "scheme", el: "elisp", bas: "basic",
          // Historical languages (punch card era)
          mad: "mad", for: "fortran", f: "fortran", f77: "fortran", f90: "fortran",
          ftn: "fortran", cob: "cobol", cbl: "cobol", pli: "pli", pl1: "pli",
          alg: "algol", sno: "snobol", apl: "apl", slip: "slip",
        };

        const language = languageMap[extension] || "";

        const fileId = addCode({
          name: file.name,
          language: language || undefined,
          source: "upload",
          size: text.length,
        });

        setCodeContent(fileId, text);
        storeOriginalContent(fileId, text);

        onFileAdded?.();
      } catch (error) {
        console.error("File read error:", error);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [addCode, setCodeContent, storeOriginalContent, addLineAnnotation, onFileAdded]
  );

  // Handle paste code
  const handleCodeSubmit = useCallback(() => {
    if (!codeInputText.trim()) return;

    const codeName = codeInputName.trim() || "Untitled code";
    const language = codeInputLanguage.trim() || "";

    const fileId = addCode({
      name: codeName,
      language: language || undefined,
      source: "paste",
      size: codeInputText.length,
    });

    setCodeContent(fileId, codeInputText);
    storeOriginalContent(fileId, codeInputText);

    onFileAdded?.();

    // Reset
    setCodeInputText("");
    setCodeInputName("");
    setCodeInputLanguage("");
    setShowCodeInput(false);
  }, [codeInputText, codeInputName, codeInputLanguage, addCode, setCodeContent, storeOriginalContent, onFileAdded]);

  // Delete file (local trash or cloud soft delete)
  const handleDeleteFile = useCallback((fileId: string) => {
    if (!isInProject) {
      const file = session.codeFiles.find(f => f.id === fileId);
      const content = session.codeContents[fileId];
      if (file && content) {
        setLocalTrashedFiles(prev => [{
          id: fileId,
          name: file.name,
          language: file.language || "plaintext",
          content: content,
          deletedAt: new Date().toISOString(),
        }, ...prev]);
      }
    }
    removeCode(fileId);
  }, [removeCode, isInProject, session.codeFiles, session.codeContents]);

  // Local trash handlers (for non-cloud mode)
  const handleLocalLoadTrashedFiles = useCallback(() => {
    // Local trash is already in state, nothing to fetch
  }, []);

  const handleLocalRestoreFile = useCallback(async (fileId: string) => {
    const trashedFile = localTrashedFiles.find(f => f.id === fileId);
    if (!trashedFile) return { error: new Error("File not found in trash") };

    const newId = addCode({
      name: trashedFile.name,
      language: trashedFile.language,
      source: "restored",
      size: trashedFile.content.length,
    });
    setCodeContent(newId, trashedFile.content);

    setLocalTrashedFiles(prev => prev.filter(f => f.id !== fileId));

    return { error: null };
  }, [localTrashedFiles, addCode, setCodeContent]);

  const handleLocalPermanentlyDeleteFile = useCallback(async (fileId: string) => {
    setLocalTrashedFiles(prev => prev.filter(f => f.id !== fileId));
    return { error: null };
  }, []);

  const handleLocalEmptyTrash = useCallback(async () => {
    setLocalTrashedFiles([]);
    return { error: null };
  }, []);

  // Rename file
  const handleRenameFile = useCallback((fileId: string, newName: string) => {
    updateCode(fileId, { name: newName });
  }, [updateCode]);

  // Duplicate file
  const handleDuplicateFile = useCallback((fileId: string) => {
    const originalFile = session.codeFiles.find((f) => f.id === fileId);
    const originalContent = session.codeContents[fileId];
    if (!originalFile || !originalContent) return;

    const newId = addCode({
      name: `${originalFile.name} (copy)`,
      language: originalFile.language,
      source: originalFile.source,
      size: originalContent.length,
    });

    setCodeContent(newId, originalContent);
  }, [session.codeFiles, session.codeContents, addCode, setCodeContent]);

  // Initialize original contents (e.g., when loading a saved session)
  const initializeOriginalContents = useCallback((contents: Map<string, string>) => {
    setOriginalContents(contents);
  }, []);

  return {
    // State
    selectedFileId,
    setSelectedFileId,
    originalContents,
    showCodeInput,
    setShowCodeInput,
    codeInputText,
    setCodeInputText,
    codeInputName,
    setCodeInputName,
    codeInputLanguage,
    setCodeInputLanguage,
    localTrashedFiles,
    // Refs
    fileInputRef,
    // Handlers
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
  };
}
