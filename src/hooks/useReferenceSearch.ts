/**
 * Reference search hook extracted from WorkbenchLayout
 * Handles literature search, results display, and adding references as files
 */

import { useState, useCallback } from "react";
import type { CodeReference, Session, ReferenceResult } from "@/types";
import { formatReferenceAsMarkdown, generateReferenceFileName, getUniqueFileName } from "@/lib/code-extraction";

interface UseReferenceSearchParams {
  session: Session;
  addCode: (code: Omit<CodeReference, "id" | "uploadedAt">) => string;
  setCodeContent: (fileId: string, content: string) => void;
  getRequestHeaders: () => Record<string, string>;
  setSuccessMessage: (msg: string | null) => void;
}

export function useReferenceSearch({
  session,
  addCode,
  setCodeContent,
  getRequestHeaders,
  setSuccessMessage,
}: UseReferenceSearchParams) {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchingLiterature, setIsSearchingLiterature] = useState(false);
  const [searchResults, setSearchResults] = useState<ReferenceResult[]>([]);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [selectedReferences, setSelectedReferences] = useState<Set<number>>(new Set());

  const handleSearchLiterature = useCallback(() => {
    setSearchQuery("");
    setShowSearchModal(true);
  }, []);

  const getSuggestedSearchTerms = useCallback((): string[] => {
    const suggestions: string[] = [];

    // Add suggestions from code files (exclude auto-generated files)
    if (session.codeFiles.length > 0) {
      const code = session.codeFiles.find(f => !f.name.match(/^generated-\d+/));
      if (code) {
        if (code.name) suggestions.push(code.name.replace(/\.[^.]+$/, ""));
        if (code.language) suggestions.push(`${code.language} programming history`);
        if (code.author) suggestions.push(code.author);
        if (code.platform) suggestions.push(code.platform);
      }
    }

    if (session.mode === "interpret") {
      suggestions.push("computing history");
    }

    const recentContent = session.messages
      .filter(m => m.role === "user")
      .slice(-2)
      .map(m => m.content)
      .join(" ");

    const quotedTerms = recentContent.match(/"([^"]+)"/g);
    if (quotedTerms) {
      suggestions.push(...quotedTerms.map(t => t.replace(/"/g, "")));
    }

    return [...new Set(suggestions.filter(s => s && s.length > 2))].slice(0, 4);
  }, [session.codeFiles, session.mode, session.messages]);

  const executeSearchLiterature = useCallback(async (query: string) => {
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
          setSuccessMessage("Rate limited. Please wait a few seconds and try again.");
          return;
        }
        throw new Error(data.message || "Failed to search literature");
      }

      if (data.references && data.references.length > 0) {
        setSearchResults(data.references);
        setSelectedReferences(new Set(data.references.map((_: any, i: number) => i)));
        setShowResultsModal(true);
      } else {
        setSuccessMessage("No references found for that search");
      }
    } catch (error) {
      console.error("Reference search error:", error);
      setSuccessMessage("Failed to search references");
    } finally {
      setIsSearchingLiterature(false);
    }
  }, [getRequestHeaders, setSuccessMessage]);

  const handleAddSelectedReferences = useCallback(() => {
    if (selectedReferences.size === 0) {
      setShowResultsModal(false);
      return;
    }

    const existingFiles = session.codeFiles.map(f => f.name);
    let filesCreated = 0;

    selectedReferences.forEach((index) => {
      const reference = searchResults[index];
      if (!reference) return;

      const baseFileName = generateReferenceFileName(reference);
      const fileName = getUniqueFileName(baseFileName, existingFiles);
      const content = formatReferenceAsMarkdown(reference);

      const fileId = addCode({
        name: fileName,
        language: "markdown",
        source: "created",
        size: content.length,
      });

      setCodeContent(fileId, content);
      existingFiles.push(fileName);
      filesCreated++;
    });

    setSuccessMessage(`✓ Created ${filesCreated} reference file(s) in project`);
    setShowResultsModal(false);
    setSearchResults([]);
    setSelectedReferences(new Set());
  }, [selectedReferences, searchResults, session.codeFiles, addCode, setCodeContent, setSuccessMessage]);

  const dismissResults = useCallback(() => {
    setShowResultsModal(false);
    setSearchResults([]);
    setSelectedReferences(new Set());
  }, []);

  return {
    showSearchModal,
    setShowSearchModal,
    searchQuery,
    setSearchQuery,
    isSearchingLiterature,
    searchResults,
    showResultsModal,
    setShowResultsModal,
    selectedReferences,
    setSelectedReferences,
    handleSearchLiterature,
    getSuggestedSearchTerms,
    executeSearchLiterature,
    handleAddSelectedReferences,
    dismissResults,
  };
}
