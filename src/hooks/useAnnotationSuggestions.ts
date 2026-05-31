/**
 * Annotation suggestions hook extracted from WorkbenchLayout
 * Handles AI-powered annotation suggestions, review modal, and adding annotations
 */

import { useState, useCallback } from "react";
import type { Session, LineAnnotationType, LineAnnotation } from "@/types";
import type { AISettings } from "@/types/ai-settings";

/**
 * Find the smallest substring starting at `start` that is a balanced
 * bracket expression matching the opener at `text[start]` ("{" or "[").
 * Respects string literals so braces inside JSON strings don't confuse
 * the counter. Returns the substring including both brackets, or null.
 */
function extractBalanced(text: string, start: number): string | null {
  const open = text[start];
  const close = open === "{" ? "}" : open === "[" ? "]" : "";
  if (!close) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Permissive recovery of the annotations JSON from an LLM response.
 * Strips reasoning preambles, tries fenced-then-bare extraction, and
 * uses a brace-counting balanced extractor rather than greedy regex so
 * stray punctuation in the prose doesn't break parsing.
 */
function extractAnnotationJson(raw: string): { annotations: unknown[] } | null {
  if (!raw) return null;

  // 1. Strip reasoning-model preambles like <think>…</think> or
  //    <thought>…</thought> which can contain stray braces.
  let text = raw.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "");
  text = text.replace(/<thought>[\s\S]*?<\/thought>/gi, "");

  const tryParse = (candidate: string): { annotations: unknown[] } | null => {
    try {
      const obj = JSON.parse(candidate);
      if (Array.isArray(obj)) return { annotations: obj };
      if (obj && typeof obj === "object" && Array.isArray((obj as { annotations?: unknown }).annotations)) {
        return obj as { annotations: unknown[] };
      }
    } catch {
      /* fall through */
    }
    return null;
  };

  // 2. Try every fenced ```json … ``` (or plain ``` … ```) block, in
  //    order. Don't require the fence to end the response.
  const fenceRe = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    const parsed = tryParse(m[1].trim());
    if (parsed) return parsed;
  }

  // 3. Walk every "{" in order, looking for a balanced JSON object that
  //    contains an "annotations" key and parses cleanly.
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    const candidate = extractBalanced(text, i);
    if (!candidate || !/"annotations"\s*:/.test(candidate)) continue;
    const parsed = tryParse(candidate);
    if (parsed) return parsed;
  }

  // 4. Walk every "[" in order, looking for a balanced array that
  //    parses as an array of objects with a lineNumber field.
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "[") continue;
    const candidate = extractBalanced(text, i);
    if (!candidate) continue;
    const parsed = tryParse(candidate);
    if (parsed && parsed.annotations.some((a) => a && typeof a === "object" && "lineNumber" in (a as object))) {
      return parsed;
    }
  }

  // 5. Truncation recovery: the model was cut off mid-array by
  //    max_tokens, leaving an unclosed [{...},{...partial}. Find the
  //    first "[" and collect every fully-balanced top-level object
  //    inside it (discarding any partial one at the tail). If we
  //    rescued >=1, return them — better partial than nothing.
  const firstBracket = text.indexOf("[");
  if (firstBracket !== -1) {
    const rescued: unknown[] = [];
    let i = firstBracket + 1;
    while (i < text.length) {
      while (i < text.length && text[i] !== "{") i++;
      if (i >= text.length) break;
      const obj = extractBalanced(text, i);
      if (!obj) break; // partial / truncated — stop here
      const parsedObj = tryParse(`[${obj}]`);
      if (parsedObj && parsedObj.annotations.length === 1) {
        rescued.push(parsedObj.annotations[0]);
      }
      i += obj.length;
    }
    if (rescued.length > 0 && rescued.some((a) => a && typeof a === "object" && "lineNumber" in (a as object))) {
      console.warn(`[AI Annotation Suggestions] Output appears truncated; rescued ${rescued.length} complete annotation(s) and dropped the partial tail.`);
      return { annotations: rescued };
    }
  }

  return null;
}

