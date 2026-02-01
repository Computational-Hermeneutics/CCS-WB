"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSession } from "@/context/SessionContext";
import { cn } from "@/lib/utils";
import {
  X,
  Download,
  HelpCircle,
  MoreVertical,
  Trash2,
  Pencil,
  Copy,
  Check,
  Upload,
  Settings2,
  Minus,
  Plus,
  PanelLeft,
  PanelLeftClose,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Highlighter,
  Menu,
  Maximize2,
  Minimize2,
  RotateCcw,
  Undo2,
  Redo2,
  BookOpen,
  Cloud,
  FilePlus,
  HardDrive,
} from "lucide-react";
import { fetchSampleProject, fetchSampleProjectsManifest, type SampleProject } from "@/data/sample-projects";
import type {
  LineAnnotation,
  LineAnnotationType,
  CodeReference,
  AnnotationDisplaySettings as SessionAnnotationDisplaySettings,
  AnnotationBrightness,
  LineHighlightIntensity,
} from "@/types";
import {
  PROGRAMMING_LANGUAGES,
  ANNOTATION_FONT_SIZE_MIN,
  ANNOTATION_FONT_SIZE_MAX,
  ANNOTATION_INDENT_MIN,
  ANNOTATION_INDENT_MAX,
  CODE_FONT_OPTIONS,
  type CodeFontId,
} from "@/types/app-settings";
import { useAppSettings } from "@/context/AppSettingsContext";
import { DEFAULT_ANNOTATION_DISPLAY_SETTINGS } from "@/types/session";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import type { InlineEditState, InlineEditCallbacks } from "./cm-annotations";
import { ConfirmDialog } from "../shared/ConfirmDialog";

interface CodeEditorPanelProps {
  codeFiles: CodeReference[];
  codeContents: Map<string, string>; // fileId -> code content
  originalContents?: Map<string, string>; // fileId -> original content (for detecting modifications)
  onCodeChange?: () => void;
  onCodeContentChange?: (fileId: string, content: string) => void; // Edit code content
  onDeleteFile?: (fileId: string) => void;
  onRenameFile?: (fileId: string, newName: string) => void;
  onDuplicateFile?: (fileId: string) => void;
  onRevertFile?: (fileId: string) => void; // Revert file to original content
  onCommitFile?: (fileId: string) => void; // Commit current content as new base version
  onLoadCode?: () => void; // Trigger file upload from sidebar
  onLoadSampleProject?: (projectData: Record<string, unknown>) => void; // Load a sample project
  onAddNewFile?: () => void; // Create a new blank file
  onReorderFiles?: (fileIds: string[]) => void; // Reorder files by new order
  onUpdateFileLanguage?: (fileId: string, language: string | undefined) => void; // Update file's language
  isFullScreen?: boolean; // Whether annotation pane is in full screen mode
  onToggleFullScreen?: () => void; // Callback to toggle full screen mode
  onRequestMinPanelWidth?: (minWidthPercent: number) => void; // Request minimum panel width (for auto-extend)
  userInitials?: string; // User initials to store with annotations (for multi-user support)
  // Annotation methods (optional - falls back to useSession if not provided)
  onAddLineAnnotation?: (annotation: Omit<LineAnnotation, "id" | "createdAt">) => void;
  onUpdateLineAnnotation?: (id: string, updates: Partial<Omit<LineAnnotation, "id" | "codeFileId" | "createdAt">>) => void;
  onRemoveLineAnnotation?: (id: string) => void;
  onClearLineAnnotations?: (codeFileId: string) => void;
  // Remote annotation IDs for animation (yellow flash when collaborator adds annotation)
  newRemoteAnnotationIds?: Set<string>;
  // Annotation replies
  expandedAnnotationId?: string | null;
  onToggleReplies?: (annotationId: string) => void;
  onAddReply?: (annotationId: string, content: string) => void;
  onDeleteReply?: (replyId: string) => void;
  replyInputOpenFor?: string | null;
  onOpenReplyInput?: (annotationId: string) => void;
  onCloseReplyInput?: () => void;
  // Whether we're in a cloud project (for showing cloud icon on files)
  isInProject?: boolean;
  // Whether the panel is in read-only mode (e.g., viewing library project)
  readOnly?: boolean;
  // Number of members in the shared project (0 = not shared, undefined = unknown)
  sharedProjectMemberCount?: number;
  // List of members in the shared project
  sharedProjectMembers?: Array<{ user_id: string; initials?: string; avatar_url?: string; display_name?: string; role: string }>;
  // File trash props (for cloud projects)
  trashedFiles?: Array<{ id: string; name: string; language: string; deletedAt: string }>;
  isLoadingFileTrash?: boolean;
  onLoadTrashedFiles?: () => void;
  onRestoreFile?: (fileId: string) => Promise<{ error: Error | null }>;
  onPermanentlyDeleteFile?: (fileId: string) => Promise<{ error: Error | null }>;
  onEmptyFileTrash?: () => Promise<{ error: Error | null }>;
}

// Historical punch card languages that typically used 80-column format
const PUNCH_CARD_LANGUAGES = [
  'fortran', 'cobol', 'basic', 'pascal', 'assembly', 'asm', 'agc',
  // Early variants
  'fortran77', 'fortran90', 'f77', 'f90', 'cob', 'bas',
  // MIT/early AI languages
  'mad', 'slip', 'lisp',
  // Other punch card era languages
  'pli', 'pl1', 'algol', 'snobol', 'apl'
];

/**
 * Detect if a file appears to be in 80-column punch card format.
 * Returns true if:
 * - The file uses a punch card language, OR
 * - More than 50% of non-empty lines are exactly 72-80 characters, OR
 * - Lines have sequence numbers in columns 73-80 (right side - FORTRAN style), OR
 * - Lines have sequence numbers at the start (left side - MAD/SLIP style)
 */
function detectPunchCardFormat(code: string, language?: string): boolean {
  // Check if it's a punch card language
  if (language) {
    const normalizedLang = language.toLowerCase().trim();
    if (PUNCH_CARD_LANGUAGES.some(l => normalizedLang.includes(l))) {
      return true;
    }
  }

  const lines = code.split('\n');
  const nonEmptyLines = lines.filter(line => line.trim().length > 0);

  if (nonEmptyLines.length < 5) return false; // Not enough lines to determine

  // Check for sequence numbers on the LEFT (MAD/SLIP/early languages)
  // Pattern: lines starting with 5-8 digit numbers (often increments of 10)
  // e.g., "000010", "001400", "00100"
  const leftSequencePattern = /^\s*\d{5,8}\s/;
  const linesWithLeftNumbers = nonEmptyLines.filter(line =>
    leftSequencePattern.test(line)
  ).length;

  // If more than 30% of lines have left-side sequence numbers, it's punch card
  if (linesWithLeftNumbers / nonEmptyLines.length > 0.3) {
    return true;
  }

  // Check for sequence numbers on the right (columns 73-80)
  // Pattern: lines ending with whitespace + 5-8 digit numbers
  // Note: Total line length may exceed 80 due to leading whitespace (common in preserved files)
  // e.g., "      EXTERNAL FUNCTION (KEY,MYTRAN)                                      000010"
  const rightSequencePattern = /\s{2,}\d{5,8}\s*$/;
  const linesWithRightNumbers = nonEmptyLines.filter(line =>
    rightSequencePattern.test(line)
  ).length;

  // If more than 30% of lines have right-side sequence numbers, it's punch card
  if (linesWithRightNumbers / nonEmptyLines.length > 0.3) {
    return true;
  }

  // Count lines that are in the 72-80 character range (typical punch card)
  const punchCardLines = nonEmptyLines.filter(line => {
    const len = line.length;
    return len >= 72 && len <= 80;
  }).length;

  // If more than 50% of lines are 72-80 chars, it's likely punch card format
  return punchCardLines / nonEmptyLines.length > 0.5;
}

/**
 * Calculate the minimum panel width percentage needed to display 80 characters
 * without horizontal scrolling.
 * @param containerWidth - Total available width in pixels
 * @param fontSize - Current font size in pixels
 * @param sidebarWidth - Width of the file tree sidebar in pixels
 * @returns Minimum panel width as a percentage (0-100)
 */
function calculateMinWidthForPunchCard(
  containerWidth: number,
  fontSize: number,
  sidebarWidth: number
): number {
  // Approximate character width for monospace font (varies by font, ~0.6em is typical)
  const charWidth = fontSize * 0.6;

  // Width needed: 80 chars + line numbers (~4 chars) + gutter padding (~32px) + scrollbar safety (~20px)
  const lineNumberWidth = charWidth * 5; // Line numbers plus gutter
  const padding = 32 + 20; // Left/right padding plus scrollbar safety margin
  const codeWidth = charWidth * 80;
  const totalNeeded = sidebarWidth + lineNumberWidth + codeWidth + padding;

  // Convert to percentage of container
  const percentNeeded = (totalNeeded / containerWidth) * 100;

  // Return with a small buffer, capped at 85% (max allowed in CritiqueLayout)
  return Math.min(85, percentNeeded + 2);
}

type FileSortOrder = "manual" | "az" | "za";

type EditorMode = "annotate" | "edit";

// Display settings for code viewer
interface DisplaySettings {
  fontSize: number; // Font size in pixels
  bold: boolean;
}

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  fontSize: 12,
  bold: false,
};

// Use AnnotationDisplaySettings from session types (includes fontSize and indent)
// Re-export for backwards compatibility with other code that imports from here
export type { LineHighlightIntensity } from "@/types";
type AnnotationDisplaySettings = SessionAnnotationDisplaySettings;

// Min/max font sizes
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 24;

// Annotation type prefixes for inline display
const ANNOTATION_PREFIXES: Record<LineAnnotationType, string> = {
  observation: "Obs",
  question: "Q",
  metaphor: "Met",
  pattern: "Pat",
  context: "Ctx",
  critique: "Crit",
};

// Reverse mapping: prefix -> type
const PREFIX_TO_TYPE: Record<string, LineAnnotationType> = {
  Obs: "observation",
  Q: "question",
  Met: "metaphor",
  Pat: "pattern",
  Ctx: "context",
  Crit: "critique",
};

// Regex to match annotation lines: // An:Type: content (with optional leading whitespace)
const ANNOTATION_LINE_REGEX = /^\s*\/\/\s*An:(Obs|Q|Met|Pat|Ctx|Crit):\s*(.*)$/;

const ANNOTATION_COLORS: Record<LineAnnotationType, string> = {
  observation: "text-blue-600 dark:text-blue-400",
  question: "text-amber-600 dark:text-amber-400",
  metaphor: "text-purple-600 dark:text-purple-400",
  pattern: "text-green-600 dark:text-green-400",
  context: "text-slate-500 dark:text-slate-400",
  critique: "text-burgundy",
};

// Pill background colors for annotation panel (muted/subtle)
const ANNOTATION_PILL_COLORS: Record<LineAnnotationType, string> = {
  observation: "bg-blue-400/35 dark:bg-blue-500/30",
  question: "bg-amber-400/35 dark:bg-amber-500/30",
  metaphor: "bg-purple-400/35 dark:bg-purple-500/30",
  pattern: "bg-green-400/35 dark:bg-green-500/30",
  context: "bg-slate-400/35 dark:bg-slate-500/30",
  critique: "bg-burgundy/35 dark:bg-burgundy/30",
};

// File type categories for colour coding
type FileCategory = "code" | "web" | "data" | "text" | "shell" | "other";

const LANGUAGE_CATEGORIES: Record<string, FileCategory> = {
  // Code languages
  python: "code", javascript: "code", typescript: "code", java: "code",
  c: "code", "c++": "code", cpp: "code", "c#": "code", csharp: "code",
  go: "code", rust: "code", ruby: "code", php: "code", swift: "code",
  kotlin: "code", scala: "code", perl: "code", r: "code",
  basic: "code", fortran: "code", cobol: "code", pascal: "code",
  lisp: "code", scheme: "code", prolog: "code", haskell: "code",
  erlang: "code", elixir: "code", clojure: "code", lua: "code",
  matlab: "code", julia: "code", dart: "code", groovy: "code",
  assembly: "code", asm: "code", agc: "code",
  // Web
  html: "web", css: "web", jsx: "web", tsx: "web", vue: "web",
  // Shell/scripting
  bash: "shell", shell: "shell", zsh: "shell", powershell: "shell",
  // Data/config
  json: "data", yaml: "data", yml: "data", xml: "data", toml: "data", sql: "data",
  // Text
  pseudocode: "text", other: "text", markdown: "text", md: "text", txt: "text",
};

