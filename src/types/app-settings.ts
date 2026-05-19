// App-wide settings types

export type AppMode = "critique" | "interpret" | "create";

// Theme options
export type ThemeMode = "light" | "dark" | "system";

// Predefined accent colour palettes with complementary background tints
export const ACCENT_COLOURS = [
  {
    id: "burgundy",
    name: "Burgundy",
    hsl: { light: "352 47% 33%", dark: "352 55% 55%" },
    // Warm cream/ivory backgrounds
    bg: { light: "40 33% 97%", dark: "220 15% 12%" },
    cream: { light: "40 24% 94%", dark: "220 12% 16%" },
    parchment: { light: "40 24% 89%", dark: "220 10% 20%" },
  },
  {
    id: "forest",
    name: "Forest",
    hsl: { light: "150 40% 30%", dark: "150 45% 50%" },
    // Cool sage/mint tinted backgrounds
    bg: { light: "140 20% 97%", dark: "160 15% 11%" },
    cream: { light: "140 15% 94%", dark: "160 12% 15%" },
    parchment: { light: "140 12% 89%", dark: "160 10% 19%" },
  },
  {
    id: "navy",
    name: "Navy",
    hsl: { light: "220 50% 35%", dark: "220 55% 55%" },
    // Cool blue-grey backgrounds
    bg: { light: "220 20% 97%", dark: "225 20% 11%" },
    cream: { light: "220 15% 94%", dark: "225 15% 15%" },
    parchment: { light: "220 12% 89%", dark: "225 12% 19%" },
  },
  {
    id: "plum",
    name: "Plum",
    hsl: { light: "280 35% 40%", dark: "280 40% 55%" },
    // Subtle lavender tinted backgrounds
    bg: { light: "270 20% 97%", dark: "280 15% 11%" },
    cream: { light: "270 15% 94%", dark: "280 12% 15%" },
    parchment: { light: "270 12% 89%", dark: "280 10% 19%" },
  },
  {
    id: "rust",
    name: "Rust",
    hsl: { light: "20 60% 40%", dark: "20 55% 55%" },
    // Warm terracotta/sand backgrounds
    bg: { light: "30 30% 97%", dark: "20 15% 11%" },
    cream: { light: "30 25% 94%", dark: "20 12% 15%" },
    parchment: { light: "30 20% 89%", dark: "20 10% 19%" },
  },
  {
    id: "slate",
    name: "Slate",
    hsl: { light: "210 15% 40%", dark: "210 20% 55%" },
    // Neutral grey backgrounds
    bg: { light: "210 10% 97%", dark: "210 15% 11%" },
    cream: { light: "210 8% 94%", dark: "210 12% 15%" },
    parchment: { light: "210 6% 89%", dark: "210 10% 19%" },
  },
] as const;

export type AccentColourId = typeof ACCENT_COLOURS[number]["id"];

// Supported programming languages (top 10 most popular + Historical + Other)
export const PROGRAMMING_LANGUAGES = [
  { id: "", name: "Not specified", description: "Auto-detect or unspecified" },
  { id: "python", name: "Python", description: "Python" },
  { id: "javascript", name: "JavaScript", description: "JavaScript" },
  { id: "java", name: "Java", description: "Java" },
  { id: "c", name: "C", description: "C" },
  { id: "cpp", name: "C++", description: "C++" },
  { id: "csharp", name: "C#", description: "C#" },
  { id: "go", name: "Go", description: "Go" },
  { id: "rust", name: "Rust", description: "Rust" },
  { id: "ruby", name: "Ruby", description: "Ruby" },
  { id: "perl", name: "Perl", description: "Perl" },
  // Historical languages (punch card era and early microcomputers)
  { id: "basic", name: "BASIC", description: "Beginner's All-purpose Symbolic Instruction Code (1964+)" },
  { id: "mad", name: "MAD", description: "Michigan Algorithm Decoder (1960s)" },
  { id: "fortran", name: "FORTRAN", description: "Formula Translation (1957+)" },
  { id: "cobol", name: "COBOL", description: "Common Business-Oriented Language (1959+)" },
  { id: "other", name: "Other", description: "Specify in session" },
] as const;

export type ProgrammingLanguageId = typeof PROGRAMMING_LANGUAGES[number]["id"];

