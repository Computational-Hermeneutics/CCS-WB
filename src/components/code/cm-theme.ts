/**
 * Custom CodeMirror theme for CCS Workbench
 * Uses CSS variables from globals.css for consistency with the editorial design
 */

import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// Light theme - editorial scholarly aesthetic
const ccsLightTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "hsl(var(--card))",
      color: "hsl(var(--foreground))",
      height: "100%",
    },
    ".cm-scroller": {
      overflow: "auto",
    },
    ".cm-content": {
      fontFamily: "var(--code-font-family, ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace)",
      caretColor: "hsl(var(--burgundy))",
      padding: "4px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "hsl(var(--burgundy))",
      borderLeftWidth: "2px",
    },
    ".cm-gutters": {
      backgroundColor: "hsl(var(--cream) / 0.3)",
      color: "hsl(var(--muted-foreground))",
      borderRight: "1px solid hsl(var(--parchment) / 0.5)",
      paddingRight: "8px",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 8px 0 16px",
      minWidth: "40px",
      textAlign: "right",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "hsl(var(--burgundy) / 0.1)",
    },
    ".cm-activeLine": {
      backgroundColor: "hsl(var(--cream) / 0.5)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "hsl(var(--burgundy) / 0.15)",
    },
    ".cm-selectionMatch": {
      backgroundColor: "hsl(var(--gold) / 0.2)",
    },
    ".cm-searchMatch": {
      backgroundColor: "hsl(var(--gold) / 0.3)",
      outline: "1px solid hsl(var(--gold) / 0.5)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "hsl(var(--gold) / 0.5)",
    },
    // Annotation widget styling - improved visibility
    ".cm-annotation-widget": {
      borderRight: "2px solid", // Color set inline by widget (matches line highlight)
      backgroundColor: "transparent",
      padding: "2px 12px 2px var(--annotation-indent, 56px)", // Extra left indent (offset from code)
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: "var(--annotation-font-size, 11px)",
      width: "100%", // Ensure full width for uniform bar sizing
    },
    // Annotation bar - contains badge and content, colored background
    ".cm-annotation-bar": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      flex: "1",
      minWidth: "0", // Allow shrinking for long content
      padding: "3px 10px 3px 6px",
      borderRadius: "4px",
      transition: "background-color 0.15s, opacity 0.15s",
      opacity: "var(--annotation-opacity, 0.6)", // Use CSS variable from widget
    },
    ".cm-annotation-widget:hover .cm-annotation-bar": {
      opacity: "1 !important", // Override variable on hover
    },
    ".cm-annotation-widget:hover .cm-annotation-replies": {
      opacity: "1 !important", // Brighten replies on hover too
    },
    ".cm-annotation-type-badge": {
      fontFamily: "system-ui, sans-serif",
      fontSize: "9px",
      fontWeight: "600",
      padding: "1px 6px",
      borderRadius: "9px",
      whiteSpace: "nowrap",
      textTransform: "uppercase",
      letterSpacing: "0.3px",
      flexShrink: "0",
      transition: "opacity 0.15s, transform 0.15s",
    },
    ".cm-annotation-prefix": {
      fontFamily: "system-ui, sans-serif",
      fontSize: "10px",
      fontWeight: "600",
      whiteSpace: "nowrap",
      display: "none", // Hidden, replaced by badge
    },
    ".cm-annotation-content": {
      flex: "1",
      fontFamily: "var(--code-font-family, ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace)",
      fontStyle: "italic",
      color: "hsl(var(--slate))",
      transition: "opacity 0.15s",
      wordWrap: "break-word",
      overflowWrap: "anywhere",
      minWidth: "0",
    },
    ".cm-annotation-actions": {
      display: "flex",
      gap: "4px",
      flexShrink: "0",
      opacity: "0.3",
      transition: "opacity 0.15s",
    },
    ".cm-annotation-widget:hover .cm-annotation-actions": {
      opacity: "1",
    },
    ".cm-annotation-btn": {
      padding: "1px 4px",
      fontSize: "8px",
      color: "hsl(var(--muted-foreground))",
      cursor: "pointer",
      border: "none",
      background: "none",
      textTransform: "lowercase",
    },
    ".cm-annotation-btn:hover": {
      color: "hsl(var(--foreground))",
    },
    ".cm-annotation-btn-delete:hover": {
      color: "hsl(0 80% 50%)",
    },
    // Inline annotation editor
    ".cm-annotation-editor": {
      alignItems: "center",
    },
    ".cm-annotation-type-container": {
      display: "flex",
      alignItems: "center",
      gap: "2px",
      flexShrink: "0",
    },
    ".cm-annotation-type-select": {
      fontFamily: "system-ui, sans-serif",
      fontSize: "10px",
      fontWeight: "600",
      border: "none",
      background: "transparent",
      cursor: "pointer",
      padding: "0 2px",
    },
    ".cm-annotation-type-select:focus": {
      outline: "none",
    },
    ".cm-annotation-input": {
      flex: "1",
      fontFamily: "system-ui, sans-serif",
      fontStyle: "italic",
      fontSize: "11px",
      color: "hsl(var(--slate))",
      backgroundColor: "transparent",
      border: "none",
      borderBottom: "1px solid hsl(var(--parchment))",
      padding: "2px 4px",
      minWidth: "150px",
    },
    ".cm-annotation-input:focus": {
      outline: "none",
      borderBottomColor: "hsl(var(--burgundy) / 0.5)",
    },
    ".cm-annotation-input::placeholder": {
      color: "hsl(var(--muted-foreground))",
      fontStyle: "italic",
    },
    ".cm-annotation-btn-submit": {
      backgroundColor: "hsl(var(--burgundy))",
      color: "hsl(var(--ivory))",
      borderRadius: "2px",
      padding: "2px 6px",
    },
    ".cm-annotation-btn-submit:hover": {
      backgroundColor: "hsl(var(--burgundy) / 0.9)",
      color: "hsl(var(--ivory))",
    },
    ".cm-annotation-btn-submit:disabled": {
      opacity: "0.5",
      cursor: "not-allowed",
    },
    // Signed-as indicator in annotation editor
    ".cm-annotation-signed-as": {
      fontSize: "8px",
      color: "hsl(var(--muted-foreground))",
      marginLeft: "6px",
      fontStyle: "normal",
    },
    ".cm-annotation-unsigned": {
      fontSize: "7px",
      fontStyle: "italic",
      opacity: "0.5",
    },
    // Line click highlight in annotate mode
    ".cm-line-clickable": {
      cursor: "pointer",
    },
    ".cm-line-clickable:hover": {
      backgroundColor: "hsl(var(--cream) / 0.5)",
    },
    // Annotate gutter - clickable line numbers with + on hover
    ".cm-annotate-gutter": {
      cursor: "pointer",
    },
    ".cm-annotate-gutter .cm-gutterElement": {
      padding: "0 8px 0 16px",
      minWidth: "40px",
      textAlign: "right",
    },
    ".cm-annotate-gutter-marker": {
      display: "inline-block",
      position: "relative",
    },
    ".cm-annotate-gutter-number": {
      display: "inline",
    },
    ".cm-annotate-gutter-plus": {
      display: "none",
      fontWeight: "bold",
      color: "hsl(var(--burgundy))",
    },
    ".cm-annotate-gutter .cm-gutterElement:hover .cm-annotate-gutter-number": {
      display: "none",
    },
    ".cm-annotate-gutter .cm-gutterElement:hover .cm-annotate-gutter-plus": {
      display: "inline",
    },
    ".cm-annotate-gutter .cm-gutterElement:hover": {
      backgroundColor: "hsl(var(--burgundy) / 0.15)",
    },
    // Dimmed lines for highlight annotations mode - strong dimming to focus on annotations
    ".cm-line-dimmed": {
      opacity: "0.12",
      transition: "opacity 0.15s",
    },
    ".cm-line-dimmed:hover": {
      opacity: "0.4",
    },
    // Remote annotation arrival animation - yellow flash
    ".cm-annotation-remote-new": {
      animation: "remote-annotation-flash 1.5s ease-out",
    },
    ".cm-annotation-remote-new .cm-annotation-bar": {
      animation: "remote-annotation-bar-flash 1.5s ease-out",
    },
    "@keyframes remote-annotation-flash": {
      "0%": {
        backgroundColor: "hsl(48 100% 70% / 0.4)",
        transform: "translateX(-4px)",
      },
      "15%": {
        transform: "translateX(0)",
      },
      "100%": {
        backgroundColor: "transparent",
      },
    },
    "@keyframes remote-annotation-bar-flash": {
      "0%": {
        boxShadow: "0 0 12px 4px hsl(48 100% 55% / 0.6)",
      },
      "100%": {
        boxShadow: "none",
      },
    },
  },
  { dark: false }
);

