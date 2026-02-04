/**
 * Code Extraction and File Generation Utilities
 * Supports Create mode and reference search file creation
 */

import type { ReferenceResult } from "@/types";

export interface CodeBlock {
  language: string;
  code: string;
  startLine: number;
  endLine: number;
}

/**
 * Extract code blocks from markdown text
 * Parses ```language ... ``` fenced code blocks
 */
export function extractCodeBlocks(markdown: string): CodeBlock[] {
  const codeBlocks: CodeBlock[] = [];
  const lines = markdown.split('\n');

  let inCodeBlock = false;
  let currentBlock: { language: string; code: string[]; startLine: number } | null = null;

  lines.forEach((line, index) => {
    // More flexible regex: allow leading whitespace and any language name
    const fenceMatch = line.trim().match(/^```([a-zA-Z0-9+#-]*)?$/);

    if (fenceMatch && !inCodeBlock) {
      // Start of code block
      inCodeBlock = true;
      const language = fenceMatch[1] || 'plaintext';
      currentBlock = { language, code: [], startLine: index };
    } else if (line.trim().match(/^```$/) && inCodeBlock && currentBlock) {
      // End of code block
      inCodeBlock = false;
      codeBlocks.push({
        language: currentBlock.language,
        code: currentBlock.code.join('\n'),
        startLine: currentBlock.startLine,
        endLine: index
      });
      currentBlock = null;
    } else if (inCodeBlock && currentBlock) {
      // Inside code block
      currentBlock.code.push(line);
    }
  });

  return codeBlocks;
}

/**
 * Map programming language to file extension
 */
export function languageToExtension(language: string): string {
  const extensionMap: Record<string, string> = {
    // Common languages
    javascript: 'js',
    typescript: 'ts',
    python: 'py',
    java: 'java',
    cpp: 'cpp',
    'c++': 'cpp',
    c: 'c',
    csharp: 'cs',
    'c#': 'cs',
    go: 'go',
    rust: 'rs',
    ruby: 'rb',
    php: 'php',
    swift: 'swift',
    kotlin: 'kt',
    scala: 'scala',

    // Web languages
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',

    // Markup/config
    json: 'json',
    yaml: 'yaml',
    yml: 'yml',
    toml: 'toml',
    xml: 'xml',
    markdown: 'md',
    md: 'md',

    // Shell
    bash: 'sh',
    shell: 'sh',
    sh: 'sh',
    zsh: 'zsh',
    fish: 'fish',
    powershell: 'ps1',

    // Functional
    haskell: 'hs',
    ocaml: 'ml',
    fsharp: 'fs',
    'f#': 'fs',
    erlang: 'erl',
    elixir: 'ex',
    clojure: 'clj',
    scheme: 'scm',
    lisp: 'lisp',

    // Other
    sql: 'sql',
    r: 'r',
    matlab: 'm',
    lua: 'lua',
    perl: 'pl',
    vim: 'vim',
    latex: 'tex',

    // Default
    plaintext: 'txt',
    text: 'txt'
  };

  const normalized = language.toLowerCase().trim();
  return extensionMap[normalized] || 'txt';
}

/**
 * Generate filename for AI-generated code
 * Format: generated-[timestamp]-[index].[ext]
 */
export function generateFileName(
  language: string,
  index: number = 0,
  timestamp?: number
): string {
  const ts = timestamp || Date.now();
  const ext = languageToExtension(language);

  // If index is 0, don't include it in filename
  if (index === 0) {
    return `generated-${ts}.${ext}`;
  }

  return `generated-${ts}-${index}.${ext}`;
}

/**
 * Generate filename for reference material
 * Format: ref-[author-lastname]-[year].md
 */
export function generateReferenceFileName(reference: ReferenceResult): string {
  // Extract last name from first author
  const firstAuthor = reference.authors[0] || 'unknown';
  const lastName = firstAuthor.split(' ').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'unknown';

  const year = reference.year || 'n.d.';

  return `ref-${lastName}-${year}.md`;
}

/**
 * Format reference in Harvard style as markdown
 */
export function formatReferenceAsMarkdown(reference: ReferenceResult): string {
  const { title, authors, year, description, url, sourceType, repository, language } = reference;

  // Format authors (Harvard style: Surname, I.)
  const formattedAuthors = authors.length > 0
    ? authors.join(', ')
    : 'Unknown Author';

  // Harvard citation
  const citation = `${formattedAuthors} (${year || 'n.d.'}) *${title}*${url ? `. Available at: ${url}` : ''}.`;

  // Build markdown
  let markdown = `# ${title}\n\n`;

  // Citation
  markdown += `## Citation\n\n${citation}\n\n`;

  // Metadata
  markdown += `## Metadata\n\n`;
  markdown += `- **Authors**: ${formattedAuthors}\n`;
  markdown += `- **Year**: ${year || 'n.d.'}\n`;
  markdown += `- **Source Type**: ${sourceType}\n`;
  if (repository) {
    markdown += `- **Repository**: ${repository}\n`;
  }
  if (language) {
    markdown += `- **Language**: ${language}\n`;
  }
  if (url) {
    markdown += `- **URL**: ${url}\n`;
  }
  markdown += `\n`;

  // Description/Abstract
  if (description) {
    markdown += `## Abstract\n\n${description}\n\n`;
  }

  // Notes section (empty template for user)
  markdown += `## Notes\n\n`;
  markdown += `*Add your notes and analysis here...*\n\n`;

  // Related Work section (empty template)
  markdown += `## Related Work\n\n`;
  markdown += `*Links to related references...*\n`;

  return markdown;
}

/**
 * Increment filename version suffix
 * Examples:
 *   script.py → script-v2.py
 *   script-v2.py → script-v3.py
 */
export function incrementFileVersion(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');
  const extension = lastDotIndex > 0 ? fileName.slice(lastDotIndex) : '';
  const nameWithoutExt = lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;

  // Check if already has version suffix
  const versionMatch = nameWithoutExt.match(/-v(\d+)$/);

  if (versionMatch) {
    // Increment existing version
    const currentVersion = parseInt(versionMatch[1], 10);
    const newVersion = currentVersion + 1;
    const baseName = nameWithoutExt.slice(0, -versionMatch[0].length);
    return `${baseName}-v${newVersion}${extension}`;
  } else {
    // Add v2 suffix
    return `${nameWithoutExt}-v2${extension}`;
  }
}

/**
 * Check if filename already exists in file list
 */
export function fileExists(fileName: string, existingFiles: string[]): boolean {
  return existingFiles.includes(fileName);
}

/**
 * Get unique filename by incrementing version if needed
 */
export function getUniqueFileName(fileName: string, existingFiles: string[]): string {
  let uniqueName = fileName;

  while (fileExists(uniqueName, existingFiles)) {
    uniqueName = incrementFileVersion(uniqueName);
  }

  return uniqueName;
}
