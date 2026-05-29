/**
 * CodeMirror extension factories for annotation features
 */

import { Extension, Range } from "@codemirror/state";
import { EditorView, Decoration, gutter } from "@codemirror/view";
import type { LineAnnotation, LineAnnotationType } from "@/types";
import {
  DEFAULT_ANNOTATION_DISPLAY_SETTINGS,
  getAnnotationColor,
  getLineHighlightOpacity,
  type AnnotationDisplaySettings,
  type InlineEditState,
  type InlineEditCallbacks,
  type LineHighlightIntensity,
} from "./cm-annotations-config";
import {
  InlineAnnotationEditor,
  AnnotationWidget,
  AnnotateLineMarker,
} from "./cm-annotations-widgets";

// ============================================================================
// Main Annotations Extension
// ============================================================================

/**
 * Create annotation extension with inline editing support
 */
export function createSimpleAnnotationsExtension(
  annotations: LineAnnotation[],
  onEdit: ((id: string) => void) | undefined,
  onDelete: ((id: string) => void) | undefined,
  isDark: boolean,
  editState?: InlineEditState,
  editCallbacks?: InlineEditCallbacks,
  highlightedType?: LineAnnotationType | null,
  displaySettings?: AnnotationDisplaySettings,
  newRemoteAnnotationIds?: Set<string>,
  userInitials?: string,
  expandedAnnotationId?: string | null,
  onToggleReplies?: (id: string) => void,
  onAddReply?: (annotationId: string, content: string) => void,
  onDeleteReply?: (replyId: string) => void,
  replyInputOpenFor?: string | null,
  onOpenReplyInput?: (id: string) => void,
  onCloseReplyInput?: () => void,
  isInProject?: boolean // Enable reply functionality (cloud projects only for now)
): Extension {
  const settings = displaySettings || DEFAULT_ANNOTATION_DISPLAY_SETTINGS;

  if (!settings.visible) {
    return [];
  }

  return EditorView.decorations.compute(["doc"], (state) => {
    const decorations: { pos: number; widget: Decoration }[] = [];

    // Group annotations by their display line (end line for blocks)
    const byDisplayLine = new Map<number, LineAnnotation[]>();
    for (const ann of annotations) {
      const displayLine = ann.endLineNumber ?? ann.lineNumber;
      const existing = byDisplayLine.get(displayLine) || [];
      byDisplayLine.set(displayLine, [...existing, ann]);
    }

    // Create widgets for each display line
    for (const [displayLine, lineAnnotations] of byDisplayLine) {
      if (displayLine < 1 || displayLine > state.doc.lines) continue;

      const line = state.doc.line(displayLine);

      for (const ann of lineAnnotations) {
        // Check if this annotation is being edited
        if (editState?.annotationId === ann.id && editCallbacks) {
          const widget = Decoration.widget({
            widget: new InlineAnnotationEditor(editState, editCallbacks, isDark, false, userInitials),
            block: true,
            side: 1,
          });
          decorations.push({ pos: line.to, widget });
        } else {
          // Show normal annotation widget
          const isHighlighted = highlightedType === ann.type;
          const isRemoteNew = newRemoteAnnotationIds?.has(ann.id) ?? false;
          const widget = Decoration.widget({
            widget: new AnnotationWidget(
              ann,
              onEdit,
              onDelete,
              isDark,
              isHighlighted,
              settings,
              isRemoteNew,
              expandedAnnotationId,
              onToggleReplies,
              onAddReply,
              onDeleteReply,
              replyInputOpenFor === ann.id, // Only this annotation cares if it has input open
              onOpenReplyInput,
              onCloseReplyInput,
              true // Replies are a local feature; the .ccs file carries them. Cloud sync, when on, is layered on top.
            ),
            block: true,
            side: 1,
          });
          decorations.push({ pos: line.to, widget });
        }
      }
    }

    // Add inline editor for new annotation
    if (editState?.lineNumber && editCallbacks && !editState.annotationId) {
      const lineNumber = editState.lineNumber;
      if (lineNumber >= 1 && lineNumber <= state.doc.lines) {
        const line = state.doc.line(lineNumber);
        const widget = Decoration.widget({
          widget: new InlineAnnotationEditor(editState, editCallbacks, isDark, true, userInitials),
          block: true,
          side: 1,
        });
        decorations.push({ pos: line.to, widget });
      }
    }

    decorations.sort((a, b) => a.pos - b.pos);
    return Decoration.set(decorations.map((d) => d.widget.range(d.pos)));
  });
}

