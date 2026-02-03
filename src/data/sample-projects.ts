/**
 * Sample projects that ship with the CCS Workbench
 * These are complete .ccs project files available in public/sample-code/
 *
 * Projects are loaded dynamically from public/sample-code/Samples.md
 * Users can add their own projects by editing that manifest file.
 */

import type { EntryMode } from "@/types";

export interface SampleProject {
  id: string;
  name: string;
  filename: string;
  mode: EntryMode;
  description: string;
  era?: string;
  annotationCount?: number;
}

/**
 * Parse the Samples.md manifest to get available sample projects
 * Format: - path/filename.ccs: Name | mode | Description | era | count
 */
export function parseSamplesManifest(markdown: string): SampleProject[] {
  const projects: SampleProject[] = [];
  const lines = markdown.split("\n");
  let inCodeBlock = false;

  for (const line of lines) {
    // Track code blocks to skip example lines
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Skip lines inside code blocks
    if (inCodeBlock) {
      continue;
    }

    // Match lines like "- eliza/eliza-1965b-CR.ccs: ELIZA (1965) | critique | Description | 1960s | 30"
    const match = line.match(/^-\s+([a-z0-9_/-]+\.ccs):\s*(.+)$/i);
    if (match) {
      const filename = match[1].trim();
      const parts = match[2].split("|").map(p => p.trim());

      if (parts.length >= 3) {
        const [name, mode, description, era, countStr] = parts;
        const validModes: EntryMode[] = ["critique", "interpret", "create"];
        const projectMode = validModes.includes(mode as EntryMode) ? (mode as EntryMode) : "critique";

        // Parse annotation count - handle both numeric strings and undefined
        let annotationCount: number | undefined = undefined;
        if (countStr && !isNaN(parseInt(countStr, 10))) {
          annotationCount = parseInt(countStr, 10);
        }

        projects.push({
          id: filename.replace(".ccs", ""),
          name,
          filename,
          mode: projectMode,
          description,
          era: era || undefined,
          annotationCount,
        });
      }
    }
  }

  return projects;
}

/**
 * Fetch the samples manifest and parse it
 * @returns Array of sample projects
 */
export async function fetchSampleProjectsManifest(): Promise<SampleProject[]> {
  try {
    const response = await fetch("/sample-code/Samples.md");
    if (!response.ok) {
      console.warn("Samples.md not found, using fallback");
      return FALLBACK_SAMPLES;
    }
    const markdown = await response.text();
    const projects = parseSamplesManifest(markdown);
    return projects.length > 0 ? projects : FALLBACK_SAMPLES;
  } catch (error) {
    console.error("Failed to load samples manifest:", error);
    return FALLBACK_SAMPLES;
  }
}

/**
 * Fetch a sample project file from the public folder
 * @param filename - The filename in public/sample-code/
 * @returns The parsed project data
 */
export async function fetchSampleProject(filename: string): Promise<Record<string, unknown>> {
  const response = await fetch(`/sample-code/${filename}`);
  if (!response.ok) {
    throw new Error(`Failed to load sample project: ${filename}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

// Fallback samples if manifest doesn't exist or fails to load
const FALLBACK_SAMPLES: SampleProject[] = [
  {
    id: "eliza-1965-critique",
    name: "ELIZA (1965) - Annotated",
    filename: "eliza/eliza-1965b-CR.ccs",
    mode: "critique",
    description: "A complete critique session of Weizenbaum's ELIZA with 30+ annotations",
    era: "1960s",
    annotationCount: 30,
  },
];

// For backwards compatibility, export static list (will be replaced by dynamic loading)
export const SAMPLE_PROJECTS = FALLBACK_SAMPLES;
