"use client";

import React from "react";
import {
  X,
  FileText,
  FileDown,
  Save,
  AlertTriangle,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Session, LineAnnotationType, ReferenceResult } from "@/types";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { AISettingsPanel } from "@/components/settings/AISettingsPanel";

interface WorkbenchModalsProps {
  // Settings
  showSettingsModal: boolean;
  setShowSettingsModal: (show: boolean) => void;
  settingsTab: "profile" | "code" | "appearance" | "ai" | "about";

  // AI Settings
  showAIPanel: boolean;
  setShowAIPanel: (show: boolean) => void;

  // Reference Search
  showSearchModal: boolean;
  setShowSearchModal: (show: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  executeSearchLiterature: (query: string) => void;
  getSuggestedSearchTerms: () => string[];

  // Annotation Suggestions
  showAnnotationSuggestionsModal: boolean;
  dismissAnnotationSuggestions: () => void;
  annotationModalMode: "type-selection" | "review";
  selectedAnnotationTypes: Set<LineAnnotationType>;
  setSelectedAnnotationTypes: (types: Set<LineAnnotationType>) => void;
  handleRequestAnnotationSuggestions: (types: Set<LineAnnotationType>) => void;
  isRequestingAnnotations: boolean;
  currentSuggestionIndex: number;
  annotationSuggestions: Array<{
    lineNumber: number;
    type: LineAnnotationType;
    content: string;
    lineContent: string;
  }>;
  handleDiscardCurrentSuggestion: () => void;
  handleAddCurrentSuggestion: () => void;

  // Reference Results
  showResultsModal: boolean;
  setShowResultsModal: (show: boolean) => void;
  searchResults: ReferenceResult[];
  selectedReferences: Set<number>;
  setSelectedReferences: (refs: Set<number>) => void;
  dismissResults: () => void;
  handleAddSelectedReferences: () => void;

  // Success Toast
  successMessage: string | null;

  // Export
  showExportModal: boolean;
  setShowExportModal: (show: boolean) => void;
  handleExportJSON: () => void;
  handleExportText: () => void;
  handleExportPDF: () => void;

  // Save Session
  showSaveModal: boolean;
  setShowSaveModal: (show: boolean) => void;
  saveModalName: string;
  setSaveModalName: (name: string) => void;
  handleConfirmSave: () => void;

  // New Project
  showNewProjectModal: boolean;
  setShowNewProjectModal: (show: boolean) => void;
  handleNewProject: () => void;

  // Send Context
  showSendContextModal: boolean;
  setShowSendContextModal: (show: boolean) => void;
  session: Session;
  annotatedCodeContext: string;
}

const WorkbenchModals = React.memo(function WorkbenchModals({
  showSettingsModal,
  setShowSettingsModal,
  settingsTab,
  showAIPanel,
  setShowAIPanel,
  showSearchModal,
  setShowSearchModal,
  searchQuery,
  setSearchQuery,
  executeSearchLiterature,
  getSuggestedSearchTerms,
  showAnnotationSuggestionsModal,
  dismissAnnotationSuggestions,
  annotationModalMode,
  selectedAnnotationTypes,
  setSelectedAnnotationTypes,
  handleRequestAnnotationSuggestions,
  isRequestingAnnotations,
  currentSuggestionIndex,
  annotationSuggestions,
  handleDiscardCurrentSuggestion,
  handleAddCurrentSuggestion,
  showResultsModal,
  setShowResultsModal,
  searchResults,
  selectedReferences,
  setSelectedReferences,
  dismissResults,
  handleAddSelectedReferences,
  successMessage,
  showExportModal,
  setShowExportModal,
  handleExportJSON,
  handleExportText,
  handleExportPDF,
  showSaveModal,
  setShowSaveModal,
  saveModalName,
  setSaveModalName,
  handleConfirmSave,
  showNewProjectModal,
  setShowNewProjectModal,
  handleNewProject,
  showSendContextModal,
  setShowSendContextModal,
  session,
  annotatedCodeContext,
}: WorkbenchModalsProps) {
  return (
    <>
      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        initialTab={settingsTab}
      />

      {/* AI Settings Panel */}
      <AISettingsPanel
        isOpen={showAIPanel}
        onClose={() => setShowAIPanel(false)}
      />

      {/* Reference Search Modal */}
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

      {/* Annotation Suggestions Modal - Two modes: type-selection and review */}
      {showAnnotationSuggestionsModal && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4"
          onClick={dismissAnnotationSuggestions}
        >
          <div
            className="bg-popover rounded-sm shadow-editorial-lg p-4 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col border border-parchment modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            {annotationModalMode === 'type-selection' ? (
              <>
                {/* Type Selection Mode */}
                <h3 className="font-display text-sm text-ink mb-2">Select Annotation Types</h3>
                <p className="font-body text-[11px] text-slate mb-3">
                  Choose which types of annotations you'd like the AI to suggest for your code.
                </p>

                {/* Annotation type checkboxes */}
                <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                  {(['observation', 'question', 'metaphor', 'pattern', 'context', 'critique'] as LineAnnotationType[]).map((type) => (
                    <label
                      key={type}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-sm border cursor-pointer transition-colors",
                        selectedAnnotationTypes.has(type)
                          ? "bg-burgundy/5 border-burgundy/30"
                          : "bg-card border-parchment hover:border-gold/50"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAnnotationTypes.has(type)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedAnnotationTypes);
                          if (e.target.checked) {
                            newSelected.add(type);
                          } else {
                            newSelected.delete(type);
                          }
                          setSelectedAnnotationTypes(newSelected);
                        }}
                        className="h-4 w-4 rounded border-parchment-dark text-burgundy focus:ring-burgundy focus:ring-offset-0"
                      />
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-sm text-[9px] font-medium uppercase tracking-wide",
                          type === 'observation' && "bg-blue-100 text-blue-700",
                          type === 'question' && "bg-purple-100 text-purple-700",
                          type === 'metaphor' && "bg-pink-100 text-pink-700",
                          type === 'pattern' && "bg-amber-100 text-amber-700",
                          type === 'context' && "bg-emerald-100 text-emerald-700",
                          type === 'critique' && "bg-red-100 text-red-700"
                        )}>
                          {type === 'observation' && 'Observation'}
                          {type === 'question' && 'Question'}
                          {type === 'metaphor' && 'Metaphor'}
                          {type === 'pattern' && 'Pattern'}
                          {type === 'context' && 'Context'}
                          {type === 'critique' && 'Critique'}
                        </span>
                        <span className="font-body text-[11px] text-slate">
                          {type === 'observation' && 'Descriptive observations about the code'}
                          {type === 'question' && 'Questions to prompt deeper analysis'}
                          {type === 'metaphor' && 'Metaphors and symbolic interpretations'}
                          {type === 'pattern' && 'Recurring patterns and structures'}
                          {type === 'context' && 'Historical and cultural context'}
                          {type === 'critique' && 'Critical analysis and evaluation'}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-between border-t border-parchment pt-3">
                  <button
                    onClick={() => {
                      const allTypes: LineAnnotationType[] = ['observation', 'question', 'metaphor', 'pattern', 'context', 'critique'];
                      if (selectedAnnotationTypes.size === 6) {
                        setSelectedAnnotationTypes(new Set());
                      } else {
                        setSelectedAnnotationTypes(new Set(allTypes));
                      }
                    }}
                    className="text-[11px] text-slate hover:text-ink transition-colors"
                  >
                    {selectedAnnotationTypes.size === 6 ? "Deselect all" : "Select all"}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={dismissAnnotationSuggestions}
                      className="btn-editorial-ghost text-[11px] px-3 py-1.5"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleRequestAnnotationSuggestions(selectedAnnotationTypes)}
                      disabled={selectedAnnotationTypes.size === 0 || isRequestingAnnotations}
                      className={cn(
                        "text-[11px] px-3 py-1.5 rounded-sm",
                        selectedAnnotationTypes.size > 0 && !isRequestingAnnotations
                          ? "btn-editorial-primary"
                          : "bg-parchment text-slate-muted cursor-not-allowed"
                      )}
                    >
                      {isRequestingAnnotations ? "Generating..." : `Generate (${selectedAnnotationTypes.size})`}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Review Mode - One suggestion at a time */}
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display text-sm text-ink">Review Annotation Suggestions</h3>
                  <p className="font-mono text-[10px] text-slate-muted">
                    {currentSuggestionIndex + 1} of {annotationSuggestions.length}
                  </p>
                </div>
                <p className="font-body text-[11px] text-slate mb-3">
                  Review each suggestion and choose to add or discard it.
                </p>