const FILE_CATEGORY_COLORS: Record<FileCategory, string> = {
  code: "text-blue-600",      // Blue for code
  web: "text-orange-600",     // Orange for web
  data: "text-green-600",     // Green for data/config
  shell: "text-amber-600",    // Amber for shell scripts
  text: "text-slate-500",     // Grey for text/other
  other: "text-slate-500",
};

// Language to file extension mapping
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  // Common languages
  python: ".py",
  javascript: ".js",
  typescript: ".ts",
  java: ".java",
  c: ".c",
  "c++": ".cpp",
  cpp: ".cpp",
  "c#": ".cs",
  csharp: ".cs",
  go: ".go",
  rust: ".rs",
  ruby: ".rb",
  php: ".php",
  swift: ".swift",
  kotlin: ".kt",
  scala: ".scala",
  perl: ".pl",
  r: ".r",
  // Web
  html: ".html",
  css: ".css",
  jsx: ".jsx",
  tsx: ".tsx",
  vue: ".vue",
  // Shell/scripting
  bash: ".sh",
  shell: ".sh",
  zsh: ".sh",
  powershell: ".ps1",
  // Data/config
  json: ".json",
  yaml: ".yaml",
  yml: ".yml",
  xml: ".xml",
  toml: ".toml",
  sql: ".sql",
  // Historical/academic
  basic: ".bas",
  fortran: ".f90",
  cobol: ".cob",
  pascal: ".pas",
  lisp: ".lisp",
  scheme: ".scm",
  prolog: ".pl",
  haskell: ".hs",
  erlang: ".erl",
  elixir: ".ex",
  clojure: ".clj",
  // Assembly
  assembly: ".asm",
  asm: ".asm",
  // Other
  lua: ".lua",
  matlab: ".m",
  julia: ".jl",
  dart: ".dart",
  groovy: ".groovy",
  // Pseudocode defaults to txt
  pseudocode: ".txt",
  other: ".txt",
};