// Monospace font options for code display in annotations
export const CODE_FONT_OPTIONS = [
  { id: "default", name: "System Default", family: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
  { id: "firacode", name: "Fira Code", family: "'Fira Code', ui-monospace, monospace" },
  { id: "jetbrains", name: "JetBrains Mono", family: "'JetBrains Mono', ui-monospace, monospace" },
  { id: "source-code", name: "Source Code Pro", family: "'Source Code Pro', ui-monospace, monospace" },
  { id: "ibm-plex", name: "IBM Plex Mono", family: "'IBM Plex Mono', ui-monospace, monospace" },
  { id: "cascadia", name: "Cascadia Code", family: "'Cascadia Code', ui-monospace, monospace" },
  { id: "roboto", name: "Roboto Mono", family: "'Roboto Mono', ui-monospace, monospace" },
  { id: "inconsolata", name: "Inconsolata", family: "'Inconsolata', ui-monospace, monospace" },
] as const;

export type CodeFontId = typeof CODE_FONT_OPTIONS[number]["id"];

export interface FontSizeSettings {
  codeFontSize: number;
  chatFontSize: number;
}

export interface ModeOverrides {
  critique?: Partial<FontSizeSettings>;
  interpret?: Partial<FontSizeSettings>;
  create?: Partial<FontSizeSettings>;
}

export interface AppSettings {
  // Global font size defaults
  codeFontSize: number;
  chatFontSize: number;

  // UI font size for modals, settings panels, etc.
  uiFontSize: number;

  // Annotation display settings
  annotationFontSize: number; // Font size for annotation content (9-16px)
  annotationIndent: number;   // Left indent for annotations (0-160px)

  // Code files pane font size
  filesPaneFontSize: number;  // Font size for files sidebar (8-14px)

  // Code font for annotations and code display
  codeFont: CodeFontId;

  // Default programming language preference
  defaultLanguage: ProgrammingLanguageId;

  // Theme setting
  theme: ThemeMode;

  // Accent colour
  accentColour: AccentColourId;

  // Cloud collaboration master switch. When false, all Supabase-backed
  // UI (sign-in, cloud projects, members, library, sync banners,
  // connection status) is hidden and no Supabase requests are made,
  // even when the Supabase env vars are configured. Lets a user run
  // CCS-WB as a clean local-only tool.
  collaborationEnabled: boolean;

  // Per-mode overrides (undefined = use global)
  modeOverrides: ModeOverrides;
}

export interface AppSettingsStorage {
  version: string;
  settings: AppSettings;
  lastUpdated: string;
}

// User profile for identification and export attribution
export interface UserProfile {
  name: string;
  initials: string;  // Short identifier displayed in chat and stored with annotations
  affiliation: string;
  bio: string;
  anonymousMode: boolean; // If true, exclude profile from exports
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  name: "",
  initials: "",
  affiliation: "",
  bio: "",
  anonymousMode: false,
};

// Default settings
export const DEFAULT_APP_SETTINGS: AppSettings = {
  codeFontSize: 13,
  chatFontSize: 14,
  uiFontSize: 11,
  annotationFontSize: 9,
  annotationIndent: 56,
  filesPaneFontSize: 10,
  codeFont: "default",
  defaultLanguage: "",
  theme: "light",
  accentColour: "burgundy",
  collaborationEnabled: true,
  modeOverrides: {},
};

// Font size constraints
export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 24;

// UI font size constraints (smaller range for UI elements)
export const UI_FONT_SIZE_MIN = 9;
export const UI_FONT_SIZE_MAX = 16;

// Annotation display constraints
export const ANNOTATION_FONT_SIZE_MIN = 9;
export const ANNOTATION_FONT_SIZE_MAX = 16;
export const ANNOTATION_INDENT_MIN = 0;
export const ANNOTATION_INDENT_MAX = 160;

// Files pane font size constraints
export const FILES_PANE_FONT_SIZE_MIN = 8;
export const FILES_PANE_FONT_SIZE_MAX = 14;

// Custom skin types
export type SkinMode = "both" | "light-only" | "dark-only";

export interface SkinConfig {
  name: string;
  author: string;
  version: string;
  description: string;
  mode: SkinMode;
  fonts?: {
    display?: string;
    body?: string;
    mono?: string;
  };
  colors?: {
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
  // Optional Clippy customization
  clippy?: {
    messages?: string[];           // Skin-specific messages to add to rotation
    avoidCreditBox?: boolean;      // If true, Clippy avoids the skin credit box area
  };
}

export interface SkinManifestEntry {
  id: string;      // folder name
  name: string;    // display name
}

export interface LoadedSkin extends SkinManifestEntry {
  config: SkinConfig;
  customCSS?: string;
}
