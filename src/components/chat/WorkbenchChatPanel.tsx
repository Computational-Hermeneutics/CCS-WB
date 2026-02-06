"use client";

import React from "react";
import {
  PanelRight,
  PanelRightClose,
  Search,
  X,
  Check,
  Copy,
  FileCode,
  FileDown,
  Heart,
  Loader2,
  Sparkles,
  Eye,
  FileSearch,
  Lightbulb,
  SlidersHorizontal,
  Minus,
  Plus,
  ArrowUp,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn, formatTimestamp } from "@/lib/utils";
import { ContextPreview } from "@/components/chat";
import { GuidedPrompts } from "@/components/prompts";
import { GUIDED_PROMPTS } from "@/types";
import type { Session } from "@/types";
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from "@/types/app-settings";
import type { AppMode } from "@/types/app-settings";

interface WorkbenchChatPanelProps {
  // Visibility & layout
  annotationFullScreen: boolean;
  chatCollapsed: boolean;
  setChatCollapsed: (collapsed: boolean) => void;

  // Chat search
  showChatSearch: boolean;
  setShowChatSearch: (show: boolean) => void;
  chatSearchQuery: string;
  setChatSearchQuery: (query: string) => void;
  chatSearchInputRef: React.RefObject<HTMLInputElement | null>;

  // Session data
  session: Session;
  codeContents: Map<string, string>;

  // Messages refs
  messagesEndRef: React.RefObject<HTMLDivElement | null>;

  // Input
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: (value: string) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;

  // Chat state
  isLoading: boolean;
  copiedMessageId: string | null;
  handleCopyMessage: (id: string, content: string) => void;
  handleExtractCodeToFiles: (id: string, content: string) => void;
  handleSaveResponseAsMarkdown: (id: string, content: string) => void;
  handleToggleFavourite: (id: string) => void;
  favouriteMessages: Set<string>;
  getDisplayName: () => string | null;

  // Font size
  chatFontSize: number;
  showFontSizePopover: boolean;
  setShowFontSizePopover: (show: boolean) => void;
  setModeChatFontSize: (mode: AppMode, size: number) => void;

  // Guided prompts
  showGuidedPrompts: boolean;
  setShowGuidedPrompts: (show: boolean) => void;
  handleSelectGuidedPrompt: (prompt: string) => void;

  // Annotation suggestions
  setAnnotationModalMode: (mode: "type-selection" | "review") => void;
  setShowAnnotationSuggestionsModal: (show: boolean) => void;
  isRequestingAnnotations: boolean;

  // Context & search
  setShowSendContextModal: (show: boolean) => void;
  handleSearchLiterature: () => void;
  isSearchingLiterature: boolean;

  // Send
  handleSend: () => void;
  isAiReady: boolean;
  connectionStatus: string;

  // AI provider display
  aiProviderDisplayName: string;
}

