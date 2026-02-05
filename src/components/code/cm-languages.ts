/**
 * Language detection and loading for CodeMirror
 * Maps file extensions and language names to CodeMirror language packages
 */

import { type LanguageSupport, StreamLanguage } from "@codemirror/language";

// Language-specific colors for visual identification
// Colors chosen for good contrast and recognition
export const LANGUAGE_COLORS: Record<string, { light: string; dark: string }> = {
  javascript: { light: "#f7df1e", dark: "#f7df1e" }, // JavaScript yellow
  typescript: { light: "#3178c6", dark: "#5a9bd5" }, // TypeScript blue
  jsx: { light: "#61dafb", dark: "#61dafb" }, // React cyan
  tsx: { light: "#3178c6", dark: "#5a9bd5" }, // TypeScript blue
  python: { light: "#3776ab", dark: "#5a9fd4" }, // Python blue
  java: { light: "#b07219", dark: "#e8a838" }, // Java orange
  c: { light: "#555555", dark: "#888888" }, // C grey
  cpp: { light: "#f34b7d", dark: "#f77a9f" }, // C++ pink
  rust: { light: "#dea584", dark: "#dea584" }, // Rust copper
  go: { light: "#00add8", dark: "#00d4ff" }, // Go cyan
  html: { light: "#e34c26", dark: "#f06529" }, // HTML orange
  css: { light: "#1572b6", dark: "#33a9dc" }, // CSS blue
  json: { light: "#292929", dark: "#a0a0a0" }, // JSON grey
  xml: { light: "#e44d26", dark: "#f16529" }, // XML orange
  sql: { light: "#e38c00", dark: "#ffb347" }, // SQL amber
  markdown: { light: "#083fa1", dark: "#4a90d9" }, // Markdown blue
  perl: { light: "#39457e", dark: "#7b8bc4" }, // Perl blue (camel book blue)
  plain: { light: "#6b7280", dark: "#9ca3af" }, // Plain text grey
  // Historical languages (punch card era)
  mad: { light: "#6a1b9a", dark: "#9c4dcc" }, // MAD purple (Michigan colors)
  fortran: { light: "#4d148c", dark: "#7b1fa2" }, // FORTRAN deep purple
  cobol: { light: "#0d47a1", dark: "#1976d2" }, // COBOL blue
  basic: { light: "#0066cc", dark: "#4da6ff" }, // BASIC Dartmouth blue
  agc: { light: "#c45100", dark: "#ff8c1a" }, // AGC bright orange (Apollo spacesuit orange)
  assembly: { light: "#696969", dark: "#a9a9a9" }, // Assembly grey
  iplv: { light: "#d32f2f", dark: "#ef5350" }, // IPL-V red (RAND Corporation colors)
};

/**
 * Get the color for a language
 * @param language - The language name or file extension
 * @param isDark - Whether dark mode is active
 * @returns The color hex string
 */
export function getLanguageColor(language: string, isDark: boolean): string {
  const normalised = normaliseLanguage(language);
  const colors = LANGUAGE_COLORS[normalised] || LANGUAGE_COLORS.plain;
  return isDark ? colors.dark : colors.light;
}

// Lazy-loaded language imports
// Using dynamic imports to reduce initial bundle size
type LanguageLoader = () => Promise<LanguageSupport>;