// Dark theme variant
const ccsDarkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "hsl(var(--card))",
      color: "hsl(var(--foreground))",
      height: "100%",
    },
    ".cm-scroller": {
      overflow: "auto",
    },
    ".cm-content": {
      fontFamily: "var(--code-font-family, ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace)",
      caretColor: "hsl(var(--burgundy))",
      padding: "4px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "hsl(var(--burgundy))",
      borderLeftWidth: "2px",
    },
    ".cm-gutters": {
      backgroundColor: "hsl(var(--cream) / 0.3)",
      color: "hsl(var(--muted-foreground))",
      borderRight: "1px solid hsl(var(--parchment) / 0.5)",
      paddingRight: "8px",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 8px 0 16px",
      minWidth: "40px",
      textAlign: "right",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "hsl(var(--burgundy) / 0.15)",
    },
    ".cm-activeLine": {
      backgroundColor: "hsl(var(--cream) / 0.3)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "hsl(var(--burgundy) / 0.25)",
    },
    ".cm-selectionMatch": {
      backgroundColor: "hsl(var(--gold) / 0.25)",
    },
    ".cm-searchMatch": {
      backgroundColor: "hsl(var(--gold) / 0.3)",
      outline: "1px solid hsl(var(--gold) / 0.5)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "hsl(var(--gold) / 0.5)",
    },
    // Annotation widget styling for dark mode - improved visibility
    ".cm-annotation-widget": {
      borderRight: "2px solid", // Color set inline by widget (matches line highlight)
      backgroundColor: "transparent",
      padding: "2px 12px 2px var(--annotation-indent, 56px)", // Extra left indent (offset from code)
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: "var(--annotation-font-size, 11px)",
      width: "100%", // Ensure full width for uniform bar sizing
    },
    // Annotation bar - contains badge and content, colored background
    ".cm-annotation-bar": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      flex: "1",
      minWidth: "0", // Allow shrinking for long content
      padding: "3px 10px 3px 6px",
      borderRadius: "4px",
      transition: "background-color 0.15s, opacity 0.15s",
      opacity: "var(--annotation-opacity, 0.6)", // Use CSS variable from widget
    },
    ".cm-annotation-widget:hover .cm-annotation-bar": {
      opacity: "1 !important", // Override variable on hover
    },
    ".cm-annotation-widget:hover .cm-annotation-replies": {
      opacity: "1 !important", // Brighten replies on hover too
    },
    ".cm-annotation-type-badge": {
      fontFamily: "system-ui, sans-serif",
      fontSize: "9px",
      fontWeight: "600",
      padding: "1px 6px",
      borderRadius: "9px",
      whiteSpace: "nowrap",
      textTransform: "uppercase",
      letterSpacing: "0.3px",
      flexShrink: "0",
      transition: "opacity 0.15s, transform 0.15s",
    },
    ".cm-annotation-prefix": {
      fontFamily: "system-ui, sans-serif",
      fontSize: "10px",
      fontWeight: "600",
      whiteSpace: "nowrap",
      display: "none", // Hidden, replaced by badge
    },
    ".cm-annotation-content": {
      flex: "1",
      fontFamily: "var(--code-font-family, ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace)",
      fontStyle: "italic",
      color: "hsl(var(--slate))",
      transition: "opacity 0.15s",
      wordWrap: "break-word",
      overflowWrap: "anywhere",
      minWidth: "0",
    },
    ".cm-annotation-actions": {
      display: "flex",
      gap: "4px",
      flexShrink: "0",
      opacity: "0.3",
      transition: "opacity 0.15s",
    },
    ".cm-annotation-widget:hover .cm-annotation-actions": {
      opacity: "1",
    },
    ".cm-annotation-btn": {
      padding: "1px 4px",
      fontSize: "8px",
      color: "hsl(var(--muted-foreground))",
      cursor: "pointer",
      border: "none",
      background: "none",
      textTransform: "lowercase",
    },
    ".cm-annotation-btn:hover": {
      color: "hsl(var(--foreground))",
    },
    ".cm-annotation-btn-delete:hover": {
      color: "hsl(0 60% 60%)",
    },
    // Inline annotation editor
    ".cm-annotation-editor": {
      alignItems: "center",
    },
    ".cm-annotation-type-container": {
      display: "flex",
      alignItems: "center",
      gap: "2px",
      flexShrink: "0",
    },
    ".cm-annotation-type-select": {
      fontFamily: "system-ui, sans-serif",
      fontSize: "10px",
      fontWeight: "600",
      border: "none",
      background: "transparent",
      cursor: "pointer",
      padding: "0 2px",
    },
    ".cm-annotation-type-select:focus": {
      outline: "none",
    },
    ".cm-annotation-input": {
      flex: "1",
      fontFamily: "system-ui, sans-serif",
      fontStyle: "italic",
      fontSize: "11px",
      color: "hsl(var(--slate))",
      backgroundColor: "transparent",
      border: "none",
      borderBottom: "1px solid hsl(var(--parchment) / 0.3)",
      padding: "2px 4px",
      minWidth: "150px",
    },
    ".cm-annotation-input:focus": {
      outline: "none",
      borderBottomColor: "hsl(var(--burgundy) / 0.5)",
    },
    ".cm-annotation-input::placeholder": {
      color: "hsl(var(--muted-foreground))",
      fontStyle: "italic",
    },
    ".cm-annotation-btn-submit": {
      backgroundColor: "hsl(var(--burgundy))",
      color: "hsl(var(--ivory))",
      borderRadius: "2px",
      padding: "2px 6px",
    },
    ".cm-annotation-btn-submit:hover": {
      backgroundColor: "hsl(var(--burgundy) / 0.9)",
      color: "hsl(var(--ivory))",
    },
    ".cm-annotation-btn-submit:disabled": {
      opacity: "0.5",
      cursor: "not-allowed",
    },
    // Signed-as indicator in annotation editor
    ".cm-annotation-signed-as": {
      fontSize: "8px",
      color: "hsl(var(--muted-foreground))",
      marginLeft: "6px",
      fontStyle: "normal",
    },
    ".cm-annotation-unsigned": {
      fontSize: "7px",
      fontStyle: "italic",
      opacity: "0.5",
    },
    // Line click highlight in annotate mode
    ".cm-line-clickable": {
      cursor: "pointer",
    },
    ".cm-line-clickable:hover": {
      backgroundColor: "hsl(var(--cream) / 0.3)",
    },
    // Annotate gutter - clickable line numbers with + on hover
    ".cm-annotate-gutter": {
      cursor: "pointer",
    },
    ".cm-annotate-gutter .cm-gutterElement": {
      padding: "0 8px 0 16px",
      minWidth: "40px",
      textAlign: "right",
    },
    ".cm-annotate-gutter-marker": {
      display: "inline-block",
      position: "relative",
    },
    ".cm-annotate-gutter-number": {
      display: "inline",
    },
    ".cm-annotate-gutter-plus": {
      display: "none",
      fontWeight: "bold",
      color: "hsl(var(--burgundy))",
    },
    ".cm-annotate-gutter .cm-gutterElement:hover .cm-annotate-gutter-number": {
      display: "none",
    },
    ".cm-annotate-gutter .cm-gutterElement:hover .cm-annotate-gutter-plus": {
      display: "inline",
    },
    ".cm-annotate-gutter .cm-gutterElement:hover": {
      backgroundColor: "hsl(var(--burgundy) / 0.2)",
    },
    // Dimmed lines for highlight annotations mode - strong dimming to focus on annotations
    ".cm-line-dimmed": {
      opacity: "0.10",
      transition: "opacity 0.15s",
    },
    ".cm-line-dimmed:hover": {
      opacity: "0.35",
    },
    // Remote annotation arrival animation - yellow flash (dark mode)
    ".cm-annotation-remote-new": {
      animation: "remote-annotation-flash-dark 1.5s ease-out",
    },
    ".cm-annotation-remote-new .cm-annotation-bar": {
      animation: "remote-annotation-bar-flash-dark 1.5s ease-out",
    },
    "@keyframes remote-annotation-flash-dark": {
      "0%": {
        backgroundColor: "hsl(48 100% 50% / 0.3)",
        transform: "translateX(-4px)",
      },
      "15%": {
        transform: "translateX(0)",
      },
      "100%": {
        backgroundColor: "transparent",
      },
    },
    "@keyframes remote-annotation-bar-flash-dark": {
      "0%": {
        boxShadow: "0 0 12px 4px hsl(48 100% 45% / 0.5)",
      },
      "100%": {
        boxShadow: "none",
      },
    },
  },
  { dark: true }
);