const WorkbenchChatPanel = React.memo(function WorkbenchChatPanel({
  annotationFullScreen,
  chatCollapsed,
  setChatCollapsed,
  showChatSearch,
  setShowChatSearch,
  chatSearchQuery,
  setChatSearchQuery,
  chatSearchInputRef,
  session,
  codeContents,
  messagesEndRef,
  inputRef,
  input,
  setInput,
  handleKeyDown,
  isLoading,
  copiedMessageId,
  handleCopyMessage,
  handleExtractCodeToFiles,
  handleSaveResponseAsMarkdown,
  handleToggleFavourite,
  favouriteMessages,
  getDisplayName,
  chatFontSize,
  showFontSizePopover,
  setShowFontSizePopover,
  setModeChatFontSize,
  showGuidedPrompts,
  setShowGuidedPrompts,
  handleSelectGuidedPrompt,
  setAnnotationModalMode,
  setShowAnnotationSuggestionsModal,
  isRequestingAnnotations,
  setShowSendContextModal,
  handleSearchLiterature,
  isSearchingLiterature,
  handleSend,
  isAiReady,
  connectionStatus,
  aiProviderDisplayName,
}: WorkbenchChatPanelProps) {
  if (annotationFullScreen) return null;

  return (
    <div
      className={cn(
        "hidden md:flex flex-col transition-all duration-200",
        chatCollapsed ? "w-10 flex-shrink-0" : "flex-1 min-w-0"
      )}
      data-mobile-chat-hook
    >
      {/* Collapsed state - just show expand button */}
      {chatCollapsed ? (
        <div className="flex-1 flex flex-col items-center pt-2 bg-cream/30 border-l border-parchment">
          <button
            onClick={() => setChatCollapsed(false)}
            className="p-2 text-slate hover:text-ink hover:bg-cream rounded-sm transition-colors"
            title="Expand chat panel"
          >
            <PanelRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <span className="mt-2 text-[10px] text-slate-muted" style={{ writingMode: "vertical-rl" }}>Chat</span>
        </div>
      ) : (
      <>
      {/* Chat panel header bar - matches file tree header style */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-parchment bg-cream/30">
        <button
          onClick={() => setChatCollapsed(true)}
          className="p-1 text-slate-muted hover:text-ink hover:bg-cream rounded-sm transition-colors"
          title="Collapse chat panel"
        >
          <PanelRightClose className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <span className="font-sans text-[10px] text-slate-muted">
          AI: {aiProviderDisplayName}
        </span>
      </div>
      {/* Chat search bar */}
      {showChatSearch && (
        <div className="border-b border-parchment bg-cream/50 px-3 py-2 flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-slate-muted flex-shrink-0" strokeWidth={1.5} />
          <input
            ref={chatSearchInputRef as React.RefObject<HTMLInputElement>}
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {session.messages
          .filter(message => {
            // Hide internal system messages (file load/restore notifications)
            if (/^I've (loaded|restored|uploaded|added) \*\*/.test(message.content)) return false;
            if (/^Session ".*" restored from/.test(message.content)) return false;
            // Search filter
            if (chatSearchQuery && !message.content.toLowerCase().includes(chatSearchQuery.toLowerCase())) return false;
            return true;
          })
          .map((message) => (
          <div
            key={message.id}
            className={cn(
              "max-w-[90%] group/message",
              message.role === "user" ? "ml-auto" : "mr-auto"
            )}
          >
            <div
              className={cn(
                "px-4 py-3 rounded-sm",
                message.role === "user"
                  ? "bg-burgundy/10 text-ink"
                  : "bg-card border border-parchment"
              )}
            >
              <div
                className="font-body leading-relaxed prose prose-sm prose-slate dark:prose-invert max-w-none
                  prose-p:my-2 prose-p:leading-relaxed prose-p:text-[1em]
                  prose-headings:font-display prose-headings:text-ink prose-headings:mt-4 prose-headings:mb-2
                  prose-h1:text-[1.2em] prose-h2:text-[1.1em] prose-h3:text-[1em]
                  prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:text-[1em]
                  prose-code:font-mono prose-code:bg-parchment prose-code:px-1 prose-code:py-0.5 prose-code:rounded-sm prose-code:!text-[0.85em] prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-parchment prose-pre:border prose-pre:border-parchment-dark prose-pre:rounded-sm prose-pre:my-2 prose-pre:!text-[0.85em] prose-pre:font-mono prose-pre:overflow-x-auto
                  prose-blockquote:border-l-burgundy prose-blockquote:text-slate-muted prose-blockquote:my-2
                  prose-strong:text-ink prose-strong:font-semibold
                  prose-a:text-burgundy prose-a:no-underline hover:prose-a:underline"
                style={{ fontSize: `${chatFontSize}px` }}
              >
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </div>
            {/* User/Model name, timestamp, and actions inline */}
            <div className={cn(
              "mt-0.5 px-1 flex items-center gap-2",
              message.role === "user" ? "flex-row-reverse" : "flex-row"
            )}>
              <span className="font-sans text-[9px] text-slate-muted">
                {message.role !== "user" && message.metadata?.model && `${message.metadata.model}, `}
                {formatTimestamp(message.timestamp)}
                {message.role === "user" && getDisplayName() && `, ${getDisplayName()}`}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => handleCopyMessage(message.id, message.content)}
                  className="p-0.5 text-slate-muted hover:text-ink rounded-sm transition-colors opacity-0 group-hover/message:opacity-100"
                  title="Copy"
                >
                  {copiedMessageId === message.id ? (
                    <Check className="h-3 w-3 text-green-600" strokeWidth={1.5} />
                  ) : (
                    <Copy className="h-3 w-3" strokeWidth={1.5} />
                  )}
                </button>
                {/* Extract code to files button - all modes for assistant messages */}
                {message.role === 'assistant' && (
                  <button
                    onClick={() => handleExtractCodeToFiles(message.id, message.content)}
                    className="p-0.5 text-slate-muted hover:text-ink rounded-sm transition-colors opacity-0 group-hover/message:opacity-100"
                    title="Extract code to files"
                  >
                    <FileCode className="h-3 w-3" strokeWidth={1.5} />
                  </button>
                )}
                {/* Save response as markdown file */}
                {message.role === 'assistant' && (
                  <button
                    onClick={() => handleSaveResponseAsMarkdown(message.id, message.content)}
                    className="p-0.5 text-slate-muted hover:text-ink rounded-sm transition-colors opacity-0 group-hover/message:opacity-100"
                    title="Save response as markdown"
                  >
                    <FileDown className="h-3 w-3" strokeWidth={1.5} />
                  </button>
                )}
                <button
                  onClick={() => handleToggleFavourite(message.id)}
                  className={cn(
                    "p-0.5 rounded-sm transition-colors",
                    favouriteMessages.has(message.id)
                      ? "text-burgundy"
                      : "text-slate-muted hover:text-ink opacity-0 group-hover/message:opacity-100"
                  )}
                  title={favouriteMessages.has(message.id) ? "Marked" : "Mark"}
                >
                  <Heart
                    className="h-3 w-3"
                    strokeWidth={1.5}
                    fill={favouriteMessages.has(message.id) ? "currentColor" : "none"}
                  />
                </button>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start pl-2 py-2">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-burgundy/70 thinking-dot" />
              <div className="w-1.5 h-1.5 rounded-full bg-burgundy/70 thinking-dot" />
              <div className="w-1.5 h-1.5 rounded-full bg-burgundy/70 thinking-dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef as React.RefObject<HTMLDivElement>} />
      </div>

      {/* Context Preview */}
      <ContextPreview
        codeFiles={session.codeFiles}
        codeContents={codeContents}
        annotations={session.lineAnnotations}
      />

      {/* Guided Prompts */}
      {showGuidedPrompts && session.mode && (
        <div data-guided-prompts className="border-t border-parchment p-3">
          <GuidedPrompts
            mode={session.mode}
            currentPhase={session.currentPhase}
            onSelectPrompt={handleSelectGuidedPrompt}
            compact
          />
        </div>
      )}

      {/* Input area - Claude-style */}
      <div className="p-3 flex justify-center">
      <div className="w-full md:w-[80%]">
        {/* Claude-style input container */}
        <div className="bg-card rounded-2xl border border-parchment shadow-sm">
          {/* Textarea */}
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply..."
            className="w-full resize-none rounded-t-2xl px-4 py-3 font-body bg-transparent focus:outline-none overflow-hidden"
            style={{ fontSize: `${chatFontSize}px`, minHeight: '44px' }}
            rows={1}
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 pb-2">
            {/* Left side icons */}
            <div className="flex items-center gap-0.5">
              {session.codeFiles.length > 0 && (
                <>
                  <button
                    onClick={() => {
                      setAnnotationModalMode('type-selection');
                      setShowAnnotationSuggestionsModal(true);
                    }}
                    disabled={isRequestingAnnotations}
                    className={cn(
                      "p-1.5 rounded-md transition-colors",
                      isRequestingAnnotations
                        ? "text-slate-muted cursor-not-allowed"
                        : "text-slate hover:text-ink"
                    )}
                    title={isRequestingAnnotations ? "Getting suggestions..." : "AI annotation suggestions"}
                  >
                    {isRequestingAnnotations ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" strokeWidth={1.5} />
                    )}
                  </button>
                  <button
                    onClick={() => setShowSendContextModal(true)}
                    className="p-1.5 text-slate hover:text-ink rounded-md transition-colors"
                    title="View context sent to LLM"
                  >
                    <Eye className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </>
              )}
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
                    showChatSearch ? "text-burgundy" : "text-slate hover:text-ink"
                  )}
                  title="Search messages (Cmd+Shift+F)"
                >
                  <Search className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}
              {(GUIDED_PROMPTS[session.mode]?.[session.currentPhase]?.length ?? 0) > 0 && (
                <button
                  data-guided-prompts
                  onClick={() => setShowGuidedPrompts(!showGuidedPrompts)}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    showGuidedPrompts ? "text-burgundy" : "text-slate hover:text-ink"
                  )}
                  title="Guided prompts"
                >
                  <Lightbulb className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}
              {/* Reference search button */}
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
                  <FileSearch className="h-4 w-4" strokeWidth={1.5} />
                )}
              </button>
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
                        onClick={() => setModeChatFontSize("critique", chatFontSize - 1)}
                        disabled={chatFontSize <= FONT_SIZE_MIN}
                        className="p-1.5 text-slate hover:text-ink hover:bg-cream rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Decrease"
                      >
                        <Minus className="h-3 w-3" strokeWidth={1.5} />
                      </button>
                      <span className="text-xs text-ink font-mono w-6 text-center">{chatFontSize}</span>
                      <button
                        onClick={() => setModeChatFontSize("critique", chatFontSize + 1)}
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

              {/* Send button - color indicates connection status */}
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading || !isAiReady}
                className={cn(
                  "p-2 rounded-lg flex items-center justify-center transition-colors",
                  isLoading
                    ? "bg-parchment text-slate-muted cursor-not-allowed"
                    : connectionStatus === "success"
                      ? input.trim() && isAiReady
                        ? "bg-burgundy text-ivory hover:bg-burgundy-dark"
                        : "bg-burgundy/30 text-burgundy cursor-not-allowed"
                      : input.trim() && isAiReady
                        ? "bg-amber-500 text-ivory hover:bg-amber-600"
                        : "bg-amber-500/30 text-amber-700 cursor-not-allowed"
                )}
                title={
                  isLoading
                    ? "Sending..."
                    : !input.trim()
                      ? "Type a message"
                      : !isAiReady
                        ? "Click to test connection and send"
                        : connectionStatus === "success"
                          ? "Send message"
                          : "Click to test connection and send"
                }
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
      </>
      )}
    </div>
  );
});

export { WorkbenchChatPanel };
