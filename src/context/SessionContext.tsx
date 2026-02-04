"use client";

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from "react";
import type {
  Session,
  EntryMode,
  Message,
  CodeReference,
  AnalysisResult,
  ReferenceResult,
  CritiqueArtifact,
  ConversationPhase,
  SessionSettings,
  CodeVersion,
  CreateLanguage,
  ExperienceLevel,
  LineAnnotation,
  LineAnnotationType,
  DisplaySettings,
  AnnotationDisplaySettings,
  PanelLayoutSettings,
} from "@/types";
import { DEFAULT_DISPLAY_SETTINGS, getModeExperienceLevel } from "@/types/session";
import { generateId, getCurrentTimestamp } from "@/lib/utils";
import {
  saveSessionForMode,
  loadSessionForMode,
  clearSessionForMode,
  clearAllSessions,
  hasSessionForMode,
  saveLastMode,
  getLastMode,
} from "@/lib/session-storage";

// Action types
type SessionAction =
  | { type: "INIT_SESSION"; payload: { mode: EntryMode; experienceLevel?: ExperienceLevel } }
  | { type: "ADD_MESSAGE"; payload: Message }
  | { type: "UPDATE_MESSAGE"; payload: { id: string; updates: Partial<Message> } }
  | { type: "ADD_CODE"; payload: CodeReference }
  | { type: "REMOVE_CODE"; payload: string }
  | { type: "UPDATE_CODE"; payload: { id: string; updates: Partial<CodeReference> } }
  | { type: "REORDER_CODE"; payload: string[] } // New order of file IDs
  | { type: "ADD_ANALYSIS"; payload: AnalysisResult }
  | { type: "ADD_REFERENCES"; payload: ReferenceResult[] }
  | { type: "CLEAR_REFERENCES" }
  | { type: "ADD_ARTIFACT"; payload: CritiqueArtifact }
  | { type: "SET_PHASE"; payload: ConversationPhase }
  | { type: "ESCALATE_FEEDBACK" }
  | { type: "UPDATE_SETTINGS"; payload: Partial<SessionSettings> }
  | { type: "IMPORT_SESSION"; payload: Session }
  | { type: "RESET_SESSION" }
  // Create mode actions
  | { type: "INIT_CREATE_STATE"; payload: { projectName: string; inspiration?: string; inspirationUrl?: string } }
  | { type: "ADD_CODE_VERSION"; payload: Omit<CodeVersion, "id" | "createdAt" | "version"> }
  | { type: "SET_CURRENT_VERSION"; payload: string }
  | { type: "SET_CREATE_LANGUAGE"; payload: CreateLanguage }
  | { type: "SET_LANGUAGE_OVERRIDE"; payload: string | undefined }
  | { type: "SET_EXPERIENCE_LEVEL"; payload: ExperienceLevel }
  | { type: "SET_MODE"; payload: EntryMode }
  | { type: "LOAD_SAVED_SESSION"; payload: Session }
  | { type: "TRANSFER_TO_CRITIQUE"; payload: string } // version id to transfer
  // Line annotation actions
  | { type: "ADD_LINE_ANNOTATION"; payload: LineAnnotation }
  | { type: "UPDATE_LINE_ANNOTATION"; payload: { id: string; updates: Partial<Omit<LineAnnotation, "id" | "codeFileId" | "createdAt">> } }
  | { type: "REMOVE_LINE_ANNOTATION"; payload: string }
  | { type: "CLEAR_LINE_ANNOTATIONS"; payload?: string } // optional codeFileId to clear only that file's annotations
  // Code contents actions
  | { type: "SET_CODE_CONTENT"; payload: { fileId: string; content: string } }
  | { type: "REMOVE_CODE_CONTENT"; payload: string }
  // Display settings actions
  | { type: "UPDATE_DISPLAY_SETTINGS"; payload: Partial<DisplaySettings> }
  | { type: "UPDATE_ANNOTATION_DISPLAY_SETTINGS"; payload: Partial<AnnotationDisplaySettings> }
  | { type: "UPDATE_PANEL_LAYOUT_SETTINGS"; payload: Partial<PanelLayoutSettings> }
  // Auto-save actions
  | { type: "MARK_DIRTY" }
  | { type: "MARK_CLEAN"; payload?: { lastSaved: string } }
  | { type: "SET_FILE_HANDLE"; payload: { fileId: string; handleId: string } }
  | { type: "REMOVE_FILE_HANDLE"; payload: string };

