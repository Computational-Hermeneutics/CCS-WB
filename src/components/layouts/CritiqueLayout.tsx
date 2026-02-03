"use client";

import { useState, useRef, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from "react";
import { useRouter } from "next/navigation";
import { useCollaborativeSession } from "@/hooks/useCollaborativeSession";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useUnsavedWarning } from "@/hooks/useUnsavedWarning";
import { useAISettings } from "@/context/AISettingsContext";
import { cn, formatTimestamp, fetchWithTimeout, retryWithBackoff, generateId, getCurrentTimestamp } from "@/lib/utils";
import type { Message, CodeReference, ExperienceLevel, Session } from "@/types";
import { EXPERIENCE_LEVEL_LABELS, EXPERIENCE_LEVEL_DESCRIPTIONS, GUIDED_PROMPTS } from "@/types";
import {
  Send,
  Loader2,
  X,
  Download,
  FileUp,
  Settings,
  Cpu,
  Lightbulb,
  Sparkles,
  Save,
  FolderOpen,
  FileText,
  FileDown,
  FilePlus2,
  AlertTriangle,
  Minus,
  Plus,
  Eye,
  MessageSquare,
  Copy,
  Check,
  Heart,
  ArrowUp,
  SlidersHorizontal,
  ChevronDown,
  HelpCircle,
  Search,
  PanelRight,
  PanelRightClose,
  Cloud,
  CloudOff,
  CloudCog,
  Users,
  UploadCloud,
  DownloadCloud,
  XCircle,
  LogIn,
  LogOut,
  User,
  UserPlus,
  UserMinus,
  RefreshCw,
  Shield,
  Calendar,
  FileCode,
  MessageSquareText,
  Info,
  Library,
  Pencil,
  HardDrive,
} from "lucide-react";
import { CodeEditorPanel, generateAnnotatedCode, parseAnnotatedMarkdown } from "@/components/code";
import { ContextPreview } from "@/components/chat";
import { GuidedPrompts } from "@/components/prompts";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { SaveStatusIndicator } from "@/components/ui/SaveStatusIndicator";
import { UserMenu } from "@/components/auth/UserMenu";
import { AISettingsPanel } from "@/components/settings/AISettingsPanel";
import { useAppSettings } from "@/context/AppSettingsContext";
import { useAuth } from "@/context/AuthContext";
import { useProjects } from "@/context/ProjectsContext";
import { useProjectSync } from "@/hooks/useProjectSync";
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from "@/types/app-settings";
import { PROVIDER_CONFIGS } from "@/lib/ai/config";
import {
  generateSessionLog,
  exportSessionLogJSON,
  exportSessionLogText,
  exportSessionLogPDF,
  MODE_CODES,
  MODE_LABELS,
} from "@/lib/export";
import ReactMarkdown from "react-markdown";
import JSZip from "jszip";

interface CritiqueLayoutProps {
  onNavigateHome: () => void;
  triggerSave?: boolean;
  onSaveTriggered?: () => void;
}

export interface CritiqueLayoutRef {
  save: () => void;
  hasUnsavedChanges: () => boolean;
  getProjectName: () => string;
}

// Font size constants are imported from app-settings

// Opening prompt for critique mode
const CRITIQUE_OPENING = "What code would you like to explore? You can paste it directly, upload a file, or describe what you're looking at. I'm curious what drew your attention to this particular piece of software.";

// Mode colors for badges
const MODE_COLORS: Record<string, string> = {
  critique: "bg-burgundy/10 text-burgundy",
  archaeology: "bg-amber-100 text-amber-700",
  interpret: "bg-emerald-100 text-emerald-700",
  create: "bg-blue-100 text-blue-700",
};

// Strip $ namespace prefix from project names for display (library projects use $ prefix internally)
const displayProjectName = (name: string) => name.replace(/^\$+/, "");

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

