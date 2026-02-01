"use client";

/**
 * CodeMirror 6 Editor wrapper for CCS Workbench
 * Provides syntax highlighting, theming, and annotation support
 */

import { useEffect, useRef, useCallback, useMemo } from "react";
import { EditorState, Compartment, Extension } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  keymap,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { useAppSettings } from "@/context/AppSettingsContext";
import { CODE_FONT_OPTIONS } from "@/types/app-settings";
import { getCCSTheme, getFontSizeTheme, getFontFamilyTheme } from "./cm-theme";
import { loadLanguage, normaliseLanguage, getLanguageColor } from "./cm-languages";
import { createSimpleAnnotationsExtension, createAnnotateGutter, createHighlightAnnotatedLinesExtension, createSubtleAnnotationHighlightExtension, InlineEditState, InlineEditCallbacks } from "./cm-annotations";
import type { LineAnnotation, LineAnnotationType, AnnotationDisplaySettings } from "@/types";

export interface CodeMirrorEditorProps {
  /** The code content to display */
  value: string;
  /** Callback when content changes (only in edit mode) */
  onChange?: (value: string) => void;
  /** Programming language for syntax highlighting */
  language?: string;
  /** Whether the editor is read-only (annotate mode) */
  readOnly?: boolean;
  /** Font size in pixels */
  fontSize?: number;
  /** Annotations to display as widgets below lines */
  annotations?: LineAnnotation[];
  /** Callback when a line is clicked (in read-only/annotate mode)
   * If the user has selected a range of lines, endLine will be provided
   */
  onLineClick?: (startLine: number, endLine?: number) => void;
  /** Callback to edit an annotation */
  onEditAnnotation?: (id: string) => void;
  /** Callback to delete an annotation */
  onDeleteAnnotation?: (id: string) => void;
  /** Inline editing state for new/existing annotations */
  inlineEditState?: InlineEditState;
  /** Callbacks for inline editing */
  inlineEditCallbacks?: InlineEditCallbacks;
  /** Whether to show discovery animation for annotation gutter */
  showDiscoveryAnimation?: boolean;
  /** Key that increments to force animation restart (for same-type file switching) */
  animationTriggerKey?: number;
  /** Annotation type to highlight (briefly increases brightness of matching annotations) */
  highlightedAnnotationType?: LineAnnotationType | null;
  /** Annotation display settings (brightness, badge visibility, etc.) */
  annotationDisplaySettings?: AnnotationDisplaySettings;
  /** Callback when cursor position changes (line, column) */
  onCursorPositionChange?: (line: number, column: number) => void;
  /** IDs of annotations that just arrived from remote (for yellow flash animation) */
  newRemoteAnnotationIds?: Set<string>;
  /** User initials for "signed as" display in annotation editor */
  userInitials?: string;
  /** ID of the annotation with expanded replies thread */
  expandedAnnotationId?: string | null;
  /** Callback when reply button is clicked to toggle thread view */
  onToggleReplies?: (annotationId: string) => void;
  /** Callback to add a reply to an annotation */
  onAddReply?: (annotationId: string, content: string) => void;
  /** Callback to delete a reply */
  onDeleteReply?: (replyId: string) => void;
  /** ID of annotation that has reply input open */
  replyInputOpenFor?: string | null;
  /** Callback to open reply input for an annotation */
  onOpenReplyInput?: (annotationId: string) => void;
  /** Callback to close reply input */
  onCloseReplyInput?: () => void;
  /** Whether we're in a cloud project (enables reply functionality) */
  isInProject?: boolean;
  /** Initial scroll position (top offset in pixels) to restore when loading file */
  initialScrollPos?: number;
  /** Callback when scroll position changes (for tracking per-file scroll) */
  onScrollPosChange?: (scrollTop: number) => void;
  /** Initial line number to jump to (1-indexed, defaults to 1) */
  initialLineNumber?: number;
  /** Callback when cursor line changes (for tracking per-file position) */
  onLineChange?: (lineNumber: number) => void;
  /** CSS class for the container */
  className?: string;
}