// Syntax highlighting style - works for both light and dark
// Uses CSS variables which change based on theme
const ccsHighlightStyleLight = HighlightStyle.define([
  // Keywords in brown/orange for AGC assembly style
  { tag: t.keyword, color: "hsl(20 75% 40%)" },
  { tag: t.controlKeyword, color: "hsl(20 75% 40%)", fontWeight: "500" },
  { tag: t.moduleKeyword, color: "hsl(20 75% 40%)" },
  { tag: t.operatorKeyword, color: "hsl(20 75% 40%)" },

  // Comments in vibrant purple/magenta, italic
  { tag: t.comment, color: "hsl(280 60% 50%)", fontStyle: "italic" },
  { tag: t.lineComment, color: "hsl(280 60% 50%)", fontStyle: "italic" },
  { tag: t.blockComment, color: "hsl(280 60% 50%)", fontStyle: "italic" },
  { tag: t.docComment, color: "hsl(280 60% 50%)", fontStyle: "italic" },

  // Strings in forest green
  { tag: t.string, color: "hsl(150 40% 35%)" },
  { tag: t.special(t.string), color: "hsl(150 40% 35%)" },
  { tag: t.regexp, color: "hsl(150 50% 40%)" },

  // Numbers in plum
  { tag: t.number, color: "hsl(280 35% 45%)" },
  { tag: t.integer, color: "hsl(280 35% 45%)" },
  { tag: t.float, color: "hsl(280 35% 45%)" },

  // Functions in navy
  { tag: t.function(t.variableName), color: "hsl(220 50% 45%)" },
  { tag: t.function(t.propertyName), color: "hsl(220 50% 45%)" },

  // Types in rust orange
  { tag: t.typeName, color: "hsl(20 60% 45%)" },
  { tag: t.className, color: "hsl(20 60% 45%)" },
  { tag: t.namespace, color: "hsl(20 50% 50%)" },

  // Variables and properties - vibrant blue for labels/symbols
  { tag: t.variableName, color: "hsl(210 80% 45%)" },
  { tag: t.propertyName, color: "hsl(210 70% 45%)" },
  { tag: t.definition(t.variableName), color: "hsl(210 80% 40%)" },

  // Operators and punctuation
  { tag: t.operator, color: "hsl(352 30% 40%)" },
  { tag: t.punctuation, color: "hsl(0 0% 35%)" },
  { tag: t.bracket, color: "hsl(0 0% 35%)" },

  // Constants and booleans
  { tag: t.bool, color: "hsl(280 35% 45%)" },
  { tag: t.null, color: "hsl(280 35% 45%)" },
  { tag: t.atom, color: "hsl(280 35% 45%)" },

  // Tags (HTML/XML)
  { tag: t.tagName, color: "hsl(352 47% 40%)" },
  { tag: t.attributeName, color: "hsl(220 40% 45%)" },
  { tag: t.attributeValue, color: "hsl(150 40% 35%)" },

  // Headings (Markdown)
  { tag: t.heading, color: "hsl(352 47% 33%)", fontWeight: "bold" },
  { tag: t.heading1, color: "hsl(352 47% 33%)", fontWeight: "bold", fontSize: "1.2em" },
  { tag: t.heading2, color: "hsl(352 47% 33%)", fontWeight: "bold", fontSize: "1.1em" },

  // Links
  { tag: t.link, color: "hsl(220 50% 45%)", textDecoration: "underline" },
  { tag: t.url, color: "hsl(220 50% 45%)" },

  // Invalid/error
  { tag: t.invalid, color: "hsl(0 80% 50%)" },

  // Meta tokens (sequence numbers, column markers) - very subtle grey
  { tag: t.meta, color: "hsl(0 0% 78%)" },

  // Labels - slightly emphasized
  { tag: t.labelName, color: "hsl(220 40% 40%)", fontWeight: "500" },
]);