export function CodeEditorPanel({
  codeFiles,
  codeContents,
  originalContents,
  onCodeContentChange,
  onDeleteFile,
  onRenameFile,
  onDuplicateFile,
  onRevertFile,
  onCommitFile,
  onLoadCode,
  onLoadSampleProject,
  onAddNewFile,
  onReorderFiles,
  onUpdateFileLanguage,
  isFullScreen = false,
  onToggleFullScreen,
  onRequestMinPanelWidth,
  userInitials,
  onAddLineAnnotation,
  onUpdateLineAnnotation,
  onRemoveLineAnnotation,
  onClearLineAnnotations,
  newRemoteAnnotationIds,
  expandedAnnotationId,
  onToggleReplies,
  onAddReply,
  onDeleteReply,
  replyInputOpenFor,
  onOpenReplyInput,
  onCloseReplyInput,
  isInProject = false,
  readOnly = false,
  sharedProjectMemberCount = 0,
  sharedProjectMembers = [],
  // File trash props
  trashedFiles = [],
  isLoadingFileTrash = false,
  onLoadTrashedFiles,
  onRestoreFile,
  onPermanentlyDeleteFile,
  onEmptyFileTrash,
}: CodeEditorPanelProps) {
  const {
    session,
    addLineAnnotation: sessionAddLineAnnotation,
    updateLineAnnotation: sessionUpdateLineAnnotation,
    removeLineAnnotation: sessionRemoveLineAnnotation,
    clearLineAnnotations: sessionClearLineAnnotations,
    updateAnnotationDisplaySettings,
  } = useSession();

  // Get app settings for code font
  const { settings: appSettings, setCodeFont } = useAppSettings();

  // Get annotation display settings from session (per-project)
  // Use defaults as fallback for old sessions that don't have displaySettings
  const annotationDisplaySettings = session.displaySettings?.annotations ?? DEFAULT_ANNOTATION_DISPLAY_SETTINGS;
  // Wrapper to update annotation display settings
  const setAnnotationDisplaySettings = (updater: Partial<AnnotationDisplaySettings> | ((prev: AnnotationDisplaySettings) => Partial<AnnotationDisplaySettings>)) => {
    if (typeof updater === "function") {
      const updates = updater(annotationDisplaySettings);
      updateAnnotationDisplaySettings(updates);
    } else {
      updateAnnotationDisplaySettings(updater);
    }
  };

  // Use prop methods if provided, otherwise fall back to session methods
  const addLineAnnotation = onAddLineAnnotation ?? sessionAddLineAnnotation;
  const updateLineAnnotation = onUpdateLineAnnotation ?? sessionUpdateLineAnnotation;
  const removeLineAnnotation = onRemoveLineAnnotation ?? sessionRemoveLineAnnotation;
  const clearLineAnnotations = onClearLineAnnotations ?? sessionClearLineAnnotations;

  const [selectedFileId, setSelectedFileId] = useState<string | null>(() => {
    // On initial mount, prioritize README.md if it exists
    if (codeFiles.length > 0) {
      const readmeFile = codeFiles.find(f => {
        const name = f.name.toLowerCase();
        return name === 'readme.md' || name === 'readme' || name.startsWith('readme.');
      });
      return readmeFile ? readmeFile.id : codeFiles[0].id;
    }
    return null;
  });
  const [editorMode, setEditorMode] = useState<EditorMode>("annotate");
  // Store the "clean" code (without embedded annotations) for edit mode
  const [editModeCode, setEditModeCode] = useState<string>("");
  // Track previous file IDs to detect which files were newly added
  const prevFileIdsRef = useRef<Set<string>>(new Set(codeFiles.map(f => f.id)));

  // Auto-select newly added LOCAL files, or first file if none selected
  // Don't auto-select files added by remote collaborators (source === "shared")
  useEffect(() => {
    if (codeFiles.length > 0) {
      const currentIds = new Set(codeFiles.map(f => f.id));
      const prevIds = prevFileIdsRef.current;

      // Find newly added files (in current but not in previous)
      const newFiles = codeFiles.filter(f => !prevIds.has(f.id));

      if (newFiles.length > 0) {
        // Only auto-select if the new file is local (not from a collaborator)
        // Files from collaborators have source === "shared"
        const localNewFiles = newFiles.filter(f => f.source !== "shared");
        if (localNewFiles.length > 0) {
          // Check if README.md is among the new files (prioritize it for sample projects)
          // More robust matching: check for readme with any extension
          const readmeFile = localNewFiles.find(f => {
            const name = f.name.toLowerCase();
            return name === 'readme.md' || name === 'readme' || name.startsWith('readme.');
          });
          if (readmeFile) {
            setSelectedFileId(readmeFile.id);
          } else {
            // Select the last locally-added file
            setSelectedFileId(localNewFiles[localNewFiles.length - 1].id);
          }
        }
        // If only shared files were added, keep current selection
      } else {
        // If no file selected or selected file no longer exists, select the first one
        const selectedExists = codeFiles.some((f) => f.id === selectedFileId);
        if (!selectedFileId || !selectedExists) {
          // Try to find README first, even among existing files
          const readmeFile = codeFiles.find(f => {
            const name = f.name.toLowerCase();
            return name === 'readme.md' || name === 'readme' || name.startsWith('readme.');
          });
          setSelectedFileId(readmeFile ? readmeFile.id : codeFiles[0].id);
        }
      }

      // Update tracking ref
      prevFileIdsRef.current = currentIds;
    } else {
      setSelectedFileId(null);
      prevFileIdsRef.current = new Set();
    }
  }, [codeFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [editingEndLine, setEditingEndLine] = useState<number | null>(null); // For block annotations
  const [annotationType, setAnnotationType] = useState<LineAnnotationType>("observation");
  const [annotationContent, setAnnotationContent] = useState("");
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editType, setEditType] = useState<LineAnnotationType>("observation");
  const [showAnnotationHelp, setShowAnnotationHelp] = useState(false);
  const [showMembersDropdown, setShowMembersDropdown] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState<string | null>(null);
  const [deleteConfirmFile, setDeleteConfirmFile] = useState<{ id: string; name: string } | null>(null);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
  // annotationDisplaySettings is now from session.displaySettings.annotations (defined above)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(144); // Default width in pixels (w-36 = 9rem = 144px)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false); // Mobile overlay sidebar state
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const panelContainerRef = useRef<HTMLDivElement>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(true); // Annotation list in files pane
  const [showDiscoveryAnimation, setShowDiscoveryAnimation] = useState(false); // Triggered when file loads
  const [animationTriggerKey, setAnimationTriggerKey] = useState(0); // Increments to force animation restart
  const [fileSortOrder, setFileSortOrder] = useState<FileSortOrder>("manual");
  const [highlightedType, setHighlightedType] = useState<LineAnnotationType | null>(null); // Type to highlight in code
  const [showToolbarMenu, setShowToolbarMenu] = useState(false); // Hamburger menu for narrow toolbar
  const [toolbarNarrow, setToolbarNarrow] = useState(false); // Track if toolbar is narrow
  const [revertConfirmFileId, setRevertConfirmFileId] = useState<string | null>(null); // File ID to confirm revert
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false); // Language selector dropdown
  const [showCustomLanguageInput, setShowCustomLanguageInput] = useState(false); // Show custom language text input
  const [customLanguageValue, setCustomLanguageValue] = useState(""); // Custom language input value
  const [cursorPosition, setCursorPosition] = useState<{ line: number; column: number } | null>(null); // Cursor position for punch card files
  const [showSamplesDropdown, setShowSamplesDropdown] = useState(false); // Samples dropdown
  const [loadingSample, setLoadingSample] = useState<string | null>(null); // Sample being loaded
  const [samplesDropdownPosition, setSamplesDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const samplesDropdownRef = useRef<HTMLDivElement>(null);
  const samplesButtonRef = useRef<HTMLButtonElement>(null);
  const [sampleProjects, setSampleProjects] = useState<SampleProject[]>([]); // Dynamically loaded samples
  // File trash state - inline in file list
  const [trashExpanded, setTrashExpanded] = useState(false);
  const [trashActionLoading, setTrashActionLoading] = useState<string | null>(null);

  // Handler for cursor position changes from CodeMirror (converts two args to object)
  const handleCursorPositionChange = useCallback((line: number, column: number) => {
    setCursorPosition({ line, column });
  }, []);

  // Handler for loading a sample project
  const handleLoadSampleProject = useCallback(async (sampleId: string) => {
    const sample = sampleProjects.find(s => s.id === sampleId);
    if (!sample || !onLoadSampleProject) return;

    setLoadingSample(sampleId);
    try {
      const projectData = await fetchSampleProject(sample.filename);
      onLoadSampleProject(projectData);
      setShowSamplesDropdown(false);
      setMobileSidebarOpen(false); // Close mobile sidebar after loading sample
    } catch (error) {
      console.error("Failed to load sample project:", error);
    } finally {
      setLoadingSample(null);
    }
  }, [sampleProjects, onLoadSampleProject]);

  // File trash handlers
  const handleToggleTrash = useCallback(() => {
    const newExpanded = !trashExpanded;
    setTrashExpanded(newExpanded);
    if (newExpanded) {
      onLoadTrashedFiles?.();
    }
  }, [trashExpanded, onLoadTrashedFiles]);

  const handleRestoreFile = useCallback(async (fileId: string) => {
    if (!onRestoreFile) return;
    setTrashActionLoading(`restore-${fileId}`);
    await onRestoreFile(fileId);
    setTrashActionLoading(null);
  }, [onRestoreFile]);

  const handlePermanentlyDeleteFile = useCallback(async (fileId: string) => {
    if (!onPermanentlyDeleteFile) return;
    setTrashActionLoading(`delete-${fileId}`);
    await onPermanentlyDeleteFile(fileId);
    setTrashActionLoading(null);
  }, [onPermanentlyDeleteFile]);

  const handleEmptyFileTrash = useCallback(async () => {
    if (!onEmptyFileTrash) return;
    setTrashActionLoading("empty");
    await onEmptyFileTrash();
    setTrashActionLoading(null);
  }, [onEmptyFileTrash]);

  // Fetch sample projects manifest on mount
  useEffect(() => {
    let mounted = true;
    fetchSampleProjectsManifest().then(projects => {
      if (mounted) {
        setSampleProjects(projects);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Reset cursor position when switching files
  useEffect(() => {
    setCursorPosition(null);
  }, [selectedFileId]);

  // Apply annotation display settings as CSS variables (per-project settings)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--annotation-font-size", `${annotationDisplaySettings.fontSize}px`);
    root.style.setProperty("--annotation-indent", `${annotationDisplaySettings.indent}px`);
  }, [annotationDisplaySettings.fontSize, annotationDisplaySettings.indent]);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolbarMenuRef = useRef<HTMLDivElement>(null);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const membersDropdownRef = useRef<HTMLDivElement>(null);
  const customLanguageInputRef = useRef<HTMLInputElement>(null);

  // Compute set of modified file IDs for efficient lookup
  // Uses useMemo to ensure the file list re-renders when modifications change
  const modifiedFileIds = useMemo(() => {
    const modified = new Set<string>();
    if (!originalContents) return modified;

    for (const [fileId, original] of originalContents.entries()) {
      // For the currently selected file in edit mode, compare against editModeCode
      if (editorMode === "edit" && fileId === selectedFileId && editModeCode !== undefined) {
        if (original !== editModeCode) {
          modified.add(fileId);
        }
      } else {
        // For other files or annotate mode, compare against saved content
        const current = codeContents.get(fileId);
        if (current !== undefined && original !== current) {
          modified.add(fileId);
        }
      }
    }
    return modified;
  }, [originalContents, codeContents, editorMode, selectedFileId, editModeCode]);

  // Helper function to check if a file is modified
  const isFileModified = useCallback((fileId: string): boolean => {
    return modifiedFileIds.has(fileId);
  }, [modifiedFileIds]);

  // Detect if current file is punch card format (for showing column indicator)
  const isPunchCardFormat = useMemo(() => {
    if (!selectedFileId) return false;
    const code = codeContents.get(selectedFileId);
    if (!code) return false;
    const selectedFile = codeFiles.find(f => f.id === selectedFileId);
    return detectPunchCardFormat(code, selectedFile?.language);
  }, [selectedFileId, codeContents, codeFiles]);

  // Auto-extend panel width for 80-column punch card formatted files
  useEffect(() => {
    if (!selectedFileId || !onRequestMinPanelWidth || !panelContainerRef.current) return;

    const code = codeContents.get(selectedFileId);
    if (!code) return;

    const selectedFile = codeFiles.find(f => f.id === selectedFileId);
    const language = selectedFile?.language;

    // Check if this file appears to be punch card format
    if (detectPunchCardFormat(code, language)) {
      const containerWidth = panelContainerRef.current.parentElement?.clientWidth || window.innerWidth;
      const minWidth = calculateMinWidthForPunchCard(
        containerWidth,
        displaySettings.fontSize,
        sidebarCollapsed ? 40 : sidebarWidth
      );
      onRequestMinPanelWidth(minWidth);
    }
  }, [selectedFileId, codeContents, codeFiles, displaySettings.fontSize, sidebarWidth, sidebarCollapsed, onRequestMinPanelWidth]);

  // Undo/Redo history for annotations
  // Each history entry stores the complete annotation state for a file at a point in time
  type AnnotationHistoryEntry = {
    fileId: string;
    annotations: LineAnnotation[];
  };
  const [undoStack, setUndoStack] = useState<AnnotationHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<AnnotationHistoryEntry[]>([]);
  const [isUndoRedoInProgress, setIsUndoRedoInProgress] = useState(false);
  const MAX_HISTORY_SIZE = 50;

  // Take a snapshot of current annotations for the selected file (for undo)
  const takeAnnotationSnapshot = useCallback(() => {
    // Don't take snapshots during undo/redo operations
    if (isUndoRedoInProgress) return;
    if (!selectedFileId) return;
    const currentAnnotations = session.lineAnnotations.filter(a => a.codeFileId === selectedFileId);
    setUndoStack(prev => {
      const newStack = [...prev, { fileId: selectedFileId, annotations: [...currentAnnotations] }];
      // Limit stack size
      if (newStack.length > MAX_HISTORY_SIZE) {
        return newStack.slice(-MAX_HISTORY_SIZE);
      }
      return newStack;
    });
    // Clear redo stack when new action is taken
    setRedoStack([]);
  }, [selectedFileId, session.lineAnnotations, isUndoRedoInProgress]);

  // Undo: restore previous annotation state
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || !selectedFileId) return;

    // Get the last snapshot
    const lastSnapshot = undoStack[undoStack.length - 1];
    if (lastSnapshot.fileId !== selectedFileId) return; // Snapshot must be for current file

    // Set flag to prevent snapshots during this operation
    setIsUndoRedoInProgress(true);

    // Save current state to redo stack
    const currentAnnotations = session.lineAnnotations.filter(a => a.codeFileId === selectedFileId);
    setRedoStack(prev => [...prev, { fileId: selectedFileId, annotations: [...currentAnnotations] }]);

    // Remove current annotations for this file
    // Use session method directly to bypass confirmation modals
    const currentFileAnnotations = session.lineAnnotations.filter(a => a.codeFileId === selectedFileId);
    currentFileAnnotations.forEach(ann => sessionRemoveLineAnnotation(ann.id));

    // Restore previous annotations
    lastSnapshot.annotations.forEach(ann => {
      addLineAnnotation({
        codeFileId: ann.codeFileId,
        lineNumber: ann.lineNumber,
        endLineNumber: ann.endLineNumber,
        lineContent: ann.lineContent,
        type: ann.type,
        content: ann.content,
        addedBy: ann.addedBy,
      });
    });

    // Pop from undo stack
    setUndoStack(prev => prev.slice(0, -1));

    // Clear flag after operation completes
    setIsUndoRedoInProgress(false);
  }, [undoStack, selectedFileId, session.lineAnnotations, sessionRemoveLineAnnotation, addLineAnnotation]);

  // Redo: restore next annotation state
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !selectedFileId) return;

    // Get the last snapshot
    const nextSnapshot = redoStack[redoStack.length - 1];
    if (nextSnapshot.fileId !== selectedFileId) return;

    // Set flag to prevent snapshots during this operation
    setIsUndoRedoInProgress(true);

    // Save current state to undo stack
    const currentAnnotations = session.lineAnnotations.filter(a => a.codeFileId === selectedFileId);
    setUndoStack(prev => [...prev, { fileId: selectedFileId, annotations: [...currentAnnotations] }]);

    // Remove current annotations for this file
    // Use session method directly to bypass confirmation modals
    const currentFileAnnotations = session.lineAnnotations.filter(a => a.codeFileId === selectedFileId);
    currentFileAnnotations.forEach(ann => sessionRemoveLineAnnotation(ann.id));

    // Restore next annotations
    nextSnapshot.annotations.forEach(ann => {
      addLineAnnotation({
        codeFileId: ann.codeFileId,
        lineNumber: ann.lineNumber,
        endLineNumber: ann.endLineNumber,
        lineContent: ann.lineContent,
        type: ann.type,
        content: ann.content,
        addedBy: ann.addedBy,
      });
    });

    // Pop from redo stack
    setRedoStack(prev => prev.slice(0, -1));

    // Clear flag after operation completes
    setIsUndoRedoInProgress(false);
  }, [redoStack, selectedFileId, session.lineAnnotations, sessionRemoveLineAnnotation, addLineAnnotation]);

  // Check if undo/redo is available for current file
  const canUndo = useMemo(() => {
    if (!selectedFileId || undoStack.length === 0) return false;
    return undoStack[undoStack.length - 1]?.fileId === selectedFileId;
  }, [selectedFileId, undoStack]);

  const canRedo = useMemo(() => {
    if (!selectedFileId || redoStack.length === 0) return false;
    return redoStack[redoStack.length - 1]?.fileId === selectedFileId;
  }, [selectedFileId, redoStack]);

  // Sort files based on current sort order
  const sortedFiles = useMemo(() => {
    if (fileSortOrder === "manual") return codeFiles;
    const sorted = [...codeFiles].sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      if (fileSortOrder === "az") {
        return nameA.localeCompare(nameB);
      } else {
        return nameB.localeCompare(nameA);
      }
    });
    return sorted;
  }, [codeFiles, fileSortOrder]);

  // Move file up/down in the list
  const handleMoveFile = useCallback((fileId: string, direction: "up" | "down") => {
    if (!onReorderFiles || fileSortOrder !== "manual") return;

    const currentIndex = codeFiles.findIndex(f => f.id === fileId);
    if (currentIndex === -1) return;

    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= codeFiles.length) return;

    const newOrder = [...codeFiles];
    const [removed] = newOrder.splice(currentIndex, 1);
    newOrder.splice(newIndex, 0, removed);

    onReorderFiles(newOrder.map(f => f.id));
  }, [codeFiles, onReorderFiles, fileSortOrder]);

  // Get current file and its code
  const selectedFile = useMemo(
    () => codeFiles.find((f) => f.id === selectedFileId),
    [codeFiles, selectedFileId]
  );

  const currentCode = useMemo(
    () => (selectedFileId ? codeContents.get(selectedFileId) || "" : ""),
    [selectedFileId, codeContents]
  );

  const lines = useMemo(() => currentCode.split("\n"), [currentCode]);

  // Get annotations for current file
  const fileAnnotations = useMemo(
    () =>
      selectedFileId
        ? session.lineAnnotations.filter((a) => a.codeFileId === selectedFileId)
        : [],
    [session.lineAnnotations, selectedFileId]
  );

  // Inline editing state for annotations - only tracks identity, widget manages content
  const inlineEditState = useMemo((): InlineEditState | undefined => {
    if (editingAnnotationId) {
      // Editing existing annotation
      const annotation = fileAnnotations.find(a => a.id === editingAnnotationId);
      return {
        lineNumber: annotation?.lineNumber || null,
        annotationId: editingAnnotationId,
        initialType: annotation?.type || "observation",
        initialContent: annotation?.content || "",
      };
    }
    if (editingLine) {
      // Creating new annotation (possibly a block annotation)
      // Position editor at the END of the block (where the annotation widget will appear)
      return {
        lineNumber: editingEndLine ?? editingLine,
        startLineNumber: editingEndLine ? editingLine : undefined, // Store start for block annotations
        annotationId: null,
        initialType: "observation",
        initialContent: "",
      };
    }
    return undefined;
  }, [editingAnnotationId, editingLine, editingEndLine, fileAnnotations]);

  // Callbacks for inline editing - widget passes final values on submit
  const inlineEditCallbacks = useMemo((): InlineEditCallbacks | undefined => {
    if (!editingAnnotationId && !editingLine) return undefined;

    return {
      onSubmit: (type, content) => {
        // Take snapshot before modifying annotations (for undo)
        takeAnnotationSnapshot();

        if (editingAnnotationId) {
          // Save edited annotation with type and content from widget
          if (content.trim()) {
            updateLineAnnotation(editingAnnotationId, { content: content.trim(), type });
          }
          setEditingAnnotationId(null);
          setEditContent("");
        } else if (editingLine && selectedFileId && content.trim()) {
          // Add new annotation with type and content from widget
          // For block annotations, capture all lines in the range
          const lineContent = editingEndLine
            ? lines.slice(editingLine - 1, editingEndLine).join('\n')
            : lines[editingLine - 1] || "";
          addLineAnnotation({
            codeFileId: selectedFileId,
            lineNumber: editingLine,
            endLineNumber: editingEndLine ?? undefined,
            lineContent,
            type: type,
            content: content.trim(),
            addedBy: userInitials || undefined,
          });
          setAnnotationContent("");
          setEditingLine(null);
          setEditingEndLine(null);
        }
      },
      onCancel: () => {
        if (editingAnnotationId) {
          setEditingAnnotationId(null);
          setEditContent("");
        } else {
          setEditingLine(null);
          setEditingEndLine(null);
          setAnnotationContent("");
        }
      },
    };
  }, [editingAnnotationId, editingLine, editingEndLine, selectedFileId, lines, updateLineAnnotation, addLineAnnotation, takeAnnotationSnapshot]);

  const handleLineClick = useCallback((startLine: number, endLine?: number) => {
    // Don't allow adding annotations in read-only mode
    if (readOnly) return;
    // Stop discovery animation when user interacts
    setShowDiscoveryAnimation(false);
    // Ensure annotations are visible when adding a new one
    // (otherwise the inline editor won't show)
    setAnnotationDisplaySettings(prev => prev.visible ? prev : { ...prev, visible: true });
    setEditingLine(startLine);
    setEditingEndLine(endLine ?? null); // null for single-line, number for block
    setAnnotationContent("");
    setAnnotationType("observation");
  }, [readOnly]);

  const handleStartEditAnnotation = useCallback((annotationId: string) => {
    // Don't allow editing annotations in read-only mode
    if (readOnly) return;
    const annotation = fileAnnotations.find(a => a.id === annotationId);
    if (annotation) {
      setEditingAnnotationId(annotation.id);
      setEditContent(annotation.content);
      setEditType(annotation.type);
      // Clear new annotation state to avoid conflicts
      setEditingLine(null);
    }
  }, [fileAnnotations, readOnly]);

  // Get file extension from language
  const getExtensionForLanguage = useCallback((language?: string): string => {
    if (!language) return ".txt";
    const normalised = language.toLowerCase().trim();
    return LANGUAGE_EXTENSIONS[normalised] || ".txt";
  }, []);

  // Get colour class for file based on language category
  const getFileColourClass = useCallback((language?: string): string => {
    if (!language) return FILE_CATEGORY_COLORS.other;
    const normalised = language.toLowerCase().trim();
    const category = LANGUAGE_CATEGORIES[normalised] || "other";
    return FILE_CATEGORY_COLORS[category];
  }, []);

  // Handle code content edit from CodeMirror
  const handleCodeEdit = useCallback((newContent: string) => {
    setEditModeCode(newContent);
  }, []);

  // Switch to Edit mode: show clean code (annotations preserved in state)
  const handleSwitchToEdit = useCallback(() => {
    if (!selectedFileId) return;

    // Just use the clean code - annotations stay in state
    setEditModeCode(currentCode);
    setEditorMode("edit");
    setEditingLine(null);
    setShowAnnotationPanel(false); // Hide annotation panel in edit mode
  }, [selectedFileId, currentCode]);

  // Switch to Annotate mode: relocate annotations based on line content
  const handleSwitchToAnnotate = useCallback(() => {
    if (!selectedFileId || !onCodeContentChange) return;

    // Update the code content with the edited version
    onCodeContentChange(selectedFileId, editModeCode);

    // Relocate existing annotations based on their lineContent
    const newLines = editModeCode.split("\n");

    // For each annotation, find where its lineContent now appears
    fileAnnotations.forEach(ann => {
      const trimmedTarget = ann.lineContent.trim();

      // Find all lines that match this content
      const matches: number[] = [];
      newLines.forEach((line, idx) => {
        if (line.trim() === trimmedTarget) {
          matches.push(idx + 1); // 1-indexed line numbers
        }
      });

      if (matches.length === 0) {
        // Line was deleted - mark as orphaned
        if (!ann.orphaned) {
          updateLineAnnotation(ann.id, { orphaned: true });
        }
      } else {
        // Find closest match to original position
        const closest = matches.reduce((prev, curr) =>
          Math.abs(curr - ann.lineNumber) < Math.abs(prev - ann.lineNumber) ? curr : prev
        );

        // Update if position changed or was previously orphaned
        if (ann.lineNumber !== closest || ann.orphaned) {
          updateLineAnnotation(ann.id, {
            lineNumber: closest,
            orphaned: false,
            lineContent: newLines[closest - 1] // Update to current content
          });
        }
      }
    });

    // Trigger discovery animation when entering annotate mode
    setShowDiscoveryAnimation(true);
    setAnimationTriggerKey(k => k + 1);
    setShowAnnotationPanel(true);
    setEditorMode("annotate");
  }, [selectedFileId, editModeCode, onCodeContentChange, fileAnnotations, updateLineAnnotation]);

  // Download annotated code as markdown with metadata
  const handleDownloadCode = useCallback(() => {
    if (!selectedFileId || !currentCode) return;

    const baseName = selectedFile?.name || "code";
    const language = selectedFile?.language || "";

    // Generate markdown with YAML frontmatter for reimport
    const annotatedMarkdown = generateAnnotatedMarkdown(
      currentCode,
      fileAnnotations,
      baseName,
      language
    );

    const blob = new Blob([annotatedMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    // Remove any existing extension and add -annotated.md suffix
    const nameWithoutExt = baseName.replace(/\.[^.]+$/, "");
    a.download = `${nameWithoutExt}-annotated.md`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [selectedFileId, currentCode, fileAnnotations, selectedFile]);

  // Handle copy code to clipboard
  const handleCopyCode = useCallback(() => {
    if (!currentCode) return;
    const annotatedCode = generateAnnotatedCode(currentCode, fileAnnotations);
    navigator.clipboard.writeText(annotatedCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  }, [currentCode, fileAnnotations]);

  // Keyboard shortcut for copy (Cmd/Ctrl+Shift+C)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "c") {
        e.preventDefault();
        handleCopyCode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCopyCode]);

  // Click outside to close display settings popover
  useEffect(() => {
    if (!showDisplaySettings) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (displaySettingsRef.current && !displaySettingsRef.current.contains(e.target as Node)) {
        setShowDisplaySettings(false);
      }
    };

    // Small delay to avoid immediate trigger from the opening click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDisplaySettings]);

  // Click outside to close members dropdown
  useEffect(() => {
    if (!showMembersDropdown) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (membersDropdownRef.current && !membersDropdownRef.current.contains(e.target as Node)) {
        setShowMembersDropdown(false);
      }
    };

    // Small delay to avoid immediate trigger from the opening click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMembersDropdown]);

  // Trigger discovery animation when a file is first loaded in annotate mode
  const previousFileIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedFileId && selectedFileId !== previousFileIdRef.current && editorMode === "annotate") {
      setShowDiscoveryAnimation(true);
      setAnimationTriggerKey(k => k + 1);
    }
    previousFileIdRef.current = selectedFileId;
  }, [selectedFileId, editorMode]);

  // Clear discovery animation flag after animation completes
  // Only starts timer when selectedFile exists (editor is mounted)
  useEffect(() => {
    if (showDiscoveryAnimation && editorMode === "annotate" && selectedFile) {
      // Allow enough time for the cascade to complete (30ms per line, ~50 lines max = 1.5s + 0.6s animation)
      const timer = setTimeout(() => {
        setShowDiscoveryAnimation(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [showDiscoveryAnimation, editorMode, selectedFile]);

  // Handle delete annotation from CodeMirror widget
  const handleDeleteAnnotation = useCallback((annotationId: string) => {
    // Don't allow deleting annotations in read-only mode
    if (readOnly) return;
    // Take snapshot before deleting (for undo)
    takeAnnotationSnapshot();
    // Use the potentially-wrapped version for normal deletes (shows confirmation if wrapped)
    removeLineAnnotation(annotationId);
  }, [removeLineAnnotation, takeAnnotationSnapshot, readOnly]);

  // Handle clicking on an annotation type pill to highlight annotations of that type
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const displaySettingsRef = useRef<HTMLDivElement>(null);

  // ResizeObserver to detect narrow toolbar
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Collapse tools when toolbar width < 320px (contentRect excludes padding)
        // The toolbar has px-4 (32px total padding), so 320 + 32 = 352px actual width threshold
        setToolbarNarrow(entry.contentRect.width < 320);
      }
    });

    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);

  // Close toolbar menu when clicking outside
  useEffect(() => {
    if (!showToolbarMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarMenuRef.current && !toolbarMenuRef.current.contains(e.target as Node)) {
        setShowToolbarMenu(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showToolbarMenu]);

  // Close language dropdown when clicking outside
  useEffect(() => {
    if (!showLanguageDropdown) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(e.target as Node)) {
        setShowLanguageDropdown(false);
        setShowCustomLanguageInput(false);
        setCustomLanguageValue("");
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showLanguageDropdown]);

  // Close samples dropdown when clicking outside
  useEffect(() => {
    if (!showSamplesDropdown) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Don't close if clicking the button or the dropdown itself
      if (samplesButtonRef.current?.contains(target)) return;
      if (samplesDropdownRef.current?.contains(target)) return;
      setShowSamplesDropdown(false);
    };

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSamplesDropdown]);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (showSamplesDropdown && samplesButtonRef.current) {
      const rect = samplesButtonRef.current.getBoundingClientRect();
      setSamplesDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [showSamplesDropdown]);


  // Close file menu dropdown when clicking outside
  useEffect(() => {
    if (!fileMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      // Find the menu element by its class
      const target = e.target as Node;
      const menu = document.querySelector('[data-file-menu]');
      if (menu && !menu.contains(target)) {
        setFileMenuOpen(null);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [fileMenuOpen]);

  // Focus custom language input when it appears
  useEffect(() => {
    if (showCustomLanguageInput && customLanguageInputRef.current) {
      customLanguageInputRef.current.focus();
    }
  }, [showCustomLanguageInput]);

  const handleHighlightType = useCallback((type: LineAnnotationType) => {
    // Clear any existing timeout
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    // Set the highlighted type
    setHighlightedType(type);
    // Auto-clear after 2 seconds
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedType(null);
    }, 2000);
  }, []);

  // Handle sidebar resize dragging
  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSidebar(true);
  }, []);

  // Sidebar resize effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSidebar || !panelContainerRef.current) return;

      const containerRect = panelContainerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;

      // Clamp between min (80px) and max (300px)
      const MIN_WIDTH = 80;
      const MAX_WIDTH = 300;
      setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
    };

    if (isDraggingSidebar) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDraggingSidebar]);

  return (
    <div ref={panelContainerRef} className="flex h-full bg-card border-r border-parchment">
      {/* Mobile sidebar backdrop */}
      {mobileSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-ink/40 z-40"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* File tree sidebar - hidden in fullscreen mode */}
      {!isFullScreen && (
      <div
        className={cn(
          "border-r border-parchment bg-cream flex-col",
          // Desktop: normal flex layout
          "hidden md:flex",
          // Mobile: fixed overlay when open
          mobileSidebarOpen && "flex fixed left-0 top-0 bottom-0 z-50"
        )}
        style={{ width: sidebarCollapsed ? 32 : (mobileSidebarOpen ? 280 : sidebarWidth) }}
      >
        <div className="px-1 py-1.5 border-b border-parchment flex items-center justify-between gap-1">
          {!sidebarCollapsed && (
            <>
              <div className="flex items-center gap-0.5 pl-1 overflow-hidden flex-1 min-w-0">
                {/* Mobile close button - only visible on mobile */}
                {mobileSidebarOpen && (
                  <button
                    onClick={() => setMobileSidebarOpen(false)}
                    className="md:hidden p-1 text-slate-muted hover:text-burgundy transition-colors"
                    title="Close menu"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                )}

                {/* New file button - leftmost (hidden in read-only mode) */}
                {onAddNewFile && !readOnly && (
                  <button
                    onClick={() => {
                      onAddNewFile();
                      setMobileSidebarOpen(false);
                    }}
                    className="p-1 text-slate-muted hover:text-burgundy transition-colors"
                    title="Create new file"
                  >
                    <FilePlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                )}
                {/* Load code button (hidden in read-only mode) */}
                {onLoadCode && !readOnly && (
                  <button
                    onClick={() => {
                      onLoadCode();
                      setMobileSidebarOpen(false);
                    }}
                    className="p-1 text-slate-muted hover:text-burgundy transition-colors"
                    title="Load code file"
                  >
                    <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                )}
                {/* Load sample code button - dropdown rendered outside overflow container */}
                {onLoadSampleProject && sampleProjects.length > 0 && (
                  <button
                    ref={samplesButtonRef}
                    onClick={() => setShowSamplesDropdown(!showSamplesDropdown)}
                    className={cn(
                      "p-1 transition-colors",
                      showSamplesDropdown ? "text-burgundy" : "text-slate-muted hover:text-burgundy"
                    )}
                    title="Load sample code"
                  >
                    <BookOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                )}
                {/* Download annotated code button */}
                <button
                  onClick={handleDownloadCode}
                  disabled={!currentCode || !selectedFileId}
                  className="p-1 text-slate-muted hover:text-burgundy transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Download annotated code"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
                {/* Sort toggle button */}
                <button
                  onClick={() => {
                    // Cycle through: manual -> az -> za -> manual
                    setFileSortOrder(prev => {
                      if (prev === "manual") return "az";
                      if (prev === "az") return "za";
                      return "manual";
                    });
                  }}
                  className={cn(
                    "relative p-1 transition-colors",
                    fileSortOrder !== "manual" ? "text-burgundy" : "text-slate-muted hover:text-burgundy"
                  )}
                  title={fileSortOrder === "manual" ? "Sort A→Z" : fileSortOrder === "az" ? "Sort Z→A" : "Manual order"}
                >
                  <ArrowUpDown className="h-3 w-3" strokeWidth={1.5} />
                  {fileSortOrder !== "manual" && (
                    <span className="absolute -bottom-0.5 -right-0.5 text-[7px] font-bold">
                      {fileSortOrder === "az" ? "↓" : "↑"}
                    </span>
                  )}
                </button>
              </div>
            </>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1 text-slate-muted hover:text-burgundy transition-colors flex-shrink-0"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
        </div>
        {/* Collapsed state - show vertical "Files" label */}
        {sidebarCollapsed && (
          <div className="flex-1 flex flex-col items-center pt-2">
            <span className="text-[10px] text-slate-muted" style={{ writingMode: "vertical-rl" }}>Files</span>
          </div>
        )}
        {!sidebarCollapsed && (
          <>
          <div className="flex-1 min-h-0 overflow-y-auto py-1">
          {sortedFiles.length === 0 ? (
            <p className="px-3 py-2 font-body text-xs text-slate-muted italic">
              No code uploaded
            </p>
          ) : (
            <ul className="space-y-0">
              {sortedFiles.map((file, index) => (
                <li key={file.id} className="group relative">
                  {renamingFileId === file.id ? (
                    <div className="px-2 py-1">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && renameValue.trim()) {
                            onRenameFile?.(file.id, renameValue.trim());
                            setRenamingFileId(null);
                          }
                          if (e.key === "Escape") {
                            setRenamingFileId(null);
                          }
                        }}
                        onBlur={() => setRenamingFileId(null)}
                        className="w-full px-1 py-0.5 text-[11px] font-mono border border-burgundy rounded bg-card focus:outline-none"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "flex items-center transition-colors",
                        selectedFileId === file.id
                          ? "bg-burgundy/10 text-burgundy"
                          : "hover:bg-cream text-ink"
                      )}
                    >
                      {/* Menu button on left (hidden in read-only mode) */}
                      {!readOnly && (
                      <div className="relative flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setFileMenuOpen(fileMenuOpen === file.id ? null : file.id);
                          }}
                          className="p-1 opacity-0 group-hover:opacity-100 text-slate-muted hover:text-ink transition-all"
                        >
                          <MoreVertical className="h-3 w-3" strokeWidth={1.5} />
                        </button>
                        {fileMenuOpen === file.id && (
                          <div data-file-menu className="absolute left-0 top-full mt-1 w-28 bg-popover rounded-sm shadow-lg border border-parchment py-1 z-50">
                            {/* Move up/down buttons - only shown in manual sort mode */}
                            {fileSortOrder === "manual" && onReorderFiles && sortedFiles.length > 1 && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveFile(file.id, "up");
                                    setFileMenuOpen(null);
                                  }}
                                  disabled={index === 0}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-slate hover:bg-cream disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <ChevronUp className="h-3 w-3" strokeWidth={1.5} />
                                  Move up
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveFile(file.id, "down");
                                    setFileMenuOpen(null);
                                  }}
                                  disabled={index === sortedFiles.length - 1}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-slate hover:bg-cream disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
                                  Move down
                                </button>
                                <div className="my-1 border-t border-parchment" />
                              </>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenameValue(file.name);
                                setRenamingFileId(file.id);
                                setFileMenuOpen(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-slate hover:bg-cream"
                            >
                              <Pencil className="h-3 w-3" strokeWidth={1.5} />
                              Rename
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDuplicateFile?.(file.id);
                                setFileMenuOpen(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-slate hover:bg-cream"
                            >
                              <Copy className="h-3 w-3" strokeWidth={1.5} />
                              Duplicate
                            </button>
                            {/* Commit option - only show if file is modified */}
                            {isFileModified(file.id) && onCommitFile && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCommitFile(file.id);
                                  setFileMenuOpen(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-emerald-600 hover:bg-emerald-50"
                              >
                                <Check className="h-3 w-3" strokeWidth={1.5} />
                                Commit changes
                              </button>
                            )}
                            {/* Revert option - only show if file is modified */}
                            {isFileModified(file.id) && onRevertFile && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRevertConfirmFileId(file.id);
                                  setFileMenuOpen(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-amber-600 hover:bg-amber-50"
                              >
                                <RotateCcw className="h-3 w-3" strokeWidth={1.5} />
                                Revert changes
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmFile({ id: file.id, name: file.name });
                                setFileMenuOpen(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-error hover:bg-red-50 dark:hover:bg-red-950/50"
                            >
                              <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                      )}
                      {/* Filename button */}
                      <button
                        onClick={() => {
                          // If in edit mode and selecting a different file, switch to annotate mode first
                          if (editorMode === "edit" && file.id !== selectedFileId) {
                            setEditorMode("annotate");
                          }
                          setSelectedFileId(file.id);
                          setMobileSidebarOpen(false); // Close mobile sidebar after selection
                        }}
                        className="flex-1 min-w-0 py-1 pr-2 text-left overflow-hidden flex items-center gap-0.5"
                        title={file.name}
                      >
                        {/* Cloud icon when file is in a cloud project, HardDrive when local */}
                        {isInProject ? (
                          <Cloud className="h-2.5 w-2.5 text-slate-muted flex-shrink-0" strokeWidth={1.5} />
                        ) : (
                          <HardDrive className="h-2.5 w-2.5 text-slate-muted flex-shrink-0" strokeWidth={1.5} />
                        )}
                        <span
                          className={cn(
                            "font-mono truncate flex-1",
                            getFileColourClass(file.language),
                            !isInProject && "italic"
                          )}
                          style={{ fontSize: "var(--files-pane-font-size, 10px)" }}
                        >
                          {file.name}
                        </span>
                        {/* File status indicators */}
                        <span className="flex items-center gap-1 flex-shrink-0">
                          {/* Annotated indicator - clickable to highlight annotations */}
                          {session.lineAnnotations.some(a => a.codeFileId === file.id) && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                // Select file and toggle annotation highlighting
                                setSelectedFileId(file.id);
                                setAnnotationDisplaySettings(prev => ({ ...prev, highlightAnnotatedLines: !prev.highlightAnnotatedLines }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedFileId(file.id);
                                  setAnnotationDisplaySettings(prev => ({ ...prev, highlightAnnotatedLines: !prev.highlightAnnotatedLines }));
                                }
                              }}
                              className={cn(
                                "px-1 py-0.5 text-[8px] font-mono rounded transition-colors cursor-pointer",
                                annotationDisplaySettings.highlightAnnotatedLines
                                  ? "text-white bg-burgundy border border-burgundy shadow-sm"
                                  : "text-burgundy/80 border border-burgundy/30 hover:bg-burgundy/10"
                              )}
                              title={annotationDisplaySettings.highlightAnnotatedLines ? "Exit focus mode (click to turn off)" : "Has annotations (click to highlight)"}
                            >
                              A
                            </span>
                          )}
                          {/* Modified indicator */}
                          {isFileModified(file.id) && (
                            <span className="px-1 py-0.5 text-[8px] font-mono text-amber-600/70 dark:text-amber-500/60 border border-amber-500/30 rounded" title="Modified">
                              M
                            </span>
                          )}
                        </span>
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          </div>

          {/* Trash Section - fixed at bottom of files pane, above annotation panel */}
          {!readOnly && onLoadTrashedFiles && (
            <div className="border-t border-parchment/50 flex-shrink-0">
              <button
                onClick={handleToggleTrash}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-cream dark:hover:bg-slate-800/50 transition-colors"
              >
                <ChevronRight
                  className={cn(
                    "h-3 w-3 text-slate-muted transition-transform",
                    trashExpanded && "rotate-90"
                  )}
                  strokeWidth={1.5}
                />
                <Trash2 className="h-3 w-3 text-slate-muted" strokeWidth={1.5} />
                <span className="text-[10px] text-slate-muted">Trash</span>
                {trashedFiles.length > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 text-[8px] bg-burgundy/10 text-burgundy dark:bg-burgundy/20 dark:text-burgundy-light rounded-full">
                    {trashedFiles.length}
                  </span>
                )}
              </button>
              {trashExpanded && (
                <div className="px-2 pb-2 max-h-32 overflow-y-auto">
                  {isLoadingFileTrash ? (
                    <p className="text-[9px] text-slate-muted italic py-2 px-2">Loading...</p>
                  ) : trashedFiles.length === 0 ? (
                    <p className="text-[9px] text-slate-muted italic py-2 px-2">Trash is empty</p>
                  ) : (
                    <>
                      <ul className="space-y-0.5">
                        {trashedFiles.map((file) => (
                          <li
                            key={file.id}
                            className="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-cream dark:hover:bg-slate-800/50 transition-colors group"
                          >
                            <span className="flex-1 text-[10px] font-mono text-slate-muted truncate">
                              {file.name}
                            </span>
                            <button
                              onClick={() => handleRestoreFile(file.id)}
                              disabled={!!trashActionLoading}
                              className="p-0.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                              title="Restore"
                            >
                              <RotateCcw className="h-3 w-3" strokeWidth={1.5} />
                            </button>
                            <button
                              onClick={() => handlePermanentlyDeleteFile(file.id)}
                              disabled={!!trashActionLoading}
                              className="p-0.5 text-burgundy hover:bg-burgundy/10 rounded transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                              title="Delete permanently"
                            >
                              <X className="h-3 w-3" strokeWidth={1.5} />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={handleEmptyFileTrash}
                        disabled={trashActionLoading === "empty"}
                        className="w-full mt-2 py-1 text-[9px] text-burgundy hover:bg-burgundy/10 rounded transition-colors disabled:opacity-50"
                      >
                        {trashActionLoading === "empty" ? "Emptying..." : "Empty Trash"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Annotation panel - slides up from bottom in Annotate mode */}
          {editorMode === "annotate" && showAnnotationPanel && (() => {
            // Group annotations by type
            const grouped = fileAnnotations.reduce((acc, ann) => {
              if (!acc[ann.type]) acc[ann.type] = [];
              acc[ann.type].push(ann);
              return acc;
            }, {} as Record<LineAnnotationType, typeof fileAnnotations>);

            // Check for orphaned annotations
            const orphaned = fileAnnotations.filter(a => a.orphaned);

            return (
              <div className="mt-auto border-t border-parchment bg-cream px-2 py-1.5 max-h-24 overflow-y-auto">
                <div className="font-sans text-[9px] uppercase tracking-wider text-slate-muted pb-1 mb-1.5 border-b border-parchment/50">
                  Annotations ({fileAnnotations.length})
                </div>
                <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-[8px]">
                  {(Object.keys(ANNOTATION_PREFIXES) as LineAnnotationType[]).map(type => {
                    const anns = grouped[type];
                    const validAnns = anns ? anns.filter(a => !a.orphaned) : [];
                    const count = validAnns.length;
                    return (
                      <button
                        key={type}
                        onClick={() => count > 0 && handleHighlightType(type)}
                        disabled={count === 0}
                        className={cn(
                          "flex items-center gap-1 text-left transition-all",
                          count === 0 ? "opacity-35 cursor-default" : "cursor-pointer hover:opacity-80",
                          highlightedType === type && "ring-1 ring-burgundy rounded-sm"
                        )}
                        title={count > 0 ? `Click to highlight ${ANNOTATION_PREFIXES[type]} annotations` : undefined}
                      >
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-full text-[7px] font-semibold uppercase text-white min-w-[28px] text-center",
                          ANNOTATION_PILL_COLORS[type]
                        )}>
                          {ANNOTATION_PREFIXES[type]}
                        </span>
                        <span className="text-slate-muted font-mono text-[7px]">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {orphaned.length > 0 && (
                  <div className="flex items-center gap-1 mt-1 opacity-50">
                    <span className="px-1.5 py-0.5 rounded-full text-[7px] font-semibold uppercase bg-error/40 text-white">?</span>
                    <span className="text-slate-muted font-mono text-[7px]">
                      {orphaned.length} orphaned
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
          </>
        )}
      </div>
      )}

      {/* Samples dropdown - rendered outside overflow container with fixed positioning */}
      {showSamplesDropdown && samplesDropdownPosition && (
        <div
          ref={samplesDropdownRef}
          className="fixed z-50 bg-card border border-parchment rounded-md shadow-lg py-1 min-w-[200px] max-w-[280px]"
          style={{
            top: samplesDropdownPosition.top,
            left: samplesDropdownPosition.left,
          }}
        >
          <div className="px-2 py-1 border-b border-parchment">
            <span className="text-[9px] font-semibold text-slate-muted uppercase tracking-wide">Sample Projects</span>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {sampleProjects.map((sample) => (
              <button
                key={sample.id}
                onClick={() => handleLoadSampleProject(sample.id)}
                disabled={loadingSample === sample.id}
                className="w-full text-left px-2 py-1.5 hover:bg-cream transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-burgundy">{sample.name}</span>
                  {sample.era && (
                    <span className="text-[8px] px-1 py-0.5 bg-slate-muted/20 rounded text-slate-muted">{sample.era}</span>
                  )}
                </div>
                <p className="text-[9px] text-slate-muted mt-0.5 leading-snug">{sample.description}</p>
                {sample.annotationCount !== undefined && (
                  <p className="text-[8px] text-burgundy/70 mt-0.5">
                    {sample.annotationCount === 0 ? 'Unannotated' : `${sample.annotationCount} annotation${sample.annotationCount !== 1 ? 's' : ''}`}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Resizable divider - only show when sidebar not collapsed and not fullscreen */}
      {!isFullScreen && !sidebarCollapsed && (
        <div
          onMouseDown={handleSidebarMouseDown}
          className={cn(
            "w-1 cursor-col-resize hover:bg-burgundy/30 transition-colors flex-shrink-0",
            isDraggingSidebar && "bg-burgundy/30"
          )}
        />
      )}

      {/* Code editor area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile-only header with hamburger menu - always visible */}
        {!selectedFile && (
          <div className="md:hidden px-4 py-2 border-b border-parchment bg-cream flex items-center gap-2">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="p-2 text-slate hover:text-ink transition-colors"
              title="Open files menu"
            >
              <Menu className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <span className="font-sans text-xs text-slate-muted">
              {codeFiles.length === 0 ? 'No files loaded' : 'Select a file'}
            </span>
          </div>
        )}

        {/* Editor header */}
        {selectedFile && (
          <div ref={toolbarRef} className="px-4 py-2 border-b border-parchment bg-cream flex items-center justify-between">
            {/* Left group: mode toggle and tools */}
            <div className="flex items-center gap-2">
              {/* Mobile menu button - visible only on mobile */}
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden p-2 text-slate hover:text-ink transition-colors"
                title="Open files menu"
              >
                <Menu className="h-4 w-4" strokeWidth={1.5} />
              </button>

              {/* Edit/Annotate mode toggle - hidden in read-only mode */}
              {!readOnly && (
                <div className="flex items-center border border-parchment rounded-sm overflow-hidden">
                  <button
                    onClick={handleSwitchToEdit}
                    className={cn(
                      "px-2 py-0.5 text-[9px] font-sans transition-colors",
                      editorMode === "edit"
                        ? "bg-burgundy text-ivory"
                        : "bg-card text-slate hover:bg-cream"
                    )}
                    title="Edit code (annotations embedded as comments)"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (editorMode === "annotate") {
                        setShowAnnotationPanel(!showAnnotationPanel);
                      } else {
                        handleSwitchToAnnotate();
                      }
                    }}
                    className={cn(
                      "px-2 py-0.5 text-[9px] font-sans transition-colors",
                      editorMode === "annotate"
                        ? "bg-burgundy text-ivory"
                        : "bg-card text-slate hover:bg-cream"
                    )}
                    title={editorMode === "annotate" ? "Toggle annotation panel" : "Annotate code (click lines to add annotations)"}
                  >
                    Annotate
                  </button>
                </div>
              )}

              {/* Read-only indicator */}
              {readOnly && (
                <span className="px-2 py-0.5 text-[9px] font-sans text-slate bg-amber-100 border border-amber-200 rounded-sm">
                  View Only
                </span>
              )}

              {/* Language selector - always visible */}
              <div className="relative" ref={languageDropdownRef}>
                <button
                  onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                  className="font-sans text-[9px] text-slate hover:text-ink px-2 py-0.5 border border-parchment hover:border-slate-muted rounded-sm transition-colors flex items-center gap-1"
                  title="Click to change language"
                >
                  <span>{selectedFile?.language
                    ? PROGRAMMING_LANGUAGES.find(l => l.id === selectedFile.language)?.name
                      || selectedFile.language // Show custom language name directly
                    : "Language"}</span>
                  <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", showLanguageDropdown && "rotate-180")} strokeWidth={1.5} />
                </button>
                {showLanguageDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-44 bg-popover rounded-sm shadow-lg border border-parchment p-1 z-50 max-h-64 overflow-y-auto">
                    {showCustomLanguageInput ? (
                      // Custom language input mode
                      <div className="p-1">
                        <input
                          ref={customLanguageInputRef}
                          type="text"
                          value={customLanguageValue}
                          onChange={(e) => setCustomLanguageValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && customLanguageValue.trim()) {
                              if (selectedFileId && onUpdateFileLanguage) {
                                onUpdateFileLanguage(selectedFileId, customLanguageValue.trim());
                              }
                              setShowLanguageDropdown(false);
                              setShowCustomLanguageInput(false);
                              setCustomLanguageValue("");
                            } else if (e.key === "Escape") {
                              setShowCustomLanguageInput(false);
                              setCustomLanguageValue("");
                            }
                          }}
                          placeholder="Enter language name..."
                          className="w-full px-2 py-1.5 text-[11px] border border-parchment rounded-sm focus:outline-none focus:border-burgundy"
                        />
                        <div className="flex gap-1 mt-1">
                          <button
                            onClick={() => {
                              if (customLanguageValue.trim() && selectedFileId && onUpdateFileLanguage) {
                                onUpdateFileLanguage(selectedFileId, customLanguageValue.trim());
                              }
                              setShowLanguageDropdown(false);
                              setShowCustomLanguageInput(false);
                              setCustomLanguageValue("");
                            }}
                            disabled={!customLanguageValue.trim()}
                            className="flex-1 px-2 py-1 text-[10px] bg-burgundy text-ivory rounded-sm hover:bg-burgundy/90 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Set
                          </button>
                          <button
                            onClick={() => {
                              setShowCustomLanguageInput(false);
                              setCustomLanguageValue("");
                            }}
                            className="px-2 py-1 text-[10px] text-slate hover:bg-cream rounded-sm"
                          >
                            Back
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Language list
                      <>
                        {PROGRAMMING_LANGUAGES.filter(lang => lang.id !== "other").map((lang) => (
                          <button
                            key={lang.id}
                            onClick={() => {
                              if (selectedFileId && onUpdateFileLanguage) {
                                onUpdateFileLanguage(selectedFileId, lang.id || undefined);
                              }
                              setShowLanguageDropdown(false);
                            }}
                            className={cn(
                              "w-full text-left px-2 py-1.5 text-[11px] rounded-sm hover:bg-cream transition-colors",
                              selectedFile?.language === lang.id && "text-burgundy font-medium"
                            )}
                          >
                            {lang.name}
                          </button>
                        ))}
                        <div className="border-t border-parchment my-1" />
                        <button
                          onClick={() => {
                            setShowCustomLanguageInput(true);
                            setCustomLanguageValue("");
                          }}
                          className={cn(
                            "w-full text-left px-2 py-1.5 text-[11px] rounded-sm hover:bg-cream transition-colors",
                            // Highlight if current language is a custom value (not in the standard list)
                            selectedFile?.language && !PROGRAMMING_LANGUAGES.find(l => l.id === selectedFile.language) && "text-burgundy font-medium"
                          )}
                        >
                          Other...
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Tools - hide when narrow, show in hamburger menu instead */}
              {!toolbarNarrow && (
                <>
                  {/* Quick toggles for annotation display - only in annotate mode */}
                  {editorMode === "annotate" && (
                    <>
                      <button
                        onClick={() => setAnnotationDisplaySettings(prev => ({ ...prev, visible: !prev.visible }))}
                        className="p-1 text-slate-muted hover:text-ink transition-colors"
                        title={annotationDisplaySettings.visible ? "Hide annotations" : "Show annotations"}
                      >
                        {annotationDisplaySettings.visible ? (
                          <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} />
                        )}
                      </button>
                      <button
                        onClick={() => setAnnotationDisplaySettings(prev => ({ ...prev, highlightAnnotatedLines: !prev.highlightAnnotatedLines }))}
                        className={cn(
                          "p-1 rounded transition-all",
                          annotationDisplaySettings.highlightAnnotatedLines
                            ? "text-white bg-burgundy shadow-sm"
                            : "text-slate-muted hover:text-ink hover:bg-cream"
                        )}
                        title={annotationDisplaySettings.highlightAnnotatedLines ? "Exit focus mode (show all code equally)" : "Focus mode: highlight annotated lines"}
                      >
                        <Highlighter className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                      {/* Fullscreen toggle */}
                      {onToggleFullScreen && (
                        <button
                          onClick={onToggleFullScreen}
                          className={cn(
                            "p-1 transition-colors",
                            isFullScreen
                              ? "text-burgundy"
                              : "text-slate-muted hover:text-ink"
                          )}
                          title={isFullScreen ? "Exit full screen" : "Full screen mode"}
                        >
                          {isFullScreen ? (
                            <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                          ) : (
                            <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                          )}
                        </button>
                      )}
                      {/* Undo/Redo buttons */}
                      <div className="h-4 w-px bg-parchment mx-1" />
                      <button
                        onClick={handleUndo}
                        disabled={!canUndo}
                        className="p-1 text-slate-muted hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Undo (⌘Z)"
                      >
                        <Undo2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={handleRedo}
                        disabled={!canRedo}
                        className="p-1 text-slate-muted hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Redo (⌘⇧Z)"
                      >
                        <Redo2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    </>
                  )}

                  {/* Divider before copy */}
                  <div className="h-4 w-px bg-parchment mx-1" />

                  <button
                    onClick={handleCopyCode}
                    disabled={!currentCode}
                    className={cn(
                      "p-1 w-6 h-6 flex items-center justify-center transition-colors disabled:opacity-50",
                      codeCopied ? "text-green-600" : "text-slate-muted hover:text-ink"
                    )}
                    title="Copy code (⌘⇧C)"
                  >
                    {codeCopied ? (
                      <Check className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} />
                    ) : (
                      <Copy className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} />
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Right group: hamburger menu (narrow) or help and settings (wide) */}
            <div className="flex items-center gap-2">
              {/* Cursor position indicator for punch card files - shown in both narrow and wide */}
              {toolbarNarrow && isPunchCardFormat && cursorPosition && (
                <span
                  className="font-mono text-[9px] text-slate-muted px-1.5 py-0.5 bg-cream rounded"
                  title="Line : Column (for 80-column punch card code)"
                >
                  L{cursorPosition.line}:C{cursorPosition.column}
                </span>
              )}
              {toolbarNarrow ? (
                /* Hamburger menu for narrow toolbar */
                <div className="relative" ref={toolbarMenuRef}>
                  <button
                    onClick={() => setShowToolbarMenu(!showToolbarMenu)}
                    className={cn(
                      "p-1 transition-colors",
                      showToolbarMenu ? "text-burgundy" : "text-slate-muted hover:text-ink"
                    )}
                    title="Tools menu"
                  >
                    <Menu className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                  {showToolbarMenu && (
                    <div className="absolute top-full right-0 mt-1 w-48 bg-popover rounded-sm shadow-lg border border-parchment py-1 z-50">
                      {/* Annotation tools - only in annotate mode */}
                      {editorMode === "annotate" && (
                        <>
                          <button
                            onClick={() => {
                              setAnnotationDisplaySettings(prev => ({ ...prev, visible: !prev.visible }));
                              setShowToolbarMenu(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-slate hover:bg-cream"
                          >
                            {annotationDisplaySettings.visible ? (
                              <Eye className="h-3 w-3" strokeWidth={1.5} />
                            ) : (
                              <EyeOff className="h-3 w-3" strokeWidth={1.5} />
                            )}
                            {annotationDisplaySettings.visible ? "Hide annotations" : "Show annotations"}
                          </button>
                          <button
                            onClick={() => {
                              setAnnotationDisplaySettings(prev => ({ ...prev, highlightAnnotatedLines: !prev.highlightAnnotatedLines }));
                              setShowToolbarMenu(false);
                            }}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-1.5 text-[10px]",
                              annotationDisplaySettings.highlightAnnotatedLines
                                ? "bg-burgundy text-white font-medium"
                                : "text-slate hover:bg-cream"
                            )}
                          >
                            <Highlighter className="h-3 w-3" strokeWidth={1.5} />
                            {annotationDisplaySettings.highlightAnnotatedLines ? "Exit focus mode" : "Focus mode"}
                          </button>
                          {onToggleFullScreen && (
                            <button
                              onClick={() => {
                                onToggleFullScreen();
                                setShowToolbarMenu(false);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-slate hover:bg-cream"
                            >
                              {isFullScreen ? (
                                <Minimize2 className="h-3 w-3" strokeWidth={1.5} />
                              ) : (
                                <Maximize2 className="h-3 w-3" strokeWidth={1.5} />
                              )}
                              {isFullScreen ? "Exit full screen" : "Full screen"}
                            </button>
                          )}
                          {/* Undo/Redo in menu */}
                          <button
                            onClick={() => {
                              handleUndo();
                              setShowToolbarMenu(false);
                            }}
                            disabled={!canUndo}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-slate hover:bg-cream disabled:opacity-30"
                          >
                            <Undo2 className="h-3 w-3" strokeWidth={1.5} />
                            Undo
                          </button>
                          <button
                            onClick={() => {
                              handleRedo();
                              setShowToolbarMenu(false);
                            }}
                            disabled={!canRedo}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-slate hover:bg-cream disabled:opacity-30"
                          >
                            <Redo2 className="h-3 w-3" strokeWidth={1.5} />
                            Redo
                          </button>
                          <div className="my-1 border-t border-parchment" />
                        </>
                      )}
                      <button
                        onClick={() => {
                          handleCopyCode();
                          setShowToolbarMenu(false);
                        }}
                        disabled={!currentCode}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-slate hover:bg-cream disabled:opacity-50"
                      >
                        <Copy className="h-3 w-3" strokeWidth={1.5} />
                        Copy code
                      </button>
                      <div className="my-1 border-t border-parchment" />
                      <button
                        onClick={() => {
                          setShowAnnotationHelp(true);
                          setShowToolbarMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-slate hover:bg-cream"
                      >
                        <HelpCircle className="h-3 w-3" strokeWidth={1.5} />
                        Annotation help
                      </button>
                      <button
                        onClick={() => {
                          setShowDisplaySettings(true);
                          setShowToolbarMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-slate hover:bg-cream"
                      >
                        <Settings2 className="h-3 w-3" strokeWidth={1.5} />
                        Display settings
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Normal toolbar buttons when wide */
                <>
              {/* Cursor position indicator for punch card files */}
              {isPunchCardFormat && cursorPosition && (
                <span
                  className="font-mono text-[9px] text-slate-muted px-1.5 py-0.5 bg-cream rounded"
                  title="Line : Column (for 80-column punch card code)"
                >
                  L{cursorPosition.line}:C{cursorPosition.column}
                </span>
              )}

              {/* Shared project members indicator */}
              {sharedProjectMemberCount > 0 && !readOnly && (
                <div className="relative" ref={membersDropdownRef}>
                  <button
                    onClick={() => setShowMembersDropdown(!showMembersDropdown)}
                    className={cn(
                      "p-1 transition-colors flex items-center gap-0.5",
                      showMembersDropdown ? "text-burgundy" : "text-slate-muted hover:text-ink"
                    )}
                    title={`${sharedProjectMemberCount} ${sharedProjectMemberCount === 1 ? 'member' : 'members'}`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span className="text-[9px] font-sans">{sharedProjectMemberCount}</span>
                  </button>
                  {showMembersDropdown && (
                    <div className="absolute top-full right-0 mt-1 w-56 bg-popover rounded-sm shadow-lg border border-parchment py-1 z-50">
                      <div className="px-3 py-1.5 border-b border-parchment">
                        <h4 className="font-display text-[10px] text-ink font-medium">Project Members</h4>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {sharedProjectMembers.map((member) => (
                          <div key={member.user_id} className="px-3 py-2 hover:bg-cream flex items-center gap-2">
                            {member.avatar_url ? (
                              <img src={member.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center text-[9px] font-sans">
                                {member.initials || '?'}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-sans text-[10px] text-ink truncate">
                                {member.display_name || 'Unknown'}
                              </div>
                              <div className="font-sans text-[9px] text-slate-muted capitalize">
                                {member.role}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Help - annotation types */}
              <div className="relative">
                <button
                  onClick={() => setShowAnnotationHelp(!showAnnotationHelp)}
                  className={cn(
                    "p-1 transition-colors",
                    showAnnotationHelp ? "text-burgundy" : "text-slate-muted hover:text-ink"
                  )}
                  title="Annotation types"
                >
                  <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
                {showAnnotationHelp && (
                  <div className="absolute top-full right-0 mt-1 w-64 bg-popover rounded-sm shadow-lg border border-parchment p-3 z-50">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-display text-xs text-ink">Annotation Help</h4>
                      <button
                        onClick={() => setShowAnnotationHelp(false)}
                        className="p-0.5 text-slate hover:text-ink"
                      >
                        <X className="h-3 w-3" strokeWidth={1.5} />
                      </button>
                    </div>
                    <p className="font-body text-[10px] text-slate mb-2">
                      Click any line to add an annotation.
                    </p>

                    {/* Annotation types */}
                    <div className="font-sans text-[8px] uppercase tracking-wider text-slate-muted mb-1">Types</div>
                    <ul className="space-y-0.5 mb-3">
                      <li className="flex items-start gap-2">
                        <span className={cn("font-mono text-[9px] font-semibold w-8", ANNOTATION_COLORS.observation)}>Obs</span>
                        <span className="font-body text-[10px] text-slate">Notable feature or detail</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className={cn("font-mono text-[9px] font-semibold w-8", ANNOTATION_COLORS.question)}>Q</span>
                        <span className="font-body text-[10px] text-slate">Something to explore</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className={cn("font-mono text-[9px] font-semibold w-8", ANNOTATION_COLORS.metaphor)}>Met</span>
                        <span className="font-body text-[10px] text-slate">Figurative interpretation</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className={cn("font-mono text-[9px] font-semibold w-8", ANNOTATION_COLORS.pattern)}>Pat</span>
                        <span className="font-body text-[10px] text-slate">Recurring structure</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className={cn("font-mono text-[9px] font-semibold w-8", ANNOTATION_COLORS.context)}>Ctx</span>
                        <span className="font-body text-[10px] text-slate">Historical/cultural context</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className={cn("font-mono text-[9px] font-semibold w-8", ANNOTATION_COLORS.critique)}>Crit</span>
                        <span className="font-body text-[10px] text-slate">Critical claim</span>
                      </li>
                    </ul>

                    {/* Display controls */}
                    <div className="font-sans text-[8px] uppercase tracking-wider text-slate-muted mb-1">Display</div>
                    <ul className="space-y-0.5 text-[10px] text-slate mb-3">
                      <li><Eye className="h-3 w-3 inline mr-1" strokeWidth={1.5} />Show/hide annotations</li>
                      <li><Highlighter className="h-3 w-3 inline mr-1" strokeWidth={1.5} />Highlight annotated lines</li>
                      <li><Maximize2 className="h-3 w-3 inline mr-1" strokeWidth={1.5} />Full screen (hides files and chat)</li>
                      <li><Settings2 className="h-3 w-3 inline mr-1" strokeWidth={1.5} />Brightness, badge, background</li>
                    </ul>

                    {/* Keyboard shortcuts */}
                    <div className="font-sans text-[8px] uppercase tracking-wider text-slate-muted mb-1">Shortcuts</div>
                    <ul className="space-y-0.5 text-[10px] text-slate font-mono">
                      <li><span className="text-slate-muted">⌘F</span> Search in code</li>
                      <li><span className="text-slate-muted">⌘⇧C</span> Copy code</li>
                    </ul>
                  </div>
                )}
              </div>
              {/* Display settings */}
              <div className="relative" ref={displaySettingsRef}>
                <button
                  onClick={() => setShowDisplaySettings(!showDisplaySettings)}
                  className={cn(
                    "p-1 transition-colors",
                    showDisplaySettings ? "text-burgundy" : "text-slate-muted hover:text-ink"
                  )}
                  title="Display settings"
                >
                  <Settings2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
                {showDisplaySettings && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-popover rounded shadow-xl border border-parchment/50 p-3 z-50 ring-1 ring-black/5 dark:ring-white/10">
                    {/* Code section */}
                    <div className="font-sans text-[9px] uppercase tracking-wider text-slate-muted mb-2">Code</div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-sans text-[10px] text-slate">Font size</span>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => setDisplaySettings(prev => ({
                            ...prev,
                            fontSize: Math.max(MIN_FONT_SIZE, prev.fontSize - 1)
                          }))}
                          disabled={displaySettings.fontSize <= MIN_FONT_SIZE}
                          className="p-0.5 rounded-sm border border-parchment bg-card hover:bg-cream disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="h-2.5 w-2.5" strokeWidth={1.5} />
                        </button>
                        <span className="w-6 text-center text-[10px] font-mono text-foreground">{displaySettings.fontSize}</span>
                        <button
                          onClick={() => setDisplaySettings(prev => ({
                            ...prev,
                            fontSize: Math.min(MAX_FONT_SIZE, prev.fontSize + 1)
                          }))}
                          disabled={displaySettings.fontSize >= MAX_FONT_SIZE}
                          className="p-0.5 rounded-sm border border-parchment bg-card hover:bg-cream disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Plus className="h-2.5 w-2.5" strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>

                    {/* Annotation settings - only in annotate mode */}
                    {editorMode === "annotate" && (
                      <>
                        <div className="my-2.5 border-t border-parchment" />
                        <div className="font-sans text-[9px] uppercase tracking-wider text-slate-muted mb-2">Annotations</div>

                        {/* Brightness - dropdown */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-sans text-[10px] text-slate">Brightness</span>
                          <select
                            value={annotationDisplaySettings.brightness}
                            onChange={(e) => setAnnotationDisplaySettings(prev => ({ ...prev, brightness: e.target.value as AnnotationBrightness }))}
                            className="px-1.5 py-0.5 text-[10px] font-sans bg-card text-foreground border border-parchment rounded-sm focus:outline-none focus:ring-1 focus:ring-burgundy cursor-pointer"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="full">Full</option>
                          </select>
                        </div>

                        {/* Show badge */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-sans text-[10px] text-slate">Type badge</span>
                          <input
                            type="checkbox"
                            checked={annotationDisplaySettings.showBadge}
                            onChange={(e) => setAnnotationDisplaySettings(prev => ({ ...prev, showBadge: e.target.checked }))}
                            className="rounded border-parchment text-burgundy focus:ring-burgundy h-3.5 w-3.5 cursor-pointer"
                          />
                        </div>

                        {/* Show bar background */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-sans text-[10px] text-slate">Bar background</span>
                          <input
                            type="checkbox"
                            checked={annotationDisplaySettings.showPillBackground}
                            onChange={(e) => setAnnotationDisplaySettings(prev => ({ ...prev, showPillBackground: e.target.checked }))}
                            className="rounded border-parchment text-burgundy focus:ring-burgundy h-3.5 w-3.5 cursor-pointer"
                          />
                        </div>

                        {/* Line highlight intensity */}
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <span className="font-sans text-[10px] text-slate">Line highlight</span>
                          <select
                            value={annotationDisplaySettings.lineHighlightIntensity}
                            onChange={(e) => setAnnotationDisplaySettings(prev => ({ ...prev, lineHighlightIntensity: e.target.value as LineHighlightIntensity }))}
                            className="px-1.5 py-0.5 text-[10px] font-sans bg-card text-foreground border border-parchment rounded-sm focus:outline-none focus:ring-1 focus:ring-burgundy cursor-pointer"
                          >
                            <option value="off">Off</option>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="full">Full</option>
                          </select>
                        </div>

                        {/* Annotation font size */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-sans text-[10px] text-slate">Font size</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setAnnotationDisplaySettings({ fontSize: annotationDisplaySettings.fontSize - 1 })}
                              disabled={annotationDisplaySettings.fontSize <= ANNOTATION_FONT_SIZE_MIN}
                              className={cn(
                                "p-0.5 rounded-sm border border-parchment transition-colors",
                                annotationDisplaySettings.fontSize <= ANNOTATION_FONT_SIZE_MIN
                                  ? "opacity-50 cursor-not-allowed"
                                  : "hover:border-burgundy hover:text-burgundy"
                              )}
                            >
                              <Minus className="h-2.5 w-2.5" />
                            </button>
                            <span className="w-5 text-center font-mono text-[10px]">
                              {annotationDisplaySettings.fontSize}
                            </span>
                            <button
                              onClick={() => setAnnotationDisplaySettings({ fontSize: annotationDisplaySettings.fontSize + 1 })}
                              disabled={annotationDisplaySettings.fontSize >= ANNOTATION_FONT_SIZE_MAX}
                              className={cn(
                                "p-0.5 rounded-sm border border-parchment transition-colors",
                                annotationDisplaySettings.fontSize >= ANNOTATION_FONT_SIZE_MAX
                                  ? "opacity-50 cursor-not-allowed"
                                  : "hover:border-burgundy hover:text-burgundy"
                              )}
                            >
                              <Plus className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>

                        {/* Annotation left indent */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-sans text-[10px] text-slate">Left indent</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setAnnotationDisplaySettings({ indent: annotationDisplaySettings.indent - 8 })}
                              disabled={annotationDisplaySettings.indent <= ANNOTATION_INDENT_MIN}
                              className={cn(
                                "p-0.5 rounded-sm border border-parchment transition-colors",
                                annotationDisplaySettings.indent <= ANNOTATION_INDENT_MIN
                                  ? "opacity-50 cursor-not-allowed"
                                  : "hover:border-burgundy hover:text-burgundy"
                              )}
                            >
                              <Minus className="h-2.5 w-2.5" />
                            </button>
                            <span className="w-5 text-center font-mono text-[10px]">
                              {annotationDisplaySettings.indent}
                            </span>
                            <button
                              onClick={() => setAnnotationDisplaySettings({ indent: annotationDisplaySettings.indent + 8 })}
                              disabled={annotationDisplaySettings.indent >= ANNOTATION_INDENT_MAX}
                              className={cn(
                                "p-0.5 rounded-sm border border-parchment transition-colors",
                                annotationDisplaySettings.indent >= ANNOTATION_INDENT_MAX
                                  ? "opacity-50 cursor-not-allowed"
                                  : "hover:border-burgundy hover:text-burgundy"
                              )}
                            >
                              <Plus className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>

                        {/* Code font */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-sans text-[10px] text-slate">Code font</span>
                          <select
                            value={appSettings.codeFont}
                            onChange={(e) => setCodeFont(e.target.value as CodeFontId)}
                            className="px-1.5 py-0.5 text-[10px] font-sans bg-card text-foreground border border-parchment rounded-sm focus:outline-none focus:ring-1 focus:ring-burgundy cursor-pointer min-w-[90px]"
                            style={{ fontFamily: CODE_FONT_OPTIONS.find(f => f.id === appSettings.codeFont)?.family }}
                          >
                            {CODE_FONT_OPTIONS.map((font) => (
                              <option key={font.id} value={font.id}>
                                {font.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              </>
              )}
            </div>
          </div>
        )}

        {/* Code editor content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!selectedFile ? (
            <div className="flex items-center justify-center h-full text-slate-muted">
              <p className="font-body text-sm">Select or upload a code file to begin analysis</p>
            </div>
          ) : editorMode === "edit" ? (
            /* Edit mode - CodeMirror with editable content */
            <CodeMirrorEditor
              value={editModeCode}
              onChange={handleCodeEdit}
              language={selectedFile.language}
              readOnly={false}
              fontSize={displaySettings.fontSize}
              onCursorPositionChange={isPunchCardFormat ? handleCursorPositionChange : undefined}
              className="flex-1"
            />
          ) : (
            /* Annotate mode - CodeMirror with read-only content and annotation widgets */
            <CodeMirrorEditor
              value={currentCode}
              language={selectedFile.language}
              readOnly={true}
              fontSize={displaySettings.fontSize}
              annotations={fileAnnotations}
              onLineClick={handleLineClick}
              onEditAnnotation={handleStartEditAnnotation}
              onDeleteAnnotation={handleDeleteAnnotation}
              inlineEditState={inlineEditState}
              inlineEditCallbacks={inlineEditCallbacks}
              showDiscoveryAnimation={showDiscoveryAnimation}
              animationTriggerKey={animationTriggerKey}
              highlightedAnnotationType={highlightedType}
              annotationDisplaySettings={annotationDisplaySettings}
              onCursorPositionChange={isPunchCardFormat ? handleCursorPositionChange : undefined}
              newRemoteAnnotationIds={newRemoteAnnotationIds}
              userInitials={userInitials}
              expandedAnnotationId={expandedAnnotationId}
              onToggleReplies={onToggleReplies}
              onAddReply={onAddReply}
              onDeleteReply={onDeleteReply}
              replyInputOpenFor={replyInputOpenFor}
              onOpenReplyInput={onOpenReplyInput}
              onCloseReplyInput={onCloseReplyInput}
              isInProject={isInProject}
              className="flex-1"
            />
          )}
        </div>
      </div>

      {/* Revert confirmation modal */}
      {revertConfirmFileId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg shadow-xl border border-parchment p-4 max-w-sm mx-4">
            <h3 className="font-display text-sm text-ink mb-2">Revert Changes?</h3>
            <p className="font-body text-xs text-slate mb-4">
              This will discard all changes to &ldquo;{codeFiles.find(f => f.id === revertConfirmFileId)?.name}&rdquo;
              and restore it to the original content. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRevertConfirmFileId(null)}
                className="px-3 py-1.5 text-[10px] font-sans text-slate hover:bg-cream rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onRevertFile?.(revertConfirmFileId);
                  setRevertConfirmFileId(null);
                }}
                className="px-3 py-1.5 text-[10px] font-sans bg-amber-600 text-white hover:bg-amber-700 rounded transition-colors"
              >
                Revert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete file confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmFile !== null}
        title={`Delete "${deleteConfirmFile?.name}"?`}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteConfirmFile) {
            onDeleteFile?.(deleteConfirmFile.id);
            if (selectedFileId === deleteConfirmFile.id) {
              setSelectedFileId(sortedFiles.find(f => f.id !== deleteConfirmFile.id)?.id || null);
            }
          }
          setDeleteConfirmFile(null);
        }}
        onCancel={() => setDeleteConfirmFile(null)}
      />
    </div>
  );
}

// Helper function to generate annotated code string for LLM context
export function generateAnnotatedCode(
  code: string,
  annotations: LineAnnotation[]
): string {
  const lines = code.split("\n");
  const annotationsByLine = new Map<number, LineAnnotation[]>();

  annotations.forEach((ann) => {
    const existing = annotationsByLine.get(ann.lineNumber) || [];
    annotationsByLine.set(ann.lineNumber, [...existing, ann]);
  });

  const result: string[] = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    result.push(line);

    const lineAnnotations = annotationsByLine.get(lineNumber) || [];
    lineAnnotations.forEach((ann) => {
      // Indent annotations with two tabs for readability in edit mode
      // For block annotations, include line range: // An:Type[L5-12]: content
      if (ann.endLineNumber && ann.endLineNumber !== ann.lineNumber) {
        result.push(`\t\t// An:${ANNOTATION_PREFIXES[ann.type]}[L${ann.lineNumber}-${ann.endLineNumber}]: ${ann.content}`);
      } else {
        result.push(`\t\t// An:${ANNOTATION_PREFIXES[ann.type]}: ${ann.content}`);
      }
    });
  });

  return result.join("\n");
}

// Export format types
export interface AnnotatedMarkdownMetadata {
  ccsAnnotated: true;
  version: string;
  filename: string;
  language: string;
  exportedAt: string;
  annotations: Array<{
    line: number;
    endLine?: number; // For block annotations
    type: LineAnnotationType;
    content: string;
    addedBy?: string; // User initials who added this annotation
  }>;
}

export interface ParsedAnnotatedMarkdown {
  metadata: AnnotatedMarkdownMetadata;
  code: string;
}

/**
 * Generate a markdown file with YAML frontmatter containing metadata and annotations
 * This format can be reimported to restore the original file type and annotations
 */
export function generateAnnotatedMarkdown(
  code: string,
  annotations: LineAnnotation[],
  filename: string,
  language: string
): string {
  // Build annotation list for YAML
  const annotationList = annotations.map((ann) => ({
    line: ann.lineNumber,
    endLine: ann.endLineNumber && ann.endLineNumber !== ann.lineNumber ? ann.endLineNumber : undefined,
    type: ann.type,
    content: ann.content,
    addedBy: ann.addedBy,
  }));

  // Escape special characters in YAML strings
  const escapeYaml = (str: string) => {
    if (/[:\n"']/.test(str) || str.includes("#")) {
      return `"${str.replace(/"/g, '\\"')}"`;
    }
    return str;
  };

  // Build YAML frontmatter
  const yamlLines = [
    "---",
    "ccs-annotated: true",
    'version: "1.0"',
    `filename: ${escapeYaml(filename)}`,
    `language: ${escapeYaml(language || "plain")}`,
    `exported-at: "${new Date().toISOString()}"`,
  ];

  if (annotationList.length > 0) {
    yamlLines.push("annotations:");
    annotationList.forEach((ann) => {
      yamlLines.push(`  - line: ${ann.line}`);
      if (ann.endLine) {
        yamlLines.push(`    endLine: ${ann.endLine}`);
      }
      yamlLines.push(`    type: ${ann.type}`);
      yamlLines.push(`    content: ${escapeYaml(ann.content)}`);
      if (ann.addedBy) {
        yamlLines.push(`    addedBy: ${escapeYaml(ann.addedBy)}`);
      }
    });
  }

  yamlLines.push("---");

  // Determine the code fence language identifier
  const fenceLanguage = language?.toLowerCase() || "";

  // Build the complete markdown
  const parts = [
    yamlLines.join("\n"),
    "",
    "```" + fenceLanguage,
    code,
    "```",
    "",
  ];

  return parts.join("\n");
}

/**
 * Parse an annotated markdown file and extract metadata and code
 * Returns null if the file is not a valid CCS annotated markdown file
 */
export function parseAnnotatedMarkdown(content: string): ParsedAnnotatedMarkdown | null {
  // Check for YAML frontmatter
  if (!content.startsWith("---")) {
    return null;
  }

  // Find the end of frontmatter
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return null;
  }

  const frontmatter = content.substring(4, endIndex);
  const body = content.substring(endIndex + 5).trim();

  // Parse YAML manually (simple parser for our specific format)
  const lines = frontmatter.split("\n");
  let ccsAnnotated = false;
  let version = "";
  let filename = "";
  let language = "";
  let exportedAt = "";
  const annotations: Array<{ line: number; endLine?: number; type: LineAnnotationType; content: string; addedBy?: string }> = [];

  let currentAnnotation: { line?: number; endLine?: number; type?: LineAnnotationType; content?: string; addedBy?: string } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for annotation list item
    if (trimmed.startsWith("- line:")) {
      // Save previous annotation
      if (currentAnnotation?.line && currentAnnotation?.type && currentAnnotation?.content !== undefined) {
        annotations.push({
          line: currentAnnotation.line,
          endLine: currentAnnotation.endLine,
          type: currentAnnotation.type,
          content: currentAnnotation.content,
          addedBy: currentAnnotation.addedBy,
        });
      }
      currentAnnotation = { line: parseInt(trimmed.replace("- line:", "").trim(), 10) };
      continue;
    }

    if (currentAnnotation) {
      if (trimmed.startsWith("endLine:")) {
        currentAnnotation.endLine = parseInt(trimmed.replace("endLine:", "").trim(), 10);
        continue;
      }
      if (trimmed.startsWith("type:")) {
        const typeValue = trimmed.replace("type:", "").trim() as LineAnnotationType;
        if (["observation", "question", "metaphor", "pattern", "context", "critique"].includes(typeValue)) {
          currentAnnotation.type = typeValue;
        }
        continue;
      }
      if (trimmed.startsWith("content:")) {
        let contentValue = trimmed.replace("content:", "").trim();
        // Unescape YAML strings
        if (contentValue.startsWith('"') && contentValue.endsWith('"')) {
          contentValue = contentValue.slice(1, -1).replace(/\\"/g, '"');
        }
        currentAnnotation.content = contentValue;
        continue;
      }
      if (trimmed.startsWith("addedBy:")) {
        let addedByValue = trimmed.replace("addedBy:", "").trim();
        // Unescape YAML strings
        if (addedByValue.startsWith('"') && addedByValue.endsWith('"')) {
          addedByValue = addedByValue.slice(1, -1).replace(/\\"/g, '"');
        }
        currentAnnotation.addedBy = addedByValue;
        continue;
      }
    }

    // Parse top-level fields
    if (trimmed === "ccs-annotated: true") {
      ccsAnnotated = true;
    } else if (trimmed.startsWith("version:")) {
      version = trimmed.replace("version:", "").trim().replace(/^"|"$/g, "");
    } else if (trimmed.startsWith("filename:")) {
      filename = trimmed.replace("filename:", "").trim().replace(/^"|"$/g, "");
    } else if (trimmed.startsWith("language:")) {
      language = trimmed.replace("language:", "").trim().replace(/^"|"$/g, "");
    } else if (trimmed.startsWith("exported-at:")) {
      exportedAt = trimmed.replace("exported-at:", "").trim().replace(/^"|"$/g, "");
    }
  }

  // Save last annotation
  if (currentAnnotation?.line && currentAnnotation?.type && currentAnnotation?.content !== undefined) {
    annotations.push({
      line: currentAnnotation.line,
      endLine: currentAnnotation.endLine,
      type: currentAnnotation.type,
      content: currentAnnotation.content,
      addedBy: currentAnnotation.addedBy,
    });
  }

  if (!ccsAnnotated) {
    return null;
  }

  // Extract code from fenced code block
  const codeBlockMatch = body.match(/```[^\n]*\n([\s\S]*?)```/);
  const code = codeBlockMatch ? codeBlockMatch[1].replace(/\n$/, "") : body;

  return {
    metadata: {
      ccsAnnotated: true,
      version,
      filename,
      language,
      exportedAt,
      annotations,
    },
    code,
  };
}
