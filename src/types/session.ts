/**
 * Core types for the CCS-WB (Critical Code Studies Workbench) application
 */

export type EntryMode = 'critique' | 'archaeology' | 'interpret' | 'create';

export type MessageRole = 'user' | 'assistant' | 'system';

// Phases for critique/archaeology/interpret modes
export type CritiquePhase =
  | 'opening'        // Initial code presentation and context gathering
  | 'surface'        // Surface-level reading: syntax, structure, names
  | 'context'        // Historical, cultural, platform context
  | 'interpretation' // Deep hermeneutic analysis
  | 'synthesis'      // Drawing together interpretive threads
  | 'output';        // Generating critique document or annotation

// Phases for create mode (vibe coding)
export type CreatePhase =
  | 'concept'        // Exploring what algorithm/code to create
  | 'scaffolding'    // Setting up the basic structure
  | 'iteration'      // Refining and developing the code
  | 'reflection'     // Understanding what was created
  | 'transfer';      // Ready to copy to critique mode

export type ConversationPhase = CritiquePhase | CreatePhase;

export type FeedbackLevel = 'gentle' | 'moderate' | 'direct';

export type CritiqueArtifactType = 'annotation' | 'critique' | 'reading';

export type AnalysisType =
  | 'structural'    // Code structure, control flow, organisation
  | 'semantic'      // Naming, metaphors, linguistic choices
  | 'contextual'    // Platform, era, author, cultural moment
  | 'comparative'   // Comparing code versions or implementations
  | 'hermeneutic'   // Deep interpretive analysis
  | 'genealogical'; // Tracing influences and derivations

export interface MessageMetadata {
  analysisTriggered?: boolean;
  literatureQueried?: boolean;
  feedbackLevel?: FeedbackLevel;
  phase?: ConversationPhase;
  model?: string;  // Model name that generated this response (e.g., "Gemini 2.5 Pro")
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  metadata?: MessageMetadata;
  isFavourite?: boolean;  // Heart-marked messages for export
}

export interface CodeReference {
  id: string;
  name: string;
  language?: string;      // Programming language
  source?: string;        // Where code came from (paste, upload, URL, archive, created)
  sourceUrl?: string;     // Original URL if fetched
  size: number;
  uploadedAt: string;
  summary?: string;
  // Code archaeology metadata
  author?: string;
  date?: string;          // When code was written (if known)
  platform?: string;      // Original platform/system
  context?: string;       // Brief historical context
}

// Kept for compatibility, may remove later
export interface FileReference extends CodeReference {}

// Code version for create mode - tracks iterations during vibe coding
export interface CodeVersion {
  id: string;
  version: number;
  content: string;
  language?: string;
  name: string;
  description?: string;   // What changed in this version
  createdAt: string;
  inspiration?: string;   // e.g., "ELIZA", "Strachey Love Letters", "ppg256"
}

// Working memory for create mode - tracks all code versions
export interface CreateModeState {
  projectName: string;
  inspiration?: string;   // What inspired this code
  inspirationUrl?: string; // Link to original (e.g., Nick Montfort's ppg256)
  language: CreateLanguage; // Language for code generation (default: Python)
  versions: CodeVersion[];
  currentVersionId?: string;
}

export interface InterpretationNote {
  type: 'observation' | 'question' | 'connection' | 'context';
  message: string;
  lineReference?: string; // e.g., "lines 15-20"
}

// Line-anchored annotation for close reading
export interface AnnotationReplyData {
  id: string;
  content: string;
  createdAt: string;
  addedBy?: string;         // Initials of the user who added this reply
  profileColor?: string;    // User's chosen profile color (hex format like #FF5733), falls back to hash-based color if not set
}

export interface LineAnnotation {
  id: string;
  codeFileId: string;       // Which code file this annotation belongs to
  lineNumber: number;       // The line number being annotated (start line for blocks)
  endLineNumber?: number;   // End line for block annotations (undefined = single line)
  lineContent: string;      // The actual content of the line(s) (for reference)
  type: 'observation' | 'question' | 'metaphor' | 'pattern' | 'context' | 'critique';
  content: string;          // The annotation text
  createdAt: string;
  orphaned?: boolean;       // True if the annotated line was deleted during editing
  addedBy?: string;         // Initials of the user who added this annotation (for future multi-user support)
  replies?: AnnotationReplyData[]; // Thread of replies to this annotation
}

export type LineAnnotationType = LineAnnotation['type'];

export const LINE_ANNOTATION_TYPES: LineAnnotationType[] = [
  'observation',
  'question',
  'metaphor',
  'pattern',
  'context',
  'critique',
];

export const LINE_ANNOTATION_LABELS: Record<LineAnnotationType, string> = {
  observation: 'Observation',
  question: 'Question',
  metaphor: 'Metaphor',
  pattern: 'Pattern',
  context: 'Context',
  critique: 'Critique',
};

