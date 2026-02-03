/**
 * Critical Code Studies Methodology
 *
 * Loads methodology directly from Critical-Code-Studies-Skill.md
 * This allows users to modify the skill document to customise the methodology.
 *
 * Bibliography available in CCS-Bibliography.md for reference.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Cache for loaded methodology to avoid repeated file reads
let cachedMethodology: string | null = null;
let cachedBibliographyNote: string | null = null;

/**
 * Load the CCS methodology from the skill document
 */
function loadSkillDocument(): string {
  if (cachedMethodology) {
    return cachedMethodology;
  }

  const skillPath = join(process.cwd(), "Critical-Code-Studies-Skill.md");

  if (existsSync(skillPath)) {
    try {
      cachedMethodology = readFileSync(skillPath, "utf-8");
      return cachedMethodology;
    } catch (error) {
      console.error("Failed to load CCS skill document:", error);
      return getFallbackMethodology();
    }
  }

  console.warn("CCS skill document not found, using fallback methodology");
  return getFallbackMethodology();
}

/**
 * Get bibliography reference note
 */
function getBibliographyNote(): string {
  if (cachedBibliographyNote) {
    return cachedBibliographyNote;
  }

  const bibPath = join(process.cwd(), "CCS-Bibliography.md");

  if (existsSync(bibPath)) {
    cachedBibliographyNote = `

## Bibliography Reference
A comprehensive bibliography of CCS texts is available in CCS-Bibliography.md. Key references include:
- Marino, M. C. (2020) *Critical Code Studies*. MIT Press.
- Berry, D. M. (2011) *The Philosophy of Software*. Palgrave Macmillan.
- Berry, D. M. & Marino, M. C. (2024) 'Reading ELIZA', *Electronic Book Review*.
- Montfort, N. et al. (2013) *10 PRINT*. MIT Press.

Consult the full bibliography for additional sources on hermeneutics, platform studies, computing history, and critical theory.
`;
    return cachedBibliographyNote;
  }

  return "";
}

/**
 * Fallback methodology if skill document is not available
 */
function getFallbackMethodology(): string {
  return `## Critical Code Studies: Core Methodology

CCS applies critical hermeneutics to interpretation of computer source code, program architecture, and documentation within sociohistorical context.

**Core premise**: Code is doubly hidden - by illiteracy and by screens on which output delights/distracts. Meaning grows out of functioning but is not limited to literal processes enacted.

**Code's dual character**:
- **Unambiguous (technical)**: Produces specific computational effects, must compile/execute correctly
- **Ambiguous (social)**: Meaning proliferates through human interpretation, subject to rhetorical analysis

**Berry's Materialist-Phenomenological CCS**: Code as crystallisation of social formations, examined through tests of strength, political economy, and three-fold analysis (ontology, genealogy, mechanology).

**Marino's Hermeneutic-Rhetorical CCS**: Code as social text with extrafunctional significance, analysed through close reading, hermeneutics of suspicion, and attention to multiple audiences.

**Methodological implication**: Cannot read code solely for functionality without considering what it means. Both dimensions require simultaneous attention.
`;
}

/**
 * Extract a specific mode section from the skill document
 */
