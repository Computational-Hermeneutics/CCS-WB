"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { useAISettings } from "@/context/AISettingsContext";
import { cn, formatTimestamp, fetchWithTimeout, retryWithBackoff, generateId, getCurrentTimestamp } from "@/lib/utils";
import type { Message, AnalysisResult, ReferenceResult, CodeReference, CreateLanguage, ExperienceLevel } from "@/types";
import { CREATE_LANGUAGES, EXPERIENCE_LEVEL_LABELS, EXPERIENCE_LEVEL_DESCRIPTIONS } from "@/types";
import {
  Send,
  Upload,
  BookOpen,
  FileOutput,
  Settings,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  FileText,
  Download,
  FileDown,
  Cpu,
  Code,
  MessageSquarePlus,
  GitCompare,
  Lightbulb,
  Save,
  FolderOpen,
  Minus,
  Plus,
  Eye,
  Copy,
  Check,
  Heart,
  ArrowUp,
  SlidersHorizontal,
  ChevronDown,
  Search,
} from "lucide-react";
import jsPDF from "jspdf";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { AISettingsPanel } from "@/components/settings/AISettingsPanel";
import { useAppSettings } from "@/context/AppSettingsContext";
import type { AppMode } from "@/types/app-settings";
import { FONT_SIZE_MIN, FONT_SIZE_MAX, PROGRAMMING_LANGUAGES } from "@/types/app-settings";
import { AnnotatedCodeViewer, generateAnnotatedCode } from "@/components/code";
import { GuidedPrompts } from "@/components/prompts";
import { CritiqueLayout, type CritiqueLayoutRef } from "@/components/layouts";
import { PROVIDER_CONFIGS } from "@/lib/ai/config";
import { APP_VERSION, APP_NAME } from "@/lib/config";
import { GUIDED_PROMPTS } from "@/types";
import {
  generateSessionLog,
  exportSessionLogJSON,
  exportSessionLogText,
  exportSessionLogPDF,
  MODE_CODES,
  MODE_LABELS,
  CCS_SKILL_VERSION,
} from "@/lib/export";

// Font size constants are imported from app-settings

// Opening prompts based on mode
const openingPrompts: Record<string, string> = {
  critique: "What code would you like to explore? You can paste it directly, upload a file, or describe what you're looking at. I'm curious what drew your attention to this particular piece of software.",
  archaeology: "What historical software are you investigating? Tell me about the code and its context. When was it written, for what platform, and what interests you about it?",
  interpret: "What aspects of code interpretation are you thinking about? We could explore hermeneutic frameworks, discuss the relationship between code and meaning, or work through how to approach a close reading.",
  create: "Let's create some code together! Would you like to build a simple version of a classic algorithm? We could try:\n\n• ELIZA - A pattern-matching chatbot (Weizenbaum, 1966)\n• Love Letter Generator - Combinatorial text (Strachey, 1952)\n• Poetry Generator - Like Nick Montfort's ppg256\n• Sorting Algorithm - Bubble sort or selection sort\n• Cellular Automaton - Simple rule-based patterns\n\nWhat interests you, or do you have something else in mind?",
};