export function CodeMirrorEditor({
  value,
  onChange,
  language,
  readOnly = false,
  fontSize = 12,
  annotations = [],
  onLineClick,
  onEditAnnotation,
  onDeleteAnnotation,
  inlineEditState,
  inlineEditCallbacks,
  showDiscoveryAnimation = false,
  animationTriggerKey = 0,
  highlightedAnnotationType,
  annotationDisplaySettings,
  onCursorPositionChange,
  newRemoteAnnotationIds,
  userInitials,
  expandedAnnotationId,
  onToggleReplies,
  onAddReply,
  onDeleteReply,
  replyInputOpenFor,
  onOpenReplyInput,
  onCloseReplyInput,
  isInProject,
  initialScrollPos,
  onScrollPosChange,
  initialLineNumber = 1,
  onLineChange,
  className,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { effectiveTheme, settings } = useAppSettings();

  // Get the current font family from settings
  const codeFontFamily = useMemo(() => {
    const fontOption = CODE_FONT_OPTIONS.find(f => f.id === settings.codeFont);
    return fontOption?.family || CODE_FONT_OPTIONS[0].family;
  }, [settings.codeFont]);

  // Compartments for dynamic reconfiguration
  const themeCompartment = useRef(new Compartment());
  const languageCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());
  const annotationsCompartment = useRef(new Compartment());
  const fontSizeCompartment = useRef(new Compartment());
  const fontFamilyCompartment = useRef(new Compartment());
  const gutterCompartment = useRef(new Compartment());
  const highlightLinesCompartment = useRef(new Compartment());
  const subtleHighlightCompartment = useRef(new Compartment());

  // Track if this is the initial mount to prevent double updates
  const isInitialMount = useRef(true);

  // Track last value to avoid unnecessary updates
  const lastValueRef = useRef(value);

  // Refs for values that need to be accessed in closures
  // This ensures the updateListener always sees current values
  const readOnlyRef = useRef(readOnly);
  const onChangeRef = useRef(onChange);
  const onCursorPositionChangeRef = useRef(onCursorPositionChange);
  const onScrollPosChangeRef = useRef(onScrollPosChange);
  const onLineChangeRef = useRef(onLineChange);

  // Keep refs in sync with props
  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onCursorPositionChangeRef.current = onCursorPositionChange;
  }, [onCursorPositionChange]);

  useEffect(() => {
    onScrollPosChangeRef.current = onScrollPosChange;
  }, [onScrollPosChange]);

  useEffect(() => {
    onLineChangeRef.current = onLineChange;
  }, [onLineChange]);

  // Memoize handlers to prevent recreation
  const stableOnEdit = useCallback(
    (id: string) => onEditAnnotation?.(id),
    [onEditAnnotation]
  );
  const stableOnDelete = useCallback(
    (id: string) => onDeleteAnnotation?.(id),
    [onDeleteAnnotation]
  );

  // Determine if dark mode
  const isDark = effectiveTheme === "dark";

  // Get language-specific color for animation
  const animationColor = useMemo(
    () => getLanguageColor(language || "plain", isDark),
    [language, isDark]
  );

  // Stable onLineClick callback (supports single line or range selection)
  const stableOnLineClick = useCallback(
    (startLine: number, endLine?: number) => onLineClick?.(startLine, endLine),
    [onLineClick]
  );

  // Mobile-specific configuration
  const mobileExtensions = useMemo(() => {
    if (typeof window === 'undefined') return [];
    const isMobile = window.innerWidth < 768;
    if (!isMobile) return [];

    return [
      EditorView.theme({
        '&': {
          fontSize: '16px', // Prevent iOS zoom on focus
        },
        '.cm-scroller': {
          fontSize: '16px',
        },
        '.cm-gutters': {
          minWidth: '44px', // Touch-friendly tap targets
        },
      }),
    ];
  }, []);

  // Create base extensions (static, not including gutter which varies by mode)
  const baseExtensions = useMemo(
    (): Extension[] => [
      highlightActiveLine(),
      highlightActiveLineGutter(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      crosshairCursor(),
      history(),
      search({ top: true }), // Enable search panel (Cmd+F)
      highlightSelectionMatches(), // Highlight all matches of selection
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      EditorView.lineWrapping,
      ...mobileExtensions, // Add mobile-specific configuration
    ],
    [mobileExtensions]
  );

  // Initialize editor on mount
  useEffect(() => {
    if (!containerRef.current) return;

    // Clear any existing content
    containerRef.current.innerHTML = "";

    const extensions: Extension[] = [
      ...baseExtensions,
      // Use custom annotate gutter in annotate mode (with + on hover), regular line numbers otherwise
      gutterCompartment.current.of(
        readOnly && onLineClick
          ? createAnnotateGutter(stableOnLineClick, showDiscoveryAnimation, animationTriggerKey, animationColor)
          : lineNumbers()
      ),
      themeCompartment.current.of(getCCSTheme(isDark)),
      fontSizeCompartment.current.of(getFontSizeTheme(fontSize)),
      fontFamilyCompartment.current.of(getFontFamilyTheme(codeFontFamily)),
      languageCompartment.current.of([]),
      readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
      annotationsCompartment.current.of(
        readOnly
          ? createSimpleAnnotationsExtension(
              annotations,
              stableOnEdit,
              stableOnDelete,
              isDark,
              inlineEditState,
              inlineEditCallbacks,
              highlightedAnnotationType,
              annotationDisplaySettings,
              newRemoteAnnotationIds,
              userInitials,
              expandedAnnotationId,
              onToggleReplies,
              onAddReply,
              onDeleteReply,
              replyInputOpenFor,
              onOpenReplyInput,
              onCloseReplyInput,
              isInProject
            )
          : []
      ),
      // Highlight annotated lines extension (dims non-annotated lines, colours annotated lines by type)
      highlightLinesCompartment.current.of(
        annotationDisplaySettings?.highlightAnnotatedLines
          ? createHighlightAnnotatedLinesExtension(annotations, true, isDark)
          : []
      ),
      // Subtle permanent highlight for annotated lines (controlled by lineHighlightIntensity setting)
      subtleHighlightCompartment.current.of(
        readOnly && annotationDisplaySettings?.visible && annotationDisplaySettings?.lineHighlightIntensity && annotationDisplaySettings.lineHighlightIntensity !== "off"
          ? createSubtleAnnotationHighlightExtension(annotations, isDark, annotationDisplaySettings.lineHighlightIntensity)
          : []
      ),
      // Update listener for content changes
      // Uses refs to ensure we always have current values (not stale closure captures)
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChangeRef.current && !readOnlyRef.current) {
          const newValue = update.state.doc.toString();
          lastValueRef.current = newValue;
          onChangeRef.current(newValue);
        }
      }),
      // Update listener for cursor position changes (selection moves, focus, etc.)
      EditorView.updateListener.of((update) => {
        // Fire on selection change OR when editor gains focus
        if (update.selectionSet || update.focusChanged) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          const lineNumber = line.number;
          const column = pos - line.from + 1; // 1-based column

          // Track cursor position for punch card display
          if (onCursorPositionChangeRef.current) {
            onCursorPositionChangeRef.current(lineNumber, column);
          }

          // Track line number for per-file position memory
          if (onLineChangeRef.current) {
            onLineChangeRef.current(lineNumber);
          }
        }
      }),
      // Mouse move handler for real-time position tracking on hover
      EditorView.domEventHandlers({
        mousemove(event, view) {
          if (!onCursorPositionChangeRef.current) return false;
          // Convert mouse coordinates to document position
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos !== null) {
            const line = view.state.doc.lineAt(pos);
            const column = pos - line.from + 1; // 1-based column
            onCursorPositionChangeRef.current(line.number, column);
          }
          return false; // Don't prevent default handling
        },
        scroll(event, view) {
          // Track scroll position for per-file memory
          if (onScrollPosChangeRef.current) {
            const scroller = view.scrollDOM;
            onScrollPosChangeRef.current(scroller.scrollTop);
          }
          return false;
        },
      }),
    ];

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    lastValueRef.current = value;
    isInitialMount.current = false;

    // Report initial cursor position
    if (onCursorPositionChangeRef.current) {
      const pos = view.state.selection.main.head;
      const line = view.state.doc.lineAt(pos);
      onCursorPositionChangeRef.current(line.number, pos - line.from + 1);
    }

    // Jump to initial line number for this file (defaults to line 1)
    // This takes precedence over scroll position for better UX
    if (initialLineNumber > 1) {
      requestAnimationFrame(() => {
        if (viewRef.current) {
          const doc = viewRef.current.state.doc;
          // Ensure line number is within document bounds
          const targetLine = Math.min(initialLineNumber, doc.lines);
          const line = doc.line(targetLine);

          // Scroll to the line and place cursor there
          viewRef.current.dispatch({
            selection: { anchor: line.from },
            effects: EditorView.scrollIntoView(line.from, { y: "center" }),
          });
        }
      });
    } else if (initialScrollPos !== undefined && initialScrollPos > 0) {
      // Fallback to scroll position if no specific line number
      requestAnimationFrame(() => {
        if (view.scrollDOM) {
          view.scrollDOM.scrollTop = initialScrollPos;
        }
      });
    }

    // Load language support asynchronously
    if (language) {
      const normalised = normaliseLanguage(language);
      loadLanguage(normalised).then((langSupport) => {
        if (langSupport && viewRef.current) {
          viewRef.current.dispatch({
            effects: languageCompartment.current.reconfigure(langSupport),
          });
        }
      });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only run on mount - we handle updates via effects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update value when prop changes (external update)
  useEffect(() => {
    const view = viewRef.current;
    if (!view || isInitialMount.current) return;

    // Only update if value actually changed from external source
    if (value !== lastValueRef.current) {
      const currentValue = view.state.doc.toString();
      if (value !== currentValue) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: value },
        });
        lastValueRef.current = value;
      }
    }
  }, [value]);

  // Update theme when effectiveTheme changes
  useEffect(() => {
    if (isInitialMount.current) return;
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(getCCSTheme(isDark)),
    });
  }, [isDark]);

  // Update font size
  useEffect(() => {
    if (isInitialMount.current) return;
    viewRef.current?.dispatch({
      effects: fontSizeCompartment.current.reconfigure(getFontSizeTheme(fontSize)),
    });
  }, [fontSize]);

  // Update font family
  useEffect(() => {
    if (isInitialMount.current) return;
    viewRef.current?.dispatch({
      effects: fontFamilyCompartment.current.reconfigure(getFontFamilyTheme(codeFontFamily)),
    });
  }, [codeFontFamily]);

  // Update language when language prop changes
  useEffect(() => {
    if (isInitialMount.current) return;

    // If no language specified, clear syntax highlighting
    if (!language) {
      viewRef.current?.dispatch({
        effects: languageCompartment.current.reconfigure([]),
      });
      return;
    }

    const normalised = normaliseLanguage(language);
    loadLanguage(normalised).then((langSupport) => {
      if (viewRef.current) {
        viewRef.current.dispatch({
          effects: languageCompartment.current.reconfigure(
            langSupport ? langSupport : []
          ),
        });
      }
    });
  }, [language]);

  // Update readOnly state and gutter when mode changes
  useEffect(() => {
    if (isInitialMount.current) return;
    viewRef.current?.dispatch({
      effects: [
        readOnlyCompartment.current.reconfigure(
          EditorState.readOnly.of(readOnly)
        ),
        gutterCompartment.current.reconfigure(
          readOnly && onLineClick
            ? createAnnotateGutter(stableOnLineClick, showDiscoveryAnimation, animationTriggerKey, animationColor)
            : lineNumbers()
        ),
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, showDiscoveryAnimation, animationTriggerKey, animationColor]);

  // Update annotations when they change
  useEffect(() => {
    if (isInitialMount.current) return;
    viewRef.current?.dispatch({
      effects: annotationsCompartment.current.reconfigure(
        readOnly
          ? createSimpleAnnotationsExtension(
              annotations,
              stableOnEdit,
              stableOnDelete,
              isDark,
              inlineEditState,
              inlineEditCallbacks,
              highlightedAnnotationType,
              annotationDisplaySettings,
              newRemoteAnnotationIds,
              userInitials,
              expandedAnnotationId,
              onToggleReplies,
              onAddReply,
              onDeleteReply,
              replyInputOpenFor,
              onOpenReplyInput,
              onCloseReplyInput,
              isInProject
            )
          : []
      ),
    });
  }, [annotations, readOnly, stableOnEdit, stableOnDelete, isDark, inlineEditState, inlineEditCallbacks, highlightedAnnotationType, annotationDisplaySettings, newRemoteAnnotationIds, userInitials, expandedAnnotationId, onToggleReplies, onAddReply, onDeleteReply, replyInputOpenFor, onOpenReplyInput, onCloseReplyInput]);

  // Update highlight annotated lines extension when setting or annotations change
  useEffect(() => {
    if (isInitialMount.current) return;
    viewRef.current?.dispatch({
      effects: highlightLinesCompartment.current.reconfigure(
        annotationDisplaySettings?.highlightAnnotatedLines
          ? createHighlightAnnotatedLinesExtension(annotations, true, isDark)
          : []
      ),
    });
  }, [annotations, annotationDisplaySettings?.highlightAnnotatedLines, isDark]);

  // Update subtle highlight extension when annotations or visibility/intensity changes
  useEffect(() => {
    if (isInitialMount.current) return;
    viewRef.current?.dispatch({
      effects: subtleHighlightCompartment.current.reconfigure(
        readOnly && annotationDisplaySettings?.visible && annotationDisplaySettings?.lineHighlightIntensity && annotationDisplaySettings.lineHighlightIntensity !== "off"
          ? createSubtleAnnotationHighlightExtension(annotations, isDark, annotationDisplaySettings.lineHighlightIntensity)
          : []
      ),
    });
  }, [annotations, readOnly, annotationDisplaySettings?.visible, annotationDisplaySettings?.lineHighlightIntensity, isDark]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        height: "100%",
        width: "100%",
        overflow: "auto",
        // @ts-ignore - CSS custom property
        "--code-font-family": codeFontFamily,
      }}
    />
  );
}