const languageLoaders: Record<string, LanguageLoader> = {
  // JavaScript/TypeScript family
  javascript: () =>
    import("@codemirror/lang-javascript").then((m) => m.javascript()),
  typescript: () =>
    import("@codemirror/lang-javascript").then((m) =>
      m.javascript({ typescript: true })
    ),
  jsx: () =>
    import("@codemirror/lang-javascript").then((m) =>
      m.javascript({ jsx: true })
    ),
  tsx: () =>
    import("@codemirror/lang-javascript").then((m) =>
      m.javascript({ jsx: true, typescript: true })
    ),

  // Python
  python: () => import("@codemirror/lang-python").then((m) => m.python()),

  // Java
  java: () => import("@codemirror/lang-java").then((m) => m.java()),

  // C/C++
  c: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  cpp: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  "c++": () => import("@codemirror/lang-cpp").then((m) => m.cpp()),

  // Rust
  rust: () => import("@codemirror/lang-rust").then((m) => m.rust()),

  // Go
  go: () => import("@codemirror/lang-go").then((m) => m.go()),

  // Web languages
  html: () => import("@codemirror/lang-html").then((m) => m.html()),
  css: () => import("@codemirror/lang-css").then((m) => m.css()),

  // Data formats
  json: () => import("@codemirror/lang-json").then((m) => m.json()),
  xml: () => import("@codemirror/lang-xml").then((m) => m.xml()),

  // SQL
  sql: () => import("@codemirror/lang-sql").then((m) => m.sql()),

  // Markdown
  markdown: () =>
    import("@codemirror/lang-markdown").then((m) => m.markdown()),

  // Historical languages (punch card era)
  mad: () => import("./cm-lang-mad").then((m) => m.mad()),
  basic: () => import("./cm-lang-basic").then((m) => m.basic()),
  agc: () => import("./cm-lang-agc").then((m) => m.agc()),
  fortran: () => import("./cm-lang-fortran").then((m) => m.fortran()),
  iplv: () => import("./cm-lang-iplv").then((m) => m.iplv()),

  // Perl (via legacy modes)
  perl: () =>
    import("@codemirror/legacy-modes/mode/perl").then(
      (m) => StreamLanguage.define(m.perl) as unknown as LanguageSupport
    ),

  // Assembly - use C syntax as approximation for comments, numbers, strings
  assembly: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
};

// File extension to language name mapping
const extensionToLanguage: Record<string, string> = {
  // JavaScript/TypeScript
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",

  // Python
  py: "python",
  pyw: "python",
  pyx: "python",

  // Java
  java: "java",

  // C/C++
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  hxx: "cpp",

  // Rust
  rs: "rust",

  // Go
  go: "go",

  // Web
  html: "html",
  htm: "html",
  xhtml: "html",
  css: "css",
  scss: "css",
  sass: "css",
  less: "css",

  // Data
  json: "json",
  jsonc: "json",
  xml: "xml",
  svg: "xml",
  xsl: "xml",
  xslt: "xml",

  // SQL
  sql: "sql",

  // Markdown
  md: "markdown",
  markdown: "markdown",

  // YAML (no native support, use plain text)
  yaml: "plain",
  yml: "plain",

  // Perl
  pl: "perl",
  pm: "perl",
  t: "perl",

  // Shell (no native support, use plain text)
  sh: "plain",
  bash: "plain",
  zsh: "plain",
  ps1: "plain",

  // Historical languages (punch card era)
  // FORTRAN variants
  for: "fortran",
  f: "fortran",
  f77: "fortran",
  f90: "fortran",
  f95: "fortran",
  ftn: "fortran",
  // COBOL
  cob: "cobol",
  cbl: "cobol",
  // BASIC - has syntax highlighting
  bas: "basic",
  // Assembly
  asm: "assembly",
  s: "assembly",
  // AGC (Apollo Guidance Computer)
  agc: "agc",
  aea: "agc",
  // MAD (Michigan Algorithm Decoder) - has syntax highlighting
  mad: "mad",
  // IPL-V (Information Processing Language V)
  iplv: "iplv",
  // SLIP (Symmetric List Processor)
  slip: "plain",
  // PL/I
  pli: "plain",
  pl1: "plain",
  // ALGOL
  alg: "plain",
  // LISP
  lsp: "plain",
  lisp: "plain",
  // SNOBOL
  sno: "plain",
  // APL
  apl: "plain",

  // Other
  txt: "plain",
};