export default function ConversationPage() {
  const router = useRouter();
  const { session, addMessage, updateMessage, updateSettings, addCode, removeCode, addReferences, clearReferences, addArtifact, importSession, setCreateLanguage, setLanguageOverride, setExperienceLevel, switchMode, clearModeSession, hasSavedSession } = useSession();
  const { settings: aiSettings, getRequestHeaders, isConfigured: isAIConfigured, connectionStatus, isAiReady } = useAISettings();
  const { settings: appSettings, getFontSizes, setModeChatFontSize, getDisplayName, profile } = useAppSettings();
  const aiEnabled = aiSettings.aiEnabled;
  const [input, setInput] = useState("");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"profile" | "code" | "appearance" | "ai" | "about">("appearance");
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);

  // Get effective language: session override > global default > "Not specified"
  const effectiveLanguage = session.languageOverride || appSettings.defaultLanguage || "";
  const languageName = PROGRAMMING_LANGUAGES.find(l => l.id === effectiveLanguage)?.name || "Not specified";
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(false); // Default closed on mobile
  const [isMobile, setIsMobile] = useState(false);

  // Detect if we're on alpha/test deployment for visual indicator
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      setIsAlphaVersion(
        hostname.includes('alpha') ||
        hostname.includes('test') ||
        hostname.includes('staging')
      );
    }
  }, []);

  // Check if mobile viewport - only toggle panel when crossing threshold
  useEffect(() => {
    let wasMobile = window.innerWidth < 768;

    // Set initial state
    setIsMobile(wasMobile);
    setIsContextPanelOpen(!wasMobile);

    const checkMobile = () => {
      const nowMobile = window.innerWidth < 768;
      // Only update when crossing the mobile/desktop threshold
      if (nowMobile !== wasMobile) {
        setIsMobile(nowMobile);
        setIsContextPanelOpen(!nowMobile);
        wasMobile = nowMobile;
      }
    };

    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const [isSearchingLiterature, setIsSearchingLiterature] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedOutput, setGeneratedOutput] = useState<{ content: string; type: string } | null>(null);
  const [selectedOutputType, setSelectedOutputType] = useState<"annotation" | "critique" | "reading">("critique");
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState("");
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [triggerCritiqueSave, setTriggerCritiqueSave] = useState(false);
  const [isAlphaVersion, setIsAlphaVersion] = useState(false);
  const [selectedCodeDetails, setSelectedCodeDetails] = useState<CodeReference | null>(null);
  const [selectedRefDetails, setSelectedRefDetails] = useState<ReferenceResult | null>(null);
  const [selectedArtifactDetails, setSelectedArtifactDetails] = useState<{ id: string; type: string; content: string; version: number; createdAt: string } | null>(null);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInputText, setCodeInputText] = useState("");
  const [codeInputName, setCodeInputName] = useState("");
  const [codeInputLanguage, setCodeInputLanguage] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [customLanguage, setCustomLanguage] = useState("");
  const [showCustomLanguageInput, setShowCustomLanguageInput] = useState(false);
  const [showExperienceHelp, setShowExperienceHelp] = useState(false);
  const [showCodeAnnotator, setShowCodeAnnotator] = useState<{ code: string; fileId: string; fileName?: string; language?: string } | null>(null);
  const [showGuidedPrompts, setShowGuidedPrompts] = useState(false);
  const [projectName, setProjectName] = useState<string>("");

  // Get font size from app settings based on current mode
  const currentMode = (session.mode || "critique") as AppMode;
  const { chatFontSize } = getFontSizes(currentMode);
  const [showFontSizePopover, setShowFontSizePopover] = useState(false);
  const [showContextPreview, setShowContextPreview] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [favouriteMessages, setFavouriteMessages] = useState<Set<string>>(new Set());
  // Chat search state
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionLoadInputRef = useRef<HTMLInputElement>(null);
  const chatSearchInputRef = useRef<HTMLInputElement>(null);
  const hasAddedOpeningMessage = useRef(false);
  const critiqueLayoutRef = useRef<CritiqueLayoutRef>(null);

  // Use ref for session to avoid stale closure issues in hasUnsavedChanges
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Check if there are unsaved changes (more than just the initial assistant message)
  const hasUnsavedChanges = useCallback(() => {
    // For critique mode, use the ref method if available
    if (sessionRef.current.mode === "critique" && critiqueLayoutRef.current) {
      return critiqueLayoutRef.current.hasUnsavedChanges();
    }

    // For other modes, check directly using ref to get latest session data
    const currentSession = sessionRef.current;
    // User has sent at least one message
    const hasUserMessages = currentSession.messages.some(m => m.role === 'user');
    // Has code files
    const hasCode = currentSession.codeFiles.length > 0;
    // Has analysis results
    const hasAnalysis = currentSession.analysisResults.length > 0;
    // Has references
    const hasRefs = currentSession.references.length > 0;
    // Has generated outputs
    const hasOutputs = currentSession.critiqueArtifacts.length > 0;

    return hasUserMessages || hasCode || hasAnalysis || hasRefs || hasOutputs;
  }, []); // No dependencies needed - we use ref to access latest session

  // Warn user before closing tab/window if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Close dropdowns if clicking outside of them
      if (!target.closest('[data-dropdown]')) {
        setShowModeDropdown(false);
        setShowExperienceHelp(false);
        setShowLanguageDropdown(false);
        setShowFontSizePopover(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle navigation to home with warning
  const handleNavigateHome = useCallback(() => {
    if (hasUnsavedChanges()) {
      setShowUnsavedWarning(true);
    } else {
      router.push('/');
    }
  }, [hasUnsavedChanges, router]);

  // Auto-dismiss success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Track message count to only scroll on new messages, not updates
  const prevMessageCount = useRef(session.messages.length);

  // Scroll to bottom only when new messages are added
  useEffect(() => {
    if (session.messages.length > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCount.current = session.messages.length;
  }, [session.messages.length]);

  // Add opening prompt if no messages (only once)
  // Note: critique mode is handled by CritiqueLayout, so skip here
  useEffect(() => {
    if (session.messages.length === 0 && session.mode && session.mode !== "critique" && !hasAddedOpeningMessage.current) {
      hasAddedOpeningMessage.current = true;
      let openingContent = openingPrompts[session.mode] || openingPrompts.idea;

      // For create mode, append the language info
      if (session.mode === "create") {
        const lang = session.createState?.language || "Python";
        openingContent += `\n\n[I'll write code in ${lang}. You can change this in the sidebar.]`;
      }

      addMessage({
        role: "assistant",
        content: openingContent,
        metadata: { phase: "opening" },
      });
    }
  }, [session.mode, session.messages.length, session.createState?.language, addMessage]);

  // Handle copy message
  const handleCopyMessage = useCallback(async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  // Handle toggle favourite message - persists to session for export
  const handleToggleFavourite = useCallback((messageId: string) => {
    // Update local UI state
    setFavouriteMessages(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
    // Persist to session for export
    const message = session.messages.find(m => m.id === messageId);
    if (message) {
      updateMessage(messageId, { isFavourite: !message.isFavourite });
    }
  }, [session.messages, updateMessage]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !isAiReady) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    // Add user message
    addMessage({
      role: "user",
      content: userMessage,
    });

    try {
      // Use retry with exponential backoff for LLM calls
      const data = await retryWithBackoff(
        async () => {
          const response = await fetchWithTimeout("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getRequestHeaders() },
            body: JSON.stringify({
              messages: [...session.messages, { role: "user", content: userMessage }],
              settings: session.settings,
              currentPhase: session.currentPhase,
              experienceLevel: session.experienceLevel,
              mode: session.mode,
              createLanguage: session.createState?.language,
              defaultLanguage: effectiveLanguage || undefined,
              analysisContext: session.analysisResults,
              literatureContext: session.references,
              // Include annotations for archaeology and interpret modes
              codeContext: (session.mode === "archaeology" || session.mode === "interpret")
                ? buildAnnotatedCodeContext()
                : session.codeFiles,
            }),
            timeout: 60000, // 60 second timeout for LLM calls
          });

          // Handle rate limit error specifically
          if (response.status === 429) {
            const errorData = await response.json();
            const rateLimitError = new Error(errorData.message || "Rate limit exceeded");
            (rateLimitError as Error & { isRateLimit: boolean; retryAfter?: number }).isRateLimit = true;
            (rateLimitError as Error & { retryAfter?: number }).retryAfter = errorData.retryAfter;
            throw rateLimitError;
          }

          // Handle AI configuration errors (503 from API)
          if (response.status === 503) {
            const errorData = await response.json();
            const configError = new Error(errorData.message || "AI provider not configured");
            (configError as Error & { isConfigError: boolean; requiresSetup?: boolean }).isConfigError = true;
            (configError as Error & { requiresSetup?: boolean }).requiresSetup = errorData.requiresSetup;
            throw configError;
          }

          if (!response.ok) {
            // Try to get the actual error message from the response
            try {
              const errorData = await response.json();
              throw new Error(errorData.message || `Server error: ${response.status}`);
            } catch (parseError) {
              // If we can't parse the error response, throw a generic error
              if (parseError instanceof Error && parseError.message !== `Server error: ${response.status}`) {
                throw parseError;
              }
              throw new Error(`Failed to get response (${response.status})`);
            }
          }

          return response.json();
        },
        {
          maxRetries: 2,
          initialDelay: 1000,
          maxDelay: 5000,
          shouldRetry: (error) => {
            // Don't retry rate limit errors
            if ((error as Error & { isRateLimit?: boolean }).isRateLimit) {
              return false;
            }
            // Retry on timeout (AbortError) or server errors
            if (error instanceof Error) {
              return error.name === 'AbortError' || error.message.includes('timeout');
            }
            return false;
          },
        }
      );

      addMessage(data.message);
    } catch (error) {
      console.error("Chat error:", error);
      // Determine error type for appropriate user message
      const isRateLimitError = (error as Error & { isRateLimit?: boolean }).isRateLimit;
      const retryAfter = (error as Error & { retryAfter?: number }).retryAfter;
      const isConfigError = (error as Error & { isConfigError?: boolean }).isConfigError;
      const isTimeoutError = error instanceof Error && (error.name === 'AbortError' || error.message.includes('timeout'));
      const isNetworkError = error instanceof TypeError && error.message.includes('fetch');
      // Detect Ollama connection errors (fetch failures to localhost:11434)
      const isOllamaConnectionError = error instanceof Error &&
        (error.message.includes('ECONNREFUSED') ||
         error.message.includes('Failed to fetch') ||
         error.message.includes('NetworkError'));

      let errorMessage: string;
      if (isConfigError) {
        // Open AI settings modal for configuration errors
        setSettingsTab("ai"); setShowSettingsModal(true);
        errorMessage = "AI provider not configured or not responding. Please check your AI settings. The settings panel has been opened for you.";
      } else if (isRateLimitError) {
        errorMessage = `You're sending messages too quickly. Please wait ${retryAfter || 60} seconds before trying again. Your conversation is saved and you can continue shortly.`;
      } else if (isTimeoutError) {
        errorMessage = "The request took too long and timed out. The server might be busy. Please try again in a moment. Your conversation context is preserved.";
      } else if (isNetworkError || isOllamaConnectionError) {
        // Open AI settings modal for network/connection errors (likely Ollama not running)
        setSettingsTab("ai"); setShowSettingsModal(true);
        errorMessage = "Unable to connect to the AI provider. If using Ollama, make sure it's running (ollama serve). The settings panel has been opened for you.";
      } else {
        errorMessage = "I apologize, but I encountered an error processing your message. Please try again.";
      }

      addMessage({
        role: "assistant",
        content: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea as content grows
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      // Reset height to auto to get correct scrollHeight
      textarea.style.height = 'auto';
      // Set to scrollHeight, with a max of ~200px (about 10 lines)
      const maxHeight = 200;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
      // Add overflow if exceeds max
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [input]);

  const handleUpload = () => {
    fileInputRef.current?.click();
  };

  // Handle pasting code directly
  const handleCodeSubmit = () => {
    if (!codeInputText.trim()) return;

    const codeName = codeInputName.trim() || "Untitled code";
    const language = codeInputLanguage.trim() || detectLanguage(codeInputText);

    addCode({
      name: codeName,
      language: language,
      source: "paste",
      size: codeInputText.length,
    });

    // Add a message with the code to the conversation
    addMessage({
      role: "user",
      content: `Here's the code I'd like to analyse:\n\n**${codeName}**${language ? ` (${language})` : ""}\n\n\`\`\`${language || ""}\n${codeInputText}\n\`\`\``,
    });

    // Reset the code input
    setCodeInputText("");
    setCodeInputName("");
    setCodeInputLanguage("");
    setShowCodeInput(false);
  };

  // Extract code from a message content (looks for code blocks)
  const extractCodeFromMessage = useCallback((messageContent: string): string | null => {
    // Match code blocks with or without language specifier
    const codeBlockRegex = /```(?:\w+)?\n?([\s\S]*?)```/g;
    const matches = [...messageContent.matchAll(codeBlockRegex)];
    if (matches.length > 0) {
      // Return the first code block found
      return matches[0][1].trim();
    }
    return null;
  }, []);

  // Find code content for a code file by searching through messages
  const findCodeContentForFile = useCallback((codeFile: CodeReference): string | null => {
    // Search messages for code that matches this file
    for (const message of session.messages) {
      if (message.content.includes(codeFile.name) ||
          (codeFile.language && message.content.includes(`\`\`\`${codeFile.language}`))) {
        const code = extractCodeFromMessage(message.content);
        if (code) return code;
      }
    }
    return null;
  }, [session.messages, extractCodeFromMessage]);

  // Handle opening code annotator for a specific code file
  const handleOpenCodeAnnotator = useCallback((codeFile: CodeReference) => {
    const code = findCodeContentForFile(codeFile);
    if (code) {
      setShowCodeAnnotator({
        code,
        fileId: codeFile.id,
        fileName: codeFile.name,
        language: codeFile.language,
      });
    } else {
      // If no code found, show an error message
      setSuccessMessage("Could not find code content for this file in the conversation.");
    }
  }, [findCodeContentForFile]);

  // Handle guided prompt selection - insert into input
  const handleSelectGuidedPrompt = useCallback((prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
    setShowGuidedPrompts(false);
  }, []);

  // Build code context with annotations for LLM (for archaeology/interpret modes)
  const buildAnnotatedCodeContext = useCallback((): (CodeReference & { content?: string })[] => {
    if (session.codeFiles.length === 0) return session.codeFiles;

    return session.codeFiles.map((file) => {
      const code = findCodeContentForFile(file);
      if (!code) return file;

      const fileAnnotations = session.lineAnnotations.filter(
        (a) => a.codeFileId === file.id
      );

      return {
        ...file,
        content: fileAnnotations.length > 0
          ? generateAnnotatedCode(code, fileAnnotations)
          : code,
      };
    });
  }, [session.codeFiles, session.lineAnnotations, findCodeContentForFile]);

  // Generate context preview string for modal (archaeology/interpret modes)
  const contextPreviewText = useMemo(() => {
    if (session.codeFiles.length === 0) return "";

    const parts: string[] = ["## Code Under Analysis\n"];
    const annotatedContext = buildAnnotatedCodeContext();

    annotatedContext.forEach((file) => {
      parts.push(`### ${file.name}${file.language ? ` (${file.language})` : ""}`);
      if (file.author) parts.push(`Author: ${file.author}`);
      if (file.date) parts.push(`Date: ${file.date}`);
      if (file.platform) parts.push(`Platform: ${file.platform}`);
      parts.push("\n```" + (file.language || ""));
      parts.push(file.content || "(No code content found)");
      parts.push("```\n");
    });

    if (session.lineAnnotations.length > 0) {
      parts.push("\n*Note: Lines marked with `// An:` are analyst annotations for close reading.*");
    }

    return parts.join("\n");
  }, [session.codeFiles, session.lineAnnotations, buildAnnotatedCodeContext]);

  // Simple language detection from code content
  const detectLanguage = (code: string): string => {
    if (code.includes("def ") && code.includes(":")) return "python";
    if (code.includes("function ") || code.includes("const ") || code.includes("let ")) return "javascript";
    if (code.includes("#include") || code.includes("int main")) return "c";
    if (code.includes("public class") || code.includes("public static void")) return "java";
    if (code.includes("<html") || code.includes("<!DOCTYPE")) return "html";
    if (code.includes("fn ") && code.includes("->")) return "rust";
    if (code.includes("func ") && code.includes("package ")) return "go";
    if (code.includes("BEGIN") && code.includes("END")) return "cobol";
    if (code.includes("PROCEDURE") || code.includes("PROGRAM")) return "pascal";
    if (code.includes("(defun") || code.includes("(define")) return "lisp";
    return "";
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // Read file as text for code files
      const text = await file.text();
      const extension = file.name.split(".").pop()?.toLowerCase() || "";

      // Detect programming language from extension
      const languageMap: Record<string, string> = {
        js: "javascript", ts: "typescript", py: "python", rb: "ruby",
        c: "c", cpp: "cpp", h: "c", java: "java", go: "go", rs: "rust",
        lisp: "lisp", scm: "scheme", el: "elisp", bas: "basic",
        asm: "assembly", s: "assembly", pl: "perl", php: "php",
        sh: "bash", txt: "", md: "", html: "html", css: "css",
        // Historical languages (punch card era)
        mad: "mad", for: "fortran", f: "fortran", f77: "fortran", f90: "fortran",
        ftn: "fortran", cob: "cobol", cbl: "cobol", pli: "pli", pl1: "pli",
        alg: "algol", sno: "snobol", apl: "apl", slip: "slip",
      };

      const language = languageMap[extension] || detectLanguage(text);

      // Add code metadata to session
      addCode({
        name: file.name,
        language: language || undefined,
        source: "upload",
        size: text.length,
      });

      // Add message with the code content
      addMessage({
        role: "user",
        content: `Here's the code I'd like to analyse:\n\n**${file.name}**${language ? ` (${language})` : ""}\n\n\`\`\`${language || ""}\n${text}\n\`\`\``,
      });
    } catch (error) {
      console.error("File read error:", error);
      setUploadError(error instanceof Error ? error.message : "Failed to read file");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Handle text file upload - for CCS, treat as code or documentation to analyze
  const handleTextFileUpload = async (file: File, _fileBase64: string, fileName: string, _fileType: string) => {
    try {
      const text = await file.text();

      // Add as code (text file could be historical code or documentation)
      addCode({
        name: fileName,
        source: "upload",
        size: text.length,
      });

      // Add message with the text content
      addMessage({
        role: "user",
        content: `Here's the text I'd like to analyse:\n\n**${fileName}**\n\n\`\`\`\n${text}\n\`\`\``,
      });
    } catch (error) {
      console.error("Text file read error:", error);
      setUploadError(error instanceof Error ? error.message : "Failed to read text file");
    }
  };

  const handleSearchLiterature = () => {
    // Start with empty search box - suggestions will be shown in the modal
    setSearchQuery("");
    setShowSearchModal(true);
  };

  // Generate suggested search terms based on context
  const getSuggestedSearchTerms = (): string[] => {
    const suggestions: string[] = [];

    // Add suggestions from code files
    if (session.codeFiles.length > 0) {
      const code = session.codeFiles[0];
      if (code.name) suggestions.push(code.name.replace(/\.[^.]+$/, "")); // filename without extension
      if (code.language) suggestions.push(`${code.language} programming history`);
      if (code.author) suggestions.push(code.author);
      if (code.platform) suggestions.push(code.platform);
    }

    // Add suggestions based on mode
    if (session.mode === "archaeology") {
      suggestions.push("computing history");
    }

    // Extract key terms from recent messages
    const recentContent = session.messages
      .filter(m => m.role === "user")
      .slice(-2)
      .map(m => m.content)
      .join(" ");

    // Look for quoted terms or capitalized proper nouns
    const quotedTerms = recentContent.match(/"([^"]+)"/g);
    if (quotedTerms) {
      suggestions.push(...quotedTerms.map(t => t.replace(/"/g, "")));
    }

    // Return unique, non-empty suggestions
    return [...new Set(suggestions.filter(s => s && s.length > 2))].slice(0, 4);
  };

  const executeSearchLiterature = async (query: string) => {
    if (!query.trim()) return;

    setIsSearchingLiterature(true);
    setShowSearchModal(false);

    try {
      const response = await fetch("/api/literature", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getRequestHeaders() },
        body: JSON.stringify({
          query: query.trim(),
          limit: 5,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited - show user-friendly message with retry suggestion
          addMessage({
            role: "assistant",
            content: "The literature search API is rate limited (max 1 request per second). Please wait a few seconds and try your search again. This helps ensure fair access for all users.",
          });
          return;
        }
        throw new Error(data.message || "Failed to search literature");
      }

      if (data.references && data.references.length > 0) {
        addReferences(data.references);

        // Format references for the message
        const formatRef = (r: ReferenceResult) =>
          `- **${r.title}** (${r.authors.slice(0, 2).join(", ")}${r.authors.length > 2 ? " et al." : ""}${r.year ? `, ${r.year}` : ""})${r.repository ? ` [${r.repository}]` : ""}${r.relevanceScore ? ` (${r.relevanceScore.toLocaleString()} citations)` : ""}`;

        const refsList = data.references.map(formatRef).join("\n");

        // Build the message content
        const content = `I found ${data.references.length} relevant references for "${query}":\n\n${refsList}\n\nThese references may provide context for your critical code studies analysis. **Which of these seems most relevant to your interpretation?**`;

        addMessage({
          role: "assistant",
          content,
          metadata: { phase: "context", literatureQueried: true },
        });
      } else {
        // No references found
        addMessage({
          role: "assistant",
          content: `I couldn't find references matching "${query}". Try adjusting your search terms or being more specific about the topic. For historical code, try including the era, author name, or platform.`,
        });
      }
    } catch (error) {
      console.error("Literature search error:", error);
      const isNetworkError = error instanceof TypeError && error.message.includes('fetch');
      addMessage({
        role: "assistant",
        content: isNetworkError
          ? "Unable to connect to the server. Please check your internet connection and try again."
          : (error instanceof Error ? error.message : "I encountered an error searching the literature. Please try again in a moment."),
      });
    } finally {
      setIsSearchingLiterature(false);
    }
  };

  const handleGenerateOutput = () => {
    setShowOutputModal(true);
    setGeneratedOutput(null);
  };

  const executeGenerateOutput = async (outputType: "annotation" | "critique" | "reading") => {
    setIsGenerating(true);
    setSelectedOutputType(outputType);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getRequestHeaders() },
        body: JSON.stringify({
          outputType,
          messages: session.messages,
          references: session.references,
          analysisResults: session.analysisResults,
          experienceLevel: session.experienceLevel,
          // Include annotations for archaeology and interpret modes
          codeContext: (session.mode === "archaeology" || session.mode === "interpret")
            ? buildAnnotatedCodeContext()
            : session.codeFiles,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to generate output");
      }

      setGeneratedOutput({
        content: data.content,
        type: outputType,
      });

      // Calculate version number based on existing artifacts of this type
      const existingOfType = session.critiqueArtifacts.filter(a => a.type === outputType);
      const nextVersion = existingOfType.length + 1;

      // Also add as an artifact to the session
      addArtifact({
        type: outputType,
        content: data.content,
        version: nextVersion,
      });
    } catch (error) {
      console.error("Generate output error:", error);
      setGeneratedOutput({
        content: "Failed to generate output. Please try again.",
        type: "error",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Could add a toast notification here
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  // Save session with .ccs extension and mode code
  const handleSaveSession = useCallback(() => {
    // Open save modal instead of native prompt
    setSaveModalName(projectName || "Untitled");
    setShowSaveModal(true);
  }, [projectName]);

  // Confirm save from modal
  const handleConfirmSave = useCallback(() => {
    const name = saveModalName.trim();
    if (!name) return;

    // Update project name state
    setProjectName(name);

    const exportData = {
      ...session,
      projectName: name,
      exportedAt: new Date().toISOString(),
      version: "1.1",
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Sanitize filename and add mode code with .ccs extension
    const safeFileName = name.replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "-").toLowerCase();
    const modeCode = MODE_CODES[session.mode] || "XX";
    a.download = `${safeFileName}-${modeCode}.ccs`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Close modal
    setShowSaveModal(false);
  }, [session, saveModalName, MODE_CODES]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + S - Save project
      if (isMod && e.key === 's') {
        e.preventDefault();
        if (session.mode === 'critique') {
          setTriggerCritiqueSave(true);
        } else {
          handleSaveSession();
        }
        return;
      }

      // Cmd/Ctrl + O - Open/Load project
      if (isMod && e.key === 'o') {
        e.preventDefault();
        sessionLoadInputRef.current?.click();
        return;
      }

      // Cmd/Ctrl + E - Export
      if (isMod && e.key === 'e') {
        e.preventDefault();
        setShowExportModal(true);
        return;
      }

      // Cmd/Ctrl + / - Focus input
      if (isMod && e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }

      // Cmd/Ctrl + - - Decrease font size
      if (isMod && e.key === '-') {
        e.preventDefault();
        if (chatFontSize > FONT_SIZE_MIN) {
          setModeChatFontSize(currentMode, chatFontSize - 1);
        }
        return;
      }

      // Cmd/Ctrl + = or + - Increase font size
      if (isMod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        if (chatFontSize < FONT_SIZE_MAX) {
          setModeChatFontSize(currentMode, chatFontSize + 1);
        }
        return;
      }

      // Cmd/Ctrl + Shift + F - Toggle chat search
      if (isMod && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        setShowChatSearch(prev => !prev);
        if (!showChatSearch) {
          setTimeout(() => chatSearchInputRef.current?.focus(), 50);
        } else {
          setChatSearchQuery("");
        }
        return;
      }

      // Escape - Close popovers/modals
      if (e.key === 'Escape') {
        setShowFontSizePopover(false);
        setShowGuidedPrompts(false);
        setShowContextPreview(false);
        setShowExperienceHelp(false);
        setShowChatSearch(false);
        setChatSearchQuery("");
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [session.mode, handleSaveSession]);

  // Load session with mode validation
  const handleLoadSession = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedData = JSON.parse(content);

        // Validate required fields
        if (!importedData.id || !importedData.mode) {
          throw new Error("Invalid session file format");
        }

        // Check if mode matches current mode
        if (importedData.mode !== session.mode) {
          const importedModeCode = MODE_CODES[importedData.mode] || "XX";
          const currentModeCode = MODE_CODES[session.mode] || "XX";
          const importedModeLabel = MODE_LABELS[importedModeCode] || importedData.mode;
          const currentModeLabel = MODE_LABELS[currentModeCode] || session.mode;

          alert(`Cannot load this file. It was saved in ${importedModeLabel} mode (-${importedModeCode}) but you are currently in ${currentModeLabel} mode (-${currentModeCode}). Please switch to ${importedModeLabel} mode from the home page to load this file.`);
          return;
        }

        // Import the session
        importSession(importedData);

        // Restore project name if present
        if (importedData.projectName) {
          setProjectName(importedData.projectName);
        }

        // Restore favourite messages from session
        const favourites = new Set<string>(
          importedData.messages?.filter((m: { isFavourite?: boolean }) => m.isFavourite).map((m: { id: string }) => m.id) || []
        );
        setFavouriteMessages(favourites);

        // Add welcome message
        addMessage({
          role: "assistant",
          content: `Session "${importedData.projectName || "Untitled"}" restored from ${importedData.exportedAt ? new Date(importedData.exportedAt).toLocaleDateString() : "file"}. ${importedData.messages?.length || 0} messages loaded.`,
        });
      } catch (error) {
        console.error("Load error:", error);
        alert("Failed to load session. Please check the file format.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }, [importSession, addMessage, session.mode, MODE_CODES, MODE_LABELS]);

  const handleExportConversation = () => {
    const exportData = {
      ...session,
      projectName,
      exportedAt: new Date().toISOString(),
      version: "1.1",
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Use .ccs extension with mode code
    const safeFileName = (projectName || "session").replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "-").toLowerCase();
    const modeCode = MODE_CODES[session.mode] || "XX";
    a.download = `${safeFileName}-${modeCode}.ccs`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportModal(false);
    setSuccessMessage("Session exported successfully!");
  };

  const handleExportOutputsOnly = () => {
    const exportData = {
      critiqueArtifacts: session.critiqueArtifacts,
      exportedAt: new Date().toISOString(),
      version: "1.0",
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ccs-wb-critiques-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportModal(false);
    setSuccessMessage("Outputs exported successfully!");
  };

  const handleExportOutputsPDF = () => {
    if (session.critiqueArtifacts.length === 0) return;

    // Create a new PDF document
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
      yPos += 2; // Add spacing after paragraph
    };

    // Helper function to add a section divider
    const addSectionDivider = () => {
      yPos += 5;
      if (yPos > pageHeight - margin - 10) {
        doc.addPage();
        yPos = margin;
      }
    };

    // Title - Editorial burgundy
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(124, 45, 54); // Burgundy
    doc.text("CCS-WB", margin, yPos);
    yPos += 12;

    // Subtitle
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("Generated Critiques", margin, yPos);
    yPos += 8;

    // Export metadata
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text(`Exported: ${new Date().toLocaleString()}`, margin, yPos);
    yPos += 10;

    // Reset text color
    doc.setTextColor(0, 0, 0);

    // Add each generated output
    for (const artifact of session.critiqueArtifacts) {
      addSectionDivider();

      // Output type header
      const typeLabel = artifact.type === "annotation" ? "Code Annotation" :
        artifact.type === "critique" ? "Code Critique" :
          artifact.type === "reading" ? "Close Reading" : artifact.type;

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(124, 45, 54); // Burgundy
      doc.text(`${typeLabel} (v${artifact.version})`, margin, yPos);
      yPos += 8;
      doc.setTextColor(0, 0, 0);

      // Output content
      addWrappedText(artifact.content, 11);
      addSectionDivider();
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

    // Save the PDF
    doc.save(`ccs-wb-critiques-${new Date().toISOString().slice(0, 10)}.pdf`);
    setShowExportModal(false);
    setSuccessMessage("Outputs PDF exported successfully!");
  };

  const handleExportPDF = () => {
    // Create a new PDF document
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
      yPos += 2; // Add spacing after paragraph
    };

    // Helper function to add a section divider
    const addSectionDivider = () => {
      yPos += 5;
      if (yPos > pageHeight - margin - 10) {
        doc.addPage();
        yPos = margin;
      }
    };

    // Title - Editorial burgundy
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(124, 45, 54); // Burgundy
    doc.text(APP_NAME, margin, yPos);
    yPos += 8;

    // Version info
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`App v${APP_VERSION} · CCS Methodology v${CCS_SKILL_VERSION}`, margin, yPos);
    yPos += 8;

    // Session metadata
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text(`Exported: ${new Date().toLocaleString()}`, margin, yPos);
    yPos += 5;
    if (session.experienceLevel) {
      doc.text(`Experience: ${EXPERIENCE_LEVEL_LABELS[session.experienceLevel as ExperienceLevel] || session.experienceLevel}`, margin, yPos);
      yPos += 5;
    }
    doc.text(`Mode: ${session.mode === 'critique' ? 'Code Critique' : session.mode === 'archaeology' ? 'Code Archaeology' : session.mode === 'create' ? 'Code Creation' : "Hermeneutic Exploration"}`, margin, yPos);
    yPos += 10;

    // Reset text color
    doc.setTextColor(0, 0, 0);

    // Add generated outputs if any
    if (session.critiqueArtifacts.length > 0) {
      addSectionDivider();
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(124, 45, 54); // Burgundy
      doc.text("Generated Outputs", margin, yPos);
      yPos += 10;
      doc.setTextColor(0, 0, 0);

      for (const artifact of session.critiqueArtifacts) {
        // Output type header
        const typeLabel = artifact.type === "annotation" ? "Code Annotation" :
          artifact.type === "critique" ? "Code Critique" :
            "Close Reading";

        addWrappedText(`${typeLabel} (v${artifact.version})`, 14, true);
        yPos += 2;

        // Output content
        addWrappedText(artifact.content, 11);
        addSectionDivider();
      }
    }

    // Add references if any
    if (session.references.length > 0) {
      addSectionDivider();
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(124, 45, 54); // Burgundy
      doc.text("References", margin, yPos);
      yPos += 10;
      doc.setTextColor(0, 0, 0);

      for (const ref of session.references) {
        addWrappedText(`• ${ref.title}`, 11, true);
        addWrappedText(`  ${ref.authors.join(", ")}${ref.year ? ` (${ref.year})` : ""}`, 10);
        if (ref.repository) {
          doc.setTextColor(100, 100, 100);
          addWrappedText(`  Source: ${ref.repository}`, 9);
          doc.setTextColor(0, 0, 0);
        }
        yPos += 2;
      }
    }

    // Add conversation summary
    if (session.messages.length > 1) {
      addSectionDivider();
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(124, 45, 54); // Burgundy
      doc.text("Conversation Summary", margin, yPos);
      yPos += 10;
      doc.setTextColor(0, 0, 0);

      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`${session.messages.length} messages exchanged`, margin, yPos);
      yPos += 8;
      doc.setTextColor(0, 0, 0);

      // Add key user messages (filter to user role only, limit to prevent huge PDFs)
      const userMessages = session.messages.filter(m => m.role === 'user').slice(0, 10);
      for (const msg of userMessages) {
        addWrappedText(`You: ${msg.content.substring(0, 300)}${msg.content.length > 300 ? '...' : ''}`, 10);
        yPos += 3;
      }
    }

    // Footer on last page
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

    // Save the PDF
    doc.save(`ccs-wb-session-${new Date().toISOString().slice(0, 10)}.pdf`);
    setShowExportModal(false);
    setSuccessMessage("PDF exported successfully!");
  };

  // Export handlers using shared utilities
  const handleExportSessionLogJSON = useCallback(() => {
    const log = generateSessionLog(session, projectName, undefined, undefined, profile);
    const modeCode = MODE_CODES[session.mode] || "XX";
    exportSessionLogJSON(log, projectName, modeCode);
    setShowExportModal(false);
    setSuccessMessage("Session log exported as JSON!");
  }, [session, projectName, profile]);

  const handleExportSessionLogText = useCallback(() => {
    const log = generateSessionLog(session, projectName, undefined, undefined, profile);
    const modeCode = MODE_CODES[session.mode] || "XX";
    exportSessionLogText(log, projectName, modeCode);
    setShowExportModal(false);
    setSuccessMessage("Session log exported as text!");
  }, [session, projectName, profile]);

  const handleExportSessionLogPDF = useCallback(() => {
    const log = generateSessionLog(session, projectName, undefined, undefined, profile);
    const modeCode = MODE_CODES[session.mode] || "XX";
    const annotationIndent = session.displaySettings?.annotations?.indent ?? 56;  // Use user's indent setting
    exportSessionLogPDF(log, projectName, modeCode, annotationIndent);
    setShowExportModal(false);
    setSuccessMessage("Session log exported as PDF!");
  }, [session, projectName, profile]);

  // Critique, archaeology, and interpret modes use CritiqueLayout (IDE-style interface)
  // Create mode uses conversational chat UI
  if (session.mode === "critique" || session.mode === "archaeology" || session.mode === "interpret") {
    return (
      <>
        <CritiqueLayout
          ref={critiqueLayoutRef}
          onNavigateHome={handleNavigateHome}
          triggerSave={triggerCritiqueSave}
          onSaveTriggered={() => setTriggerCritiqueSave(false)}
        />
        {/* Unsaved Changes Warning Modal */}
        {showUnsavedWarning && (
          <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
            <div className="bg-popover rounded-sm shadow-editorial-lg p-6 w-full max-w-md mx-4 border border-parchment modal-content">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-display-md text-ink">Unsaved Changes</h3>
                <button
                  onClick={() => setShowUnsavedWarning(false)}
                  className="text-slate-muted hover:text-ink transition-colors"
                >
                  <X className="h-5 w-5" strokeWidth={1.5} />
                </button>
              </div>
              <p className="font-body text-body-sm text-slate mb-6">
                You have unsaved work{critiqueLayoutRef.current?.getProjectName() ? ` in "${critiqueLayoutRef.current.getProjectName()}"` : ""}. Would you like to save before leaving?
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setShowUnsavedWarning(false);
                    // Trigger save via prop (more reliable than ref)
                    setTriggerCritiqueSave(true);
                  }}
                  className="w-full btn-editorial-primary py-3"
                >
                  Save First
                </button>
                <button
                  onClick={() => {
                    setShowUnsavedWarning(false);
                    router.push('/');
                  }}
                  className="w-full btn-editorial bg-gold text-ink border-gold hover:bg-gold-light py-3"
                >
                  Leave Without Saving
                </button>
                <button
                  onClick={() => setShowUnsavedWarning(false)}
                  className="w-full btn-editorial-ghost py-3"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Create mode: Chat-based conversational interface for generative coding
  return (
    <div className="h-screen flex flex-col bg-parchment overflow-hidden">
      {/* Header */}
      <header className="shrink-0 bg-ink text-parchment px-6 py-4 border-b border-slate/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleNavigateHome}
              className="text-gold-light hover:text-gold transition-colors"
              aria-label="Go home"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </button>
            <div>
              <h1 className="font-display text-display-sm">
                {projectName || "Untitled Project"}
              </h1>
              <p className="font-body text-body-xs text-slate-muted">
                Create Mode - Generative Coding
                {session.createState?.language && ` · ${session.createState.language}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language selector */}
            <div className="relative" data-dropdown>
              <button
                onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                className="btn-editorial-ghost text-xs px-3 py-1.5"
              >
                <Code className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
                {session.createState?.language || "Python"}
              </button>
              {showLanguageDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-popover rounded-sm shadow-editorial border border-parchment z-50">
                  <div className="p-2 max-h-64 overflow-y-auto">
                    {CREATE_LANGUAGES.map((lang) => (
                      <button
                        key={lang}
                        onClick={() => {
                          setCreateLanguage(lang);
                          setShowLanguageDropdown(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded font-body text-body-sm transition-colors",
                          session.createState?.language === lang
                            ? "bg-gold-light text-ink"
                            : "text-slate hover:bg-parchment"
                        )}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Save button */}
            <button
              onClick={handleSaveSession}
              className="btn-editorial-primary text-xs px-3 py-1.5"
              title="Save session (Cmd/Ctrl + S)"
            >
              <Save className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
              Save
            </button>

            {/* Settings */}
            <button
              onClick={() => {
                setSettingsTab("ai");
                setShowSettingsModal(true);
              }}
              className="btn-editorial-ghost text-xs px-3 py-1.5"
            >
              <Settings className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content: Split view on desktop, single column on mobile */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-3xl mx-auto space-y-6">
              {session.messages.map((message, index) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-4",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-sm p-4",
                      message.role === "user"
                        ? "bg-gold-light text-ink ml-auto"
                        : "bg-white text-slate border border-parchment"
                    )}
                    style={{ fontSize: `${chatFontSize}px` }}
                  >
                    <div className="font-body whitespace-pre-wrap leading-relaxed prose prose-sm max-w-none">
                      {message.content}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-muted">
                      <span>{formatTimestamp(message.timestamp)}</span>
                      <button
                        onClick={() => handleCopyMessage(message.id, message.content)}
                        className="hover:text-ink transition-colors"
                        title="Copy message"
                      >
                        {copiedMessageId === message.id ? (
                          <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                        ) : (
                          <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white text-slate border border-parchment rounded-sm p-4">
                    <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input area */}
          <div className="shrink-0 border-t border-parchment bg-white">
            <div className="max-w-3xl mx-auto p-4">
              <div className={cn(
                "bg-parchment rounded-lg border border-slate/20",
                !isAiReady && "opacity-50"
              )}>
                {/* Textarea */}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={!isAiReady ? "AI assistant not configured. Check settings to start chatting..." : "Describe what you'd like to create..."}
                  disabled={!isAiReady || isLoading}
                  className={cn(
                    "w-full resize-none rounded-t-lg px-4 py-3 font-body bg-transparent focus:outline-none placeholder:text-slate-muted overflow-hidden",
                    !isAiReady && "cursor-not-allowed"
                  )}
                  style={{ fontSize: `${chatFontSize}px`, minHeight: '44px' }}
                  rows={1}
                />

                {/* Bottom toolbar */}
                <div className="flex items-center justify-between px-3 pb-2">
                  {/* Left side icons */}
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => setShowCodeInput(true)}
                      className="p-1.5 text-slate hover:text-ink rounded-md transition-colors"
                      title="Add code"
                    >
                      <Code className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={handleUpload}
                      disabled={isUploading}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        isUploading
                          ? "text-slate-muted cursor-not-allowed"
                          : "text-slate hover:text-ink"
                      )}
                      title={isUploading ? "Uploading..." : "Load code from file"}
                    >
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" strokeWidth={1.5} />
                      )}
                    </button>
                    <button
                      onClick={handleSearchLiterature}
                      disabled={isSearchingLiterature}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        isSearchingLiterature
                          ? "text-slate-muted cursor-not-allowed"
                          : "text-slate hover:text-ink"
                      )}
                      title={isSearchingLiterature ? "Searching..." : "Search references"}
                    >
                      {isSearchingLiterature ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <BookOpen className="h-4 w-4" strokeWidth={1.5} />
                      )}
                    </button>
                    <button
                      onClick={handleGenerateOutput}
                      disabled={!isAiReady}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        isAiReady
                          ? "text-slate hover:text-ink"
                          : "text-slate-muted cursor-not-allowed"
                      )}
                      title={isAiReady ? "Generate output" : "AI not ready"}
                    >
                      <FileOutput className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </div>

                  {/* Right side - Send button */}
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading || !isAiReady}
                    className={cn(
                      "px-3 py-1 rounded-md transition-colors text-sm font-medium",
                      (!input.trim() || isLoading || !isAiReady)
                        ? "bg-slate/10 text-slate-muted cursor-not-allowed"
                        : "bg-gold text-ink hover:bg-gold-light"
                    )}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" strokeWidth={1.5} />
                    )}
                  </button>
                </div>
              </div>

              {!isAiReady && (
                <p className="mt-2 text-xs text-slate-muted font-body text-center">
                  AI provider not configured. You can still add code and search references.{" "}
                  <button
                    onClick={() => {
                      setSettingsTab("ai");
                      setShowSettingsModal(true);
                    }}
                    className="text-gold hover:text-gold-light underline"
                  >
                    Open Settings
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Context panel (desktop only) */}
        {!isMobile && (
          <div className="w-80 border-l border-parchment bg-white overflow-y-auto">
            <div className="p-4">
              <h3 className="font-display text-display-xs text-ink mb-4">
                Context
              </h3>

              {/* Code files */}
              {session.codeFiles.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-body text-body-sm font-medium text-slate mb-2">
                    Generated Code ({session.codeFiles.length})
                  </h4>
                  <div className="space-y-2">
                    {session.codeFiles.map((file) => (
                      <div
                        key={file.id}
                        className="p-3 bg-parchment rounded-sm border border-slate/10"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-body text-body-sm font-medium text-ink truncate">
                              {file.name}
                            </p>
                            {file.language && (
                              <p className="font-body text-body-xs text-slate-muted mt-0.5">
                                {file.language}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload/Add code */}
              <div className="space-y-2">
                <button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="w-full btn-editorial-ghost text-sm py-2"
                >
                  <Upload className="h-4 w-4 mr-2" strokeWidth={1.5} />
                  Upload Code File
                </button>
                <button
                  onClick={() => setShowCodeInput(true)}
                  className="w-full btn-editorial-ghost text-sm py-2"
                >
                  <Code className="h-4 w-4 mr-2" strokeWidth={1.5} />
                  Paste Code
                </button>
              </div>

              {/* References */}
              {session.references.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-body text-body-sm font-medium text-slate mb-2">
                    References ({session.references.length})
                  </h4>
                  <div className="space-y-2">
                    {session.references.map((ref) => (
                      <button
                        key={ref.id}
                        onClick={() => setSelectedRefDetails(ref)}
                        className="w-full text-left p-3 bg-parchment rounded-sm border border-slate/10 hover:border-gold transition-colors"
                      >
                        <p className="font-body text-body-xs font-medium text-ink line-clamp-2">
                          {ref.title}
                        </p>
                        <p className="font-body text-body-xs text-slate-muted mt-1">
                          {ref.authors.slice(0, 2).join(", ")}
                          {ref.authors.length > 2 && " et al."}
                          {ref.year && ` (${ref.year})`}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Reference search modal */}
      {showSearchModal && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setShowSearchModal(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-editorial-lg p-4 w-full max-w-sm mx-4 border border-parchment modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-sm text-ink mb-2">Find References</h3>
            <p className="font-body text-[11px] text-slate mb-3">
              Search for related scholarship, code repositories, or historical software archives.
            </p>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchQuery.trim()) {
                  executeSearchLiterature(searchQuery);
                }
              }}
              placeholder="e.g., critical code studies, ELIZA, game programming"
              className="w-full px-3 py-2 font-body text-[12px] bg-card border border-parchment rounded-sm focus:outline-none focus:border-gold/50 text-foreground placeholder:text-slate-muted mb-3"
              autoFocus
            />

            {/* Suggested search terms based on context */}
            {(() => {
              const suggestions = getSuggestedSearchTerms();
              if (suggestions.length > 0) {
                return (
                  <div className="mb-3">
                    <p className="font-sans text-[9px] uppercase tracking-widest text-slate-muted mb-1.5">
                      Suggested searches
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((term, i) => (
                        <button
                          key={i}
                          onClick={() => setSearchQuery(term)}
                          className="px-2 py-0.5 text-[10px] font-sans bg-parchment border border-slate/20 rounded-sm hover:border-gold hover:text-ink transition-colors"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSearchModal(false)}
                className="btn-editorial-ghost text-[11px] px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={() => executeSearchLiterature(searchQuery)}
                disabled={!searchQuery.trim()}
                className={cn(
                  "text-[11px] px-3 py-1.5 rounded-sm",
                  searchQuery.trim()
                    ? "btn-editorial-primary"
                    : "bg-parchment text-slate-muted cursor-not-allowed"
                )}
              >
                Search
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Output generation modal */}
      {showOutputModal && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setShowOutputModal(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-editorial-lg w-full max-w-xl mx-4 max-h-[90vh] flex flex-col border border-parchment modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="p-4 border-b border-parchment">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm text-ink">Generate Critique</h3>
                <button
                  onClick={() => setShowOutputModal(false)}
                  className="text-slate-muted hover:text-ink transition-colors"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
              {!generatedOutput && (
                <p className="font-body text-[11px] text-slate mt-1.5">
                  Choose the type of critical output you&apos;d like to generate from your analysis.
                </p>
              )}
            </div>

            {/* Modal content */}
            <div className="flex-1 overflow-y-auto p-4">
              {!generatedOutput && !isGenerating && (
                <div className="grid gap-2">
                  {/* Code Annotation option */}
                  <button
                    onClick={() => executeGenerateOutput("annotation")}
                    className="text-left p-3 border border-parchment rounded-sm hover:border-gold hover:bg-gold/5 transition-all duration-300"
                  >
                    <h4 className="font-display text-caption text-ink mb-0.5">Code Annotation</h4>
                    <p className="font-body text-[10px] text-slate">
                      Line-by-line annotations exploring lexical choices, naming conventions, and structural decisions.
                    </p>
                  </button>

                  {/* Code Critique option */}
                  <button
                    onClick={() => executeGenerateOutput("critique")}
                    className="text-left p-3 border border-parchment rounded-sm hover:border-gold hover:bg-gold/5 transition-all duration-300"
                  >
                    <h4 className="font-display text-caption text-ink mb-0.5">Code Critique</h4>
                    <p className="font-body text-[10px] text-slate">
                      A structured critical analysis following the triadic hermeneutic framework (intention, generation, execution).
                    </p>
                  </button>

                  {/* Close Reading option */}
                  <button
                    onClick={() => executeGenerateOutput("reading")}
                    className="text-left p-3 border border-parchment rounded-sm hover:border-gold hover:bg-gold/5 transition-all duration-300"
                  >
                    <h4 className="font-display text-caption text-ink mb-0.5">Close Reading</h4>
                    <p className="font-body text-[10px] text-slate">
                      A comprehensive interpretive essay situating the code within its cultural, historical, and technical contexts.
                    </p>
                  </button>
                </div>
              )}

              {isGenerating && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 text-gold animate-spin mb-3" />
                  <p className="font-body text-[11px] text-slate">Generating your {selectedOutputType === "annotation" ? "code annotation" : selectedOutputType === "critique" ? "code critique" : "close reading"}...</p>
                </div>
              )}

              {generatedOutput && !isGenerating && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-display text-caption text-ink">
                      {generatedOutput.type === "annotation" ? "Code Annotation" :
                        generatedOutput.type === "critique" ? "Code Critique" :
                          generatedOutput.type === "reading" ? "Close Reading" : "Output"}
                    </h4>
                    <button
                      onClick={() => copyToClipboard(generatedOutput.content)}
                      className="font-sans text-[10px] text-gold hover:text-gold-light transition-colors"
                    >
                      Copy to clipboard
                    </button>
                  </div>
                  <div className="prose prose-sm max-w-none bg-parchment rounded-sm p-4 border border-slate/10 whitespace-pre-wrap text-[11px]">
                    {generatedOutput.content}
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="p-4 border-t border-parchment flex justify-between">
              {generatedOutput && !isGenerating ? (
                <>
                  <button
                    onClick={() => setGeneratedOutput(null)}
                    className="btn-editorial-ghost text-[11px] px-3 py-1.5"
                  >
                    Generate Another
                  </button>
                  <button
                    onClick={() => setShowOutputModal(false)}
                    className="btn-editorial-primary text-[11px] px-3 py-1.5"
                  >
                    Done
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowOutputModal(false)}
                  className="btn-editorial-ghost text-[11px] px-3 py-1.5 ml-auto"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* File upload input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        className="hidden"
        accept=".txt,.py,.js,.ts,.java,.c,.cpp,.h,.rb,.go,.rs,.md,.html,.css,.json,.xml,.bas,.asm,.lisp,.scm"
      />

      {/* Session load input */}
      <input
        ref={sessionLoadInputRef}
        type="file"
        onChange={handleLoadSession}
        className="hidden"
        accept=".ccs,.json"
      />

      {/* Code input modal */}
      {showCodeInput && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4">
          <div className="bg-popover rounded-sm shadow-editorial-lg p-6 w-full max-w-2xl border border-parchment">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-display-md text-ink">Paste Code</h3>
              <button
                onClick={() => setShowCodeInput(false)}
                className="text-slate-muted hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block font-body text-body-sm text-slate mb-2">
                  File name
                </label>
                <input
                  type="text"
                  value={codeInputName}
                  onChange={(e) => setCodeInputName(e.target.value)}
                  placeholder="e.g., my-algorithm.py"
                  className="w-full font-body text-body-md bg-parchment text-ink border border-slate/20 rounded-sm px-4 py-2 focus:outline-none focus:ring-1 focus:ring-gold"
                />
              </div>
              <div>
                <label className="block font-body text-body-sm text-slate mb-2">
                  Language (optional)
                </label>
                <input
                  type="text"
                  value={codeInputLanguage}
                  onChange={(e) => setCodeInputLanguage(e.target.value)}
                  placeholder="e.g., python, javascript"
                  className="w-full font-body text-body-md bg-parchment text-ink border border-slate/20 rounded-sm px-4 py-2 focus:outline-none focus:ring-1 focus:ring-gold"
                />
              </div>
              <div>
                <label className="block font-body text-body-sm text-slate mb-2">
                  Code
                </label>
                <textarea
                  value={codeInputText}
                  onChange={(e) => setCodeInputText(e.target.value)}
                  placeholder="Paste your code here..."
                  className="w-full h-64 font-mono text-sm bg-parchment text-ink border border-slate/20 rounded-sm px-4 py-3 focus:outline-none focus:ring-1 focus:ring-gold resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleCodeSubmit}
                  className="flex-1 btn-editorial-primary py-2"
                >
                  Add Code
                </button>
                <button
                  onClick={() => setShowCodeInput(false)}
                  className="flex-1 btn-editorial-ghost py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          initialTab={settingsTab}
        />
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4">
          <div className="bg-popover rounded-sm shadow-editorial-lg p-6 w-full max-w-md border border-parchment">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-display-md text-ink">Save Session</h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-slate-muted hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block font-body text-body-sm text-slate mb-2">
                  Project name
                </label>
                <input
                  type="text"
                  value={saveModalName}
                  onChange={(e) => setSaveModalName(e.target.value)}
                  placeholder="e.g., My Algorithm Implementation"
                  className="w-full font-body text-body-md bg-parchment text-ink border border-slate/20 rounded-sm px-4 py-2 focus:outline-none focus:ring-1 focus:ring-gold"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleConfirmSave}
                  disabled={!saveModalName.trim()}
                  className="flex-1 btn-editorial-primary py-2"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="flex-1 btn-editorial-ghost py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success message */}
      {successMessage && (
        <div className="fixed bottom-4 right-4 bg-gold text-ink px-4 py-3 rounded-sm shadow-editorial border border-gold-light z-50">
          <p className="font-body text-body-sm">{successMessage}</p>
        </div>
      )}

      {/* Reference details modal */}
      {selectedRefDetails && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4">
          <div className="bg-popover rounded-sm shadow-editorial-lg p-6 w-full max-w-2xl border border-parchment max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-display-md text-ink">Reference Details</h3>
              <button
                onClick={() => setSelectedRefDetails(null)}
                className="text-slate-muted hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="font-body text-body-sm font-medium text-slate mb-1">Title</h4>
                <p className="font-body text-body-md text-ink">{selectedRefDetails.title}</p>
              </div>
              <div>
                <h4 className="font-body text-body-sm font-medium text-slate mb-1">Authors</h4>
                <p className="font-body text-body-md text-ink">{selectedRefDetails.authors.join(", ")}</p>
              </div>
              {selectedRefDetails.year && (
                <div>
                  <h4 className="font-body text-body-sm font-medium text-slate mb-1">Year</h4>
                  <p className="font-body text-body-md text-ink">{selectedRefDetails.year}</p>
                </div>
              )}
              {selectedRefDetails.repository && (
                <div>
                  <h4 className="font-body text-body-sm font-medium text-slate mb-1">Source</h4>
                  <p className="font-body text-body-md text-ink">{selectedRefDetails.repository}</p>
                </div>
              )}
              {selectedRefDetails.description && (
                <div>
                  <h4 className="font-body text-body-sm font-medium text-slate mb-1">Description</h4>
                  <p className="font-body text-body-sm text-slate">{selectedRefDetails.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

