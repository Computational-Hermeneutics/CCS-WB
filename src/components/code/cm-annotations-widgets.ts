/**
 * CodeMirror widget classes for rendering annotations
 */

import { WidgetType, GutterMarker } from "@codemirror/view";
import type { LineAnnotation, LineAnnotationType } from "@/types";
import {
  ANNOTATION_COLORS,
  ANNOTATION_PREFIXES,
  ANNOTATION_TYPES,
  BRIGHTNESS_OPACITY,
  getAnnotationColor,
  getBrightnessOpacity,
  type AnnotationDisplaySettings,
  type InlineEditState,
  type InlineEditCallbacks,
  DEFAULT_ANNOTATION_DISPLAY_SETTINGS,
} from "./cm-annotations-config";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Converts URLs in text to clickable links and styles quoted original text
 * Returns a DocumentFragment with text nodes, styled spans, and link elements
 */
function createContentWithLinks(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();

  // Check if text starts with [original text] pattern (edit history)
  const editHistoryRegex = /^(\[.*?\])\s*/;
  const editMatch = text.match(editHistoryRegex);

  let textToProcess = text;

  if (editMatch) {
    // Style the original text in brackets differently
    const originalText = editMatch[1];
    const originalSpan = document.createElement("span");
    originalSpan.textContent = originalText + " ";
    originalSpan.style.cssText = `
      opacity: 0.6;
      font-style: italic;
      font-size: 0.95em;
    `;
    fragment.appendChild(originalSpan);

    // Process the rest of the text (after the brackets)
    textToProcess = text.slice(editMatch[0].length);
  }

  // URL regex pattern - matches http://, https://, and www. URLs
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(textToProcess)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(textToProcess.slice(lastIndex, match.index)));
    }

    // Create clickable link
    const link = document.createElement("a");
    let url = match[0];

    // Add https:// prefix if URL starts with www.
    if (url.startsWith("www.")) {
      url = "https://" + url;
    }

    link.href = url;
    link.textContent = match[0]; // Display original text (with or without https://)
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.cssText = `
      color: inherit;
      text-decoration: underline;
      text-decoration-style: dotted;
      text-underline-offset: 2px;
    `;

    // Prevent link click from triggering annotation events
    link.onclick = (e) => {
      e.stopPropagation();
    };

    fragment.appendChild(link);
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last URL
  if (lastIndex < textToProcess.length) {
    fragment.appendChild(document.createTextNode(textToProcess.slice(lastIndex)));
  }

  return fragment;
}

// ============================================================================
// InlineAnnotationEditor Widget
// ============================================================================

/**
 * Widget that renders an inline editor for new or existing annotations
 * Manages its own internal DOM state to avoid recreation on every change
 */
export class InlineAnnotationEditor extends WidgetType {
  private currentType: LineAnnotationType;
  private currentContent: string;

  constructor(
    readonly editState: InlineEditState,
    readonly callbacks: InlineEditCallbacks,
    readonly isDark: boolean,
    readonly isNew: boolean,
    readonly userInitials?: string
  ) {
    super();
    this.currentType = editState.initialType;
    this.currentContent = editState.initialContent;
  }

