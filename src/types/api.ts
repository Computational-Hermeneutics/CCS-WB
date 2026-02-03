/**
 * API request and response types for CCS-WB
 */

import type {
  AnalysisResult,
  ReferenceResult,
  Message,
  CritiqueArtifact,
  CritiqueArtifactType,
  SessionSettings,
  CodeReference,
} from './session';

// Chat API
export interface ChatRequest {
  messages: Message[];
  settings: SessionSettings;
  currentPhase: string;
  experienceLevel?: string;  // CCS experience level (learning, practitioner, research)
  mode?: string;      // Entry mode (critique, interpret, create)
  createLanguage?: string;  // Language for create mode code generation
  defaultLanguage?: string;  // User's preferred programming language (from app settings)
  analysisContext?: AnalysisResult[];
  literatureContext?: ReferenceResult[];  // References
  codeContext?: (CodeReference & { content?: string })[];  // Code being analysed with optional content
}

export interface ChatResponse {
  message: Message;
  suggestedActions?: string[];
  phaseTransition?: string;
  feedbackLevel?: string;
}

// Code Upload API
export interface UploadRequest {
  file: File;
}

export interface UploadResponse {
  fileId: string;
  fileName: string;
  fileType: string;
  size: number;
  summary: string;
  language?: string;
  lineCount?: number;
}

// Code Analysis API
export interface AnalyzeRequest {
  codeId: string;
  analysisType: string;
  options?: Record<string, unknown>;
}

export interface AnalyzeResponse {
  result: AnalysisResult;
}

// Reference Search API (code repositories, archives)
export interface ReferenceSearchRequest {
  query: string;
  domain?: string;
  limit?: number;
  includeHistorical?: boolean;
}

export interface ReferenceSearchResponse {
  references: ReferenceResult[];
  totalFound: number;
  cached: boolean;
}

// Generate Output API
export interface GenerateRequest {
  type: CritiqueArtifactType;
  sessionContext: {
    messages: Message[];
    analysisResults?: AnalysisResult[];
    references?: ReferenceResult[];
    codeFiles?: CodeReference[];
    domain?: string;
  };
}

export interface GenerateResponse {
  artifact: CritiqueArtifact;
}

// Export API
export interface ExportRequest {
  format: 'json' | 'pdf';
  includeConversation: boolean;
  includeOutputsOnly: boolean;
}

export interface ExportResponse {
  data: string | Blob;
  filename: string;
  contentType: string;
}

// Import API
export interface ImportRequest {
  sessionData: string;
}

export interface ImportResponse {
  success: boolean;
  welcomeBackSummary: string;
  session: import('./session').Session;
}

// Error Response
export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}