export const LINE_ANNOTATION_COLORS: Record<LineAnnotationType, string> = {
  observation: 'bg-blue-100 border-blue-300 text-blue-800',
  question: 'bg-amber-100 border-amber-300 text-amber-800',
  metaphor: 'bg-purple-100 border-purple-300 text-purple-800',
  pattern: 'bg-green-100 border-green-300 text-green-800',
  context: 'bg-slate-100 border-slate-300 text-slate-800',
  critique: 'bg-burgundy/10 border-burgundy/30 text-burgundy',
};

export interface AnalysisResult {
  id: string;
  type: AnalysisType;
  summary: string;
  details: Record<string, unknown>;
  notes: InterpretationNote[];
  createdAt: string;
}

export type SourceType = 'archive' | 'repository' | 'publication' | 'personal';

export interface ReferenceResult {
  id: string;
  sourceId: string;
  title: string;
  authors: string[];
  year?: number;
  description?: string;
  url?: string;
  sourceType: SourceType;
  repository?: string;      // e.g., "GitHub", "Internet Archive", "Computer History Museum"
  language?: string;        // Programming language
  platform?: string;        // Original platform
  relevanceScore?: number;
  isHistorical?: boolean;   // Pre-2000 or significant historical code
}

export interface CritiqueArtifact {
  id: string;
  type: CritiqueArtifactType;
  content: string;
  version: number;
  createdAt: string;
  codeReferenceId?: string; // Links to the code being critiqued
}

// Annotation display settings for customizing appearance (per-project)
export type AnnotationBrightness = "low" | "medium" | "high" | "full";
export type LineHighlightIntensity = "off" | "low" | "medium" | "high" | "full";

export interface AnnotationDisplaySettings {
  visible: boolean;                    // Show/hide annotations in code
  brightness: AnnotationBrightness;    // Opacity level
  showPillBackground: boolean;         // Show colored bar background
  showBadge: boolean;                  // Show type badge pill
  lineHighlightIntensity: LineHighlightIntensity; // Subtle highlight intensity on annotated lines
  highlightAnnotatedLines: boolean;    // Dim non-annotated lines (focus mode)
  fontSize: number;                    // Annotation font size (9-16px)
  indent: number;                      // Left indent for annotations (0-160px)
}

export const DEFAULT_ANNOTATION_DISPLAY_SETTINGS: AnnotationDisplaySettings = {
  visible: true,
  brightness: "medium",
  showPillBackground: true,
  showBadge: true,
  lineHighlightIntensity: "medium",
  highlightAnnotatedLines: false,
  fontSize: 9,
  indent: 56,
};

// Panel layout settings (per-project)
export interface PanelLayoutSettings {
  codePanelWidth: number;      // Percentage width for code panel (0-100)
  chatCollapsed: boolean;      // Whether the chat panel is collapsed
  annotationFullScreen: boolean; // Whether annotation panel is fullscreen
}

export const DEFAULT_PANEL_LAYOUT_SETTINGS: PanelLayoutSettings = {
  codePanelWidth: 70,
  chatCollapsed: false,
  annotationFullScreen: false,
};

// Combined display settings for a session/project
export interface DisplaySettings {
  annotations: AnnotationDisplaySettings;
  panelLayout: PanelLayoutSettings;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  annotations: DEFAULT_ANNOTATION_DISPLAY_SETTINGS,
  panelLayout: DEFAULT_PANEL_LAYOUT_SETTINGS,
};

export interface SessionSettings {
  beDirectMode: boolean;
  teachMeMode: boolean;
}

export interface Session {
  id: string;
  mode: EntryMode;
  experienceLevel?: ExperienceLevel;  // CCS experience level (learning, practitioner, research)
  languageOverride?: string;  // Per-session language preference (overrides global default)
  messages: Message[];
  codeFiles: CodeReference[];   // Code being analysed
  codeContents: Record<string, string>;  // Map of codeFileId -> actual code content
  lineAnnotations: LineAnnotation[];  // Line-anchored annotations for close reading
  analysisResults: AnalysisResult[];
  references: ReferenceResult[]; // Related code, scholarship
  critiqueArtifacts: CritiqueArtifact[];
  settings: SessionSettings;
  displaySettings: DisplaySettings;  // Per-project display settings (synced to cloud)
  currentPhase: ConversationPhase;
  feedbackEscalation: number;   // 0-3 tracking escalation level
  createdAt: string;
  lastModified: string;
  // Create mode working memory
  createState?: CreateModeState;
  // Auto-save state
  isDirty?: boolean;  // Has unsaved changes
  fileHandles?: Record<string, string>;  // Map of fileId -> handleId (for File System Access API)
  lastSaved?: string;  // ISO timestamp of last successful save
}

export interface SessionExport {
  version: string;
  exportedAt: string;
  session: Session;
}