// Language name normalisation (handles various input formats)
const languageAliases: Record<string, string> = {
  // JavaScript variants
  js: "javascript",
  ecmascript: "javascript",
  node: "javascript",

  // TypeScript variants
  ts: "typescript",

  // Python variants
  py: "python",
  python3: "python",

  // C++ variants
  "c++": "cpp",
  cxx: "cpp",

  // C# (no native support)
  "c#": "plain",
  csharp: "plain",

  // Go variants
  golang: "go",

  // Rust variants
  rs: "rust",

  // HTML variants
  htm: "html",
  xhtml: "html",

  // Markdown variants
  md: "markdown",

  // BASIC (historical, has syntax highlighting)
  basic: "basic",
  bas: "basic",

  // LISP family (no native support)
  lisp: "plain",
  scheme: "plain",
  clojure: "plain",

  // Other historical languages (punch card era)
  fortran: "fortran",
  cobol: "cobol",
  pascal: "plain",
  assembly: "assembly",
  asm: "assembly",
  agc: "agc", // Apollo Guidance Computer assembly - has syntax highlighting
  aea: "agc", // AGC assembly source files
  mad: "mad", // Michigan Algorithm Decoder - has syntax highlighting
  iplv: "iplv", // Information Processing Language V - has syntax highlighting
  slip: "plain", // Symmetric List Processor
  pli: "plain", // PL/I
  algol: "plain",
  snobol: "plain",
  apl: "plain",

  // Pseudocode
  pseudocode: "plain",
  pseudo: "plain",

  // Other modern languages without native support
  ruby: "plain",
  rb: "plain",
  php: "plain",
  swift: "plain",
  kotlin: "plain",
  kt: "plain",
  scala: "plain",
  perl: "perl",
  pl: "perl",
  r: "plain",
  haskell: "plain",
  hs: "plain",
  erlang: "plain",
  elixir: "plain",
  lua: "plain",
  matlab: "plain",
  julia: "plain",
  dart: "plain",
  groovy: "plain",
};

/**
 * Get language name from a file extension
 * @param filename - The filename or extension (e.g., "test.py" or "py")
 * @returns The normalised language name
 */
export function getLanguageFromExtension(filename: string): string {
  const ext = filename.includes(".")
    ? filename.split(".").pop()?.toLowerCase() || ""
    : filename.toLowerCase();

  return extensionToLanguage[ext] || "plain";
}

/**
 * Normalise a language name to its canonical form
 * @param language - The language name (e.g., "Python", "py", "python3")
 * @returns The normalised language name
 */
export function normaliseLanguage(language: string): string {
  const lower = language.toLowerCase().trim();

  // Check aliases first
  if (languageAliases[lower]) {
    return languageAliases[lower];
  }

  // Check if it's a known language
  if (languageLoaders[lower]) {
    return lower;
  }

  // Check extensions
  if (extensionToLanguage[lower]) {
    return extensionToLanguage[lower];
  }

  return "plain";
}

/**
 * Load a CodeMirror language support extension
 * @param language - The language name
 * @returns Promise resolving to LanguageSupport or null if not available
 */
export async function loadLanguage(
  language: string
): Promise<LanguageSupport | null> {
  const normalised = normaliseLanguage(language);

  if (normalised === "plain") {
    return null;
  }

  const loader = languageLoaders[normalised];
  if (!loader) {
    return null;
  }

  try {
    return await loader();
  } catch (error) {
    console.warn(`Failed to load language support for ${language}:`, error);
    return null;
  }
}

/**
 * Check if a language has syntax highlighting support
 * @param language - The language name
 * @returns Whether syntax highlighting is available
 */
export function hasLanguageSupport(language: string): boolean {
  const normalised = normaliseLanguage(language);
  return normalised !== "plain" && normalised in languageLoaders;
}

/**
 * Get all supported languages
 * @returns Array of supported language names
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(languageLoaders);
}