function extractModeSection(fullDocument: string, mode: string): string {
  const modeMap: Record<string, string> = {
    critique: "MODE 1: CRITIQUE",
    interpret: "MODE 2: INTERPRET",
    create: "MODE 3: CREATE",
  };

  const modeHeader = modeMap[mode];
  if (!modeHeader) {
    return "";
  }

  // Find the mode section
  const modeStart = fullDocument.indexOf(`## ${modeHeader}`);
  if (modeStart === -1) {
    return "";
  }

  // Find the next mode section or end of modes
  const nextModeMatch = fullDocument.slice(modeStart + 1).match(/\n## MODE \d:/);
  const advancedMatch = fullDocument.slice(modeStart + 1).indexOf("## ADVANCED CHALLENGES");
  const referencesMatch = fullDocument.slice(modeStart + 1).indexOf("## KEY REFERENCES");

  let modeEnd: number;
  if (nextModeMatch && nextModeMatch.index !== undefined) {
    modeEnd = modeStart + 1 + nextModeMatch.index;
  } else if (advancedMatch !== -1) {
    modeEnd = modeStart + 1 + advancedMatch;
  } else if (referencesMatch !== -1) {
    modeEnd = modeStart + 1 + referencesMatch;
  } else {
    modeEnd = fullDocument.length;
  }

  return fullDocument.slice(modeStart, modeEnd).trim();
}

/**
 * Extract core foundations from the skill document
 */
function extractCoreFoundations(fullDocument: string): string {
  const coreStart = fullDocument.indexOf("## CORE FOUNDATIONS");
  if (coreStart === -1) {
    return "";
  }

  const modeStart = fullDocument.indexOf("## MODE 1:");
  if (modeStart === -1) {
    return fullDocument.slice(coreStart).trim();
  }

  return fullDocument.slice(coreStart, modeStart).trim();
}

/**
 * Extract a specific phase from a mode section
 */
function extractPhaseSection(modeSection: string, phaseNumber: number): string {
  const phaseHeader = `### Phase ${phaseNumber}:`;
  const phaseStart = modeSection.indexOf(phaseHeader);
  if (phaseStart === -1) {
    return "";
  }

  // Find next phase or end of section
  const nextPhaseMatch = modeSection.slice(phaseStart + 1).match(/\n### Phase \d:/);
  const nextSectionMatch = modeSection.slice(phaseStart + 1).indexOf("\n---");

  let phaseEnd: number;
  if (nextPhaseMatch && nextPhaseMatch.index !== undefined) {
    phaseEnd = phaseStart + 1 + nextPhaseMatch.index;
  } else if (nextSectionMatch !== -1) {
    phaseEnd = phaseStart + 1 + nextSectionMatch;
  } else {
    phaseEnd = modeSection.length;
  }

  return modeSection.slice(phaseStart, phaseEnd).trim();
}

/**
 * LLM-specific methodology guidance for create mode
 */
const LLM_AWARENESS = `
### LLM-Assisted Critical Code Studies

**Triadic Hermeneutics**: Human ↔ LLM ↔ Code. Human interprets both code and LLM's interpretation. Form initial reading before consulting LLM, compare, identify tensions, verify through execution.

**The Competence Effect**: LLM's functional capability masks absence of semantic understanding. Code works, bugs get fixed, system appears to understand. Guard against this constant reinforcement.

**Three Cognitive Modes**:
1. **Delegation** (risk): LLM autonomous, minimal oversight - competence effect danger
2. **Productive Augmentation** (optimal): Human-LLM collaboration, iterative refinement, critical evaluation
3. **Overhead** (cost): Verification exceeds benefits in specialised/novel/safety-critical domains

**Methodological Transparency**: Document interactions, decision points, failures. Enable reproducibility and collective methodological learning.
`;

/**
 * Get methodology appropriate to the current analysis mode
 * Progressive loading: core foundations + mode-specific content
 */
export function getMethodologyForMode(mode?: string): string {
  const fullDocument = loadSkillDocument();
  const coreFoundations = extractCoreFoundations(fullDocument);
  const modeSection = mode ? extractModeSection(fullDocument, mode) : "";
  const bibNote = getBibliographyNote();

  let methodology = coreFoundations;

  if (modeSection) {
    methodology += "\n\n" + modeSection;
  }

  // Add LLM awareness for create mode
  if (mode === "create") {
    methodology += LLM_AWARENESS;
  }

  methodology += bibNote;

  return methodology;
}

/**
 * Get methodology for a specific phase within a mode
 * Later phases get more methodology progressively loaded
 */
export function getMethodologyForPhase(phase: string, mode?: string): string {
  const fullDocument = loadSkillDocument();
  const coreFoundations = extractCoreFoundations(fullDocument);
  const modeSection = mode ? extractModeSection(fullDocument, mode) : "";
  const bibNote = getBibliographyNote();

  let methodology = coreFoundations;

  // Map conversation phases to skill document phases
  const phaseMapping: Record<string, number> = {
    // Opening/surface phases get Phase 1 (foundational)
    opening: 1,
    surface: 1,
    concept: 1,
    scaffolding: 1,
    // Context/iteration phases get Phase 1 + 2
    context: 2,
    iteration: 2,
    // Interpretation/reflection phases get all phases
    interpretation: 3,
    reflection: 3,
    synthesis: 3,
    transfer: 3,
    output: 3,
  };

  const targetPhase = phaseMapping[phase] || 1;

  if (modeSection) {
    // Progressive loading based on conversation phase
    if (targetPhase >= 1) {
      const phase1 = extractPhaseSection(modeSection, 1);
      if (phase1) {
        methodology += "\n\n" + phase1;
      }
    }
    if (targetPhase >= 2) {
      const phase2 = extractPhaseSection(modeSection, 2);
      if (phase2) {
        methodology += "\n\n" + phase2;
      }
    }
    if (targetPhase >= 3) {
      const phase3 = extractPhaseSection(modeSection, 3);
      if (phase3) {
        methodology += "\n\n" + phase3;
      }
    }
  }

  // Add LLM awareness for create mode or later phases
  if (mode === "create" || targetPhase >= 2) {
    methodology += LLM_AWARENESS;
  }

  methodology += bibNote;

  return methodology;
}

/**
 * Clear the cached methodology (useful if the skill document is updated)
 */
export function clearMethodologyCache(): void {
  cachedMethodology = null;
  cachedBibliographyNote = null;
}