// Languages for create mode (vibe coding)
export const CREATE_LANGUAGES = [
  'Python',
  'JavaScript',
  'BASIC',
  'Lisp',
  'Pseudocode',
  'Other',
] as const;

export type CreateLanguageOption = typeof CREATE_LANGUAGES[number];

// CreateLanguage can be a preset or a custom string (when "Other" is selected)
export type CreateLanguage = string;

// CCS experience levels - affects how the assistant engages
export const CCS_EXPERIENCE_LEVELS = [
  'learning',      // New to CCS - explains concepts, offers scaffolding, suggests readings
  'practitioner',  // Familiar with CCS - uses vocabulary freely, focuses on analysis
  'research',      // Deep engagement - engages as peer, technical depth, challenges interpretations
] as const;

export type ExperienceLevel = typeof CCS_EXPERIENCE_LEVELS[number];

// Human-readable labels for experience levels
export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  learning: "Learning CCS",
  practitioner: "Practitioner",
  research: "Researcher",
};

// Descriptions for experience levels (used in help tooltip)
export const EXPERIENCE_LEVEL_DESCRIPTIONS: Record<ExperienceLevel, string> = {
  learning: "New to critical code studies? The assistant will explain concepts, offer scaffolding, and suggest readings.",
  practitioner: "Familiar with CCS methods. The assistant uses vocabulary freely and focuses on your analysis.",
  research: "For deep scholarly engagement. The assistant engages as a peer, offers technical depth, and challenges interpretations.",
};

// Legacy aliases for compatibility during migration
export const CODE_DOMAINS = CCS_EXPERIENCE_LEVELS;
export type CodeDomain = ExperienceLevel;

// Guided prompts for each phase - helps users know what questions to ask
// Prompts starting with "Analyse" or "Explain" etc are LLM-actionable
// Others are reflective questions for the user to consider before engaging
export const GUIDED_PROMPTS: Record<EntryMode, Partial<Record<ConversationPhase, string[]>>> = {
  critique: {
    opening: [
      "Describe the overall structure and purpose of this code",
      "What language features and paradigms does this code use?",
      "Identify the key abstractions in this code",
    ],
    surface: [
      "Analyse the naming conventions used in this code",
      "What metaphors appear in variable and function names?",
      "Examine the code structure and organisation",
      "What do the comments reveal about the author's intent?",
    ],
    context: [
      "What platform constraints might have shaped this code?",
      "Research the historical context of when this was written",
      "What computing conventions of the era are visible?",
    ],
    interpretation: [
      "What values and assumptions are embedded in this code?",
      "What does this code make visible or invisible?",
      "Analyse the power relations encoded in this software",
      "What ideological assumptions underpin the design?",
    ],
    synthesis: [
      "Summarise the key interpretive threads from our analysis",
      "How do different readings complement or contradict each other?",
      "What remains ambiguous or unresolved in our interpretation?",
    ],
    output: [
      "Generate a formal code critique document",
      "Create detailed line-by-line annotations",
      "Write a close reading essay on this code",
    ],
  },
  archaeology: {
    opening: [
      "Research when this code was written and by whom",
      "What platform or system was this written for?",
      "Trace the provenance of this code",
    ],
    surface: [
      "Identify the language dialect and version",
      "What historical idioms and patterns appear?",
      "How does the structure reflect its era?",
    ],
    context: [
      "What were the technical constraints of the time?",
      "Research the intended audience for this software",
      "What contemporary software might have influenced this?",
    ],
    interpretation: [
      "Compare this to modern approaches to the same problem",
      "What assumptions reveal its historical moment?",
      "What has been lost or gained since this was written?",
    ],
    synthesis: [
      "What does this code reveal about its era?",
      "How does historical context change our reading?",
    ],
  },
  interpret: {
    opening: [
      "Explain different hermeneutic approaches to code",
      "What aspects of code interpretation should I understand?",
    ],
    surface: [
      "How does close reading apply to source code?",
      "Explain extrafunctional significance in code",
    ],
    context: [
      "How do platform studies inform code interpretation?",
      "Explain the role of execution context in interpretation",
    ],
    interpretation: [
      "How do we navigate author intention vs reader reception?",
      "Explain the triadic hermeneutic structure",
      "How do we avoid over-reading or under-reading code?",
    ],
  },
  create: {
    concept: [
      "Suggest classic algorithms I could implement to learn",
      "What simple project would help me understand pattern matching?",
    ],
    scaffolding: [
      "Create the simplest working version of this",
      "What data structures do we need for this?",
    ],
    iteration: [
      "Add the next logical feature to this code",
      "Refactor this to be more readable",
    ],
    reflection: [
      "Analyse the design choices we made in this code",
      "What values are embedded in the code we built?",
      "I'm ready to transfer this to critique mode for analysis",
    ],
  },
};