// Initial state
const createInitialSession = (): Session => ({
  id: generateId(),
  mode: "critique",
  messages: [],
  codeFiles: [],
  codeContents: {},
  lineAnnotations: [],
  analysisResults: [],
  references: [],
  critiqueArtifacts: [],
  settings: {
    beDirectMode: false,
    teachMeMode: false,
  },
  displaySettings: DEFAULT_DISPLAY_SETTINGS,
  currentPhase: "opening",
  feedbackEscalation: 0,
  createdAt: getCurrentTimestamp(),
  lastModified: getCurrentTimestamp(),
});

// Reducer
function sessionReducer(state: Session, action: SessionAction): Session {
  const now = getCurrentTimestamp();

  switch (action.type) {
    case "INIT_SESSION":
      return {
        ...createInitialSession(),
        mode: action.payload.mode,
        // Auto-derive experience level from mode if not explicitly provided
        experienceLevel: action.payload.experienceLevel ?? getModeExperienceLevel(action.payload.mode),
      };

    case "ADD_MESSAGE":
      return {
        ...state,
        messages: [...state.messages, action.payload],
        isDirty: true,
        lastModified: now,
      };

    case "UPDATE_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.payload.id ? { ...msg, ...action.payload.updates } : msg
        ),
        isDirty: true,
        lastModified: now,
      };

    case "ADD_CODE":
      return {
        ...state,
        codeFiles: [...state.codeFiles, action.payload],
        isDirty: true,
        lastModified: now,
      };

    case "REMOVE_CODE": {
      // Remove the code content as well
      const { [action.payload]: _, ...remainingContents } = state.codeContents;
      return {
        ...state,
        codeFiles: state.codeFiles.filter((f) => f.id !== action.payload),
        codeContents: remainingContents,
        // Also remove annotations for this file
        lineAnnotations: state.lineAnnotations.filter((a) => a.codeFileId !== action.payload),
        isDirty: true,
        lastModified: now,
      };
    }

    case "UPDATE_CODE":
      return {
        ...state,
        codeFiles: state.codeFiles.map((f) =>
          f.id === action.payload.id ? { ...f, ...action.payload.updates } : f
        ),
        isDirty: true,
        lastModified: now,
      };

    case "REORDER_CODE": {
      // Reorder files based on the provided array of IDs
      const orderedIds = action.payload;
      const fileMap = new Map(state.codeFiles.map(f => [f.id, f]));
      const reorderedFiles = orderedIds
        .map(id => fileMap.get(id))
        .filter((f): f is CodeReference => f !== undefined);
      return {
        ...state,
        codeFiles: reorderedFiles,
        isDirty: true,
        lastModified: now,
      };
    }

    case "ADD_ANALYSIS":
      return {
        ...state,
        analysisResults: [...state.analysisResults, action.payload],
        isDirty: true,
        lastModified: now,
      };

    case "ADD_REFERENCES":
      return {
        ...state,
        references: [...state.references, ...action.payload],
        isDirty: true,
        lastModified: now,
      };

    case "CLEAR_REFERENCES":
      return {
        ...state,
        references: [],
        isDirty: true,
        lastModified: now,
      };

    case "ADD_ARTIFACT":
      return {
        ...state,
        critiqueArtifacts: [...state.critiqueArtifacts, action.payload],
        isDirty: true,
        lastModified: now,
      };

    case "SET_PHASE":
      return {
        ...state,
        currentPhase: action.payload,
        isDirty: true,
        lastModified: now,
      };

    case "ESCALATE_FEEDBACK":
      return {
        ...state,
        feedbackEscalation: Math.min(state.feedbackEscalation + 1, 3),
        isDirty: true,
        lastModified: now,
      };

    case "UPDATE_SETTINGS":
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
        isDirty: true,
        lastModified: now,
      };

    case "IMPORT_SESSION":
      // Gracefully handle old session formats by providing defaults for missing fields
      // eslint-disable-next-line no-case-declarations
      const defaultSession = createInitialSession();
      // eslint-disable-next-line no-case-declarations
      const imported = action.payload as Session & {
        uploadedFiles?: CodeReference[];
        literatureFindings?: ReferenceResult[];
        puzzleArtifacts?: CritiqueArtifact[];
        codeContentsMap?: Record<string, string>; // Old format from save files
      };
      return {
        ...defaultSession, // Start with all default values
        ...action.payload, // Override with imported values
        // Migrate archaeology mode to interpret mode (archaeology mode removed in v2.21.0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mode: (action.payload.mode as any) === "archaeology" ? "interpret" : action.payload.mode,
        // Ensure arrays are always arrays (handle missing fields from old formats)
        // Support both old (uploadedFiles) and new (codeFiles) field names
        codeFiles: Array.isArray(imported.codeFiles) ? imported.codeFiles :
                   Array.isArray(imported.uploadedFiles) ? imported.uploadedFiles : [],
        // Support new (codeContents) and old (codeContentsMap) field names
        codeContents: imported.codeContents && typeof imported.codeContents === "object" ? imported.codeContents :
                      imported.codeContentsMap && typeof imported.codeContentsMap === "object" ? imported.codeContentsMap : {},
        analysisResults: Array.isArray(action.payload.analysisResults) ? action.payload.analysisResults : [],
        // Support both old (literatureFindings) and new (references) field names
        references: Array.isArray(imported.references) ? imported.references :
                    Array.isArray(imported.literatureFindings) ? imported.literatureFindings : [],
        // Support both old (puzzleArtifacts) and new (critiqueArtifacts) field names
        critiqueArtifacts: Array.isArray(imported.critiqueArtifacts) ? imported.critiqueArtifacts :
                           Array.isArray(imported.puzzleArtifacts) ? imported.puzzleArtifacts : [],
        messages: Array.isArray(action.payload.messages) ? action.payload.messages : [],
        lineAnnotations: Array.isArray(action.payload.lineAnnotations) ? action.payload.lineAnnotations : [],
        // Ensure settings object exists with defaults
        settings: {
          ...defaultSession.settings,
          ...(action.payload.settings || {}),
        },
        // Ensure displaySettings object exists with defaults (for old session files)
        displaySettings: {
          annotations: {
            ...defaultSession.displaySettings.annotations,
            ...(action.payload.displaySettings?.annotations || {}),
          },
          panelLayout: {
            ...defaultSession.displaySettings.panelLayout,
            ...(action.payload.displaySettings?.panelLayout || {}),
          },
        },
        // Ensure other required fields have defaults
        currentPhase: action.payload.currentPhase || "opening",
        feedbackEscalation: typeof action.payload.feedbackEscalation === "number" ? action.payload.feedbackEscalation : 0,
        // Explicitly preserve experienceLevel from imported data
        experienceLevel: action.payload.experienceLevel,
        // Preserve createState for Create mode sessions
        createState: action.payload.createState,
        lastModified: now,
      };

    case "RESET_SESSION":
      return createInitialSession();

    // Create mode actions
    case "INIT_CREATE_STATE":
      return {
        ...state,
        createState: {
          projectName: action.payload.projectName,
          inspiration: action.payload.inspiration,
          inspirationUrl: action.payload.inspirationUrl,
          language: "Python", // Default language
          versions: [],
          currentVersionId: undefined,
        },
        currentPhase: "concept",
        isDirty: true,
        lastModified: now,
      };

    case "ADD_CODE_VERSION":
      // eslint-disable-next-line no-case-declarations
      const newVersion: CodeVersion = {
        ...action.payload,
        id: generateId(),
        version: (state.createState?.versions.length || 0) + 1,
        createdAt: now,
      };
      return {
        ...state,
        createState: state.createState
          ? {
              ...state.createState,
              versions: [...state.createState.versions, newVersion],
              currentVersionId: newVersion.id,
            }
          : {
              projectName: action.payload.name,
              language: "Python", // Default language
              versions: [newVersion],
              currentVersionId: newVersion.id,
            },
        isDirty: true,
        lastModified: now,
      };

    case "SET_CREATE_LANGUAGE":
      return {
        ...state,
        createState: state.createState
          ? {
              ...state.createState,
              language: action.payload,
            }
          : {
              projectName: "New Project",
              language: action.payload,
              versions: [],
              currentVersionId: undefined,
            },
        isDirty: true,
        lastModified: now,
      };

    case "SET_LANGUAGE_OVERRIDE":
      return {
        ...state,
        languageOverride: action.payload,
        isDirty: true,
        lastModified: now,
      };

    case "SET_EXPERIENCE_LEVEL":
      return {
        ...state,
        experienceLevel: action.payload,
        isDirty: true,
        lastModified: now,
      };

    case "SET_MODE":
      return {
        ...state,
        mode: action.payload,
        isDirty: true,
        lastModified: now,
      };

    case "LOAD_SAVED_SESSION":
      // Ensure displaySettings exists with defaults (for old saved sessions)
      // eslint-disable-next-line no-case-declarations
      const loadedDefaults = createInitialSession();
      return {
        ...action.payload,
        // Merge displaySettings with defaults to handle old sessions
        displaySettings: {
          annotations: {
            ...loadedDefaults.displaySettings.annotations,
            ...(action.payload.displaySettings?.annotations || {}),
          },
          panelLayout: {
            ...loadedDefaults.displaySettings.panelLayout,
            ...(action.payload.displaySettings?.panelLayout || {}),
          },
        },
        lastModified: now,
      };

    case "SET_CURRENT_VERSION":
      return {
        ...state,
        createState: state.createState
          ? {
              ...state.createState,
              currentVersionId: action.payload,
            }
          : undefined,
        isDirty: true,
        lastModified: now,
      };

    case "TRANSFER_TO_CRITIQUE":
      // Find the version and add it as a CodeReference
      // eslint-disable-next-line no-case-declarations
      const versionToTransfer = state.createState?.versions.find(
        (v) => v.id === action.payload
      );
      if (!versionToTransfer) return state;

      // eslint-disable-next-line no-case-declarations
      const codeRef: CodeReference = {
        id: generateId(),
        name: `${versionToTransfer.name} v${versionToTransfer.version}`,
        language: versionToTransfer.language,
        source: "created",
        size: versionToTransfer.content.length,
        uploadedAt: now,
        summary: versionToTransfer.description,
        context: versionToTransfer.inspiration
          ? `Inspired by ${versionToTransfer.inspiration}`
          : undefined,
      };

      return {
        ...state,
        mode: "critique",
        codeFiles: [...state.codeFiles, codeRef],
        currentPhase: "opening",
        isDirty: true,
        lastModified: now,
      };

    // Line annotation actions
    case "ADD_LINE_ANNOTATION":
      return {
        ...state,
        lineAnnotations: [...state.lineAnnotations, action.payload],
        isDirty: true,
        lastModified: now,
      };

    case "UPDATE_LINE_ANNOTATION":
      return {
        ...state,
        lineAnnotations: state.lineAnnotations.map((ann) =>
          ann.id === action.payload.id
            ? { ...ann, ...action.payload.updates }
            : ann
        ),
        isDirty: true,
        lastModified: now,
      };

    case "REMOVE_LINE_ANNOTATION":
      return {
        ...state,
        lineAnnotations: state.lineAnnotations.filter(
          (ann) => ann.id !== action.payload
        ),
        isDirty: true,
        lastModified: now,
      };

    case "CLEAR_LINE_ANNOTATIONS":
      return {
        ...state,
        lineAnnotations: action.payload
          ? state.lineAnnotations.filter((ann) => ann.codeFileId !== action.payload)
          : [],
        isDirty: true,
        lastModified: now,
      };

    // Code contents actions
    case "SET_CODE_CONTENT":
      return {
        ...state,
        codeContents: {
          ...state.codeContents,
          [action.payload.fileId]: action.payload.content,
        },
        isDirty: true,
        lastModified: now,
      };

    case "REMOVE_CODE_CONTENT": {
      const { [action.payload]: _, ...remainingCodeContents } = state.codeContents;
      return {
        ...state,
        codeContents: remainingCodeContents,
        isDirty: true,
        lastModified: now,
      };
    }

    // Display settings actions
    case "UPDATE_DISPLAY_SETTINGS":
      return {
        ...state,
        displaySettings: {
          ...state.displaySettings,
          ...action.payload,
        },
        isDirty: true,
        lastModified: now,
      };

    case "UPDATE_ANNOTATION_DISPLAY_SETTINGS":
      return {
        ...state,
        displaySettings: {
          ...state.displaySettings,
          annotations: {
            ...state.displaySettings.annotations,
            ...action.payload,
          },
        },
        isDirty: true,
        lastModified: now,
      };

    case "UPDATE_PANEL_LAYOUT_SETTINGS":
      return {
        ...state,
        displaySettings: {
          ...state.displaySettings,
          panelLayout: {
            ...state.displaySettings.panelLayout,
            ...action.payload,
          },
        },
        isDirty: true,
        lastModified: now,
      };

    case "MARK_DIRTY":
      return {
        ...state,
        isDirty: true,
        lastModified: now,
      };

    case "MARK_CLEAN":
      return {
        ...state,
        isDirty: false,
        lastSaved: action.payload?.lastSaved || now,
        lastModified: now,
      };

    case "SET_FILE_HANDLE":
      return {
        ...state,
        fileHandles: {
          ...state.fileHandles,
          [action.payload.fileId]: action.payload.handleId,
        },
        lastModified: now,
      };

    case "REMOVE_FILE_HANDLE": {
      const newHandles = { ...(state.fileHandles || {}) };
      delete newHandles[action.payload];
      return {
        ...state,
        fileHandles: newHandles,
        lastModified: now,
      };
    }

    default:
      return state;
  }
}