export const CritiqueLayout = forwardRef<CritiqueLayoutRef, CritiqueLayoutProps>(function CritiqueLayout({
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
    // File trash
    trashedFiles,
    isLoadingFileTrash,
    loadTrashedFiles,
    restoreFileFromTrash,
    permanentlyDeleteFileFromTrash,
    emptyAllFileTrash,
  } = useCollaborativeSession();
  const { settings: aiSettings, getRequestHeaders, isConfigured: isAIConfigured, connectionStatus, isAiReady } = useAISettings();
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

  // Auto-save hooks
  const autoSave = useAutoSave({
    enabled: true,
    onSaveSuccess: (timestamp) => {
      console.log("[CritiqueLayout] Auto-save successful:", timestamp);
    },
    onSaveError: (error) => {
      console.error("[CritiqueLayout] Auto-save failed:", error);
      // Could show a toast notification here
    },
  });

  // Warn before closing with unsaved changes
  useUnsavedWarning(autoSave.isDirty, true);

  // Get current project info for shared project indicator
  const currentProject = useMemo(() =>
    currentProjectId ? projects.find(p => p.id === currentProjectId) : null,
    [currentProjectId, projects]
  );
  const router = useRouter();

  // Get font sizes from app settings for critique mode
  const { codeFontSize, chatFontSize } = getFontSizes("critique");

  // Get effective language for API context: session override > global default
  const effectiveLanguage = session.languageOverride || appSettings.defaultLanguage || "";

  // State
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"profile" | "code" | "appearance" | "ai" | "about">("appearance");
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [showGuidedPrompts, setShowGuidedPrompts] = useState(false);
  const [showExperienceHelp, setShowExperienceHelp] = useState(false);
  const [showCloudMenu, setShowCloudMenu] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [populateWithSession, setPopulateWithSession] = useState(false);
  const [cloudActionLoading, setCloudActionLoading] = useState<string | null>(null);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInputText, setCodeInputText] = useState("");
  const [codeInputName, setCodeInputName] = useState("");
  const [codeInputLanguage, setCodeInputLanguage] = useState("");
  const [projectName, setProjectName] = useState<string>("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSendContextModal, setShowSendContextModal] = useState(false);
  const [expandedAnnotationId, setExpandedAnnotationId] = useState<string | null>(null);
  const [replyInputOpenFor, setReplyInputOpenFor] = useState<string | null>(null);
  const [showFontSizePopover, setShowFontSizePopover] = useState(false);
  const [showHelpPopover, setShowHelpPopover] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState("");
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [projectMemberCount, setProjectMemberCount] = useState<number>(0);
  const [projectMembers, setProjectMembers] = useState<Array<{ user_id: string; initials?: string; avatar_url?: string; display_name?: string; role: string }>>([]);
  const [showProjectRestoredBanner, setShowProjectRestoredBanner] = useState(false);

  // Check if cloud project was restored on page load
  useEffect(() => {
    if (currentProjectId && currentProject) {
      // Check if this was a page reload by seeing if there's no session data yet
      const wasRestored = localStorage.getItem("ccs-project-just-restored") === "true";
      if (wasRestored) {
        setShowProjectRestoredBanner(true);
        localStorage.removeItem("ccs-project-just-restored");
        // Auto-hide banner after 10 seconds
        const timer = setTimeout(() => setShowProjectRestoredBanner(false), 10000);
        return () => clearTimeout(timer);
      }
    }
  }, [currentProjectId, currentProject]);

  // Local file trash (for when not in cloud mode)
  // Persisted to localStorage so it survives page refreshes and project switches
  interface LocalTrashedFile {
    id: string;
    name: string;
    language: string;
    content: string;
    deletedAt: string;
  }
  const LOCAL_TRASH_STORAGE_KEY = "ccs-wb-local-trash";
  const [localTrashedFiles, setLocalTrashedFiles] = useState<LocalTrashedFile[]>(() => {
    // Load from localStorage on initial mount
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

  // Persist local trash to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_TRASH_STORAGE_KEY, JSON.stringify(localTrashedFiles));
    } catch (e) {
      console.error("Failed to save local trash to localStorage:", e);
    }
  }, [localTrashedFiles]);

  // Message interaction state
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [favouriteMessages, setFavouriteMessages] = useState<Set<string>>(new Set());

  // Chat search state
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const chatSearchInputRef = useRef<HTMLInputElement>(null);

  // Project info dropdown state
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const projectInfoRef = useRef<HTMLDivElement>(null);

  // Rename project state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isRenamingLoading, setIsRenamingLoading] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

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

  // Track original file contents for detecting modifications and enabling revert
  const [originalContents, setOriginalContents] = useState<Map<string, string>>(new Map());

  // Helper to store original content when a file is first added
  const storeOriginalContent = useCallback((fileId: string, content: string) => {
    setOriginalContents(prev => {
      const next = new Map(prev);
      // Only store if not already stored (don't overwrite original)
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
      // Also clear annotations for a clean start
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

  // Reset layout to defaults when session changes (clear or load new session)
  const prevSessionIdRef = useRef(session.id);
  // Store codeContents in a ref so we can access the current value without adding to dependencies
  const sessionCodeContentsRef = useRef(session.codeContents);
  sessionCodeContentsRef.current = session.codeContents;

  useEffect(() => {
    if (session.id !== prevSessionIdRef.current) {
      // Session changed - reset layout to defaults
      setCodePanelWidth(DEFAULT_CODE_PANEL_WIDTH);
      setProjectName("");
      setFavouriteMessages(new Set());
      // Initialize originalContents from the loaded session's codeContents
      // This allows modification detection to work after session restore
      const loadedContents = new Map(Object.entries(sessionCodeContentsRef.current));
      setOriginalContents(loadedContents);
      hasAddedOpeningMessage.current = false;
      prevSessionIdRef.current = session.id;
    }
  }, [session.id]);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionLoadInputRef = useRef<HTMLInputElement>(null);
  const hasAddedOpeningMessage = useRef(false);

  // Track message count to only scroll on new messages, not updates
  const prevMessageCount = useRef(session.messages.length);

  // Scroll to bottom only when new messages are added
  useEffect(() => {
    if (session.messages.length > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCount.current = session.messages.length;
  }, [session.messages.length]);

  // Add opening message
  useEffect(() => {
    if (session.messages.length === 0 && !hasAddedOpeningMessage.current) {
      hasAddedOpeningMessage.current = true;
      addMessage({
        role: "assistant",
        content: CRITIQUE_OPENING,
        metadata: { phase: "opening" },
      });
    }
  }, [session.messages.length, addMessage]);

  // Refresh projects when cloud menu opens (handles stale state from Safari suspension)
  useEffect(() => {
    if (showCloudMenu && isAuthenticated) {
      refreshProjects();
    }
  }, [showCloudMenu, isAuthenticated, refreshProjects]);

  // Poll pending submissions for admin badge (every 60 seconds)
  useEffect(() => {
    if (!isAdmin || !isAuthenticated) return;

    // Initial fetch
    fetchPendingSubmissions();

    // Poll every 60 seconds
    const interval = setInterval(() => {
      fetchPendingSubmissions();
    }, 60000);

    return () => clearInterval(interval);
  }, [isAdmin, isAuthenticated, fetchPendingSubmissions]);

  // Fetch project members to determine if project is shared
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
      setProjectMembers(memberList.map(m => ({
        user_id: m.user_id,
        initials: m.profile?.initials || undefined,
        avatar_url: m.profile?.avatar_url || undefined,
        display_name: m.profile?.display_name || m.profile?.initials || 'Member',
        role: m.role
      })));
    };

    fetchMembers();
  }, [currentProjectId, isAuthenticated, getProjectMembers]);

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

  // Generate annotated code context for LLM
  const annotatedCodeContext = useMemo(() => {
    if (session.codeFiles.length === 0) return "";

    const parts: string[] = ["## Code Under Analysis\n"];

    session.codeFiles.forEach((file) => {
      const code = codeContents.get(file.id);
      if (!code) return;

      const fileAnnotations = session.lineAnnotations.filter(
        (a) => a.codeFileId === file.id
      );
      const annotatedCode = generateAnnotatedCode(code, fileAnnotations);

      parts.push(`### ${file.name}${file.language ? ` (${file.language})` : ""}`);
      if (file.author) parts.push(`Author: ${file.author}`);
      if (file.date) parts.push(`Date: ${file.date}`);
      if (file.platform) parts.push(`Platform: ${file.platform}`);
      parts.push("\n```" + (file.language || ""));
      parts.push(annotatedCode);
      parts.push("```\n");
    });

    if (session.lineAnnotations.length > 0) {
      parts.push("\n*Note: Lines marked with `// An:` are analyst annotations for close reading.*");
    }

    return parts.join("\n");
  }, [session.codeFiles, session.lineAnnotations, codeContents]);

  // Handle copy message
  const handleCopyMessage = useCallback(async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  // Handle toggle favourite message - persists to session for export
  const handleToggleFavourite = useCallback((messageId: string) => {
    // Update local UI state
    setFavouriteMessages(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
    // Persist to session for export
    const message = session.messages.find(m => m.id === messageId);
    if (message) {
      updateMessage(messageId, { isFavourite: !message.isFavourite });
    }
  }, [session.messages, updateMessage]);

  // Handle send message
  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading || !isAiReady) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    addMessage({ role: "user", content: userMessage });

    try {
      const data = await retryWithBackoff(
        async () => {
          const response = await fetchWithTimeout("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getRequestHeaders() },
            body: JSON.stringify({
              messages: [...session.messages, { role: "user", content: userMessage }],
              settings: session.settings,
              currentPhase: session.currentPhase,
              experienceLevel: session.experienceLevel,
              mode: "critique",
              defaultLanguage: effectiveLanguage || undefined,
              analysisContext: session.analysisResults,
              literatureContext: session.references,
              // Include annotated code context
              codeContext: session.codeFiles.map((file) => {
                const code = codeContents.get(file.id);
                const fileAnnotations = session.lineAnnotations.filter((a) => a.codeFileId === file.id);
                return {
                  ...file,
                  content: code
                    ? generateAnnotatedCode(code, fileAnnotations)
                    : undefined,
                };
              }),
            }),
            timeout: 60000,
          });

          if (response.status === 429) {
            const errorData = await response.json();
            const err = new Error(errorData.message) as Error & { isRateLimit: boolean; retryAfter?: number };
            err.isRateLimit = true;
            err.retryAfter = errorData.retryAfter;
            throw err;
          }

          if (response.status === 503) {
            const errorData = await response.json();
            const err = new Error(errorData.message) as Error & { isConfigError: boolean };
            err.isConfigError = true;
            throw err;
          }

          if (!response.ok) throw new Error("Failed to get response");
          return response.json();
        },
        {
          maxRetries: 2,
          initialDelay: 1000,
          maxDelay: 5000,
          shouldRetry: (error) => {
            if ((error as Error & { isRateLimit?: boolean }).isRateLimit) return false;
            if (error instanceof Error) {
              return error.name === "AbortError" || error.message.includes("timeout");
            }
            return false;
          },
        }
      );

      addMessage(data.message);
    } catch (error) {
      console.error("Chat error:", error);
      const isConfigError = (error as Error & { isConfigError?: boolean }).isConfigError;
      if (isConfigError) { setSettingsTab("ai"); setShowSettingsModal(true); };

      addMessage({
        role: "assistant",
        content: isConfigError
          ? "AI provider not configured. Please check your AI settings."
          : "I encountered an error. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, isAiReady, session, addMessage, getRequestHeaders, codeContents]);

  // Handle key down
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Global keyboard shortcuts
  // Auto-resize textarea as content grows
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      // Reset height to auto to get correct scrollHeight
      textarea.style.height = 'auto';
      // Set to scrollHeight, with a max of ~200px (about 10 lines)
      const maxHeight = 200;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
      // Add overflow if exceeds max
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [input]);

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
            // This is a CCS annotated file - restore it with original metadata
            const { metadata, code } = parsed;

            // Use original filename or current filename (minus -annotated.md suffix)
            const originalName = metadata.filename || file.name.replace(/-annotated\.md$/, "");

            // Add code reference with original language
            const fileId = addCode({
              name: originalName,
              language: metadata.language || undefined,
              source: "upload",
              size: code.length,
            });

            // Store the clean code content
            setCodeContent(fileId, code);
            storeOriginalContent(fileId, code);

            // Restore annotations
            for (const ann of metadata.annotations) {
              // Get the line content from the code
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

            // Add message
            const annotationCount = metadata.annotations.length;
            addMessage({
              role: "user",
              content: `I've restored **${originalName}**${metadata.language ? ` (${metadata.language})` : ""} with ${annotationCount} annotation${annotationCount !== 1 ? "s" : ""}.`,
            });

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

        // Add code reference and get the ID
        const fileId = addCode({
          name: file.name,
          language: language || undefined,
          source: "upload",
          size: text.length,
        });

        // Store code content with the actual ID in session
        setCodeContent(fileId, text);
        storeOriginalContent(fileId, text);

        // Reset manual resize flag to allow 80-column auto-extend for new files
        userHasManuallyResized.current = false;

        // Add message
        addMessage({
          role: "user",
          content: `I've uploaded **${file.name}**${language ? ` (${language})` : ""} for analysis.`,
        });
      } catch (error) {
        console.error("File read error:", error);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [addCode, addMessage, setCodeContent, storeOriginalContent, addLineAnnotation]
  );

  // Handle paste code
  const handleCodeSubmit = useCallback(() => {
    if (!codeInputText.trim()) return;

    const codeName = codeInputName.trim() || "Untitled code";
    const language = codeInputLanguage.trim() || "";

    // Add code reference and get the ID
    const fileId = addCode({
      name: codeName,
      language: language || undefined,
      source: "paste",
      size: codeInputText.length,
    });

    // Store code content with the actual ID in session
    setCodeContent(fileId, codeInputText);
    storeOriginalContent(fileId, codeInputText);

    // Reset manual resize flag to allow 80-column auto-extend for new files
    userHasManuallyResized.current = false;

    // Add message
    addMessage({
      role: "user",
      content: `I've added **${codeName}**${language ? ` (${language})` : ""} for analysis.`,
    });

    // Reset
    setCodeInputText("");
    setCodeInputName("");
    setCodeInputLanguage("");
    setShowCodeInput(false);
  }, [codeInputText, codeInputName, codeInputLanguage, addCode, addMessage, storeOriginalContent]);

  // Handle guided prompt selection
  const handleSelectGuidedPrompt = useCallback((prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
    setShowGuidedPrompts(false);
  }, []);

  // Save session with code contents (downloads local file)
  const handleSaveSession = useCallback(() => {
    setSaveModalName(projectName || "Untitled");
    setShowSaveModal(true);
  }, [projectName]);

  // Save to cloud (for cloud projects)
  const [isSavingToCloud, setIsSavingToCloud] = useState(false);
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

  // NOTE: Auto-save to session_data removed - annotations and files sync via their own tables.
  // Manual "Save to Cloud" creates a snapshot for backup/restore purposes.
  // This avoids conflicts when multiple users are editing simultaneously.

  // Refresh from cloud (to fix sync issues)
  const [isRefreshingFromCloud, setIsRefreshingFromCloud] = useState(false);
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
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const handleDownloadZip = useCallback(async () => {
    if (!currentProject) return;

    setIsDownloadingZip(true);
    try {
      const zip = new JSZip();

      // Add code files to ZIP
      for (const file of session.codeFiles) {
        const content = codeContents.get(file.id) || "";
        zip.file(file.name, content);
      }

      // Create annotations summary as markdown
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
            // Sort by line number
            const sorted = [...fileAnnotations].sort((a, b) => a.lineNumber - b.lineNumber);
            for (const ann of sorted) {
              annotationsContent += `**Line ${ann.lineNumber}** [${ann.type}]${ann.addedBy ? ` (${ann.addedBy})` : ""}\n`;
              annotationsContent += `> ${ann.content}\n\n`;
            }
          }
        }

        zip.file("annotations.md", annotationsContent);
      }

      // Add project metadata
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

      // Generate and download
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

  // Start renaming project
  const handleStartRename = useCallback(() => {
    if (currentProject) {
      setRenameValue(currentProject.name);
      setIsRenaming(true);
      // Focus the input after render
      setTimeout(() => renameInputRef.current?.focus(), 0);
    }
  }, [currentProject]);

  // Cancel rename
  const handleCancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameValue("");
  }, []);

  // Submit rename
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

  // Load a project from the cloud menu
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

  // Create a new project from the cloud menu
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
          // Save current session to the new project (overwrites README template)
          await saveProject(project.id, session);
        } else if (initialSession) {
          // Use the initialSession returned by createProject (contains README)
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

  // Confirm save from modal
  const handleConfirmSave = useCallback(() => {
    const name = saveModalName.trim();
    if (!name) return;

    // Update project name state
    setProjectName(name);

    const exportData = {
      ...session,
      projectName: name,
      // Also include codeContentsMap for backwards compatibility with older versions
      codeContentsMap: session.codeContents,
      exportedAt: new Date().toISOString(),
      version: "1.3", // Version with layoutState
      // Layout state for restoring pane positions
      layoutState: {
        codePanelWidth,
        chatCollapsed,
      },
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Sanitize filename and add mode code with .ccs extension
    const safeFileName = name.replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "-").toLowerCase();
    const modeCode = MODE_CODES[session.mode] || "XX";
    a.download = `${safeFileName}-${modeCode}.ccs`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Close modal
    setShowSaveModal(false);
  }, [session, saveModalName]);

  // Handle new project - clears current session after confirmation
  const handleNewProject = useCallback(() => {
    // Clear the session for the current mode
    clearModeSession(session.mode);
    // Reset local state
    setProjectName("");
    setFavouriteMessages(new Set());
    setCodePanelWidth(DEFAULT_CODE_PANEL_WIDTH);
    setChatCollapsed(false);
    // Close modal
    setShowNewProjectModal(false);
  }, [clearModeSession, session.mode]);

  // Check if there are unsaved changes (more than just the initial assistant message)
  // Note: We use a ref to access latest session data to avoid stale closure issues
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const hasUnsavedChanges = useCallback(() => {
    const currentSession = sessionRef.current;
    // User has sent at least one message
    const hasUserMessages = currentSession.messages.some(m => m.role === 'user');
    // Has code files
    const hasCode = currentSession.codeFiles.length > 0;
    // Has analysis results
    const hasAnalysis = currentSession.analysisResults.length > 0;
    // Has references
    const hasRefs = currentSession.references.length > 0;
    // Has generated outputs
    const hasOutputs = currentSession.critiqueArtifacts.length > 0;
    // Has line annotations
    const hasAnnotations = currentSession.lineAnnotations.length > 0;

    return hasUserMessages || hasCode || hasAnalysis || hasRefs || hasOutputs || hasAnnotations;
  }, []); // No dependencies needed - we use ref to access latest session

  // Use ref for projectName to avoid stale closure in imperative handle
  const projectNameRef = useRef(projectName);
  projectNameRef.current = projectName;

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
        setShowExperienceHelp(false);
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
        setShowExperienceHelp(false);
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

  // File management handlers
  const handleDeleteFile = useCallback((fileId: string) => {
    // In cloud mode, the collaborative session handles trash via soft delete
    // In local mode, save to local trash before removing
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
    // Note: removeCode already removes code content via REMOVE_CODE reducer
  }, [removeCode, isInProject, session.codeFiles, session.codeContents]);

  // Local trash handlers (for non-cloud mode)
  const handleLocalLoadTrashedFiles = useCallback(() => {
    // Local trash is already in state, nothing to fetch
  }, []);

  const handleLocalRestoreFile = useCallback(async (fileId: string) => {
    const trashedFile = localTrashedFiles.find(f => f.id === fileId);
    if (!trashedFile) return { error: new Error("File not found in trash") };

    // Re-add the file to session
    const newId = addCode({
      name: trashedFile.name,
      language: trashedFile.language,
      source: "restored",
      size: trashedFile.content.length,
    });
    setCodeContent(newId, trashedFile.content);

    // Remove from local trash
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

  const handleRenameFile = useCallback((fileId: string, newName: string) => {
    updateCode(fileId, { name: newName });
  }, [updateCode]);

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

  // Annotation reply handlers
  const handleToggleReplies = useCallback((annotationId: string) => {
    setExpandedAnnotationId(prev => {
      if (prev === annotationId) {
        // Already expanded - collapse
        setReplyInputOpenFor(null);
        return null;
      }
      // Expand
      return annotationId;
    });
  }, []);

  const handleOpenReplyInput = useCallback((annotationId: string) => {
    console.log("handleOpenReplyInput called for:", annotationId);
    setReplyInputOpenFor(annotationId);
  }, []);

  const handleCloseReplyInput = useCallback(() => {
    setReplyInputOpenFor(null);
  }, []);

  const handleAddReply = useCallback(async (annotationId: string, content: string) => {
    if (!pushReply) return;
    await pushReply(annotationId, content);
    // Close the reply input after submitting
    setReplyInputOpenFor(null);
  }, [pushReply]);

  const handleDeleteReply = useCallback(async (replyId: string) => {
    if (!deleteReply) return;

    // Check if user is deleting someone else's reply (project owner deleting member's reply)
    let needsConfirmation = false;
    let replyAuthor: string | undefined;

    // Find the reply in annotations to check ownership
    for (const annotation of session.lineAnnotations || []) {
      const reply = annotation.replies?.find(r => r.id === replyId);
      if (reply) {
        replyAuthor = reply.addedBy;
        // Need confirmation if:
        // 1. Reply has an author (not the current user's initials)
        // 2. Current user is project owner (can delete anyone's reply via RLS)
        // 3. Reply author doesn't match current user's initials
        const currentUserInitials = user?.user_metadata?.initials || user?.email?.substring(0, 3).toUpperCase();
        const currentProject = projects.find(p => p.id === currentProjectId);
        const isOwner = currentProject?.owner_id === user?.id;

        if (isOwner && reply.addedBy && reply.addedBy !== currentUserInitials) {
          needsConfirmation = true;
        }
        break;
      }
    }

    // Show confirmation if project owner is deleting someone else's reply
    if (needsConfirmation) {
      const confirmed = window.confirm(
        `Delete reply by ${replyAuthor}?\n\nThis will permanently delete this reply.`
      );
      if (!confirmed) return;
    }

    const result = await deleteReply(replyId);
    if (!result.success) {
      console.warn("Failed to delete reply:", result.error);
      alert(result.error || "Failed to delete reply. You may not have permission to delete this reply.");
    }
  }, [deleteReply, session.lineAnnotations, user, projects, currentProjectId]);

  const handleDeleteAnnotation = useCallback(async (annotationId: string) => {
    if (!removeLineAnnotation) return;

    // Find the annotation to check ownership
    const annotation = session.lineAnnotations?.find(a => a.id === annotationId);
    let confirmMessage = "Delete this annotation?\n\nThis will permanently delete the annotation and all its replies.";

    if (annotation) {
      const annotationAuthor = annotation.addedBy;
      const currentUserInitials = user?.user_metadata?.initials || user?.email?.substring(0, 3).toUpperCase();
      const currentProject = projects.find(p => p.id === currentProjectId);
      const isOwner = currentProject?.owner_id === user?.id;

      // Different message if owner is deleting someone else's annotation
      if (isOwner && annotationAuthor && annotationAuthor !== currentUserInitials) {
        confirmMessage = `Delete annotation by ${annotationAuthor}?\n\nThis will permanently delete this annotation and all its replies.`;
      }
    }

    // Always show confirmation for annotation deletion
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;

    // Call the wrapped removeLineAnnotation
    await removeLineAnnotation(annotationId);
  }, [removeLineAnnotation, session.lineAnnotations, user, projects, currentProjectId]);

  // Load session with code contents and mode validation
  const handleLoadSession = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedData = JSON.parse(content);

        // Validate required fields
        if (!importedData.id || !importedData.mode) {
          throw new Error("Invalid session file format");
        }

        // Check if mode matches current mode (critique)
        if (importedData.mode !== "critique") {
          const importedModeCode = MODE_CODES[importedData.mode] || "XX";
          const importedModeLabel = MODE_LABELS[importedModeCode] || importedData.mode;

          alert(`Cannot load this file. It was saved in ${importedModeLabel} mode (-${importedModeCode}) but you are currently in Critique mode (-CR). Please switch to ${importedModeLabel} mode from the home page to load this file.`);
          return;
        }

        // Import the session
        importSession(importedData);

        // Restore project name if present
        if (importedData.projectName) {
          setProjectName(importedData.projectName);
        }

        // Code contents are now handled via importSession (codeContents field in session)
        // For backwards compatibility with older saves using codeContentsMap,
        // we convert it to codeContents during import in the reducer

        // Store loaded code contents as original contents for modification tracking
        const loadedContents = importedData.codeContents || importedData.codeContentsMap || {};
        const newOriginals = new Map<string, string>();
        Object.entries(loadedContents).forEach(([fileId, content]) => {
          if (typeof content === 'string') {
            newOriginals.set(fileId, content);
          }
        });
        setOriginalContents(newOriginals);

        // Restore favourite messages from session
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

        // Add welcome message
        addMessage({
          role: "assistant",
          content: `Session "${importedData.projectName || "Untitled"}" restored from ${importedData.exportedAt ? new Date(importedData.exportedAt).toLocaleDateString() : "file"}. ${importedData.codeFiles?.length || 0} code file(s) and ${importedData.lineAnnotations?.length || 0} annotation(s) loaded.`,
        });
      } catch (error) {
        console.error("Load error:", error);
        alert("Failed to load session. Please check the file format.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }, [importSession, addMessage]);

  // Export handlers using shared utilities
  const handleExportJSON = useCallback(() => {
    const log = generateSessionLog(session, projectName, codeContents, generateAnnotatedCode, profile);
    const modeCode = MODE_CODES[session.mode] || "XX";
    exportSessionLogJSON(log, projectName, modeCode);
    setShowExportModal(false);
  }, [session, projectName, codeContents, profile]);

  const handleExportText = useCallback(() => {
    const log = generateSessionLog(session, projectName, codeContents, generateAnnotatedCode, profile);
    const modeCode = MODE_CODES[session.mode] || "XX";
    exportSessionLogText(log, projectName, modeCode);
    setShowExportModal(false);
  }, [session, projectName, codeContents, profile]);

  const handleExportPDF = useCallback(() => {
    const log = generateSessionLog(session, projectName, codeContents, generateAnnotatedCode, profile);
    const modeCode = MODE_CODES[session.mode] || "XX";
    const annotationIndent = session.displaySettings?.annotations?.indent ?? 56;  // Use user's indent setting
    exportSessionLogPDF(log, projectName, modeCode, annotationIndent);
    setShowExportModal(false);
  }, [session, projectName, codeContents, profile]);

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
      {/* Header */}
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
          {/* Mode indicator - clickable to switch */}
          <div className="relative" data-dropdown>
            <button
              onClick={() => setShowModeDropdown(!showModeDropdown)}
              className="font-sans text-[10px] text-slate hover:text-ink px-2 py-0.5 border border-parchment hover:border-slate-muted rounded-sm transition-colors flex items-center gap-1"
            >
              {session.mode.charAt(0).toUpperCase() + session.mode.slice(1)}
              <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", showModeDropdown && "rotate-180")} strokeWidth={1.5} />
            </button>
            {showModeDropdown && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-popover rounded-sm shadow-lg border border-parchment p-1 z-50">
                {(["critique", "archaeology", "interpret", "create"] as const).map((mode) => (
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
                    <span>{mode.charAt(0).toUpperCase() + mode.slice(1)} Mode</span>
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
          {/* Experience level indicator - clickable to change (hidden on narrow screens) */}
          <div className="relative hidden md:block" data-dropdown>
            <button
              onClick={() => setShowExperienceHelp(!showExperienceHelp)}
              className="font-sans text-[10px] text-slate hover:text-ink px-2 py-0.5 border border-parchment hover:border-slate-muted rounded-sm transition-colors flex items-center gap-1"
            >
              {session.experienceLevel
                ? EXPERIENCE_LEVEL_LABELS[session.experienceLevel as ExperienceLevel]
                : "No level"}
              <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", showExperienceHelp && "rotate-180")} strokeWidth={1.5} />
            </button>

            {/* Experience level dropdown */}
            {showExperienceHelp && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-popover rounded-sm shadow-lg border border-parchment p-1 z-50">
                {(["learning", "practitioner", "research"] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => {
                      setExperienceLevel(level);
                      setShowExperienceHelp(false);
                      // Add a system message to notify the conversation
                      addMessage({
                        role: "system",
                        content: `[Experience level changed to ${EXPERIENCE_LEVEL_LABELS[level]}]`,
                      });
                    }}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded-sm transition-colors",
                      session.experienceLevel === level ? "bg-burgundy/10" : "hover:bg-cream"
                    )}
                  >
                    <span className={cn("block text-[11px]", session.experienceLevel === level ? "text-burgundy" : "text-ink")}>
                      {EXPERIENCE_LEVEL_LABELS[level]}
                    </span>
                    <span className="block text-[9px] text-slate-muted mt-0.5">
                      {EXPERIENCE_LEVEL_DESCRIPTIONS[level]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: Project/session name - shows cloud project name when connected, otherwise local session name */}
        {currentProjectId ? (
          // Cloud project: clickable name with info dropdown
          <div className="hidden sm:flex justify-center min-w-0" data-dropdown ref={projectInfoRef}>
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
                <span className="font-mono text-[10px] text-ink font-medium truncate max-w-[160px]">
                  {currentProject?.name || "Cloud Project"}
                </span>
                {/* Owner initials or Public indicator */}
                {viewingLibraryProjectId ? (
                  <span className="font-sans text-[8px] text-emerald-600 font-medium">Public</span>
                ) : currentProject?.owner?.initials ? (
                  <span className="font-sans text-[8px] text-slate/60">{currentProject.owner.initials}</span>
                ) : null}
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
                <div className="flex flex-col gap-1 text-[10px] text-slate/70 mb-3">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Created: {new Date(currentProject.created_at).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Modified: {new Date(currentProject.updated_at).toLocaleDateString()}
                  </span>
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
                          ref={renameInputRef}
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
                            "bg-white border border-parchment",
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
          <button
            onClick={() => {
              const newName = prompt("Rename project:", projectName || "Untitled");
              if (newName !== null && newName.trim()) {
                setProjectName(newName.trim());
              }
            }}
            className="hidden sm:flex justify-center hover:bg-cream px-2 py-0.5 rounded-sm transition-colors items-center gap-1.5 min-w-0 max-w-[280px]"
            title="Local session (click to rename)"
          >
            <HardDrive className="h-3 w-3 text-slate-muted flex-shrink-0" strokeWidth={1.5} />
            {projectName ? (
              <span className="font-mono text-[10px] text-ink truncate">
                {projectName.replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "-").toLowerCase()}-{MODE_CODES[session.mode] || "XX"}.ccs
              </span>
            ) : (
              <span className="font-mono text-[10px] text-slate-muted italic whitespace-nowrap">
                untitled-{MODE_CODES[session.mode] || "XX"}.ccs
              </span>
            )}
          </button>
        )}
        <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
          <input
            ref={sessionLoadInputRef}
            type="file"
            className="hidden"
            accept=".ccs,.json"
            onChange={handleLoadSession}
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
          <button
            onClick={handleSaveSession}
            className="p-2 md:p-1.5 text-slate hover:text-ink"
            title="Save session"
          >
            <Save className="h-4 w-4" strokeWidth={1.5} />
          </button>
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
          <div className="hidden sm:block w-px h-4 bg-parchment mx-1" />
          <button onClick={() => setShowExportModal(true)} className="p-2 md:p-1.5 text-slate hover:text-ink" title="Export session log">
            <Download className="h-4 w-4" strokeWidth={1.5} />
          </button>
          {/* Save Status Indicator */}
          {autoSave.isSupported && (
            <SaveStatusIndicator
              status={autoSave.saveStatus}
              lastSaved={autoSave.lastSaved}
              isDirty={autoSave.isDirty}
              className="hidden md:flex"
            />
          )}
          {/* AI Status Button */}
          <button
            onClick={() => setShowAIPanel(true)}
            className={cn(
              "font-sans text-[10px] px-2 py-0.5 border rounded-sm transition-colors",
              !aiEnabled
                ? "text-red-700 bg-red-50 border-red-200 hover:border-red-400 dark:text-red-400 dark:bg-red-950 dark:border-red-800 dark:hover:border-red-600"
                : connectionStatus === "success"
                  ? "text-green-700 bg-green-50 border-green-200 hover:border-green-400 dark:text-green-400 dark:bg-green-950 dark:border-green-800 dark:hover:border-green-600"
                  : "text-amber-700 bg-amber-50 border-amber-200 hover:border-amber-400 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800 dark:hover:border-amber-600"
            )}
            title={
              !aiEnabled
                ? "AI disabled - click to enable"
                : connectionStatus === "success"
                  ? "AI connected - click to configure"
                  : connectionStatus === "error"
                    ? "Connection failed - click to configure"
                    : "AI not verified - click to test connection"
            }
          >
            {!aiEnabled ? "AI: Off" : connectionStatus === "success" ? "AI: On" : "AI: ??"}
          </button>
          {/* Cloud projects button - next to AI status */}
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

                {/* Save/Refresh icons (only when in a project) */}
                {currentProjectId && (
                  <>
                    <div className="border-t border-parchment mt-1" />
                    <div className="flex items-center justify-center gap-3 px-2 py-1.5">
                      <button
                        onClick={() => {
                          handleSaveToCloud();
                          setShowCloudMenu(false);
                        }}
                        disabled={isSavingToCloud}
                        title="Save to cloud"
                        className={cn(
                          "flex items-center gap-1 px-1.5 py-1 rounded-sm",
                          "text-[10px] text-slate-muted hover:text-ink",
                          "hover:bg-cream transition-colors",
                          "disabled:opacity-50"
                        )}
                      >
                        {isSavingToCloud ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <Save className="h-2.5 w-2.5" />
                        )}
                        Save
                      </button>
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
                        <p>Dialogue with AI assistant. Guided prompts suggest phase-appropriate questions. "Help Annotate" asks AI to suggest annotations.</p>
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

      {/* Cloud project restored banner */}
      {showProjectRestoredBanner && currentProject && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CloudCog className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="font-sans text-[11px] text-blue-800 dark:text-blue-200">
              Reconnected to cloud project: <strong>{currentProject.name}</strong>
            </span>
          </div>
          <button
            onClick={() => setShowProjectRestoredBanner(false)}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
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
              importSession({
                ...sampleData,
                mode: currentMode, // Keep user's current mode
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

        {/* Right: Chat Panel - only show when AI enabled and not fullscreen, hidden on mobile */}
        {aiEnabled && !annotationFullScreen && (
        <div
          className={cn(
            "hidden md:flex flex-col transition-all duration-200",
            chatCollapsed ? "w-10 flex-shrink-0" : "flex-1 min-w-0"
          )}
          data-mobile-chat-hook
        >
          {/* Collapsed state - just show expand button */}
          {chatCollapsed ? (
            <div className="flex-1 flex flex-col items-center pt-2 bg-cream/30 border-l border-parchment">
              <button
                onClick={() => setChatCollapsed(false)}
                className="p-2 text-slate hover:text-ink hover:bg-cream rounded-sm transition-colors"
                title="Expand chat panel"
              >
                <PanelRight className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <span className="mt-2 text-[10px] text-slate-muted" style={{ writingMode: "vertical-rl" }}>Chat</span>
            </div>
          ) : (
          <>
          {/* Chat panel header bar - matches file tree header style */}
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-parchment bg-cream/30">
            <button
              onClick={() => setChatCollapsed(true)}
              className="p-1 text-slate-muted hover:text-ink hover:bg-cream rounded-sm transition-colors"
              title="Collapse chat panel"
            >
              <PanelRightClose className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            <span className="font-sans text-[10px] text-slate-muted">
              AI: {PROVIDER_CONFIGS[aiSettings.provider]?.name || aiSettings.provider}
            </span>
          </div>
          {/* Chat search bar */}
          {showChatSearch && (
            <div className="border-b border-parchment bg-cream/50 px-3 py-2 flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-slate-muted flex-shrink-0" strokeWidth={1.5} />
              <input
                ref={chatSearchInputRef}
                type="text"
                value={chatSearchQuery}
                onChange={(e) => setChatSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="flex-1 bg-transparent text-sm text-ink placeholder:text-slate-muted focus:outline-none font-body"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowChatSearch(false);
                    setChatSearchQuery("");
                  }
                }}
              />
              {chatSearchQuery && (
                <span className="text-[10px] text-slate-muted">
                  {session.messages.filter(m =>
                    m.content.toLowerCase().includes(chatSearchQuery.toLowerCase())
                  ).length} found
                </span>
              )}
              <button
                onClick={() => {
                  setShowChatSearch(false);
                  setChatSearchQuery("");
                }}
                className="p-0.5 text-slate-muted hover:text-ink"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          )}
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {session.messages
              .filter(message =>
                !chatSearchQuery ||
                message.content.toLowerCase().includes(chatSearchQuery.toLowerCase())
              )
              .map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[90%] group/message",
                  message.role === "user" ? "ml-auto" : "mr-auto"
                )}
              >
                <div
                  className={cn(
                    "px-4 py-3 rounded-sm",
                    message.role === "user"
                      ? "bg-burgundy/10 text-ink"
                      : "bg-card border border-parchment"
                  )}
                >
                  <div
                    className="font-body leading-relaxed prose prose-sm prose-slate dark:prose-invert max-w-none
                      prose-p:my-2 prose-p:leading-relaxed prose-p:text-[1em]
                      prose-headings:font-display prose-headings:text-ink prose-headings:mt-4 prose-headings:mb-2
                      prose-h1:text-[1.2em] prose-h2:text-[1.1em] prose-h3:text-[1em]
                      prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:text-[1em]
                      prose-code:font-mono prose-code:bg-parchment prose-code:px-1 prose-code:py-0.5 prose-code:rounded-sm prose-code:!text-[0.85em] prose-code:before:content-none prose-code:after:content-none
                      prose-pre:bg-parchment prose-pre:border prose-pre:border-parchment-dark prose-pre:rounded-sm prose-pre:my-2 prose-pre:!text-[0.85em] prose-pre:font-mono prose-pre:overflow-x-auto
                      prose-blockquote:border-l-burgundy prose-blockquote:text-slate-muted prose-blockquote:my-2
                      prose-strong:text-ink prose-strong:font-semibold
                      prose-a:text-burgundy prose-a:no-underline hover:prose-a:underline"
                    style={{ fontSize: `${chatFontSize}px` }}
                  >
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
                {/* User/Model name, timestamp, and actions inline */}
                <div className={cn(
                  "mt-0.5 px-1 flex items-center gap-2",
                  message.role === "user" ? "flex-row-reverse" : "flex-row"
                )}>
                  <span className="font-sans text-[9px] text-slate-muted">
                    {message.role !== "user" && message.metadata?.model && `${message.metadata.model}, `}
                    {formatTimestamp(message.timestamp)}
                    {message.role === "user" && getDisplayName() && `, ${getDisplayName()}`}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => handleCopyMessage(message.id, message.content)}
                      className="p-0.5 text-slate-muted hover:text-ink rounded-sm transition-colors opacity-0 group-hover/message:opacity-100"
                      title="Copy"
                    >
                      {copiedMessageId === message.id ? (
                        <Check className="h-3 w-3 text-green-600" strokeWidth={1.5} />
                      ) : (
                        <Copy className="h-3 w-3" strokeWidth={1.5} />
                      )}
                    </button>
                    <button
                      onClick={() => handleToggleFavourite(message.id)}
                      className={cn(
                        "p-0.5 rounded-sm transition-colors",
                        favouriteMessages.has(message.id)
                          ? "text-burgundy"
                          : "text-slate-muted hover:text-ink opacity-0 group-hover/message:opacity-100"
                      )}
                      title={favouriteMessages.has(message.id) ? "Marked" : "Mark"}
                    >
                      <Heart
                        className="h-3 w-3"
                        strokeWidth={1.5}
                        fill={favouriteMessages.has(message.id) ? "currentColor" : "none"}
                      />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start pl-2 py-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-burgundy/70 thinking-dot" />
                  <div className="w-1.5 h-1.5 rounded-full bg-burgundy/70 thinking-dot" />
                  <div className="w-1.5 h-1.5 rounded-full bg-burgundy/70 thinking-dot" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Context Preview */}
          <ContextPreview
            codeFiles={session.codeFiles}
            codeContents={codeContents}
            annotations={session.lineAnnotations}
          />

          {/* Guided Prompts */}
          {showGuidedPrompts && session.mode && (
            <div data-guided-prompts className="border-t border-parchment p-3">
              <GuidedPrompts
                mode={session.mode}
                currentPhase={session.currentPhase}
                onSelectPrompt={handleSelectGuidedPrompt}
                compact
              />
            </div>
          )}

          {/* Input area - Claude-style */}
          <div className="p-3 flex justify-center">
          <div className="w-full md:w-[80%]">
            {/* Claude-style input container */}
            <div className="bg-card rounded-2xl border border-parchment shadow-sm">
              {/* Textarea */}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Reply..."
                className="w-full resize-none rounded-t-2xl px-4 py-3 font-body bg-transparent focus:outline-none overflow-hidden"
                style={{ fontSize: `${chatFontSize}px`, minHeight: '44px' }}
                rows={1}
              />

              {/* Bottom toolbar */}
              <div className="flex items-center justify-between px-3 pb-2">
                {/* Left side icons */}
                <div className="flex items-center gap-0.5">
                  {session.codeFiles.length > 0 && (
                    <>
                      <button
                        onClick={() => {
                          setInput("Suggest 3-5 annotations I could add to this code. For each suggestion, specify the line number, annotation type (Obs, Q, Met, Pat, Ctx, or Crit), and the annotation text. Focus on interesting interpretive entry points for close reading.");
                          inputRef.current?.focus();
                        }}
                        className="p-1.5 text-slate hover:text-ink rounded-md transition-colors"
                        title="Help annotate"
                      >
                        <Sparkles className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={() => setShowSendContextModal(true)}
                        className="p-1.5 text-slate hover:text-ink rounded-md transition-colors"
                        title="View context sent to LLM"
                      >
                        <Eye className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </>
                  )}
                  {session.messages.length > 0 && (
                    <button
                      onClick={() => {
                        setShowChatSearch(!showChatSearch);
                        if (!showChatSearch) {
                          setTimeout(() => chatSearchInputRef.current?.focus(), 50);
                        } else {
                          setChatSearchQuery("");
                        }
                      }}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        showChatSearch ? "text-burgundy" : "text-slate hover:text-ink"
                      )}
                      title="Search messages (Cmd+Shift+F)"
                    >
                      <Search className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  )}
                  {(GUIDED_PROMPTS[session.mode]?.[session.currentPhase]?.length ?? 0) > 0 && (
                    <button
                      data-guided-prompts
                      onClick={() => setShowGuidedPrompts(!showGuidedPrompts)}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        showGuidedPrompts ? "text-burgundy" : "text-slate hover:text-ink"
                      )}
                      title="Guided prompts"
                    >
                      <Lightbulb className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  )}
                </div>

                {/* Right side: font size + send button */}
                <div className="flex items-center gap-1">
                  {/* Font size popover */}
                  <div className="relative" data-dropdown>
                    <button
                      onClick={() => setShowFontSizePopover(!showFontSizePopover)}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        showFontSizePopover ? "text-burgundy" : "text-slate hover:text-ink"
                      )}
                      title="Font size"
                    >
                      <SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                    {showFontSizePopover && (
                      <div className="absolute bottom-full right-0 mb-2 bg-popover rounded-lg border border-parchment shadow-lg p-2 z-50">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setModeChatFontSize("critique", chatFontSize - 1)}
                            disabled={chatFontSize <= FONT_SIZE_MIN}
                            className="p-1.5 text-slate hover:text-ink hover:bg-cream rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Decrease"
                          >
                            <Minus className="h-3 w-3" strokeWidth={1.5} />
                          </button>
                          <span className="text-xs text-ink font-mono w-6 text-center">{chatFontSize}</span>
                          <button
                            onClick={() => setModeChatFontSize("critique", chatFontSize + 1)}
                            disabled={chatFontSize >= FONT_SIZE_MAX}
                            className="p-1.5 text-slate hover:text-ink hover:bg-cream rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Increase"
                          >
                            <Plus className="h-3 w-3" strokeWidth={1.5} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Send button */}
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading || !isAiReady}
                    className={cn(
                      "p-2 rounded-lg flex items-center justify-center transition-colors",
                      input.trim() && !isLoading && isAiReady
                        ? "bg-burgundy text-ivory hover:bg-burgundy-dark"
                        : "bg-parchment text-slate-muted cursor-not-allowed"
                    )}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowUp className="h-4 w-4" strokeWidth={2} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
          </div>
          </>
          )}
        </div>
        )}

        {/* Hidden file input - outside aiEnabled conditional so it works when AI is disabled */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        initialTab={settingsTab}
      />

      {/* AI Settings Panel */}
      <AISettingsPanel
        isOpen={showAIPanel}
        onClose={() => setShowAIPanel(false)}
      />


      {/* Export Session Log Modal */}
      {showExportModal && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setShowExportModal(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-lg p-6 w-full max-w-md mx-4 border border-parchment modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg text-ink">Export Session Log</h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-slate-muted hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <p className="font-body text-sm text-slate mb-2">
              Export a comprehensive log of your CCS session for documentation and research.
            </p>
            <p className="font-body text-xs text-slate-muted mb-6">
              Includes: metadata, code with annotations, full conversation, literature references, and statistics.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleExportJSON}
                className="w-full text-left p-4 border border-parchment rounded-sm hover:border-burgundy hover:bg-burgundy/5 transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-green-600" strokeWidth={1.5} />
                  <h4 className="font-display text-sm text-ink">JSON Format</h4>
                </div>
                <p className="font-body text-xs text-slate">
                  Structured data format. Best for programmatic analysis or reimport.
                </p>
              </button>
              <button
                onClick={handleExportText}
                className="w-full text-left p-4 border border-parchment rounded-sm hover:border-burgundy hover:bg-burgundy/5 transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-blue-600" strokeWidth={1.5} />
                  <h4 className="font-display text-sm text-ink">Plain Text</h4>
                </div>
                <p className="font-body text-xs text-slate">
                  Human-readable format. Best for reading, sharing, or archiving.
                </p>
              </button>
              <button
                onClick={handleExportPDF}
                className="w-full text-left p-4 border border-parchment rounded-sm hover:border-burgundy hover:bg-burgundy/5 transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileDown className="h-4 w-4 text-burgundy" strokeWidth={1.5} />
                  <h4 className="font-display text-sm text-ink">PDF Document</h4>
                </div>
                <p className="font-body text-xs text-slate">
                  Formatted document. Best for printing or formal documentation.
                </p>
              </button>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-sm text-slate hover:text-ink border border-parchment rounded-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Session Modal - Custom styled replacement for native prompt */}
      {showSaveModal && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setShowSaveModal(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-editorial-lg p-4 w-full max-w-sm mx-4 border border-parchment"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-sm text-foreground flex items-center gap-2">
                <Save className="h-4 w-4 text-burgundy" strokeWidth={1.5} />
                Save Session
              </h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-slate-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <p className="font-body text-[11px] text-slate mb-3">
              Enter a name for your session. The file will be saved with a .ccs extension to your browser's default download folder.
            </p>
            <input
              type="text"
              value={saveModalName}
              onChange={(e) => setSaveModalName(e.target.value)}
              placeholder="Session name"
              className="w-full px-3 py-2 font-body text-[12px] bg-card border border-parchment rounded-sm focus:outline-none focus:border-burgundy/50 text-foreground placeholder:text-slate-muted"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveModalName.trim()) {
                  handleConfirmSave();
                } else if (e.key === 'Escape') {
                  setShowSaveModal(false);
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="btn-editorial-secondary text-[11px] px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSave}
                disabled={!saveModalName.trim()}
                className="btn-editorial-primary text-[11px] px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Project Confirmation Modal */}
      {showNewProjectModal && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setShowNewProjectModal(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-editorial-lg p-4 w-full max-w-sm mx-4 border border-parchment"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-sm text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
                New Project
              </h3>
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="text-slate-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <p className="font-body text-[11px] text-slate mb-3">
              This will clear your current session including all code files, annotations, and chat history. This action cannot be undone.
            </p>
            <p className="font-body text-[11px] text-amber-700 dark:text-amber-400 mb-4">
              Make sure to save your session first if you want to keep your work.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="text-[11px] px-3 py-1.5 rounded-sm font-body border border-parchment-dark text-slate hover:bg-cream hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNewProject}
                className="text-[11px] px-3 py-1.5 rounded-sm font-body bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Clear and Start New
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Context Modal - Shows what gets sent to the LLM */}
      {showSendContextModal && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setShowSendContextModal(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-lg w-full max-w-2xl mx-4 border border-parchment max-h-[80vh] flex flex-col modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-parchment">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-burgundy" strokeWidth={1.5} />
                <h3 className="font-display text-lg text-ink">LLM Context Preview</h3>
              </div>
              <button
                onClick={() => setShowSendContextModal(false)}
                className="text-slate-muted hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="font-body text-sm text-slate mb-4">
                This is the annotated code context that gets sent to the LLM with each message.
                Your annotations are embedded as <code className="bg-cream px-1 rounded text-xs">// An:Type:</code> comments.
              </p>
              <div className="mb-4 p-3 bg-cream/50 rounded-sm border border-parchment">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-sans text-xs font-medium text-ink">Summary</span>
                </div>
                <ul className="font-body text-xs text-slate space-y-1">
                  <li>• {session.codeFiles.length} code file{session.codeFiles.length !== 1 ? "s" : ""}</li>
                  <li>• {session.lineAnnotations.length} annotation{session.lineAnnotations.length !== 1 ? "s" : ""}</li>
                  <li>• {annotatedCodeContext.length.toLocaleString()} characters total</li>
                </ul>
              </div>
              <div className="border border-parchment rounded-sm">
                <div className="px-3 py-2 bg-cream/30 border-b border-parchment">
                  <span className="font-sans text-xs text-slate-muted uppercase tracking-wider">Context Sent to LLM</span>
                </div>
                <pre className="p-3 text-xs font-mono text-foreground whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto bg-card">
                  {annotatedCodeContext || "(No code loaded yet)"}
                </pre>
              </div>
            </div>
            <div className="p-4 border-t border-parchment flex justify-between items-center">
              <p className="font-body text-xs text-slate-muted">
                Add annotations in the code panel to enrich the context.
              </p>
              <button
                onClick={() => setShowSendContextModal(false)}
                className="px-4 py-2 text-sm text-slate hover:text-ink border border-parchment rounded-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