// Dark mode highlight style
const ccsHighlightStyleDark = HighlightStyle.define([
  // Keywords in brown/orange for AGC assembly style
  { tag: t.keyword, color: "hsl(20 75% 55%)" },
  { tag: t.controlKeyword, color: "hsl(20 75% 55%)", fontWeight: "500" },
  { tag: t.moduleKeyword, color: "hsl(20 75% 55%)" },
  { tag: t.operatorKeyword, color: "hsl(20 75% 55%)" },

  // Comments in vibrant purple/magenta, italic
  { tag: t.comment, color: "hsl(280 65% 65%)", fontStyle: "italic" },
  { tag: t.lineComment, color: "hsl(280 65% 65%)", fontStyle: "italic" },
  { tag: t.blockComment, color: "hsl(280 65% 65%)", fontStyle: "italic" },
  { tag: t.docComment, color: "hsl(280 65% 65%)", fontStyle: "italic" },

  // Strings in lighter forest green
  { tag: t.string, color: "hsl(150 45% 55%)" },
  { tag: t.special(t.string), color: "hsl(150 45% 55%)" },
  { tag: t.regexp, color: "hsl(150 50% 60%)" },

  // Numbers in lighter plum
  { tag: t.number, color: "hsl(280 45% 65%)" },
  { tag: t.integer, color: "hsl(280 45% 65%)" },
  { tag: t.float, color: "hsl(280 45% 65%)" },

  // Functions in lighter navy
  { tag: t.function(t.variableName), color: "hsl(210 60% 65%)" },
  { tag: t.function(t.propertyName), color: "hsl(210 60% 65%)" },

  // Types in lighter rust orange
  { tag: t.typeName, color: "hsl(20 65% 60%)" },
  { tag: t.className, color: "hsl(20 65% 60%)" },
  { tag: t.namespace, color: "hsl(20 55% 65%)" },

  // Variables and properties - vibrant blue for labels/symbols
  { tag: t.variableName, color: "hsl(210 80% 65%)" },
  { tag: t.propertyName, color: "hsl(210 70% 65%)" },
  { tag: t.definition(t.variableName), color: "hsl(210 80% 70%)" },

  // Operators and punctuation
  { tag: t.operator, color: "hsl(352 40% 65%)" },
  { tag: t.punctuation, color: "hsl(40 10% 65%)" },
  { tag: t.bracket, color: "hsl(40 10% 65%)" },

  // Constants and booleans
  { tag: t.bool, color: "hsl(280 45% 65%)" },
  { tag: t.null, color: "hsl(280 45% 65%)" },
  { tag: t.atom, color: "hsl(280 45% 65%)" },

  // Tags (HTML/XML)
  { tag: t.tagName, color: "hsl(352 55% 65%)" },
  { tag: t.attributeName, color: "hsl(210 50% 70%)" },
  { tag: t.attributeValue, color: "hsl(150 45% 55%)" },

  // Headings (Markdown)
  { tag: t.heading, color: "hsl(352 55% 65%)", fontWeight: "bold" },
  { tag: t.heading1, color: "hsl(352 55% 65%)", fontWeight: "bold", fontSize: "1.2em" },
  { tag: t.heading2, color: "hsl(352 55% 65%)", fontWeight: "bold", fontSize: "1.1em" },

  // Links
  { tag: t.link, color: "hsl(210 60% 65%)", textDecoration: "underline" },
  { tag: t.url, color: "hsl(210 60% 65%)" },

  // Invalid/error
  { tag: t.invalid, color: "hsl(0 70% 60%)" },

  // Meta tokens (sequence numbers, column markers) - very subtle grey
  { tag: t.meta, color: "hsl(0 0% 38%)" },

  // Labels - slightly emphasized
  { tag: t.labelName, color: "hsl(210 50% 65%)", fontWeight: "500" },
]);