                {/* Current suggestion display */}
                {annotationSuggestions[currentSuggestionIndex] && (
                  <div className="flex-1 overflow-y-auto mb-4">
                    <div className="p-4 rounded-sm border border-parchment bg-card">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-mono text-[11px] text-slate-muted">
                          Line {annotationSuggestions[currentSuggestionIndex].lineNumber}
                        </p>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-sm text-[9px] font-medium uppercase tracking-wide",
                          annotationSuggestions[currentSuggestionIndex].type === 'observation' && "bg-blue-100 text-blue-700",
                          annotationSuggestions[currentSuggestionIndex].type === 'question' && "bg-purple-100 text-purple-700",
                          annotationSuggestions[currentSuggestionIndex].type === 'metaphor' && "bg-pink-100 text-pink-700",
                          annotationSuggestions[currentSuggestionIndex].type === 'pattern' && "bg-amber-100 text-amber-700",
                          annotationSuggestions[currentSuggestionIndex].type === 'context' && "bg-emerald-100 text-emerald-700",
                          annotationSuggestions[currentSuggestionIndex].type === 'critique' && "bg-red-100 text-red-700"
                        )}>
                          {annotationSuggestions[currentSuggestionIndex].type === 'observation' && 'Observation'}
                          {annotationSuggestions[currentSuggestionIndex].type === 'question' && 'Question'}
                          {annotationSuggestions[currentSuggestionIndex].type === 'metaphor' && 'Metaphor'}
                          {annotationSuggestions[currentSuggestionIndex].type === 'pattern' && 'Pattern'}
                          {annotationSuggestions[currentSuggestionIndex].type === 'context' && 'Context'}
                          {annotationSuggestions[currentSuggestionIndex].type === 'critique' && 'Critique'}
                        </span>
                      </div>

