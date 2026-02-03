import { NextRequest, NextResponse } from "next/server";
import jsPDF from "jspdf";
import { APP_VERSION, APP_NAME } from "@/lib/config";

// CCS Skill document version (should match Critical-Code-Studies-Skill.md)
const CCS_SKILL_VERSION = "2.4";

// Type definitions for session data
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: {
    analysisTriggered?: boolean;
    literatureQueried?: boolean;
    feedbackLevel?: number;
    phase?: string;
  };
}

interface CodeReference {
  id: string;
  name: string;
  language?: string;
  source?: string;
  sourceUrl?: string;
  size: number;
  uploadedAt: string;
  summary?: string;
  author?: string;
  date?: string;
  platform?: string;
  context?: string;
}

interface AnalysisResult {
  type: string;
  summary: string;
  details?: Record<string, unknown>;
  notes?: { type: string; message: string; lineReference?: string }[];
}

interface ReferenceResult {
  id: string;
  sourceId: string;
  title: string;
  authors: string[];
  year?: number;
  description?: string;
  url?: string;
  sourceType: string;
  repository?: string;
  language?: string;
  platform?: string;
  relevanceScore?: number;
  isHistorical?: boolean;
}

interface CritiqueArtifact {
  type: "annotation" | "critique" | "reading";
  content: string;
  version: number;
  createdAt: string;
  codeReferenceId?: string;
}

interface SessionData {
  id: string;
  mode: "critique" | "interpret" | "create";
  experienceLevel?: "learning" | "practitioner" | "research";
  messages: Message[];
  codeFiles: CodeReference[];
  analysisResults: AnalysisResult[];
  references: ReferenceResult[];
  critiqueArtifacts: CritiqueArtifact[];
  settings: {
    beDirectMode: boolean;
    teachMeMode: boolean;
  };
  currentPhase: string;
  feedbackEscalation: number;
  createdAt: string;
  lastModified: string;
}

// Helper to generate PDF from session data
function generatePDF(session: SessionData): Buffer {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let yPos = margin;

  // Helper function to add text with word wrap
  const addWrappedText = (text: string, fontSize: number, isBold: boolean = false) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    const lines = doc.splitTextToSize(text, contentWidth);
    const lineHeight = fontSize * 0.4;

    for (const line of lines) {
      if (yPos + lineHeight > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
      }
      doc.text(line, margin, yPos);
      yPos += lineHeight;
    }
    yPos += 2;
  };

  // Title
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(128, 0, 32); // Burgundy
  doc.text(APP_NAME, margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`App v${APP_VERSION} · CCS Methodology v${CCS_SKILL_VERSION}`, margin, yPos);
  yPos += 10;

  // Session Info
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const modeLabel = session.mode === "critique" ? "Code Critique" :
                    session.mode === "create" ? "Code Creation" :
                    "Hermeneutic Exploration";
  doc.text(`Mode: ${modeLabel}`, margin, yPos);
  yPos += 6;
  if (session.experienceLevel) {
    const levelLabel = session.experienceLevel === "learning" ? "Learning CCS" :
                       session.experienceLevel === "practitioner" ? "Practitioner" :
                       "Researcher";
    doc.text(`Experience: ${levelLabel}`, margin, yPos);
    yPos += 6;
  }
  doc.text(`Exported: ${new Date().toLocaleString()}`, margin, yPos);
  yPos += 10;

  // Reset text color
  doc.setTextColor(0, 0, 0);

  // Code Under Analysis
  if (session.codeFiles.length > 0) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(128, 0, 32);
    doc.text("Code Under Analysis", margin, yPos);
    yPos += 8;
    doc.setTextColor(0, 0, 0);

    for (const code of session.codeFiles) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(code.name, margin, yPos);
      yPos += 5;
      if (code.language) {
        doc.setFont("helvetica", "normal");
        doc.text(`Language: ${code.language}`, margin, yPos);
        yPos += 4;
      }
      if (code.author) {
        doc.text(`Author: ${code.author}`, margin, yPos);
        yPos += 4;
      }
      if (code.date) {
        doc.text(`Date: ${code.date}`, margin, yPos);
        yPos += 4;
      }
      yPos += 3;
    }
  }

  // Conversation
  if (session.messages.length > 0) {
    yPos += 5;
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(128, 0, 32);
    doc.text("Analysis Dialogue", margin, yPos);
    yPos += 8;
    doc.setTextColor(0, 0, 0);

    for (const message of session.messages) {
      const roleLabel = message.role === "user" ? "Analyst" : "Assistant";
      addWrappedText(`${roleLabel}: ${message.content}`, 10);
      yPos += 3;
    }
  }

  // Generated Outputs
  if (session.critiqueArtifacts.length > 0) {
    yPos += 5;
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(128, 0, 32);
    doc.text("Generated Critiques", margin, yPos);
    yPos += 8;
    doc.setTextColor(0, 0, 0);

    for (const artifact of session.critiqueArtifacts) {
      const typeLabel = artifact.type === "annotation" ? "Code Annotation" :
                       artifact.type === "critique" ? "Code Critique" :
                       artifact.type === "reading" ? "Close Reading" : artifact.type;

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(`${typeLabel} (v${artifact.version})`, margin, yPos);
      yPos += 6;
      addWrappedText(artifact.content, 10);
      yPos += 5;
    }
  }

  // Footer on all pages
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount} | Generated by CCS-WB`,
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );
  }

  // Return as buffer
  return Buffer.from(doc.output("arraybuffer"));
}

// POST /api/export - Export session data (JSON or PDF)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { session, format = "json", outputsOnly = false } = body as {
      session: SessionData;
      format?: "json" | "pdf";
      outputsOnly?: boolean;
    };

    if (!session) {
      return NextResponse.json(
        { error: "Session data is required" },
        { status: 400 }
      );
    }

    // Prepare export data
    const exportData = outputsOnly
      ? {
          critiqueArtifacts: session.critiqueArtifacts,
          exportedAt: new Date().toISOString(),
          version: "1.0",
        }
      : {
          ...session,
          exportedAt: new Date().toISOString(),
          version: "1.0",
        };

    if (format === "pdf") {
      // Generate PDF
      const pdfBuffer = generatePDF(session);

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="ccs-wb-session-${new Date().toISOString().slice(0, 10)}.pdf"`,
        },
      });
    }

    // Return JSON
    return NextResponse.json(exportData, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename="ccs-wb-session-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Failed to export session" },
      { status: 500 }
    );
  }
}

// GET /api/export - Return info about export endpoint
export async function GET() {
  return NextResponse.json({
    message: "Export endpoint for CCS-WB sessions",
    usage: {
      method: "POST",
      body: {
        session: "Session data object (required)",
        format: "json | pdf (default: json)",
        outputsOnly: "boolean - export only generated critiques (default: false)",
      },
    },
    note: "Sessions are stored client-side. Use the Export button in the app to export your session, or POST session data to this endpoint.",
  });
}