// ============================================================================
// Annotate Gutter Extension
// ============================================================================

/**
 * Create a clickable line numbers gutter for annotate mode
 * Shows "+" on hover to indicate you can add an annotation
 */
export function createAnnotateGutter(
  onLineClick: (startLine: number, endLine?: number) => void,
  showDiscovery: boolean = false,
  animationKey: number = 0,
  animationColor: string = "#6b7280"
): Extension {
  return gutter({
    class: "cm-annotate-gutter",
    lineMarker: (view, line) => {
      const lineNumber = view.state.doc.lineAt(line.from).number;
      return new AnnotateLineMarker(lineNumber, showDiscovery, animationKey, animationColor);
    },
    domEventHandlers: {
      click(view, line) {
        const clickedLineNumber = view.state.doc.lineAt(line.from).number;

        // Check if there's a selection spanning multiple lines
        const selection = view.state.selection.main;
        if (!selection.empty) {
          const startLine = view.state.doc.lineAt(selection.from).number;
          const endLine = view.state.doc.lineAt(selection.to).number;

          if (startLine !== endLine) {
            const [minLine, maxLine] = startLine < endLine
              ? [startLine, endLine]
              : [endLine, startLine];
            onLineClick(minLine, maxLine);
            return true;
          }
        }

        onLineClick(clickedLineNumber);
        return true;
      },
    },
  });
}

// ============================================================================
// Line Highlight Extensions
// ============================================================================

/**
 * Create an extension that provides a subtle permanent highlight for annotated lines
 */
export function createSubtleAnnotationHighlightExtension(
  annotations: LineAnnotation[],
  isDark: boolean = false,
  intensity: Exclude<LineHighlightIntensity, "off"> = "medium"
): Extension {
  if (annotations.length === 0) {
    return [];
  }

  const bgOpacity = getLineHighlightOpacity(intensity);

  // Build a map of line numbers to their annotation types
  const lineToType = new Map<number, LineAnnotationType>();
  for (const ann of annotations) {
    const startLine = ann.lineNumber;
    const endLine = ann.endLineNumber ?? ann.lineNumber;
    for (let i = startLine; i <= endLine; i++) {
      lineToType.set(i, ann.type);
    }
  }

  return EditorView.decorations.compute(["doc"], (state) => {
    const decorations: Range<Decoration>[] = [];

    for (let i = 1; i <= state.doc.lines; i++) {
      const annotationType = lineToType.get(i);
      if (annotationType) {
        const line = state.doc.line(i);
        const color = getAnnotationColor(annotationType, isDark);
        decorations.push(
          Decoration.line({
            class: "cm-line-subtle-annotated",
            attributes: {
              style: `background-color: ${color}${bgOpacity}; border-right: 2px solid ${color};`,
            },
          }).range(line.from)
        );
      }
    }

    return Decoration.set(decorations);
  });
}

/**
 * Create an extension that dims non-annotated lines to highlight annotations
 */
export function createHighlightAnnotatedLinesExtension(
  annotations: LineAnnotation[],
  enabled: boolean,
  isDark: boolean = false
): Extension {
  if (!enabled) {
    return [];
  }

  // Build a map of line numbers to their annotation types
  const lineToType = new Map<number, LineAnnotationType>();
  for (const ann of annotations) {
    const startLine = ann.lineNumber;
    const endLine = ann.endLineNumber ?? ann.lineNumber;
    for (let i = startLine; i <= endLine; i++) {
      lineToType.set(i, ann.type);
    }
  }

  return EditorView.decorations.compute(["doc"], (state) => {
    const dimmedDecorations: { from: number }[] = [];
    const highlightedDecorations: { from: number; type: LineAnnotationType }[] = [];

    for (let i = 1; i <= state.doc.lines; i++) {
      const line = state.doc.line(i);
      const annotationType = lineToType.get(i);

      if (annotationType) {
        highlightedDecorations.push({ from: line.from, type: annotationType });
      } else {
        dimmedDecorations.push({ from: line.from });
      }
    }

    const allDecorations = [
      ...dimmedDecorations.map((d) =>
        Decoration.line({ class: "cm-line-dimmed" }).range(d.from)
      ),
      ...highlightedDecorations.map((d) => {
        const color = getAnnotationColor(d.type, isDark);
        return Decoration.line({
          class: "cm-line-annotated",
          attributes: {
            style: `background-color: ${color}15; border-right: 2px solid ${color};`,
          },
        }).range(d.from);
      }),
    ];

    allDecorations.sort((a, b) => a.from - b.from);
    return Decoration.set(allDecorations);
  });
}