/**
 * Get the CCS theme extension for CodeMirror
 * @param isDark - Whether to use dark mode theme
 * @returns CodeMirror extension array
 */
export function getCCSTheme(isDark: boolean): Extension {
  const baseTheme = isDark ? ccsDarkTheme : ccsLightTheme;
  return [
    baseTheme,
    syntaxHighlighting(isDark ? ccsHighlightStyleDark : ccsHighlightStyleLight),
  ];
}

/**
 * Get font size theme extension
 * @param fontSize - Font size in pixels
 * @returns CodeMirror extension for font size
 */
export function getFontSizeTheme(fontSize: number): Extension {
  return EditorView.theme({
    "&": {
      fontSize: `${fontSize}px`,
    },
    ".cm-gutters": {
      fontSize: `${fontSize}px`,
    },
    ".cm-content": {
      lineHeight: "1.6",
    },
  });
}

/**
 * Get font family theme extension
 * @param fontFamily - Font family string (e.g., "'Fira Code', monospace")
 * @returns CodeMirror extension for font family
 */
export function getFontFamilyTheme(fontFamily: string): Extension {
  return EditorView.theme({
    ".cm-content": {
      fontFamily: fontFamily,
    },
    ".cm-gutters": {
      fontFamily: fontFamily,
    },
  });
}