// Context type
interface SessionContextType {
  session: Session;
  initSession: (mode: EntryMode, experienceLevel?: ExperienceLevel) => void;
  addMessage: (message: Omit<Message, "id" | "timestamp">) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  addCode: (code: Omit<CodeReference, "id" | "uploadedAt">) => string;
  removeCode: (codeId: string) => void;
  updateCode: (codeId: string, updates: Partial<CodeReference>) => void;
  reorderCodeFiles: (fileIds: string[]) => void;
  addAnalysis: (analysis: Omit<AnalysisResult, "id" | "createdAt">) => void;
  addReferences: (refs: ReferenceResult[]) => void;
  clearReferences: () => void;
  addArtifact: (artifact: Omit<CritiqueArtifact, "id" | "createdAt">) => void;
  setPhase: (phase: ConversationPhase) => void;
  escalateFeedback: () => void;
  updateSettings: (settings: Partial<SessionSettings>) => void;
  importSession: (session: Session) => void;
  resetSession: () => void;
  exportSession: () => Session;
  // Create mode functions
  initCreateState: (projectName: string, inspiration?: string, inspirationUrl?: string) => void;
  addCodeVersion: (version: Omit<CodeVersion, "id" | "createdAt" | "version">) => void;
  setCurrentVersion: (versionId: string) => void;
  setCreateLanguage: (language: CreateLanguage) => void;
  setLanguageOverride: (language: string | undefined) => void;
  setExperienceLevel: (level: ExperienceLevel) => void;
  setMode: (mode: EntryMode) => void;
  transferToCritique: (versionId: string) => void;
  // Session persistence functions
  switchMode: (mode: EntryMode) => void; // Save current, load target mode
  clearModeSession: (mode: EntryMode) => void;
  clearAllModeSessions: () => void;
  hasSavedSession: (mode: EntryMode) => boolean;
  // Line annotation functions
  addLineAnnotation: (annotation: Omit<LineAnnotation, "id" | "createdAt">) => void;
  updateLineAnnotation: (id: string, updates: Partial<Omit<LineAnnotation, "id" | "codeFileId" | "createdAt">>) => void;
  removeLineAnnotation: (id: string) => void;
  clearLineAnnotations: (codeFileId?: string) => void;
  // Code contents functions
  setCodeContent: (fileId: string, content: string) => void;
  removeCodeContent: (fileId: string) => void;
  // Display settings functions
  updateDisplaySettings: (settings: Partial<DisplaySettings>) => void;
  updateAnnotationDisplaySettings: (settings: Partial<AnnotationDisplaySettings>) => void;
  updatePanelLayoutSettings: (settings: Partial<PanelLayoutSettings>) => void;
  // Auto-save functions
  markDirty: () => void;
  markClean: (lastSaved?: string) => void;
  setFileHandle: (fileId: string, handleId: string) => void;
  removeFileHandle: (fileId: string) => void;
}

