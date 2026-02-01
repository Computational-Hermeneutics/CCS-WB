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

  // Use the new IDE-style layout for critique mode
  if (session.mode === "critique") {
    return (
      <>
        <CritiqueLayout
          ref={critiqueLayoutRef}
          onNavigateHome={handleNavigateHome}
          triggerSave={triggerCritiqueSave}
          onSaveTriggered={() => setTriggerCritiqueSave(false)}
        />
        {/* Unsaved Changes Warning Modal for Critique Mode */}
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

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Success Toast - Editorial style */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div className="bg-cream border border-parchment-dark text-ink px-5 py-3 rounded-sm shadow-editorial-md flex items-center gap-3">
            <svg className="w-5 h-5 text-burgundy" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="font-body text-body-sm">{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-slate-muted hover:text-ink transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header - Matching CritiqueLayout toolbar style */}
      <header className="border-b border-parchment bg-background px-4 py-1 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={handleNavigateHome}
            className={cn(
              "font-display text-sm transition-colors",
              isAlphaVersion
                ? "text-yellow-600 hover:text-yellow-700 dark:text-yellow-500 dark:hover:text-yellow-400"
                : "text-ink hover:text-burgundy"
            )}
            title={isAlphaVersion ? "Alpha Test Version" : undefined}
          >
            <span className="hidden sm:inline">CCS Workbench</span>
            <span className="sm:hidden">CCS-WB</span>
          </button>
          {/* Mode indicator - clickable to switch */}
          {session.mode && (
            <div className="relative" data-dropdown>
              <button
                onClick={() => setShowModeDropdown(!showModeDropdown)}
                className="font-sans text-[10px] text-slate hover:text-ink px-2 py-0.5 border border-parchment hover:border-slate-muted rounded-sm transition-colors flex items-center gap-1"
              >
                {session.mode.charAt(0).toUpperCase() + session.mode.slice(1)}
                <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", showModeDropdown && "rotate-180")} strokeWidth={1.5} />
              </button>
              {showModeDropdown && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-popover rounded-sm shadow-lg border border-parchment p-1 z-50">
                  {(["critique", "archaeology", "interpret", "create"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        if (mode !== session.mode) {
                          switchMode(mode);
                        }
                        setShowModeDropdown(false);
                      }}
                      className={cn(
                        "w-full text-left px-2 py-1.5 text-[11px] rounded-sm transition-colors flex items-center justify-between",
                        session.mode === mode ? "bg-burgundy/10 text-burgundy" : "text-ink hover:bg-cream"
                      )}
                    >
                      <span>{mode.charAt(0).toUpperCase() + mode.slice(1)} Mode</span>
                      {hasSavedSession(mode) && mode !== session.mode && (
                        <span className="text-[9px] text-slate-muted">(saved)</span>
                      )}
                    </button>
                  ))}
                  <div className="border-t border-parchment mt-1 pt-1">
                    <button
                      onClick={() => {
                        clearModeSession(session.mode);
                        setShowModeDropdown(false);
                      }}
                      className="w-full text-left px-2 py-1.5 text-[11px] text-slate-muted hover:text-error hover:bg-cream rounded-sm transition-colors"
                    >
                      Clear Current Session
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Experience level indicator - clickable to change */}
          {session.experienceLevel && (
            <div className="relative" data-dropdown>
              <button
                onClick={() => setShowExperienceHelp(!showExperienceHelp)}
                className="font-sans text-[10px] text-slate hover:text-ink px-2 py-0.5 border border-parchment hover:border-slate-muted rounded-sm transition-colors flex items-center gap-1"
              >
                {EXPERIENCE_LEVEL_LABELS[session.experienceLevel as ExperienceLevel]}
                <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", showExperienceHelp && "rotate-180")} strokeWidth={1.5} />
              </button>

              {/* Experience level dropdown */}
              {showExperienceHelp && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-popover rounded-sm shadow-lg border border-parchment p-1 z-50">
                  {(["learning", "practitioner", "research"] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => {
                        setExperienceLevel(level);
                        setShowExperienceHelp(false);
                        // Add a system message to notify the conversation
                        addMessage({
                          role: "system",
                          content: `[Experience level changed to ${EXPERIENCE_LEVEL_LABELS[level]}]`,
                        });
                      }}
                      className={cn(
                        "w-full text-left px-2 py-1.5 rounded-sm transition-colors",
                        session.experienceLevel === level ? "bg-burgundy/10" : "hover:bg-cream"
                      )}
                    >
                      <span className={cn("block text-[11px]", session.experienceLevel === level ? "text-burgundy" : "text-ink")}>
                        {EXPERIENCE_LEVEL_LABELS[level]}
                      </span>
                      <span className="block text-[9px] text-slate-muted mt-0.5">
                        {EXPERIENCE_LEVEL_DESCRIPTIONS[level]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Language indicator with dropdown */}
          <div className="relative" data-dropdown>
            <button
              onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
              className="font-sans text-[10px] text-slate hover:text-ink px-2 py-0.5 border border-parchment hover:border-slate-muted rounded-sm transition-colors flex items-center gap-1"
              title="Click to change language"
            >
              <Code className="h-3 w-3" strokeWidth={1.5} />
              <span>{languageName}</span>
              <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", showLanguageDropdown && "rotate-180")} strokeWidth={1.5} />
            </button>
            {showLanguageDropdown && (
              <div className="absolute top-full left-0 mt-1 w-44 bg-popover rounded-sm shadow-lg border border-parchment p-1 z-50 max-h-64 overflow-y-auto">
                {PROGRAMMING_LANGUAGES.map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => {
                      setLanguageOverride(lang.id || undefined);
                      setShowLanguageDropdown(false);
                    }}
                    className={cn(
                      "w-full text-left px-2 py-1.5 text-[11px] rounded-sm hover:bg-cream transition-colors",
                      effectiveLanguage === lang.id ? "bg-burgundy/10 text-burgundy" : "text-ink"
                    )}
                  >
                    {lang.name}
                  </button>
                ))}
                {session.languageOverride && (
                  <>
                    <div className="border-t border-parchment my-1" />
                    <button
                      onClick={() => {
                        setLanguageOverride(undefined);
                        setShowLanguageDropdown(false);
                      }}
                      className="w-full text-left px-2 py-1.5 text-[11px] text-slate-muted hover:text-burgundy rounded-sm transition-colors"
                    >
                      Reset to default
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center: Full filename with extension - click to rename */}
        <button
          onClick={() => {
            const newName = prompt("Rename project:", projectName || "Untitled");
            if (newName !== null && newName.trim()) {
              setProjectName(newName.trim());
            }
          }}
          className="absolute left-1/2 transform -translate-x-1/2 hover:bg-cream px-2 py-0.5 rounded-sm transition-colors"
          title="Click to rename"
        >
          {projectName ? (
            <span className="font-mono text-xs text-ink">
              {projectName.replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "-").toLowerCase()}-{MODE_CODES[session.mode] || "XX"}.ccs
            </span>
          ) : (
            <span className="font-mono text-xs text-slate-muted italic">
              untitled-{MODE_CODES[session.mode] || "XX"}.ccs
            </span>
          )}
        </button>

        <div className="relative flex items-center gap-1">
          {/* Hidden file input for loading */}
          <input
            ref={sessionLoadInputRef}
            type="file"
            className="hidden"
            accept=".ccs,.json"
            onChange={handleLoadSession}
          />

          {/* Save button */}
          <button
            onClick={handleSaveSession}
            className="p-1.5 rounded-sm text-slate hover:text-ink hover:bg-cream transition-colors"
            aria-label="Save session"
            title="Save session"
          >
            <Save className="h-4 w-4" strokeWidth={1.5} />
          </button>

          {/* Load button */}
          <button
            onClick={() => sessionLoadInputRef.current?.click()}
            className="p-1.5 rounded-sm text-slate hover:text-ink hover:bg-cream transition-colors"
            aria-label="Load session"
            title="Load session"
          >
            <FolderOpen className="h-4 w-4" strokeWidth={1.5} />
          </button>

          <div className="w-px h-4 bg-parchment mx-1" />

          {/* Export button (legacy) */}
          <button
            onClick={() => setShowExportModal(true)}
            className="p-1.5 rounded-sm text-slate hover:text-ink hover:bg-cream transition-colors"
            aria-label="Export outputs"
            title="Export outputs"
          >
            <Download className="h-4 w-4" strokeWidth={1.5} />
          </button>

          {/* AI Status Button */}
          <button
            onClick={() => setShowAIPanel(true)}
            className={cn(
              "font-sans text-[10px] px-2 py-0.5 border rounded-sm transition-colors",
              !aiEnabled
                ? "text-red-700 bg-red-50 border-red-200 hover:border-red-400 dark:text-red-400 dark:bg-red-950 dark:border-red-800 dark:hover:border-red-600"
                : connectionStatus === "success"
                  ? "text-green-700 bg-green-50 border-green-200 hover:border-green-400 dark:text-green-400 dark:bg-green-950 dark:border-green-800 dark:hover:border-green-600"
                  : "text-amber-700 bg-amber-50 border-amber-200 hover:border-amber-400 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800 dark:hover:border-amber-600"
            )}
            title={
              !aiEnabled
                ? "AI disabled - click to enable"
                : connectionStatus === "success"
                  ? "AI connected - click to configure"
                  : connectionStatus === "error"
                    ? "Connection failed - click to configure"
                    : "AI not verified - click to test connection"
            }
          >
            {!aiEnabled ? "AI: Off" : connectionStatus === "success" ? "AI: On" : "AI: ??"}
          </button>

          <div className="w-px h-4 bg-parchment mx-1" />

          {/* Settings button - opens full settings modal */}
          <button
            onClick={() => {
              setSettingsTab("appearance");
              setShowSettingsModal(true);
            }}
            className="p-1.5 rounded-sm transition-colors text-slate hover:text-ink hover:bg-cream"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" strokeWidth={1.5} />
          </button>

          {/* Settings Modal */}
          <SettingsModal
            isOpen={showSettingsModal}
            onClose={() => setShowSettingsModal(false)}
            initialTab={settingsTab}
          />
          <AISettingsPanel
            isOpen={showAIPanel}
            onClose={() => setShowAIPanel(false)}
          />
        </div>
      </header>

      {/* Code input modal - Editorial style */}
      {showCodeInput && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setShowCodeInput(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-editorial-lg w-full max-w-xl mx-4 max-h-[90vh] flex flex-col border border-parchment modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-parchment">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm text-ink">Add Code for Analysis</h3>
                <button
                  onClick={() => setShowCodeInput(false)}
                  className="text-slate-muted hover:text-ink transition-colors"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
              <p className="font-body text-[11px] text-slate mt-1.5">
                Paste or type the code you want to analyse. Add a name and language to help with interpretation.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-sans text-[10px] text-slate-muted block mb-1">Name (optional)</label>
                  <input
                    type="text"
                    value={codeInputName}
                    onChange={(e) => setCodeInputName(e.target.value)}
                    placeholder="e.g., Strachey Love Letter Generator"
                    className="input-editorial w-full text-[11px] px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-sans text-[10px] text-slate-muted block mb-1">Language (optional)</label>
                  <input
                    type="text"
                    value={codeInputLanguage}
                    onChange={(e) => setCodeInputLanguage(e.target.value)}
                    placeholder="e.g., BASIC, Python, C"
                    className="input-editorial w-full text-[11px] px-2.5 py-1.5"
                  />
                </div>
              </div>
              <div>
                <label className="font-sans text-[10px] text-slate-muted block mb-1">Code</label>
                <textarea
                  value={codeInputText}
                  onChange={(e) => setCodeInputText(e.target.value)}
                  placeholder="Paste or type your code here..."
                  className="input-editorial w-full h-48 font-mono text-[11px] px-2.5 py-1.5"
                  autoFocus
                />
              </div>
            </div>
            <div className="p-4 border-t border-parchment flex gap-2 justify-end">
              <button
                onClick={() => setShowCodeInput(false)}
                className="btn-editorial-secondary text-[11px] px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleCodeSubmit}
                disabled={!codeInputText.trim()}
                className={cn(
                  "text-[11px] px-3 py-1.5",
                  codeInputText.trim()
                    ? "btn-editorial-primary"
                    : "btn-editorial bg-parchment text-slate-muted cursor-not-allowed"
                )}
              >
                Add Code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reference search modal - Editorial style */}
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
              className="input-editorial mb-3 text-[11px] px-2.5 py-1.5"
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
                          className="px-2 py-0.5 text-[10px] font-sans bg-cream border border-parchment rounded-sm hover:border-burgundy hover:text-burgundy transition-colors"
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
                className="btn-editorial-secondary text-[11px] px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={() => executeSearchLiterature(searchQuery)}
                disabled={!searchQuery.trim()}
                className={cn(
                  "text-[11px] px-3 py-1.5",
                  searchQuery.trim()
                    ? "btn-editorial-primary"
                    : "btn-editorial bg-parchment text-slate-muted cursor-not-allowed"
                )}
              >
                Search
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Output generation modal - Editorial style */}
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
                    className="text-left p-3 border border-parchment rounded-sm hover:border-burgundy hover:bg-burgundy/5 transition-all duration-300"
                  >
                    <h4 className="font-display text-caption text-ink mb-0.5">Code Annotation</h4>
                    <p className="font-body text-[10px] text-slate">
                      Line-by-line annotations exploring lexical choices, naming conventions, and structural decisions.
                    </p>
                  </button>

                  {/* Code Critique option */}
                  <button
                    onClick={() => executeGenerateOutput("critique")}
                    className="text-left p-3 border border-parchment rounded-sm hover:border-burgundy hover:bg-burgundy/5 transition-all duration-300"
                  >
                    <h4 className="font-display text-caption text-ink mb-0.5">Code Critique</h4>
                    <p className="font-body text-[10px] text-slate">
                      A structured critical analysis following the triadic hermeneutic framework (intention, generation, execution).
                    </p>
                  </button>

                  {/* Close Reading option */}
                  <button
                    onClick={() => executeGenerateOutput("reading")}
                    className="text-left p-3 border border-parchment rounded-sm hover:border-burgundy hover:bg-burgundy/5 transition-all duration-300"
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
                  <Loader2 className="h-6 w-6 text-burgundy animate-spin mb-3" />
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
                      className="font-sans text-[10px] text-burgundy hover:text-burgundy-900 transition-colors"
                    >
                      Copy to clipboard
                    </button>
                  </div>
                  <div className="prose prose-sm max-w-none bg-cream rounded-sm p-4 border border-parchment whitespace-pre-wrap text-[11px]">
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
                    className="btn-editorial-secondary text-[11px] px-3 py-1.5"
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
                  className="btn-editorial-secondary text-[11px] px-3 py-1.5 ml-auto"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Export modal - Session Log Export */}
      {showExportModal && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setShowExportModal(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-editorial-lg p-4 w-full max-w-sm mx-4 border border-parchment modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-sm text-ink">Export Session Log</h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-slate-muted hover:text-ink transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <p className="font-body text-[11px] text-slate mb-3">
              Export a comprehensive log of your analysis session for research documentation.
            </p>
            <div className="space-y-2">
              <button
                onClick={handleExportSessionLogJSON}
                className="w-full text-left p-3 border border-parchment rounded-sm hover:border-burgundy hover:bg-burgundy/5 transition-all duration-300"
              >
                <h4 className="font-display text-caption text-ink mb-0.5">JSON Format</h4>
                <p className="font-body text-[10px] text-slate">
                  Structured data format. Includes all metadata, code artefacts, annotations, and conversation.
                </p>
              </button>
              <button
                onClick={handleExportSessionLogText}
                className="w-full text-left p-3 border border-parchment rounded-sm hover:border-burgundy hover:bg-burgundy/5 transition-all duration-300"
              >
                <h4 className="font-display text-caption text-ink mb-0.5">Text Format</h4>
                <p className="font-body text-[10px] text-slate">
                  Plain text log. Human-readable format suitable for archiving or sharing.
                </p>
              </button>
              <button
                onClick={handleExportSessionLogPDF}
                className="w-full text-left p-3 border border-parchment rounded-sm hover:border-burgundy hover:bg-burgundy/5 transition-all duration-300"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <FileDown className="h-3.5 w-3.5 text-burgundy" strokeWidth={1.5} />
                  <h4 className="font-display text-caption text-ink">PDF Format</h4>
                </div>
                <p className="font-body text-[10px] text-slate">
                  Formatted document with metadata, annotated code, and full conversation history.
                </p>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowExportModal(false)}
                className="btn-editorial-secondary text-[11px] px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Session Modal - Custom styled replacement for native prompt */}
      {showSaveModal && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setShowSaveModal(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-editorial-lg p-4 w-full max-w-sm mx-4 border border-parchment modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-sm text-foreground flex items-center gap-2">
                <Save className="h-4 w-4 text-burgundy" strokeWidth={1.5} />
                Save Session
              </h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-slate-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <p className="font-body text-[11px] text-slate mb-3">
              Enter a name for your session. The file will be saved with a .ccs extension to your browser's default download folder.
            </p>
            <input
              type="text"
              value={saveModalName}
              onChange={(e) => setSaveModalName(e.target.value)}
              placeholder="Session name"
              className="w-full px-3 py-2 font-body text-[12px] bg-card border border-parchment rounded-sm focus:outline-none focus:border-burgundy/50 text-foreground placeholder:text-slate-muted"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveModalName.trim()) {
                  handleConfirmSave();
                } else if (e.key === 'Escape') {
                  setShowSaveModal(false);
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="btn-editorial-secondary text-[11px] px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSave}
                disabled={!saveModalName.trim()}
                className="btn-editorial-primary text-[11px] px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Warning Modal - Editorial style */}
      {showUnsavedWarning && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setShowUnsavedWarning(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-editorial-lg p-4 w-full max-w-xs mx-4 border border-parchment modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-sm text-ink">Unsaved Changes</h3>
              <button
                onClick={() => setShowUnsavedWarning(false)}
                className="text-slate-muted hover:text-ink transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <p className="font-body text-[11px] text-slate mb-4">
              You have unsaved work in this session. Would you like to save your project before leaving?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setShowUnsavedWarning(false);
                  handleSaveSession();
                }}
                className="w-full btn-editorial-primary text-[11px] py-2"
              >
                Save First
              </button>
              <button
                onClick={() => {
                  setShowUnsavedWarning(false);
                  router.push('/');
                }}
                className="w-full btn-editorial bg-gold text-ink border-gold hover:bg-gold-light text-[11px] py-2"
              >
                Leave Without Saving
              </button>
              <button
                onClick={() => setShowUnsavedWarning(false)}
                className="w-full btn-editorial-ghost text-[11px] py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Code Details Modal - Editorial style */}
      {selectedCodeDetails && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setSelectedCodeDetails(null)}
        >
          <div
            className="bg-popover rounded-sm shadow-editorial-lg max-w-sm w-full mx-4 p-4 border border-parchment modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-display text-sm text-ink flex items-center gap-1.5">
                <Code className="h-4 w-4 text-burgundy" strokeWidth={1.5} />
                Code Details
              </h2>
              <button
                onClick={() => setSelectedCodeDetails(null)}
                className="text-slate-muted hover:text-ink transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Name</label>
                <p className="font-body text-[11px] text-ink font-medium mt-0.5">{selectedCodeDetails.name}</p>
              </div>

              {selectedCodeDetails.language && (
                <div>
                  <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Language</label>
                  <p className="font-body text-[11px] text-ink mt-0.5">{selectedCodeDetails.language}</p>
                </div>
              )}

              <div>
                <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Size</label>
                <p className="font-body text-[11px] text-ink mt-0.5">
                  {selectedCodeDetails.size < 1024
                    ? `${selectedCodeDetails.size} bytes`
                    : selectedCodeDetails.size < 1024 * 1024
                      ? `${(selectedCodeDetails.size / 1024).toFixed(1)} KB`
                      : `${(selectedCodeDetails.size / (1024 * 1024)).toFixed(1)} MB`
                  }
                </p>
              </div>

              <div>
                <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Added</label>
                <p className="font-body text-[11px] text-ink mt-0.5">{new Date(selectedCodeDetails.uploadedAt).toLocaleString()}</p>
              </div>

              {selectedCodeDetails.author && (
                <div>
                  <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Author</label>
                  <p className="font-body text-[10px] text-slate mt-0.5">{selectedCodeDetails.author}</p>
                </div>
              )}

              {selectedCodeDetails.date && (
                <div>
                  <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Date Written</label>
                  <p className="font-body text-[10px] text-slate mt-0.5">{selectedCodeDetails.date}</p>
                </div>
              )}

              {selectedCodeDetails.platform && (
                <div>
                  <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Platform</label>
                  <p className="font-body text-[10px] text-slate mt-0.5">{selectedCodeDetails.platform}</p>
                </div>
              )}

              {selectedCodeDetails.context && (
                <div>
                  <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Context</label>
                  <p className="font-body text-[10px] text-slate mt-0.5">{selectedCodeDetails.context}</p>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  removeCode(selectedCodeDetails.id);
                  setSelectedCodeDetails(null);
                }}
                className="btn-editorial bg-error/10 text-error border-error/30 hover:bg-error/20 text-[11px] px-3 py-1.5"
              >
                Remove Code
              </button>
              <button
                onClick={() => setSelectedCodeDetails(null)}
                className="btn-editorial-secondary text-[11px] px-3 py-1.5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reference Details Modal - Editorial style */}
      {selectedRefDetails && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setSelectedRefDetails(null)}
        >
          <div
            className="bg-popover rounded-sm shadow-editorial-lg max-w-sm w-full mx-4 p-4 max-h-[80vh] overflow-y-auto border border-parchment modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-1.5 pr-4">
                <BookOpen className="h-4 w-4 text-burgundy flex-shrink-0" strokeWidth={1.5} />
                <h2 className="font-display text-sm text-ink">Reference Details</h2>
                {selectedRefDetails.isHistorical && (
                  <span className="px-1.5 py-0.5 font-sans text-[9px] font-medium bg-ink/10 text-ink border border-ink/20 rounded-sm ml-1">
                    Historical
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedRefDetails(null)}
                className="text-slate-muted hover:text-ink flex-shrink-0 transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Title</label>
                <p className="font-display text-[11px] text-ink font-medium mt-0.5 leading-snug">{selectedRefDetails.title}</p>
              </div>

              {selectedRefDetails.repository && (
                <div>
                  <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Repository</label>
                  <p className="font-body text-[11px] text-ink mt-0.5 italic">{selectedRefDetails.repository}</p>
                </div>
              )}

              <div>
                <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Authors</label>
                <p className="font-body text-[11px] text-ink mt-0.5">{selectedRefDetails.authors.join(", ")}</p>
              </div>

              <div className="flex gap-4 flex-wrap">
                {selectedRefDetails.year && (
                  <div>
                    <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Year</label>
                    <p className="font-body text-[11px] text-ink mt-0.5">{selectedRefDetails.year}</p>
                  </div>
                )}
                {selectedRefDetails.language && (
                  <div>
                    <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Language</label>
                    <p className="font-body text-[11px] text-ink mt-0.5">{selectedRefDetails.language}</p>
                  </div>
                )}
                {selectedRefDetails.platform && (
                  <div>
                    <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Platform</label>
                    <p className="font-body text-[11px] text-ink mt-0.5">{selectedRefDetails.platform}</p>
                  </div>
                )}
              </div>

              {selectedRefDetails.description && (
                <div>
                  <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Description</label>
                  <p className="font-body text-[10px] text-slate mt-0.5 leading-relaxed">{selectedRefDetails.description}</p>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-between items-center">
              {selectedRefDetails.url && (
                <a
                  href={selectedRefDetails.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-editorial-primary text-[11px] px-3 py-1.5"
                >
                  View Document
                </a>
              )}
              <button
                onClick={() => setSelectedRefDetails(null)}
                className="btn-editorial-secondary text-[11px] px-3 py-1.5 ml-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Artifact Details Modal - Editorial style */}
      {/* Code Annotator Modal */}
      {showCodeAnnotator && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4"
          onClick={() => setShowCodeAnnotator(null)}
        >
          <div
            className="bg-popover rounded-sm shadow-editorial-lg w-full max-w-4xl h-[80vh] overflow-hidden border border-parchment modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <AnnotatedCodeViewer
              code={showCodeAnnotator.code}
              codeFileId={showCodeAnnotator.fileId}
              fileName={showCodeAnnotator.fileName}
              language={showCodeAnnotator.language}
              onClose={() => setShowCodeAnnotator(null)}
              userInitials={profile.initials}
            />
          </div>
        </div>
      )}

      {selectedArtifactDetails && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setSelectedArtifactDetails(null)}
        >
          <div
            className="bg-popover rounded-sm shadow-editorial-lg max-w-lg w-full mx-4 p-4 max-h-[80vh] overflow-y-auto border border-parchment modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-3">
              <h2 className="font-display text-sm text-ink flex items-center gap-1.5 pr-4">
                <FileOutput className="h-4 w-4 text-burgundy flex-shrink-0" strokeWidth={1.5} />
                {selectedArtifactDetails.type === "annotation" ? "Code Annotation" :
                  selectedArtifactDetails.type === "critique" ? "Code Critique" :
                    selectedArtifactDetails.type === "reading" ? "Close Reading" : "Output"}
                <span className="font-sans text-[10px] font-normal text-slate-muted">v{selectedArtifactDetails.version}</span>
              </h2>
              <button
                onClick={() => setSelectedArtifactDetails(null)}
                className="text-slate-muted hover:text-ink flex-shrink-0 transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Created</label>
                <p className="font-body text-[11px] text-ink mt-0.5">{new Date(selectedArtifactDetails.createdAt).toLocaleString()}</p>
              </div>

              <div>
                <label className="font-sans text-[9px] uppercase tracking-widest text-slate-muted">Content</label>
                <div className="mt-1 p-3 bg-cream rounded-sm border border-parchment max-h-[50vh] overflow-y-auto">
                  <p className="font-body text-[10px] text-ink whitespace-pre-wrap leading-relaxed">{selectedArtifactDetails.content}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => copyToClipboard(selectedArtifactDetails.content)}
                className="btn-editorial-primary text-[11px] px-3 py-1.5"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => setSelectedArtifactDetails(null)}
                className="btn-editorial-secondary text-[11px] px-3 py-1.5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Preview Modal - Shows what gets sent to the LLM */}
      {showContextPreview && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setShowContextPreview(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-lg w-full max-w-xl mx-4 border border-parchment max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-parchment">
              <div className="flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-burgundy" strokeWidth={1.5} />
                <h3 className="font-display text-sm text-ink">LLM Context Preview</h3>
              </div>
              <button
                onClick={() => setShowContextPreview(false)}
                className="text-slate-muted hover:text-ink transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="p-3 flex-1 overflow-y-auto">
              <p className="font-body text-[10px] text-slate mb-3">
                This is the code context that gets sent to the LLM with each message.
                {session.lineAnnotations.length > 0 && (
                  <> Your annotations are embedded as <code className="bg-cream px-1 rounded text-[9px]">// An:Type:</code> comments.</>
                )}
              </p>
              <div className="mb-3 p-2 bg-cream/50 rounded-sm border border-parchment">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="font-sans text-[10px] font-medium text-ink">Summary</span>
                </div>
                <ul className="font-body text-[10px] text-slate space-y-0.5">
                  <li>• {session.codeFiles.length} code file{session.codeFiles.length !== 1 ? "s" : ""}</li>
                  <li>• {session.lineAnnotations.length} annotation{session.lineAnnotations.length !== 1 ? "s" : ""}</li>
                  <li>• {contextPreviewText.length.toLocaleString()} characters total</li>
                </ul>
              </div>
              <div className="border border-parchment rounded-sm">
                <div className="px-2 py-1.5 bg-cream/30 border-b border-parchment">
                  <span className="font-sans text-[9px] text-slate-muted uppercase tracking-wider">Context Sent to LLM</span>
                </div>
                <pre className="p-2 text-[10px] font-mono text-foreground whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto bg-card">
                  {contextPreviewText || "(No code loaded yet)"}
                </pre>
              </div>
            </div>
            <div className="p-3 border-t border-parchment flex justify-between items-center">
              <p className="font-body text-[9px] text-slate-muted">
                Use the code annotator to add annotations that enrich the context.
              </p>
              <button
                onClick={() => setShowContextPreview(false)}
                className="px-3 py-1.5 text-[11px] text-slate hover:text-ink border border-parchment rounded-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative z-0">
        {/* Conversation area */}
        <div
          className={cn(
            "flex-1 flex flex-col transition-all duration-300",
            // On desktop, add margin when panel is open
            // On mobile, no margin needed since panel overlays
            !isMobile && isContextPanelOpen ? "md:mr-80" : ""
          )}
        >
          {/* Chat search bar */}
          {showChatSearch && (
            <div className="border-b border-parchment bg-cream/50 px-4 py-2 flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-slate-muted flex-shrink-0" strokeWidth={1.5} />
              <input
                ref={chatSearchInputRef}
                type="text"
                value={chatSearchQuery}
                onChange={(e) => setChatSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="flex-1 bg-transparent text-sm text-ink placeholder:text-slate-muted focus:outline-none font-body"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowChatSearch(false);
                    setChatSearchQuery("");
                  }
                }}
              />
              {chatSearchQuery && (
                <span className="text-[10px] text-slate-muted">
                  {session.messages.filter(m =>
                    m.content.toLowerCase().includes(chatSearchQuery.toLowerCase())
                  ).length} found
                </span>
              )}
              <button
                onClick={() => {
                  setShowChatSearch(false);
                  setChatSearchQuery("");
                }}
                className="p-0.5 text-slate-muted hover:text-ink"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          )}
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {session.messages
              .filter(message =>
                !chatSearchQuery ||
                message.content.toLowerCase().includes(chatSearchQuery.toLowerCase())
              )
              .map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                fontSize={chatFontSize}
                userName={getDisplayName()}
                isCopied={copiedMessageId === message.id}
                isFavourite={favouriteMessages.has(message.id)}
                onCopy={handleCopyMessage}
                onToggleFavourite={handleToggleFavourite}
              />
            ))}

            {isLoading && (
              <div className="flex justify-start pl-2 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-burgundy/70 thinking-dot" />
                  <div className="w-1.5 h-1.5 rounded-full bg-burgundy/70 thinking-dot" />
                  <div className="w-1.5 h-1.5 rounded-full bg-burgundy/70 thinking-dot" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area - Claude style */}
          <div className="p-4 bg-ivory flex justify-center">
          <div className="w-full md:w-[80%]">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Upload error message */}
            {uploadError && (
              <div className="mb-3 p-3 bg-error/5 border border-error/20 rounded-lg font-body text-body-sm text-error flex items-center justify-between">
                <span>{uploadError}</span>
                <button onClick={() => setUploadError(null)} className="text-error/70 hover:text-error">
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            )}

            {/* Guided prompts panel */}
            {showGuidedPrompts && session.mode && (
              <div className="mb-3 animate-fade-in">
                <GuidedPrompts
                  mode={session.mode}
                  currentPhase={session.currentPhase}
                  onSelectPrompt={handleSelectGuidedPrompt}
                />
              </div>
            )}

            {/* AI disabled or not ready banner */}
            {!isAiReady && (
              <div className="mb-3 p-3 bg-slate/5 border border-slate/20 rounded-lg">
                <p className="font-body text-body-sm text-slate text-center">
                  {!aiEnabled
                    ? "AI assistant is disabled. You can still add code, search references, and manage your session."
                    : "AI is enabled but connection not verified. Please test connection to start chatting."}
                  <button
                    onClick={() => {
                      setSettingsTab("ai");
                      setShowSettingsModal(true);
                    }}
                    className="ml-2 text-burgundy hover:text-burgundy-dark underline"
                  >
                    {!aiEnabled ? "Enable in Settings" : "Open Settings"}
                  </button>
                </p>
              </div>
            )}

            {/* Claude-style input container */}
            <div className={cn(
              "bg-card rounded-2xl border border-parchment shadow-sm",
              !isAiReady && "opacity-50"
            )}>
              {/* Textarea */}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={!aiEnabled ? "AI assistant disabled" : !isAiReady ? "Test connection in Settings to chat..." : "Reply..."}
                disabled={!isAiReady}
                className={cn(
                  "w-full resize-none rounded-t-2xl px-4 py-3 font-body bg-transparent focus:outline-none placeholder:text-slate-muted overflow-hidden",
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
                  {/* View Context button - show for archaeology and interpret modes when code exists */}
                  {(session.mode === "archaeology" || session.mode === "interpret") && session.codeFiles.length > 0 && (
                    <button
                      onClick={() => setShowContextPreview(true)}
                      className="p-1.5 text-slate hover:text-ink rounded-md transition-colors"
                      title="View context sent to LLM"
                    >
                      <Eye className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  )}
                  {/* Guided prompts button - only show if prompts exist for current mode/phase */}
                  {session.mode && (GUIDED_PROMPTS[session.mode]?.[session.currentPhase]?.length ?? 0) > 0 && (
                    <button
                      onClick={() => setShowGuidedPrompts(!showGuidedPrompts)}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        showGuidedPrompts
                          ? "text-burgundy"
                          : "text-slate hover:text-ink"
                      )}
                      title="Guided prompts"
                    >
                      <Lightbulb className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  )}
                  {/* Chat search button - only show when there are messages */}
                  {session.messages.length > 0 && (
                    <button
                      onClick={() => {
                        setShowChatSearch(!showChatSearch);
                        if (!showChatSearch) {
                          setTimeout(() => chatSearchInputRef.current?.focus(), 50);
                        } else {
                          setChatSearchQuery("");
                        }
                      }}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        showChatSearch
                          ? "text-burgundy"
                          : "text-slate hover:text-ink"
                      )}
                      title="Search messages (Cmd+Shift+F)"
                    >
                      <Search className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  )}
                </div>

                {/* Right side: font size + send button */}
                <div className="flex items-center gap-1">
                  {/* Font size popover */}
                  <div className="relative" data-dropdown>
                    <button
                      onClick={() => setShowFontSizePopover(!showFontSizePopover)}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        showFontSizePopover ? "text-burgundy" : "text-slate hover:text-ink"
                      )}
                      title="Font size"
                    >
                      <SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                    {showFontSizePopover && (
                      <div className="absolute bottom-full right-0 mb-2 bg-popover rounded-lg border border-parchment shadow-lg p-2 z-50">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setModeChatFontSize(currentMode, chatFontSize - 1)}
                            disabled={chatFontSize <= FONT_SIZE_MIN}
                            className="p-1.5 text-slate hover:text-ink hover:bg-cream rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Decrease"
                          >
                            <Minus className="h-3 w-3" strokeWidth={1.5} />
                          </button>
                          <span className="text-xs text-ink font-mono w-6 text-center">{chatFontSize}</span>
                          <button
                            onClick={() => setModeChatFontSize(currentMode, chatFontSize + 1)}
                            disabled={chatFontSize >= FONT_SIZE_MAX}
                            className="p-1.5 text-slate hover:text-ink hover:bg-cream rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Increase"
                          >
                            <Plus className="h-3 w-3" strokeWidth={1.5} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Send button */}
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading || !isAiReady}
                    className={cn(
                      "p-2 rounded-lg flex items-center justify-center transition-colors",
                      input.trim() && !isLoading && isAiReady
                        ? "bg-burgundy text-ivory hover:bg-burgundy-dark"
                        : "bg-parchment text-slate-muted cursor-not-allowed"
                    )}
                    aria-label="Send message"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowUp className="h-4 w-4" strokeWidth={2} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>

        {/* Context panel toggle - Desktop: side toggle, Mobile: bottom button */}
        {isMobile ? (
          <button
            onClick={() => setIsContextPanelOpen(!isContextPanelOpen)}
            className={cn(
              "fixed bottom-28 right-4 z-20",
              "bg-burgundy text-ivory rounded-sm p-3 shadow-editorial-md",
              "hover:bg-burgundy-900 transition-colors",
              "flex items-center justify-center"
            )}
            aria-label={isContextPanelOpen ? "Close context panel" : "Open context panel"}
          >
            {isContextPanelOpen ? (
              <X className="h-5 w-5" strokeWidth={1.5} />
            ) : (
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            )}
          </button>
        ) : (
          <button
            onClick={() => setIsContextPanelOpen(!isContextPanelOpen)}
            className={cn(
              "fixed right-0 top-1/2 -translate-y-1/2 z-10",
              "bg-card border border-parchment rounded-l-sm p-2 shadow-editorial",
              "hover:bg-cream transition-colors",
              isContextPanelOpen ? "right-80" : "right-0"
            )}
            aria-label={isContextPanelOpen ? "Close context panel" : "Open context panel"}
          >
            {isContextPanelOpen ? (
              <ChevronRight className="h-5 w-5 text-slate" strokeWidth={1.5} />
            ) : (
              <ChevronLeft className="h-5 w-5 text-slate" strokeWidth={1.5} />
            )}
          </button>
        )}

        {/* Mobile backdrop overlay */}
        {isMobile && isContextPanelOpen && (
          <div
            className="fixed inset-0 bg-ink/50 z-30"
            onClick={() => setIsContextPanelOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Context panel - Editorial style */}
        <aside
          className={cn(
            "fixed bg-ivory z-40 overflow-y-auto transition-transform duration-300",
            isMobile
              ? // Mobile: bottom sheet
              cn(
                "left-0 right-0 bottom-0 h-[70vh] rounded-t-sm border-t border-parchment shadow-editorial-lg",
                isContextPanelOpen ? "translate-y-0" : "translate-y-full"
              )
              : // Desktop: side panel
              cn(
                "right-0 top-[61px] bottom-0 w-80 border-l border-parchment",
                isContextPanelOpen ? "translate-x-0" : "translate-x-full"
              )
          )}
        >
          {/* Mobile drag handle */}
          {isMobile && (
            <div className="sticky top-0 bg-ivory pt-3 pb-2 px-5 border-b border-parchment">
              <div className="w-12 h-1 bg-parchment-dark rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="font-display text-display-md text-ink">Context</h2>
                <button
                  onClick={() => setIsContextPanelOpen(false)}
                  className="p-2 text-slate-muted hover:text-ink transition-colors rounded-sm hover:bg-cream"
                  aria-label="Close panel"
                >
                  <X className="h-5 w-5" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          )}

          <div className="p-4 space-y-5">
            {/* Language selector for create mode */}
            {session.mode === "create" && (
              <section>
                <h3 className="font-sans text-[10px] uppercase tracking-widest text-slate-muted mb-2">
                  Code Language
                </h3>
                <select
                  value={
                    CREATE_LANGUAGES.includes(session.createState?.language as typeof CREATE_LANGUAGES[number])
                      ? session.createState?.language
                      : session.createState?.language
                        ? "Other"
                        : "Python"
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "Other") {
                      setShowCustomLanguageInput(true);
                    } else {
                      setShowCustomLanguageInput(false);
                      setCustomLanguage("");
                      const previousLang = session.createState?.language || "Python";
                      if (value !== previousLang) {
                        setCreateLanguage(value);
                        // Add a message to inform the LLM of the language change
                        addMessage({
                          role: "user",
                          content: `[Language changed to ${value}. Please use ${value} for all code from now on.]`,
                        });
                      }
                    }
                  }}
                  className={cn(
                    "w-full px-2 py-1.5 font-body text-xs rounded-sm border transition-colors",
                    "bg-card border-parchment text-foreground",
                    "hover:border-burgundy/50 focus:border-burgundy focus:ring-1 focus:ring-burgundy focus:outline-none",
                    "cursor-pointer"
                  )}
                >
                  {CREATE_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
                {(showCustomLanguageInput || (session.createState?.language && !CREATE_LANGUAGES.includes(session.createState.language as typeof CREATE_LANGUAGES[number]))) && (
                  <div className="mt-1.5">
                    <input
                      type="text"
                      value={customLanguage || (session.createState?.language && !CREATE_LANGUAGES.includes(session.createState.language as typeof CREATE_LANGUAGES[number]) ? session.createState.language : "")}
                      onChange={(e) => setCustomLanguage(e.target.value)}
                      onBlur={() => {
                        if (customLanguage.trim()) {
                          const newLang = customLanguage.trim();
                          const previousLang = session.createState?.language || "Python";
                          if (newLang !== previousLang) {
                            setCreateLanguage(newLang);
                            // Add a message to inform the LLM of the language change
                            addMessage({
                              role: "user",
                              content: `[Language changed to ${newLang}. Please use ${newLang} for all code from now on.]`,
                            });
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customLanguage.trim()) {
                          const newLang = customLanguage.trim();
                          const previousLang = session.createState?.language || "Python";
                          if (newLang !== previousLang) {
                            setCreateLanguage(newLang);
                            // Add a message to inform the LLM of the language change
                            addMessage({
                              role: "user",
                              content: `[Language changed to ${newLang}. Please use ${newLang} for all code from now on.]`,
                            });
                          }
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      placeholder="Enter language name..."
                      className={cn(
                        "w-full px-2 py-1.5 font-body text-xs rounded-sm border transition-colors",
                        "bg-card border-parchment text-foreground",
                        "hover:border-burgundy/50 focus:border-burgundy focus:ring-1 focus:ring-burgundy focus:outline-none",
                        "placeholder:text-slate-muted"
                      )}
                    />
                    <p className="font-body text-[10px] text-slate-muted mt-1">
                      Press Enter to confirm.
                    </p>
                  </div>
                )}
                <p className="font-body text-[10px] text-slate-muted mt-2">
                  {session.createState?.language && !CREATE_LANGUAGES.slice(0, -1).includes(session.createState.language as typeof CREATE_LANGUAGES[number])
                    ? `Using: ${session.createState.language}`
                    : "Generated code will use this language."
                  }
                </p>
              </section>
            )}

            {/* Uploaded files */}
            <section>
              <h3 className="font-sans text-[10px] uppercase tracking-widest text-slate-muted mb-2">
                Code Files
              </h3>
              {session.codeFiles.length === 0 ? (
                <p className="font-body text-xs text-slate-muted italic">No files uploaded</p>
              ) : (
                <ul className="space-y-1.5">
                  {session.codeFiles.map((file) => (
                    <li
                      key={file.id}
                      className="font-body text-xs bg-card border border-parchment rounded-sm p-2"
                    >
                      <div
                        className="cursor-pointer hover:text-burgundy transition-colors"
                        onClick={() => setSelectedCodeDetails(file)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedCodeDetails(file);
                          }
                        }}
                      >
                        <div className="font-medium text-ink truncate">
                          {file.name}
                        </div>
                        <div className="text-[10px] text-slate-muted">{file.language || file.source || "code"}</div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleOpenCodeAnnotator(file)}
                          className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-sans text-burgundy bg-burgundy/5 border border-burgundy/20 rounded-sm hover:bg-burgundy/10 transition-colors"
                          title="Annotate this code for close reading"
                        >
                          <MessageSquarePlus className="h-3 w-3" strokeWidth={1.5} />
                          Annotate
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* References */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-sans text-[10px] uppercase tracking-widest text-slate-muted">
                  References
                </h3>
                {session.references.length > 0 && (
                  <button
                    onClick={clearReferences}
                    className="font-sans text-[9px] text-slate-muted hover:text-burgundy transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              {session.references.length === 0 ? (
                <p className="font-body text-xs text-slate-muted italic">
                  No references found
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {session.references.map((ref) => (
                    <li
                      key={ref.id}
                      className="font-body text-xs bg-card border border-parchment rounded-sm p-2 cursor-pointer hover:border-burgundy/50 transition-colors"
                      onClick={() => setSelectedRefDetails(ref)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedRefDetails(ref);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="font-medium text-ink leading-snug hover:text-burgundy flex-1">
                          {ref.title}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {ref.isHistorical && (
                            <span className="px-1 py-0.5 text-[9px] font-sans font-medium bg-ink/10 text-ink rounded-sm">
                              Historical
                            </span>
                          )}
                        </div>
                      </div>
                      {ref.repository && (
                        <div className="text-[10px] text-slate italic mt-0.5">
                          {ref.repository}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-0.5">
                        <div className="text-[10px] text-slate-muted">
                          {ref.authors.slice(0, 2).join(", ")}
                          {ref.authors.length > 2 && " et al."}
                          {ref.year && ` (${ref.year})`}
                        </div>
                        {ref.relevanceScore !== undefined && ref.relevanceScore > 0 && (
                          <div className="text-[10px] text-slate-muted">
                            {ref.relevanceScore.toLocaleString()} citations
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Generated critiques */}
            <section>
              <h3 className="font-sans text-[10px] uppercase tracking-widest text-slate-muted mb-2">
                Generated Critiques
              </h3>
              {session.critiqueArtifacts.length === 0 ? (
                <p className="font-body text-xs text-slate-muted italic">
                  No critiques generated
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {session.critiqueArtifacts.map((artifact) => (
                    <li
                      key={artifact.id}
                      className="font-body text-xs bg-card border border-parchment rounded-sm p-2 cursor-pointer hover:border-burgundy/50 transition-colors"
                      onClick={() => setSelectedArtifactDetails(artifact)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedArtifactDetails(artifact);
                        }
                      }}
                    >
                      <div className="font-medium text-ink leading-snug hover:text-burgundy">
                        {artifact.type === "annotation" ? "Code Annotation" :
                          artifact.type === "critique" ? "Code Critique" :
                            artifact.type === "reading" ? "Close Reading" : artifact.type}
                        <span className="ml-1.5 text-[10px] text-slate-muted">v{artifact.version}</span>
                      </div>
                      <div className="text-[10px] text-slate-muted mt-0.5">
                        {new Date(artifact.createdAt).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}

// Message bubble component - Editorial style (matching critique mode)
interface MessageBubbleProps {
  message: Message;
  fontSize?: number;
  userName?: string;
  isCopied?: boolean;
  isFavourite?: boolean;
  onCopy?: (messageId: string, content: string) => void;
  onToggleFavourite?: (messageId: string) => void;
}

function MessageBubble({
  message,
  fontSize = 14,
  userName,
  isCopied = false,
  isFavourite = false,
  onCopy,
  onToggleFavourite,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "message-enter group/message",
        isUser ? "flex flex-col items-end" : "flex flex-col items-start"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-sm px-4 py-3",
          isUser
            ? "bg-burgundy/10 text-ink"
            : "bg-card border border-parchment text-foreground"
        )}
      >
        <p
          className="font-body whitespace-pre-wrap leading-relaxed"
          style={{ fontSize: `${fontSize}px` }}
        >
          {message.content}
        </p>
      </div>
      {/* Timestamp and actions inline */}
      <div className={cn(
        "mt-0.5 px-1 flex items-center gap-2",
        isUser ? "flex-row-reverse" : "flex-row"
      )}>
        <span className="font-sans text-[9px] text-slate-muted">
          {formatTimestamp(message.timestamp)}
        </span>
        {onCopy && onToggleFavourite && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onCopy(message.id, message.content)}
              className="p-0.5 text-slate-muted hover:text-ink rounded-sm transition-colors opacity-0 group-hover/message:opacity-100"
              title="Copy"
            >
              {isCopied ? (
                <Check className="h-3 w-3 text-green-600" strokeWidth={1.5} />
              ) : (
                <Copy className="h-3 w-3" strokeWidth={1.5} />
              )}
            </button>
            <button
              onClick={() => onToggleFavourite(message.id)}
              className={cn(
                "p-0.5 rounded-sm transition-colors",
                isFavourite
                  ? "text-burgundy"
                  : "text-slate-muted hover:text-ink opacity-0 group-hover/message:opacity-100"
              )}
              title={isFavourite ? "Marked" : "Mark"}
            >
              <Heart
                className="h-3 w-3"
                strokeWidth={1.5}
                fill={isFavourite ? "currentColor" : "none"}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
