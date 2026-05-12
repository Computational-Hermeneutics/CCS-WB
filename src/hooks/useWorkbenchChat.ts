/**
 * Chat functionality hook extracted from WorkbenchLayout
 * Handles message sending, chat UI state, code extraction, and guided prompts
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { Message, CodeReference, Session } from "@/types";
import type { AISettings } from "@/types/ai-settings";
import type { ConnectionStatus } from "@/context/AISettingsContext";
import type { CCSMethod } from "@/lib/ccs-content";
import { fetchWithTimeout, retryWithBackoff } from "@/lib/utils";
import { extractCodeBlocks, generateFileName, getUniqueFileName } from "@/lib/code-extraction";
import { generateAnnotatedCode } from "@/components/code";
import { callOllamaDirect, pingOllama } from "@/lib/ai/browser-direct";

const CRITIQUE_OPENING =
  "What code would you like to explore? You can paste it directly, upload a file, or describe what you're looking at. I'm curious what drew your attention to this particular piece of software.";

interface UseWorkbenchChatParams {
  session: Session;
  addMessage: (message: Omit<Message, "id" | "timestamp">) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  addCode: (code: Omit<CodeReference, "id" | "uploadedAt">) => string;
  setCodeContent: (fileId: string, content: string) => void;
  getRequestHeaders: () => Record<string, string>;
  isAiReady: boolean;
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus, error?: string | null) => void;
  aiSettings: AISettings;
  effectiveLanguage: string;
  codeContents: Map<string, string>;
  setShowSettingsModal: (show: boolean) => void;
  setSettingsTab: (tab: "profile" | "code" | "appearance" | "ai" | "about") => void;
  setShowAIPanel: (show: boolean) => void;
  setSuccessMessage: (msg: string | null) => void;
}

export function useWorkbenchChat({
  session,
  addMessage,
  updateMessage,
  addCode,
  setCodeContent,
  getRequestHeaders,
  isAiReady,
  connectionStatus,
  setConnectionStatus,
  aiSettings,
  effectiveLanguage,
  codeContents,
  setShowSettingsModal,
  setSettingsTab,
  setShowAIPanel,
  setSuccessMessage,
}: UseWorkbenchChatParams) {
  // State
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [favouriteMessages, setFavouriteMessages] = useState<Set<string>>(new Set());
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [showGuidedPrompts, setShowGuidedPrompts] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatSearchInputRef = useRef<HTMLInputElement>(null);
  const hasAddedOpeningMessage = useRef(false);
  const prevMessageCount = useRef(session.messages.length);
  const processedMessageIds = useRef(new Set<string>());

  // Reset chat state when session changes
  useEffect(() => {
    setFavouriteMessages(new Set());
    hasAddedOpeningMessage.current = false;
    processedMessageIds.current = new Set<string>();
    prevMessageCount.current = session.messages.length;
  }, [session.id]);

  // Scroll to bottom only when new messages are added
  useEffect(() => {
    if (session.messages.length > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCount.current = session.messages.length;
  }, [session.messages.length]);

  // Add opening message
  useEffect(() => {
    if (session.messages.length === 0 && !hasAddedOpeningMessage.current) {
      hasAddedOpeningMessage.current = true;
      addMessage({
        role: "assistant",
        content: CRITIQUE_OPENING,
        metadata: { phase: "opening" },
      });
    }
  }, [session.messages.length, addMessage]);

  // Auto-create files from AI code responses
  useEffect(() => {
    const lastMessage = session.messages[session.messages.length - 1];

    if (!lastMessage || lastMessage.role !== "assistant") return;

    // Skip if already processed
    if (processedMessageIds.current.has(lastMessage.id)) return;
    processedMessageIds.current.add(lastMessage.id);

    // Extract code blocks from the message
    const codeBlocks = extractCodeBlocks(lastMessage.content);
    if (codeBlocks.length === 0) return;

    // Get existing file names for uniqueness check
    const existingFileNames = session.codeFiles.map((f) => f.name);

    // Create files for each code block
    const timestamp = Date.now();
    let filesCreated = 0;

    codeBlocks.forEach((block, index) => {
      const baseName = generateFileName(block.language, index, timestamp);
      const uniqueName = getUniqueFileName(baseName, existingFileNames);

      // Add to existing names to avoid duplicates within this batch
      existingFileNames.push(uniqueName);

      // Create the file
      const fileId = addCode({
        name: uniqueName,
        language: block.language,
        source: "created",
        size: block.code.length,
      });

      setCodeContent(fileId, block.code);
      filesCreated++;
    });

    if (filesCreated > 0) {
      setSuccessMessage(
        filesCreated === 1
          ? "Created 1 file from AI response"
          : `Created ${filesCreated} files from AI response`
      );
    }
  }, [session.messages, session.codeFiles, addCode, setCodeContent, setSuccessMessage]);

  // Auto-resize textarea as content grows
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const maxHeight = 200;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
    }
  }, [input]);

  // Generate annotated code context for LLM
  const annotatedCodeContext = useMemo(() => {
    if (session.codeFiles.length === 0) return "";

    const parts: string[] = ["## Code Under Analysis\n"];

    session.codeFiles.forEach((file) => {
      const code = codeContents.get(file.id);
      if (!code) return;

      const fileAnnotations = session.lineAnnotations.filter(
        (a) => a.codeFileId === file.id
      );
      const annotatedCode = generateAnnotatedCode(code, fileAnnotations);

      parts.push(`### ${file.name}${file.language ? ` (${file.language})` : ""}`);
      if (file.author) parts.push(`Author: ${file.author}`);
      if (file.date) parts.push(`Date: ${file.date}`);
      if (file.platform) parts.push(`Platform: ${file.platform}`);
      parts.push("\n```" + (file.language || ""));
      parts.push(annotatedCode);
      parts.push("```\n");
    });

    if (session.lineAnnotations.length > 0) {
      parts.push(
        "\n*Note: Lines marked with `// An:` are analyst annotations for close reading.*"
      );
    }

    return parts.join("\n");
  }, [session.codeFiles, session.lineAnnotations, codeContents]);

  // Handle copy message
  const handleCopyMessage = useCallback(
    async (messageId: string, content: string) => {
      try {
        await navigator.clipboard.writeText(content);
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    },
    []
  );

  // Handle manual code extraction to files
  const handleExtractCodeToFiles = useCallback(
    (messageId: string, content: string) => {
      const codeBlocks = extractCodeBlocks(content);

      if (codeBlocks.length === 0) {
        setSuccessMessage("No code blocks found in message");
        return;
      }

      const existingFileNames = session.codeFiles.map((f) => f.name);
      const timestamp = Date.now();
      let filesCreated = 0;

      codeBlocks.forEach((block, index) => {
        const baseName = generateFileName(block.language, index, timestamp);
        const uniqueName = getUniqueFileName(baseName, existingFileNames);
        existingFileNames.push(uniqueName);

        const fileId = addCode({
          name: uniqueName,
          language: block.language,
          source: "created",
          size: block.code.length,
        });

        setCodeContent(fileId, block.code);
        filesCreated++;
      });

      setSuccessMessage(
        filesCreated === 1
          ? "Created 1 file from message"
          : `Created ${filesCreated} files from message`
      );
    },
    [session.codeFiles, addCode, setCodeContent, setSuccessMessage]
  );

  // Handle saving AI response as markdown file
  const handleSaveResponseAsMarkdown = useCallback(
    (messageId: string, content: string) => {
      const existingFileNames = session.codeFiles.map((f) => f.name);
      const timestamp = Date.now();
      const baseName = `ai-response-${timestamp}.md`;
      const uniqueName = getUniqueFileName(baseName, existingFileNames);

      const fileId = addCode({
        name: uniqueName,
        language: "markdown",
        source: "created",
        size: content.length,
      });

      setCodeContent(fileId, content);
      setSuccessMessage(`Saved response as ${uniqueName}`);
    },
    [session.codeFiles, addCode, setCodeContent, setSuccessMessage]
  );

  // Handle toggle favourite message
  const handleToggleFavourite = useCallback(
    (messageId: string) => {
      setFavouriteMessages((prev) => {
        const next = new Set(prev);
        if (next.has(messageId)) {
          next.delete(messageId);
        } else {
          next.add(messageId);
        }
        return next;
      });
      const message = session.messages.find((m) => m.id === messageId);
      if (message) {
        updateMessage(messageId, { isFavourite: !message.isFavourite });
      }
    },
    [session.messages, updateMessage]
  );

  // Auto-test connection if disconnected
  const autoTestConnection = useCallback(async (): Promise<boolean> => {
    if (connectionStatus === "success") return true;
    if (connectionStatus === "testing") return false;

    setConnectionStatus("testing");

    try {
      // Ollama is dispatched directly from the browser (see browser-direct.ts).
      if (aiSettings.provider === "ollama") {
        const result = await pingOllama(aiSettings.baseUrl || "http://localhost:11434");
        if (result.ok) {
          setConnectionStatus("success");
          return true;
        }
        setConnectionStatus("error", result.message);
        return false;
      }

      const response = await fetch("/api/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AI-Provider": aiSettings.provider,
          "X-AI-Model": aiSettings.model,
          "X-AI-API-Key": aiSettings.apiKey || "",
          "X-AI-Base-URL": aiSettings.baseUrl || "",
          "X-AI-Custom-Model": aiSettings.customModelId || "",
        },
      });

      const data = await response.json();

      if (data.success) {
        setConnectionStatus("success");
        return true;
      } else {
        setConnectionStatus("error", data.error || "Connection test failed");
        return false;
      }
    } catch (error) {
      setConnectionStatus(
        "error",
        error instanceof Error ? error.message : "Connection test failed"
      );
      return false;
    }
  }, [connectionStatus, aiSettings, setConnectionStatus]);

  // Handle send message
  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    // Auto-test connection if not ready
    if (!isAiReady) {
      const connected = await autoTestConnection();
      if (!connected) {
        setShowAIPanel(true);
        return;
      }
    }

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    addMessage({ role: "user", content: userMessage });

    try {
      const data = await retryWithBackoff(
        async () => {
          const response = await fetchWithTimeout("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getRequestHeaders(),
            },
            body: JSON.stringify({
              messages: [
                ...session.messages,
                { role: "user", content: userMessage },
              ],
              settings: session.settings,
              currentPhase: session.currentPhase,
              experienceLevel: session.experienceLevel,
              mode: "critique",
              defaultLanguage: effectiveLanguage || undefined,
              analysisContext: session.analysisResults,
              literatureContext: session.references,
              codeContext: session.codeFiles.map((file) => {
                const code = codeContents.get(file.id);
                const fileAnnotations = session.lineAnnotations.filter(
                  (a) => a.codeFileId === file.id
                );
                return {
                  ...file,
                  content: code
                    ? generateAnnotatedCode(code, fileAnnotations)
                    : undefined,
                };
              }),
            }),
            timeout: 60000,
          });

          if (response.status === 429) {
            const errorData = await response.json();
            const err = new Error(errorData.message) as Error & {
              isRateLimit: boolean;
              retryAfter?: number;
            };
            err.isRateLimit = true;
            err.retryAfter = errorData.retryAfter;
            throw err;
          }

          if (response.status === 503) {
            const errorData = await response.json();
            const err = new Error(errorData.message) as Error & {
              isConfigError: boolean;
            };
            err.isConfigError = true;
            throw err;
          }

          if (!response.ok) throw new Error("Failed to get response");
          const payload = await response.json();

          // Browser-direct dispatch for Ollama: the server returned the
          // prepared payload; we make the actual model call here so it
          // works even when CCS-WB is deployed and Ollama is on localhost.
          if (payload?.browserDirect && payload.ollamaPayload) {
            const content = await callOllamaDirect(payload.ollamaPayload);
            return {
              message: {
                ...payload.messageTemplate,
                content,
              },
            };
          }

          return payload;
        },
        {
          maxRetries: 2,
          initialDelay: 1000,
          maxDelay: 5000,
          shouldRetry: (error) => {
            if (
              (error as Error & { isRateLimit?: boolean }).isRateLimit
            )
              return false;
            if (error instanceof Error) {
              return (
                error.name === "AbortError" ||
                error.message.includes("timeout")
              );
            }
            return false;
          },
        }
      );

      addMessage(data.message);
    } catch (error) {
      console.error("Chat error:", error);
      const isConfigError = (
        error as Error & { isConfigError?: boolean }
      ).isConfigError;
      if (isConfigError) {
        setSettingsTab("ai");
        setShowSettingsModal(true);
      }

      addMessage({
        role: "assistant",
        content: isConfigError
          ? "AI provider not configured. Please check your AI settings."
          : "I encountered an error. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    input,
    isLoading,
    isAiReady,
    session,
    addMessage,
    getRequestHeaders,
    codeContents,
    autoTestConnection,
    effectiveLanguage,
    setShowSettingsModal,
    setSettingsTab,
    setShowAIPanel,
  ]);

  // Handle key down
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Handle CCS method guidance request
  const handleCCSMethodGuidance = useCallback(
    (method: CCSMethod) => {
      const prompt = `I'd like to learn about the "${method.name}" approach to Critical Code Studies. Can you explain this methodology and how I can apply it to analyze code?`;
      addMessage({ role: "user", content: prompt });
    },
    [addMessage]
  );

  // Handle guided prompt selection
  const handleSelectGuidedPrompt = useCallback((prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
    setShowGuidedPrompts(false);
  }, []);

  return {
    // State
    input,
    setInput,
    isLoading,
    copiedMessageId,
    favouriteMessages,
    setFavouriteMessages,
    showChatSearch,
    setShowChatSearch,
    chatSearchQuery,
    setChatSearchQuery,
    showGuidedPrompts,
    setShowGuidedPrompts,
    // Refs
    messagesEndRef,
    inputRef,
    chatSearchInputRef,
    // Handlers
    handleSend,
    handleKeyDown,
    handleCopyMessage,
    handleToggleFavourite,
    handleExtractCodeToFiles,
    handleSaveResponseAsMarkdown,
    handleSelectGuidedPrompt,
    handleCCSMethodGuidance,
    autoTestConnection,
    // Memo
    annotatedCodeContext,
  };
}