const SessionContext = createContext<SessionContextType | null>(null);

// Provider component
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, dispatch] = useReducer(sessionReducer, null, createInitialSession);
  const hasLoadedRef = useRef(false);

  // Load saved session on mount
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    // Get the last active mode, defaulting to critique
    const lastMode = getLastMode() || "critique";

    // Try to load saved session for the last mode
    // This ensures the session is restored when the app is reopened
    const savedSession = loadSessionForMode(lastMode);
    if (savedSession) {
      dispatch({ type: "LOAD_SAVED_SESSION", payload: savedSession });
    } else if (lastMode !== "critique") {
      // If no saved session for last mode, initialize with that mode
      dispatch({ type: "INIT_SESSION", payload: { mode: lastMode } });
    }
  }, []);

  const initSession = useCallback((mode: EntryMode, experienceLevel?: ExperienceLevel) => {
    dispatch({ type: "INIT_SESSION", payload: { mode, experienceLevel } });
  }, []);

  const addMessage = useCallback(
    (message: Omit<Message, "id" | "timestamp">) => {
      const fullMessage: Message = {
        ...message,
        id: generateId(),
        timestamp: getCurrentTimestamp(),
      };
      dispatch({ type: "ADD_MESSAGE", payload: fullMessage });
    },
    []
  );

  const updateMessage = useCallback((id: string, updates: Partial<Message>) => {
    dispatch({ type: "UPDATE_MESSAGE", payload: { id, updates } });
  }, []);

  const addCode = useCallback(
    (code: Omit<CodeReference, "id" | "uploadedAt">): string => {
      const id = generateId();
      const fullCode: CodeReference = {
        ...code,
        id,
        uploadedAt: getCurrentTimestamp(),
      };
      dispatch({ type: "ADD_CODE", payload: fullCode });
      return id;
    },
    []
  );

  const removeCode = useCallback((codeId: string) => {
    dispatch({ type: "REMOVE_CODE", payload: codeId });
  }, []);

  const updateCode = useCallback((codeId: string, updates: Partial<CodeReference>) => {
    dispatch({ type: "UPDATE_CODE", payload: { id: codeId, updates } });
  }, []);

  const reorderCodeFiles = useCallback((fileIds: string[]) => {
    dispatch({ type: "REORDER_CODE", payload: fileIds });
  }, []);

  const addAnalysis = useCallback(
    (analysis: Omit<AnalysisResult, "id" | "createdAt">) => {
      const fullAnalysis: AnalysisResult = {
        ...analysis,
        id: generateId(),
        createdAt: getCurrentTimestamp(),
      };
      dispatch({ type: "ADD_ANALYSIS", payload: fullAnalysis });
    },
    []
  );

  const addReferences = useCallback((refs: ReferenceResult[]) => {
    dispatch({ type: "ADD_REFERENCES", payload: refs });
  }, []);

  const clearReferences = useCallback(() => {
    dispatch({ type: "CLEAR_REFERENCES" });
  }, []);

  const addArtifact = useCallback(
    (artifact: Omit<CritiqueArtifact, "id" | "createdAt">) => {
      const fullArtifact: CritiqueArtifact = {
        ...artifact,
        id: generateId(),
        createdAt: getCurrentTimestamp(),
      };
      dispatch({ type: "ADD_ARTIFACT", payload: fullArtifact });
    },
    []
  );

  const setPhase = useCallback((phase: ConversationPhase) => {
    dispatch({ type: "SET_PHASE", payload: phase });
  }, []);

  const escalateFeedback = useCallback(() => {
    dispatch({ type: "ESCALATE_FEEDBACK" });
  }, []);

  const updateSettings = useCallback((settings: Partial<SessionSettings>) => {
    dispatch({ type: "UPDATE_SETTINGS", payload: settings });
  }, []);

  const importSession = useCallback((sessionData: Session) => {
    dispatch({ type: "IMPORT_SESSION", payload: sessionData });
  }, []);

  const resetSession = useCallback(() => {
    dispatch({ type: "RESET_SESSION" });
  }, []);

  const exportSession = useCallback(() => {
    return session;
  }, [session]);

  // Create mode functions
  const initCreateState = useCallback(
    (projectName: string, inspiration?: string, inspirationUrl?: string) => {
      dispatch({
        type: "INIT_CREATE_STATE",
        payload: { projectName, inspiration, inspirationUrl },
      });
    },
    []
  );

  const addCodeVersion = useCallback(
    (version: Omit<CodeVersion, "id" | "createdAt" | "version">) => {
      dispatch({ type: "ADD_CODE_VERSION", payload: version });
    },
    []
  );

  const setCurrentVersion = useCallback((versionId: string) => {
    dispatch({ type: "SET_CURRENT_VERSION", payload: versionId });
  }, []);

  const setCreateLanguage = useCallback((language: CreateLanguage) => {
    dispatch({ type: "SET_CREATE_LANGUAGE", payload: language });
  }, []);

  const setLanguageOverride = useCallback((language: string | undefined) => {
    dispatch({ type: "SET_LANGUAGE_OVERRIDE", payload: language });
  }, []);

  const setExperienceLevel = useCallback((level: ExperienceLevel) => {
    dispatch({ type: "SET_EXPERIENCE_LEVEL", payload: level });
  }, []);

  const setMode = useCallback((mode: EntryMode) => {
    dispatch({ type: "SET_MODE", payload: mode });
  }, []);

  const transferToCritique = useCallback((versionId: string) => {
    dispatch({ type: "TRANSFER_TO_CRITIQUE", payload: versionId });
  }, []);

  // Session persistence functions
  const switchMode = useCallback((targetMode: EntryMode) => {
    // Save current session before switching
    saveSessionForMode(session.mode, session);

    // Save the target mode as the last active mode
    saveLastMode(targetMode);

    // Try to load saved session for target mode
    const savedSession = loadSessionForMode(targetMode);
    if (savedSession) {
      dispatch({ type: "LOAD_SAVED_SESSION", payload: savedSession });
    } else {
      // No saved session, create a fresh one for the target mode
      dispatch({ type: "INIT_SESSION", payload: { mode: targetMode, experienceLevel: session.experienceLevel } });
    }
  }, [session]);

  const clearModeSession = useCallback((mode: EntryMode) => {
    clearSessionForMode(mode);
    // If clearing current mode, reset the session
    if (mode === session.mode) {
      dispatch({ type: "INIT_SESSION", payload: { mode, experienceLevel: session.experienceLevel } });
    }
  }, [session.mode, session.experienceLevel]);

  const clearAllModeSessions = useCallback(() => {
    clearAllSessions();
    // Reset current session
    dispatch({ type: "INIT_SESSION", payload: { mode: session.mode, experienceLevel: session.experienceLevel } });
  }, [session.mode, session.experienceLevel]);

  const hasSavedSession = useCallback((mode: EntryMode) => {
    return hasSessionForMode(mode);
  }, []);

  // Auto-save session on changes (debounced via lastModified check)
  const lastSavedRef = useRef<string>("");
  useEffect(() => {
    // Don't save if nothing has changed since last save
    if (session.lastModified === lastSavedRef.current) return;

    // Debounce saves to avoid excessive writes
    const timeoutId = setTimeout(() => {
      saveSessionForMode(session.mode, session);
      lastSavedRef.current = session.lastModified;
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [session]);

  // Line annotation functions
  const addLineAnnotation = useCallback(
    (annotation: Omit<LineAnnotation, "id" | "createdAt">) => {
      const fullAnnotation: LineAnnotation = {
        ...annotation,
        id: generateId(),
        createdAt: getCurrentTimestamp(),
      };
      dispatch({ type: "ADD_LINE_ANNOTATION", payload: fullAnnotation });
    },
    []
  );

  const updateLineAnnotation = useCallback((id: string, updates: Partial<Omit<LineAnnotation, "id" | "codeFileId" | "createdAt">>) => {
    dispatch({ type: "UPDATE_LINE_ANNOTATION", payload: { id, updates } });
  }, []);

  const removeLineAnnotation = useCallback((id: string) => {
    dispatch({ type: "REMOVE_LINE_ANNOTATION", payload: id });
  }, []);

  const clearLineAnnotations = useCallback((codeFileId?: string) => {
    dispatch({ type: "CLEAR_LINE_ANNOTATIONS", payload: codeFileId });
  }, []);

  // Code contents functions
  const setCodeContent = useCallback((fileId: string, content: string) => {
    dispatch({ type: "SET_CODE_CONTENT", payload: { fileId, content } });
  }, []);

  const removeCodeContent = useCallback((fileId: string) => {
    dispatch({ type: "REMOVE_CODE_CONTENT", payload: fileId });
  }, []);

  // Display settings functions
  const updateDisplaySettings = useCallback((settings: Partial<DisplaySettings>) => {
    dispatch({ type: "UPDATE_DISPLAY_SETTINGS", payload: settings });
  }, []);

  const updateAnnotationDisplaySettings = useCallback((settings: Partial<AnnotationDisplaySettings>) => {
    dispatch({ type: "UPDATE_ANNOTATION_DISPLAY_SETTINGS", payload: settings });
  }, []);

  const updatePanelLayoutSettings = useCallback((settings: Partial<PanelLayoutSettings>) => {
    dispatch({ type: "UPDATE_PANEL_LAYOUT_SETTINGS", payload: settings });
  }, []);

  // Auto-save functions
  const markDirty = useCallback(() => {
    dispatch({ type: "MARK_DIRTY" });
  }, []);

  const markClean = useCallback((lastSaved?: string) => {
    dispatch({ type: "MARK_CLEAN", payload: lastSaved ? { lastSaved } : undefined });
  }, []);

  const setFileHandle = useCallback((fileId: string, handleId: string) => {
    dispatch({ type: "SET_FILE_HANDLE", payload: { fileId, handleId } });
  }, []);

  const removeFileHandle = useCallback((fileId: string) => {
    dispatch({ type: "REMOVE_FILE_HANDLE", payload: fileId });
  }, []);

  const value: SessionContextType = {
    session,
    initSession,
    addMessage,
    updateMessage,
    addCode,
    removeCode,
    updateCode,
    reorderCodeFiles,
    addAnalysis,
    addReferences,
    clearReferences,
    addArtifact,
    setPhase,
    escalateFeedback,
    updateSettings,
    importSession,
    resetSession,
    exportSession,
    // Create mode
    initCreateState,
    addCodeVersion,
    setCurrentVersion,
    setCreateLanguage,
    setLanguageOverride,
    setExperienceLevel,
    setMode,
    transferToCritique,
    // Session persistence
    switchMode,
    clearModeSession,
    clearAllModeSessions,
    hasSavedSession,
    // Line annotations
    addLineAnnotation,
    updateLineAnnotation,
    removeLineAnnotation,
    clearLineAnnotations,
    // Code contents
    setCodeContent,
    removeCodeContent,
    // Display settings
    updateDisplaySettings,
    updateAnnotationDisplaySettings,
    updatePanelLayoutSettings,
    // Auto-save
    markDirty,
    markClean,
    setFileHandle,
    removeFileHandle,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

// Hook to use session context
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