                      <div className="mb-3 p-3 bg-slate-50 dark:bg-slate-900/30 rounded border border-slate/20">
                        <p className="font-sans text-[9px] uppercase tracking-widest text-slate-muted mb-1">
                          Line of code
                        </p>
                        <p className="font-mono text-[11px] text-ink">
                          {annotationSuggestions[currentSuggestionIndex].lineContent}
                        </p>
                      </div>

                      <div>
                        <p className="font-sans text-[9px] uppercase tracking-widest text-slate-muted mb-1">
                          Annotation
                        </p>
                        <p className="font-body text-[11px] text-ink">
                          {annotationSuggestions[currentSuggestionIndex].content}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center justify-end gap-2 border-t border-parchment pt-3">
                  <button
                    onClick={handleDiscardCurrentSuggestion}
                    className="btn-editorial-ghost text-[11px] px-3 py-1.5"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleAddCurrentSuggestion}
                    className="btn-editorial-primary text-[11px] px-3 py-1.5"
                  >
                    Add
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reference Results Selection Modal */}
      {showResultsModal && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4"
          onClick={() => setShowResultsModal(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-editorial-lg p-4 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col border border-parchment modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-sm text-ink mb-2">Select References to Add</h3>
            <p className="font-body text-[11px] text-slate mb-3">
              Found {searchResults.length} references. Select which ones to add to your project.
            </p>

            {/* Results list with checkboxes */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {searchResults.map((reference, index) => (
                <label
                  key={index}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-sm border cursor-pointer transition-colors",
                    selectedReferences.has(index)
                      ? "bg-burgundy/5 border-burgundy/30"
                      : "bg-card border-parchment hover:border-gold/50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedReferences.has(index)}
                    onChange={(e) => {
                      const newSelected = new Set(selectedReferences);
                      if (e.target.checked) {
                        newSelected.add(index);
                      } else {
                        newSelected.delete(index);
                      }
                      setSelectedReferences(newSelected);
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-parchment-dark text-burgundy focus:ring-burgundy focus:ring-offset-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[12px] text-ink font-medium mb-1">
                      {reference.title}
                    </p>
                    <p className="font-sans text-[10px] text-slate mb-1">
                      {reference.authors.join(", ")} {reference.year && `(${reference.year})`}
                    </p>
                    {reference.description && (
                      <p className="font-body text-[10px] text-slate-muted line-clamp-2">
                        {reference.description}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between border-t border-parchment pt-3">
              <button
                onClick={() => {
                  if (selectedReferences.size === searchResults.length) {
                    setSelectedReferences(new Set());
                  } else {
                    setSelectedReferences(new Set(searchResults.map((_, i) => i)));
                  }
                }}
                className="text-[11px] text-slate hover:text-ink transition-colors"
              >
                {selectedReferences.size === searchResults.length ? "Deselect all" : "Select all"}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={dismissResults}
                  className="btn-editorial-ghost text-[11px] px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSelectedReferences}
                  disabled={selectedReferences.size === 0}
                  className={cn(
                    "text-[11px] px-3 py-1.5 rounded-sm",
                    selectedReferences.size > 0
                      ? "btn-editorial-primary"
                      : "bg-parchment text-slate-muted cursor-not-allowed"
                  )}
                >
                  Add {selectedReferences.size > 0 ? `(${selectedReferences.size})` : ""}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {successMessage && (
        <div className="fixed bottom-4 right-4 bg-popover border border-parchment rounded-sm shadow-editorial-lg px-4 py-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <p className="font-body text-[12px] text-ink">{successMessage}</p>
        </div>
      )}

      {/* Export Session Log Modal */}
      {showExportModal && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setShowExportModal(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-lg p-6 w-full max-w-md mx-4 border border-parchment modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg text-ink">Export Session Log</h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-slate-muted hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <p className="font-body text-sm text-slate mb-2">
              Export a comprehensive log of your CCS session for documentation and research.
            </p>
            <p className="font-body text-xs text-slate-muted mb-6">
              Includes: metadata, code with annotations, full conversation, literature references, and statistics.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleExportJSON}
                className="w-full text-left p-4 border border-parchment rounded-sm hover:border-burgundy hover:bg-burgundy/5 transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-green-600" strokeWidth={1.5} />
                  <h4 className="font-display text-sm text-ink">JSON Format</h4>
                </div>
                <p className="font-body text-xs text-slate">
                  Structured data format. Best for programmatic analysis or reimport.
                </p>
              </button>
              <button
                onClick={handleExportText}
                className="w-full text-left p-4 border border-parchment rounded-sm hover:border-burgundy hover:bg-burgundy/5 transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-blue-600" strokeWidth={1.5} />
                  <h4 className="font-display text-sm text-ink">Plain Text</h4>
                </div>
                <p className="font-body text-xs text-slate">
                  Human-readable format. Best for reading, sharing, or archiving.
                </p>
              </button>
              <button
                onClick={handleExportPDF}
                className="w-full text-left p-4 border border-parchment rounded-sm hover:border-burgundy hover:bg-burgundy/5 transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileDown className="h-4 w-4 text-burgundy" strokeWidth={1.5} />
                  <h4 className="font-display text-sm text-ink">PDF Document</h4>
                </div>
                <p className="font-body text-xs text-slate">
                  Formatted document. Best for printing or formal documentation.
                </p>
              </button>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-sm text-slate hover:text-ink border border-parchment rounded-sm"
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
            className="bg-popover rounded-sm shadow-editorial-lg p-4 w-full max-w-sm mx-4 border border-parchment"
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

      {/* New Project Confirmation Modal */}
      {showNewProjectModal && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setShowNewProjectModal(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-editorial-lg p-4 w-full max-w-sm mx-4 border border-parchment"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-sm text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
                New Project
              </h3>
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="text-slate-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <p className="font-body text-[11px] text-slate mb-3">
              This will clear your current session including all code files, annotations, and chat history. This action cannot be undone.
            </p>
            <p className="font-body text-[11px] text-amber-700 dark:text-amber-400 mb-4">
              Make sure to save your session first if you want to keep your work.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="text-[11px] px-3 py-1.5 rounded-sm font-body border border-parchment-dark text-slate hover:bg-cream hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNewProject}
                className="text-[11px] px-3 py-1.5 rounded-sm font-body bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Clear and Start New
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Context Modal - Shows what gets sent to the LLM */}
      {showSendContextModal && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={() => setShowSendContextModal(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-lg w-full max-w-2xl mx-4 border border-parchment max-h-[80vh] flex flex-col modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-parchment">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-burgundy" strokeWidth={1.5} />
                <h3 className="font-display text-lg text-ink">LLM Context Preview</h3>
              </div>
              <button
                onClick={() => setShowSendContextModal(false)}
                className="text-slate-muted hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="font-body text-sm text-slate mb-4">
                This is the annotated code context that gets sent to the LLM with each message.
                Your annotations are embedded as <code className="bg-cream px-1 rounded text-xs">// An:Type:</code> comments.
              </p>
              <div className="mb-4 p-3 bg-cream/50 rounded-sm border border-parchment">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-sans text-xs font-medium text-ink">Summary</span>
                </div>
                <ul className="font-body text-xs text-slate space-y-1">
                  <li>• {session.codeFiles.length} code file{session.codeFiles.length !== 1 ? "s" : ""}</li>
                  <li>• {session.lineAnnotations.length} annotation{session.lineAnnotations.length !== 1 ? "s" : ""}</li>
                  <li>• {annotatedCodeContext.length.toLocaleString()} characters total</li>
                </ul>
              </div>
              <div className="border border-parchment rounded-sm">
                <div className="px-3 py-2 bg-cream/30 border-b border-parchment">
                  <span className="font-sans text-xs text-slate-muted uppercase tracking-wider">Context Sent to LLM</span>
                </div>
                <pre className="p-3 text-xs font-mono text-foreground whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto bg-card">
                  {annotatedCodeContext || "(No code loaded yet)"}
                </pre>
              </div>
            </div>
            <div className="p-4 border-t border-parchment flex justify-between items-center">
              <p className="font-body text-xs text-slate-muted">
                Add annotations in the code panel to enrich the context.
              </p>
              <button
                onClick={() => setShowSendContextModal(false)}
                className="px-4 py-2 text-sm text-slate hover:text-ink border border-parchment rounded-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export { WorkbenchModals };