interface UseAnnotationSuggestionsParams {
  selectedFileId: string | null;
  session: Session;
  codeContents: Map<string, string>;
  isAiReady: boolean;
  aiSettings: AISettings;
  getRequestHeaders: () => Record<string, string>;
  autoTestConnection: () => Promise<boolean>;
  setShowAIPanel: (show: boolean) => void;
  setSuccessMessage: (msg: string | null) => void;
  addLineAnnotation: (annotation: Omit<LineAnnotation, "id" | "createdAt">) => void;
}

export function useAnnotationSuggestions({
  selectedFileId,
  session,
  codeContents,
  isAiReady,
  aiSettings,
  getRequestHeaders,
  autoTestConnection,
  setShowAIPanel,
  setSuccessMessage,
  addLineAnnotation,
}: UseAnnotationSuggestionsParams) {
  const [showAnnotationSuggestionsModal, setShowAnnotationSuggestionsModal] = useState(false);
  const [annotationModalMode, setAnnotationModalMode] = useState<'type-selection' | 'review'>('type-selection');
  const [selectedAnnotationTypes, setSelectedAnnotationTypes] = useState<Set<LineAnnotationType>>(new Set(['observation', 'question', 'metaphor', 'pattern', 'context', 'critique']));
  const [annotationSuggestions, setAnnotationSuggestions] = useState<Array<{
    lineNumber: number;
    type: LineAnnotationType;
    content: string;
    lineContent: string;
  }>>([]);
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);
  const [selectedAnnotations, setSelectedAnnotations] = useState<Set<number>>(new Set());
  const [isRequestingAnnotations, setIsRequestingAnnotations] = useState(false);

  const handleRequestAnnotationSuggestions = useCallback(async (requestedTypes: Set<LineAnnotationType>) => {
    // Check if we have a selected file and it has content
    if (!selectedFileId) {
      setSuccessMessage("Please open a code file first");
      return;
    }

    const selectedFile = session.codeFiles.find(f => f.id === selectedFileId);
    const fileContent = codeContents.get(selectedFileId);

    if (!selectedFile || !fileContent) {
      setSuccessMessage("Please open a code file first");
      return;
    }

    // Check if any types are selected
    if (requestedTypes.size === 0) {
      setSuccessMessage("Please select at least one annotation type");
      return;
    }

    // Check if connection is ready
    if (!isAiReady) {
      const connected = await autoTestConnection();
      if (!connected) {
        setShowAIPanel(true);
        return;
      }
    }

    setIsRequestingAnnotations(true);

    try {
      // Get LLM name for attribution
      const llmName = aiSettings.customModelId || aiSettings.model || aiSettings.provider || 'AI';

      // Calculate actual line count for this file
      const lineCount = fileContent.split('\n').length;

      // Format requested annotation types
      const requestedTypesArray = Array.from(requestedTypes);
      const typesDescription = requestedTypesArray.map(t => `"${t}"`).join(', ');

      // Mode-specific annotation guidance
      let modeGuidance = '';
      if (session.mode === 'critique') {
        // Analyze mode: rigorous CCS practice for practitioners
        modeGuidance = `
ANALYZE MODE GUIDANCE:
You are supporting a CCS practitioner engaged in rigorous critical code studies work. Your annotations should provide methodological support for serious analysis. Focus on:
- Identifying critical entry points for close reading and hermeneutic engagement
- Signposting connections between code sections to reveal structural patterns and power relations
- Noting moments where technical decisions encode cultural, political, or ideological positions
- Highlighting areas where materialist, archaeological, or interpretive reading methods would yield insights
- Pointing to specific lines that warrant deeper theoretical engagement
- Supporting rigorous scholarly analysis by marking significant interpretive opportunities

Your goal is to provide methodologically sound support for practitioners conducting critical code studies research.`;
      } else if (session.mode === 'interpret') {
        // Learn mode: teach CCS methodology
        modeGuidance = `
LEARN MODE GUIDANCE:
Your annotations should teach Critical Code Studies methodology. Focus on:
- Helping the user understand where CCS can provide insights
- Explaining historical, cultural, or theoretical context
- Demonstrating how to apply CCS reading methods to code
- Pointing out moments where code reveals power structures, cultural assumptions, or ideological positions
- Teaching interpretive approaches (materialist, hermeneutic, archaeological, etc.)
- Linking code practices to broader social and cultural implications

Your goal is to teach the user HOW to read code critically using CCS methods.`;
      } else if (session.mode === 'create') {
        // Create mode: generative suggestions
        modeGuidance = `
CREATE MODE GUIDANCE:
Your annotations should support creative code generation and exploration. Focus on:
- Suggesting where code could be expanded or extended
- Noting interesting possibilities for further development
- Proposing creative variations or alternative approaches
- Identifying opportunities for experimentation
- Highlighting areas ripe for algorithmic exploration
- Encouraging playful and creative engagement with the code

Your goal is to inspire and support the creative coding process.`;
      }

      // Build the prompt for annotation suggestions
      const systemPrompt = `You are an expert in Critical Code Studies. Analyze the provided code and suggest 3-5 annotations that would be valuable for close reading and critical analysis.
${modeGuidance}

CRITICAL: You MUST respond with valid JSON in the exact format specified below. Do not add any explanatory text before or after the JSON.

IMPORTANT LINE NUMBER CONSTRAINT: The file you are analyzing has exactly ${lineCount} lines (numbered 1 to ${lineCount}).
All lineNumber values MUST be between 1 and ${lineCount} inclusive.
Do NOT use line numbers from any original source code if this is an excerpt or sample.
Only use line numbers that actually exist in the provided file (1-${lineCount}).

ANNOTATION TYPES REQUESTED: Only generate annotations of these types: ${typesDescription}.

For each annotation, provide exactly these three fields:
1. "lineNumber" (required): A positive integer between 1 and ${lineCount} indicating which line to annotate
2. "type" (required): Must be one of these exact strings: ${typesDescription}
3. "content" (required): Your annotation text (1-2 concise sentences explaining the interpretive entry point)

Respond ONLY with this JSON structure (no other fields, no other text):
{
  "annotations": [
    {
      "lineNumber": 5,
      "type": "observation",
      "content": "Your annotation text here."
    },
    {
      "lineNumber": 12,
      "type": "critique",
      "content": "Another annotation."
    }
  ]
}

Do NOT use: "line_number", "comment", "annotation", "id", "code_excerpt", or any other field names.
Do NOT set lineNumber to null or 0.
Use only: "lineNumber" (integer 1-${lineCount}), "type" (string from the list), "content" (string).`;

      // Mode display name for context
      const modeContext = session.mode === 'critique' ? 'Analyze Code'
        : session.mode === 'interpret' ? 'Learn Methods'
        : 'Create Code';

      // Prepend line numbers to make it completely unambiguous for the AI
      const numberedContent = fileContent
        .split('\n')
        .map((line, index) => `${index + 1}: ${line}`)
        .join('\n');

      const userPrompt = `Analyze this code file and suggest 3-5 annotations for ${modeContext} mode:

File: ${selectedFile.name}
Language: ${selectedFile.language || 'unknown'}
Total Lines: ${lineCount}

The code below is shown with line numbers prepended (e.g., "1: ", "2: ", etc.).
Use these prepended numbers for your lineNumber field in the JSON response.
Valid line numbers: 1 to ${lineCount}

\`\`\`
${numberedContent}
\`\`\`

Respond with valid JSON array containing 3-5 annotation suggestions. Each suggestion must have:
- lineNumber: integer from 1 to ${lineCount} (use the prepended line numbers above)
- type: one of (observation, question, metaphor, pattern, context, critique)
- content: 1-2 sentence annotation following the ${modeContext} guidance
- line: the actual code line text (without the prepended line number)

Follow the ${modeContext} guidance provided above.`;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getRequestHeaders() },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          settings: session.settings,
          mode: "critique",
          // Annotation suggestions emit 3-5 paragraph-length JSON
          // entries; the default 1024-token reply budget truncates
          // verbose models (gemma, large reasoners) mid-array, so the
          // JSON parser then sees an unclosed bracket. 4096 gives
          // comfortable headroom while still being a hard cap.
          maxTokens: 4096,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          setSuccessMessage("Rate limited. Please wait and try again.");
          return;
        }
        throw new Error("Failed to get annotation suggestions");
      }

      const rawPayload = await response.json();

      // Browser-direct dispatch (see browser-direct.ts) for every
      // provider that opts in via shouldBrowserDispatch.
      let aiResponse: string;
      if (rawPayload?.browserDirect) {
        const { dispatchBrowserDirect } = await import("@/lib/ai/browser-direct");
        aiResponse = await dispatchBrowserDirect(rawPayload);
      } else {
        aiResponse = rawPayload.message.content;
      }

      console.log("[AI Annotation Suggestions] Raw AI response:", aiResponse);

      // Robust JSON extraction. Local models (especially reasoning
      // variants like qwen3-vl, deepseek-r1, and some gemma builds)
      // routinely emit:
      //   - <think>…</think> blocks before the answer,
      //   - chatty prefaces like "Here are 5 annotations:" then a fence,
      //   - fenced JSON with trailing prose after the closing fence,
      //   - bare JSON with no fence, or
      //   - stray braces in the thinking text.
      // Walk through the most permissive recovery steps in order; only
      // give up when none of them yield parseable JSON containing the
      // expected shape.
      const parsed = extractAnnotationJson(aiResponse);

      if (!parsed) {
        console.error("[AI Annotation Suggestions] Could not extract JSON from response");
        console.error("Response text:", aiResponse);
        const looksLikeRefusal = /sorry|cannot|can't|unable|refuse/i.test(aiResponse.slice(0, 200));
        setSuccessMessage(
          looksLikeRefusal
            ? "The model declined to produce annotations. Try a stronger model or rephrase."
            : "Model output wasn't valid JSON. Check the browser console for the raw response, or try a different model — local models vary in how strictly they follow format instructions."
        );
        return;
      }

      const rawSuggestions = parsed.annotations || [];
      console.log("[AI Annotation Suggestions] Parsed suggestions:", rawSuggestions);

      if (rawSuggestions.length === 0) {
        setSuccessMessage("AI did not suggest any annotations");
        return;
      }

      // Normalize field names (handle alternative naming from different LLMs)
      const suggestions = rawSuggestions.map((s: any) => {
        // Try various field names for line number
        let lineNum = s.lineNumber || s.line_number || s.lineNum || s.line || s.line_start;

        // If lineNum is a string (like "000010"), parse it
        if (typeof lineNum === 'string') {
          lineNum = parseInt(lineNum, 10);
        }

        return {
          lineNumber: lineNum,
          type: s.type || 'observation', // Default to observation if missing
          content: s.content || s.comment || s.annotation || s.text || '',
        };
      });

      console.log("[AI Annotation Suggestions] Normalized suggestions:", suggestions);

      // Validate and prepare annotations
      const codeLines = fileContent.split('\n');
      const validSuggestions = suggestions
        .filter((s: any) => {
          // Convert string line numbers to integers
          const lineNum = typeof s.lineNumber === 'string' ? parseInt(s.lineNumber, 10) : s.lineNumber;

          const isValid = lineNum &&
                 lineNum > 0 &&
                 lineNum <= codeLines.length &&
                 s.type &&
                 s.content;

          if (!isValid) {
            console.log("[AI Annotation Suggestions] Invalid suggestion filtered out:", s);
            console.log("  - lineNumber:", lineNum, "(valid range: 1-" + codeLines.length + ")");
            console.log("  - type:", s.type);
            console.log("  - content:", s.content ? "present" : "missing");
          }

          return isValid;
        })
        .map((s: any) => {
          const lineNum = typeof s.lineNumber === 'string' ? parseInt(s.lineNumber, 10) : s.lineNumber;
          return {
            lineNumber: lineNum,
            type: s.type as LineAnnotationType,
            content: s.content,
            lineContent: codeLines[lineNum - 1] || '',
          };
        });

      console.log("[AI Annotation Suggestions] Valid suggestions after filtering:", validSuggestions.length);

      if (validSuggestions.length === 0) {
        setSuccessMessage("No valid annotation suggestions found. Check browser console for details.");
        return;
      }

      // Show review modal with first suggestion
      setAnnotationSuggestions(validSuggestions);
      setCurrentSuggestionIndex(0);
      setAnnotationModalMode('review');
      setShowAnnotationSuggestionsModal(true);

    } catch (error) {
      console.error("Error requesting annotation suggestions:", error);
      setSuccessMessage("Failed to get annotation suggestions");
    } finally {
      setIsRequestingAnnotations(false);
    }
  }, [selectedFileId, session.codeFiles, session.settings, session.mode, codeContents, isAiReady, aiSettings, getRequestHeaders, autoTestConnection, setShowAIPanel, setSuccessMessage]);

  const handleAddSelectedAnnotations = useCallback(() => {
    if (selectedAnnotations.size === 0 || !selectedFileId) {
      setShowAnnotationSuggestionsModal(false);
      return;
    }

    // Get LLM name for attribution
    const llmName = aiSettings.customModelId || aiSettings.model || aiSettings.provider || 'AI';

    let annotationsAdded = 0;

    selectedAnnotations.forEach((index) => {
      const suggestion = annotationSuggestions[index];
      if (!suggestion) return;

      addLineAnnotation({
        codeFileId: selectedFileId,
        lineNumber: suggestion.lineNumber,
        lineContent: suggestion.lineContent,
        type: suggestion.type,
        content: suggestion.content,
        addedBy: llmName,
      });

      annotationsAdded++;
    });

    setSuccessMessage(`✓ Added ${annotationsAdded} annotation(s) by ${llmName}`);
    setShowAnnotationSuggestionsModal(false);
    setAnnotationSuggestions([]);
    setSelectedAnnotations(new Set());
  }, [selectedAnnotations, annotationSuggestions, selectedFileId, aiSettings, addLineAnnotation, setSuccessMessage]);

  // Add current suggestion and move to next (or close if last)
  const handleAddCurrentSuggestion = useCallback(() => {
    if (!selectedFileId) return;

    const suggestion = annotationSuggestions[currentSuggestionIndex];
    if (!suggestion) return;

    // Get LLM name for attribution
    const llmName = aiSettings.customModelId || aiSettings.model || aiSettings.provider || 'AI';

    // Add the annotation
    addLineAnnotation({
      codeFileId: selectedFileId,
      lineNumber: suggestion.lineNumber,
      lineContent: suggestion.lineContent,
      type: suggestion.type,
      content: suggestion.content,
      addedBy: llmName,
    });

    // Move to next suggestion or close modal
    if (currentSuggestionIndex < annotationSuggestions.length - 1) {
      setCurrentSuggestionIndex(currentSuggestionIndex + 1);
    } else {
      // Last suggestion - close modal
      setShowAnnotationSuggestionsModal(false);
      setAnnotationSuggestions([]);
      setCurrentSuggestionIndex(0);
      setSuccessMessage(`✓ Annotation added by ${llmName}`);
    }
  }, [currentSuggestionIndex, annotationSuggestions, selectedFileId, aiSettings, addLineAnnotation, setSuccessMessage]);

  // Discard current suggestion and move to next (or close if last)
  const handleDiscardCurrentSuggestion = useCallback(() => {
    // Move to next suggestion or close modal
    if (currentSuggestionIndex < annotationSuggestions.length - 1) {
      setCurrentSuggestionIndex(currentSuggestionIndex + 1);
    } else {
      // Last suggestion - close modal
      setShowAnnotationSuggestionsModal(false);
      setAnnotationSuggestions([]);
      setCurrentSuggestionIndex(0);
    }
  }, [currentSuggestionIndex, annotationSuggestions]);

  const dismissAnnotationSuggestions = useCallback(() => {
    setShowAnnotationSuggestionsModal(false);
    setAnnotationSuggestions([]);
    setCurrentSuggestionIndex(0);
  }, []);

  return {
    showAnnotationSuggestionsModal,
    setShowAnnotationSuggestionsModal,
    annotationModalMode,
    setAnnotationModalMode,
    selectedAnnotationTypes,
    setSelectedAnnotationTypes,
    annotationSuggestions,
    currentSuggestionIndex,
    setCurrentSuggestionIndex,
    selectedAnnotations,
    setSelectedAnnotations,
    isRequestingAnnotations,
    handleRequestAnnotationSuggestions,
    handleAddSelectedAnnotations,
    handleAddCurrentSuggestion,
    handleDiscardCurrentSuggestion,
    dismissAnnotationSuggestions,
  };
}