  eq(other: InlineAnnotationEditor): boolean {
    return (
      this.editState.lineNumber === other.editState.lineNumber &&
      this.editState.startLineNumber === other.editState.startLineNumber &&
      this.editState.annotationId === other.editState.annotationId &&
      this.isDark === other.isDark &&
      this.isNew === other.isNew &&
      this.userInitials === other.userInitials
    );
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-annotation-widget cm-annotation-editor";

    // Type selector with color-coded prefix
    const typeContainer = document.createElement("div");
    typeContainer.className = "cm-annotation-type-container";

    const prefixLabel = document.createElement("span");
    prefixLabel.className = "cm-annotation-prefix";
    prefixLabel.textContent = "// An:";
    typeContainer.appendChild(prefixLabel);

    const typeSelect = document.createElement("select");
    typeSelect.className = "cm-annotation-type-select";

    for (const type of ANNOTATION_TYPES) {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = ANNOTATION_PREFIXES[type];
      option.selected = type === this.currentType;
      typeSelect.appendChild(option);
    }

    const colonLabel = document.createElement("span");
    colonLabel.className = "cm-annotation-prefix";
    colonLabel.textContent = ":";
    typeContainer.appendChild(colonLabel);

    // Content input
    const input = document.createElement("input");
    input.type = "text";
    input.className = "cm-annotation-input";
    input.value = this.currentContent;

    if (this.isNew && this.editState.startLineNumber && this.editState.lineNumber) {
      input.placeholder = `Annotate lines ${this.editState.startLineNumber}-${this.editState.lineNumber}...`;
    } else {
      input.placeholder = this.isNew ? "Enter annotation..." : "Edit annotation...";
    }

    // Submit button
    const submitBtn = document.createElement("button");
    submitBtn.className = "cm-annotation-btn cm-annotation-btn-submit";
    submitBtn.textContent = this.isNew ? "Add" : "Save";
    submitBtn.disabled = !this.currentContent.trim();

    // Helper to update colors based on type
    const updateColors = (type: LineAnnotationType) => {
      const color = getAnnotationColor(type, this.isDark);
      prefixLabel.style.color = color;
      typeSelect.style.color = color;
      colonLabel.style.color = color;
    };

    updateColors(this.currentType);

    // Type change handler
    typeSelect.onchange = (e) => {
      this.currentType = (e.target as HTMLSelectElement).value as LineAnnotationType;
      updateColors(this.currentType);
    };
    typeContainer.appendChild(typeSelect);

    wrapper.appendChild(typeContainer);

    // Input change handler
    input.oninput = (e) => {
      this.currentContent = (e.target as HTMLInputElement).value;
      submitBtn.disabled = !this.currentContent.trim();
    };

    // Keyboard handlers
    input.onkeydown = (e) => {
      // Always stop propagation to prevent CodeMirror from intercepting input
      e.stopPropagation();

      if (e.key === "Enter" && this.currentContent.trim()) {
        e.preventDefault();
        this.callbacks.onSubmit(this.currentType, this.currentContent.trim());
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.callbacks.onCancel();
      }
    };

    wrapper.appendChild(input);

    // Actions
    const actions = document.createElement("div");
    actions.className = "cm-annotation-actions";

    submitBtn.onclick = (e) => {
      e.stopPropagation();
      if (this.currentContent.trim()) {
        this.callbacks.onSubmit(this.currentType, this.currentContent.trim());
      }
    };
    actions.appendChild(submitBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "cm-annotation-btn cm-annotation-btn-delete";
    cancelBtn.innerHTML = "&#x2715;";
    cancelBtn.onclick = (e) => {
      e.stopPropagation();
      this.callbacks.onCancel();
    };
    actions.appendChild(cancelBtn);

    // "Signed as" indicator
    const signedAs = document.createElement("span");
    signedAs.className = "cm-annotation-signed-as";
    if (this.userInitials) {
      signedAs.textContent = this.userInitials;
      signedAs.title = `Signed as ${this.userInitials}`;
    } else {
      signedAs.textContent = "unsigned";
      signedAs.classList.add("cm-annotation-unsigned");
      signedAs.title = "Set your initials in Settings → Profile";
    }
    actions.appendChild(signedAs);

    wrapper.appendChild(actions);

    // Focus the input after a short delay
    setTimeout(() => input.focus(), 10);

    // Click-away handler
    const clickAwayHandler = (e: MouseEvent) => {
      if (!wrapper.contains(e.target as Node)) {
        document.removeEventListener("mousedown", clickAwayHandler);
        this.callbacks.onCancel();
      }
    };
    setTimeout(() => {
      document.addEventListener("mousedown", clickAwayHandler);
    }, 50);

    return wrapper;
  }

  ignoreEvent(event: Event): boolean {
    const target = event.target as HTMLElement;
    const tagName = target.tagName;
    if (tagName === "SELECT" || tagName === "INPUT" || tagName === "BUTTON" || tagName === "OPTION") {
      return true;
    }
    return false;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a consistent color for a user based on their initials
 * Uses a hash function to convert initials to a hue value
 * @param initials - User initials to generate color from
 * @param isDark - Whether dark mode is active
 * @param profileColor - User's chosen profile color (takes precedence if provided)
 */
function getAuthorColor(initials: string, isDark: boolean, profileColor?: string): string {
  // If user has chosen a profile color, use it directly
  if (profileColor) {
    return profileColor;
  }

  // Otherwise, generate color from initials hash
  // Hash the initials to get a consistent hue (0-360)
  let hash = 0;
  for (let i = 0; i < initials.length; i++) {
    hash = initials.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32-bit integer
  }
  const hue = Math.abs(hash) % 360;

  // Use controlled saturation and lightness for readability
  // Dark mode: lighter, more saturated
  // Light mode: darker, less saturated
  const saturation = isDark ? 65 : 55;
  const lightness = isDark ? 55 : 45;

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// ============================================================================
// AnnotationWidget
// ============================================================================

/**
 * Widget that renders a single annotation below a code line
 */
export class AnnotationWidget extends WidgetType {
  constructor(
    readonly annotation: LineAnnotation,
    readonly onEdit: ((id: string) => void) | undefined,
    readonly onDelete: ((id: string) => void) | undefined,
    readonly isDark: boolean,
    readonly isHighlighted: boolean = false,
    readonly displaySettings: AnnotationDisplaySettings = DEFAULT_ANNOTATION_DISPLAY_SETTINGS,
    readonly isRemoteNew: boolean = false,
    readonly expandedAnnotationId: string | null = null,
    readonly onToggleReplies: ((id: string) => void) | undefined = undefined,
    readonly onAddReply: ((annotationId: string, content: string) => void) | undefined = undefined,
    readonly onDeleteReply: ((replyId: string) => void) | undefined = undefined,
    readonly hasReplyInputOpen: boolean = false,
    readonly onOpenReplyInput: ((id: string) => void) | undefined = undefined,
    readonly onCloseReplyInput: (() => void) | undefined = undefined,
    // Feature flag for reply functionality (cloud projects only for now, can enable for local files later)
    readonly repliesEnabled: boolean = true
  ) {
    super();
  }

  eq(other: AnnotationWidget): boolean {
    const repliesEqual =
      (this.annotation.replies?.length || 0) === (other.annotation.replies?.length || 0) &&
      (!this.annotation.replies || this.annotation.replies.every((r, i) =>
        r.id === other.annotation.replies?.[i]?.id &&
        r.content === other.annotation.replies?.[i]?.content
      ));

    return (
      this.annotation.id === other.annotation.id &&
      this.annotation.content === other.annotation.content &&
      this.annotation.type === other.annotation.type &&
      this.annotation.addedBy === other.annotation.addedBy &&
      this.isDark === other.isDark &&
      this.isHighlighted === other.isHighlighted &&
      this.displaySettings.brightness === other.displaySettings.brightness &&
      this.displaySettings.showBadge === other.displaySettings.showBadge &&
      this.displaySettings.showPillBackground === other.displaySettings.showPillBackground &&
      this.isRemoteNew === other.isRemoteNew &&
      this.expandedAnnotationId === other.expandedAnnotationId &&
      this.hasReplyInputOpen === other.hasReplyInputOpen &&
      this.repliesEnabled === other.repliesEnabled &&
      repliesEqual
    );
  }

  destroy(dom: HTMLElement) {
    // Remove all event listeners and clean up DOM
    dom.remove();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-annotation-widget";

    const { brightness, showBadge, showPillBackground } = this.displaySettings;
    const baseOpacity = getBrightnessOpacity(brightness);
    const color = getAnnotationColor(this.annotation.type, this.isDark);

    wrapper.style.borderRightColor = color;

    if (this.isHighlighted) {
      wrapper.classList.add("cm-annotation-highlighted");
    }

    if (this.isRemoteNew) {
      wrapper.classList.add("cm-annotation-remote-new");
    }

    // Annotation bar
    const bar = document.createElement("div");
    bar.className = "cm-annotation-bar";

    if (showPillBackground) {
      bar.style.backgroundColor = this.isDark ? `${color}18` : `${color}12`;
      if (this.isHighlighted) {
        bar.style.backgroundColor = this.isDark ? `${color}35` : `${color}25`;
      }
    }

    wrapper.style.setProperty("--annotation-opacity", String(baseOpacity));
    if (this.isHighlighted) {
      wrapper.style.setProperty("--annotation-opacity", "1");
    }

    // Type badge
    if (showBadge) {
      const badge = document.createElement("span");
      badge.className = "cm-annotation-type-badge";

      if (this.annotation.endLineNumber && this.annotation.endLineNumber !== this.annotation.lineNumber) {
        badge.textContent = `↑L${this.annotation.lineNumber}-${this.annotation.endLineNumber} ${ANNOTATION_PREFIXES[this.annotation.type]}`;
      } else {
        badge.textContent = `↑ ${ANNOTATION_PREFIXES[this.annotation.type]}`;
      }

      badge.style.backgroundColor = color;
      badge.style.color = this.isDark ? "hsl(0 0% 10%)" : "hsl(0 0% 100%)";

      if (this.isHighlighted) {
        badge.style.opacity = "1";
        badge.style.transform = "scale(1.05)";
      }
      bar.appendChild(badge);
    }

    // Content
    const content = document.createElement("span");
    content.className = "cm-annotation-content";

    let contentText = this.annotation.content;
    if (!showBadge) {
      const isBlock = this.annotation.endLineNumber && this.annotation.endLineNumber !== this.annotation.lineNumber;
      const lineRange = isBlock ? `L${this.annotation.lineNumber}-${this.annotation.endLineNumber} ` : "";
      contentText = `[${lineRange}${ANNOTATION_PREFIXES[this.annotation.type]}] ${this.annotation.content}`;
    }

    content.appendChild(createContentWithLinks(contentText));

    // Author initials
    if (this.annotation.addedBy) {
      const initials = document.createElement("span");
      initials.className = "cm-annotation-initials";
      initials.textContent = ` ${this.annotation.addedBy}`;
      initials.style.cssText = `
        font-size: 0.65em;
        opacity: 0.6;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.02em;
      `;
      content.appendChild(initials);
    }

    bar.appendChild(content);
    wrapper.appendChild(bar);

    // Actions container
    const actions = document.createElement("div");
    actions.className = "cm-annotation-actions";

    // Reply button (only in cloud projects for now)
    if (this.repliesEnabled && this.onToggleReplies) {
      const replyCount = this.annotation.replies?.length || 0;
      const replyBtn = document.createElement("button");
      replyBtn.className = "cm-annotation-btn cm-annotation-reply-btn";
      replyBtn.innerHTML = replyCount > 0 ? `&#128172; ${replyCount}` : `&#128172;`;
      replyBtn.title = replyCount > 0 ? `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}` : "Reply";
      replyBtn.onclick = (e) => {
        e.stopPropagation();
        this.onToggleReplies?.(this.annotation.id);
      };
      actions.appendChild(replyBtn);
    }

    // Edit button
    if (this.onEdit) {
      const editBtn = document.createElement("button");
      editBtn.className = "cm-annotation-btn";
      editBtn.textContent = "edit";
      editBtn.onclick = (e) => {
        e.stopPropagation();
        this.onEdit?.(this.annotation.id);
      };
      actions.appendChild(editBtn);
    }

    // Delete button
    if (this.onDelete) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "cm-annotation-btn cm-annotation-btn-delete";
      deleteBtn.innerHTML = "&#x2715;";
      deleteBtn.title = "Delete (Cmd/Ctrl+Click to skip confirmation)";
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        // Pass metaKey/ctrlKey state via custom event detail to skip confirmation
        const skipConfirm = e.metaKey || e.ctrlKey;
        // @ts-ignore - we'll handle the optional second parameter in the callback
        this.onDelete?.(this.annotation.id, skipConfirm);
      };
      actions.appendChild(deleteBtn);
    }

    wrapper.appendChild(actions);

    // Replies section (shown when expanded, cloud projects only for now)
    const isExpanded = this.expandedAnnotationId === this.annotation.id;
    if (this.repliesEnabled && isExpanded && (this.annotation.replies?.length || this.onAddReply)) {
      const repliesSection = document.createElement("div");
      repliesSection.className = "cm-annotation-replies";
      const repliesOpacity = this.isHighlighted ? 1 : baseOpacity;
      repliesSection.style.cssText = `
        margin-top: 8px;
        padding-left: 16px;
        border-left: 2px solid ${color};
        opacity: ${repliesOpacity};
      `;

      // Render existing replies
      if (this.annotation.replies && this.annotation.replies.length > 0) {
        this.annotation.replies.forEach(reply => {
          // Generate author-specific color from initials or use their chosen profile color
          const authorColor = reply.addedBy
            ? getAuthorColor(reply.addedBy, this.isDark, reply.profileColor)
            : color; // Fall back to annotation color if no author

          const replyDiv = document.createElement("div");
          replyDiv.className = "cm-annotation-reply";
          replyDiv.style.cssText = `
            padding: 6px 8px 6px 12px;
            margin-bottom: 6px;
            background: ${this.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
            border-left: 3px solid ${authorColor};
            border-radius: 4px;
            font-size: 0.9em;
            position: relative;
          `;

          const replyContent = document.createElement("span");
          replyContent.appendChild(createContentWithLinks(reply.content));
          replyDiv.appendChild(replyContent);

          // Reply author initials (colored to match left border)
          if (reply.addedBy) {
            const replyInitials = document.createElement("span");
            replyInitials.textContent = ` ${reply.addedBy}`;
            replyInitials.style.cssText = `
              font-size: 0.65em;
              color: ${authorColor};
              opacity: 0.85;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.02em;
              margin-left: 4px;
            `;
            replyDiv.appendChild(replyInitials);
          }

          // Delete reply button
          if (this.onDeleteReply) {
            const deleteReplyBtn = document.createElement("button");
            deleteReplyBtn.className = "cm-annotation-btn cm-annotation-btn-delete";
            deleteReplyBtn.innerHTML = "&#x2715;";
            deleteReplyBtn.style.cssText = `
              position: absolute;
              top: 4px;
              right: 4px;
              opacity: 0;
              transition: opacity 0.2s;
              padding: 2px 6px;
              font-size: 0.8em;
            `;
            deleteReplyBtn.onclick = (e) => {
              e.stopPropagation();
              this.onDeleteReply?.(reply.id);
            };
            replyDiv.appendChild(deleteReplyBtn);

            replyDiv.onmouseenter = () => {
              deleteReplyBtn.style.opacity = "0.6";
            };
            replyDiv.onmouseleave = () => {
              deleteReplyBtn.style.opacity = "0";
            };
          }

          repliesSection.appendChild(replyDiv);
        });
      }

      // Reply input or "+" button
      if (this.onAddReply) {
        if (this.hasReplyInputOpen) {
          // Show reply input form
          const replyForm = document.createElement("div");
          replyForm.style.cssText = `
            display: flex;
            gap: 4px;
            margin-top: 8px;
          `;

          const replyInput = document.createElement("input");
          replyInput.type = "text";
          replyInput.placeholder = "Add a reply...";
          replyInput.className = "cm-annotation-reply-input";
          replyInput.style.cssText = `
            flex: 1;
            padding: 6px 8px;
            border: 1px solid ${this.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'};
            border-radius: 4px;
            background: ${this.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.9)'};
            color: inherit;
            font-size: 0.9em;
          `;

          const submitBtn = document.createElement("button");
          submitBtn.textContent = "Reply";
          submitBtn.className = "cm-annotation-btn";
          submitBtn.style.cssText = `
            padding: 6px 12px;
            background: ${color};
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
          `;

          const handleSubmit = () => {
            const content = replyInput.value.trim();
            if (content) {
              this.onAddReply?.(this.annotation.id, content);
              replyInput.value = "";
              this.onCloseReplyInput?.();
            }
          };

          submitBtn.onclick = (e) => {
            e.stopPropagation();
            handleSubmit();
          };

          replyInput.onkeydown = (e) => {
            // Always stop propagation to prevent CodeMirror from intercepting input
            e.stopPropagation();

            if (e.key === "Enter") {
              handleSubmit();
            } else if (e.key === "Escape") {
              this.onCloseReplyInput?.();
            }
          };

          replyForm.appendChild(replyInput);
          replyForm.appendChild(submitBtn);
          repliesSection.appendChild(replyForm);

          // Auto-focus the input immediately
          requestAnimationFrame(() => replyInput.focus());

          // Click-away handler: close reply input if user clicks outside
          const clickAwayHandler = (e: MouseEvent) => {
            // Check if click is outside the reply form
            if (!replyForm.contains(e.target as Node)) {
              document.removeEventListener("mousedown", clickAwayHandler);
              this.onCloseReplyInput?.();
            }
          };
          // Add listener on next tick to avoid immediate trigger
          setTimeout(() => {
            document.addEventListener("mousedown", clickAwayHandler);
          }, 0);
        } else if (this.annotation.replies && this.annotation.replies.length > 0) {
          // Show small "+" button after all replies
          const addReplyBtn = document.createElement("button");
          addReplyBtn.className = "cm-annotation-btn cm-annotation-add-reply-btn";
          addReplyBtn.innerHTML = "+";
          addReplyBtn.title = "Add a reply";
          addReplyBtn.style.cssText = `
            margin-top: 4px;
            padding: 0px 6px;
            background: transparent;
            border: 1px solid ${color};
            border-radius: 3px;
            cursor: pointer;
            font-size: 0.85em;
            color: ${color};
            font-weight: bold;
          `;
          addReplyBtn.onclick = (e) => {
            e.stopPropagation();
            this.onOpenReplyInput?.(this.annotation.id);
          };
          // Append to repliesSection after all replies
          repliesSection.appendChild(addReplyBtn);
        } else {
          // No replies yet - show + button on its own line but smaller
          const addReplyBtn = document.createElement("button");
          addReplyBtn.className = "cm-annotation-btn cm-annotation-add-reply-btn";
          addReplyBtn.innerHTML = "+ Add reply";
          addReplyBtn.title = "Add a reply";
          addReplyBtn.style.cssText = `
            margin-top: 4px;
            padding: 2px 8px;
            background: transparent;
            border: 1px solid ${color};
            border-radius: 3px;
            cursor: pointer;
            font-size: 0.85em;
            color: ${color};
            font-weight: normal;
          `;
          addReplyBtn.onclick = (e) => {
            e.stopPropagation();
            this.onOpenReplyInput?.(this.annotation.id);
          };
          repliesSection.appendChild(addReplyBtn);
        }
      }

      wrapper.appendChild(repliesSection);
    }

    return wrapper;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// ============================================================================
// AnnotateLineMarker
// ============================================================================

/**
 * Custom gutter marker that shows line number with "+" on hover
 * Supports discovery animation with staggered delays and language-specific colors
 */
export class AnnotateLineMarker extends GutterMarker {
  constructor(
    readonly lineNumber: number,
    readonly showDiscovery: boolean = false,
    readonly animationKey: number = 0,
    readonly animationColor: string = "#6b7280"
  ) {
    super();
  }

  eq(other: AnnotateLineMarker): boolean {
    return (
      this.lineNumber === other.lineNumber &&
      this.showDiscovery === other.showDiscovery &&
      this.animationKey === other.animationKey &&
      this.animationColor === other.animationColor
    );
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-annotate-gutter-marker";

    const lineNum = document.createElement("span");
    lineNum.className = "cm-annotate-gutter-number";
    lineNum.textContent = String(this.lineNumber);

    const plusIcon = document.createElement("span");
    plusIcon.className = "cm-annotate-gutter-plus";
    plusIcon.textContent = "+";

    wrapper.appendChild(lineNum);
    wrapper.appendChild(plusIcon);

    // Discovery animation
    if (this.showDiscovery) {
      const delay = (this.lineNumber - 1) * 30;
      setTimeout(() => {
        plusIcon.style.color = this.animationColor;
        lineNum.classList.add("discovery-animate");
        plusIcon.classList.add("discovery-animate");
        setTimeout(() => {
          lineNum.classList.remove("discovery-animate");
          plusIcon.classList.remove("discovery-animate");
          plusIcon.style.color = "";
        }, 600);
      }, delay);
    }

    return wrapper;
  }
}
