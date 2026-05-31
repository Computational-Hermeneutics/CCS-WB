import { NextRequest, NextResponse } from "next/server";
import { generateId, getCurrentTimestamp } from "@/lib/utils";
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from "@/lib/rate-limit";
import { extractAIConfig, validateAIConfig, generateAIResponse } from "@/lib/ai/client";
import { getModelDisplayName } from "@/lib/ai/config";
import { getMethodologyForPhase } from "@/lib/prompts/ccs-methodology";
import type { ChatRequest, ChatResponse } from "@/types/api";
import type { Message } from "@/types/session";

// Experience level guidance - affects how the assistant engages with the user
function getExperienceLevelGuidance(experienceLevel?: string): string {
  switch (experienceLevel) {
    case "learning":
      return `## Your Approach: Supporting a Learner
The user is new to critical code studies. Adapt your engagement accordingly:
- **Explain CCS concepts** when you introduce them (e.g., "The 'triadic hermeneutic structure' means examining code from three perspectives...")
- **Offer scaffolding** for close reading techniques, suggesting where to look and what to notice
- **Suggest readings** from the CCS literature when relevant (Marino's "Critical Code Studies", Berry's work on code hermeneutics)
- **Be encouraging** of their observations while gently redirecting if they miss key interpretive opportunities
- **Use accessible language** while introducing technical vocabulary gradually
- **Check understanding** periodically ("Does this framing help you see the code differently?")`;

    case "practitioner":
      return `## Your Approach: Supporting a Practitioner
The user is familiar with critical code studies methods. Adapt your engagement accordingly:
- **Use CCS vocabulary freely** without lengthy explanations (triadic structure, close reading, hermeneutic analysis, etc.)
- **Focus on their analysis** rather than teaching methodology
- **Engage substantively** with their interpretive observations
- **Suggest connections** to relevant scholarship when it would enrich the discussion
- **Push their reading deeper** by asking probing questions about their interpretations
- **Trust their judgement** on methodological choices while offering alternative framings`;

    case "research":
      return `## Your Approach: Scholarly Peer Engagement
The user is a researcher with deep CCS expertise. Engage as an intellectual peer:
- **Match their theoretical sophistication** in discussion
- **Offer technical depth** when analysing code structures, patterns, and cultural embedding
- **Challenge interpretations** constructively, suggesting alternative readings
- **Engage with nuance** in theoretical debates (e.g., tensions between close and distant reading)
- **Reference advanced scholarship** and assume familiarity with the field
- **Be comfortable with complexity** and unresolved interpretive tensions
- **Push back** if readings seem under-theorised or could be developed further`;

    default:
      return `## Your Approach: Adaptive Engagement
No experience level specified. Begin with moderate scaffolding and adjust based on the user's demonstrated familiarity with CCS concepts and methods.`;
  }
}

// System prompt for the critical code studies assistant
function buildSystemPrompt(
  settings: { beDirectMode: boolean; teachMeMode: boolean },
  currentPhase: string,
  experienceLevel?: string,
  mode?: string,
  createLanguage?: string,
  defaultLanguage?: string
): string {
  const experienceGuidance = getExperienceLevelGuidance(experienceLevel);

  const modeContext = getModeContext(mode, createLanguage);

  // Add language preference context if specified (and not in create mode, which uses createLanguage)
  const languagePreference = defaultLanguage && mode !== "create"
    ? `\n## User's Preferred Language\nThe user's preferred programming language is **${defaultLanguage}**. When providing code examples, explanations, or discussing implementation patterns, use ${defaultLanguage} unless the code under analysis is in a different language.\n`
    : "";

  const feedbackStyle = settings.beDirectMode
    ? `Be direct in your interpretive suggestions. Offer clear readings and invite challenge or elaboration.`
    : `Use a graduated approach. Start with open questions that invite the analyst to develop their own reading. Only offer interpretive suggestions if they seem stuck.`;

  const teachingStyle = settings.teachMeMode
    ? `When discussing hermeneutic concepts (close reading, intentional fallacy, triadic structure, execution context), explain them briefly and offer to go deeper. Connect to critical code studies scholarship.`
    : `Guide through Socratic dialogue. Ask questions that prompt deeper engagement with the code rather than lecturing about methodology.`;

  // Get the appropriate CCS methodology for this mode and phase
  const ccsMethodology = getMethodologyForPhase(currentPhase, mode);

  return `You are a critical code studies assistant helping scholars engage in close reading and hermeneutic analysis of software. Your role is to facilitate rigorous interpretation of code as a cultural artefact, drawing on the methodological frameworks of David M. Berry and Mark C. Marino.

${experienceGuidance}

${modeContext}
${languagePreference}

## Current Conversation Phase: ${currentPhase}
${getPhaseGuidance(currentPhase)}

## Your Approach
${feedbackStyle}
${teachingStyle}

${ccsMethodology}

## The Triadic Hermeneutic Structure
Help the analyst navigate between:
1. **Human intention** - What did the author(s) mean to accomplish? What values and assumptions are embedded?
2. **Computational generation** - How does the code structure its logic? What metaphors and abstractions does it employ?
3. **Executable code** - What does it actually do when run? What effects does it produce?

## Layers of Code Reading
Guide analysis through these interpretive layers:
- **Lexical** - Variable names, function names, comments as linguistic choices
- **Syntactic** - Structure, control flow, organisation as rhetorical choices
- **Semantic** - What the code means, its logic and purpose
- **Pragmatic** - How the code functions in context, its effects
- **Cultural** - Historical moment, platform constraints, community conventions

## Response Guidelines
- Be intellectually curious and collaborative
- Ask one or two focused interpretive questions at a time
- Acknowledge interesting observations and productive lines of inquiry
- Offer multiple possible readings rather than single "correct" interpretations
- Connect to broader critical theory when relevant (but don't force it)
- Reference specific lines or passages when discussing the code
- Be willing to sit with ambiguity and contradiction
- Guard against the competence effect: prioritise rigour over speed

## When Code is Present
When the analyst shares code:
- Read it carefully, noting structural and stylistic features
- Identify interesting interpretive entry points
- Ask what drew their attention to particular passages
- Suggest connections between different parts of the code
- Explore the relationship between comments and code
- Consider what the code reveals about its moment of creation
- Apply both close reading (Marino) and distant reading (Berry) strategies

Remember: Your role is to deepen engagement with code as a meaningful text. The goal is richer interpretation, not definitive answers. Code is simultaneously technical object and cultural text, functional mechanism and semiotic system.`;
}

function getModeContext(mode?: string, createLanguage?: string): string {
  switch (mode) {
    case "critique":
      return `## Mode: Code Critique
The analyst has specific code they want to examine closely. Focus on:
- Close reading of the code as text
- Identifying interpretive entry points
- Exploring multiple layers of meaning
- Connecting observations to broader patterns`;
    case "interpret":
      return `## Mode: Hermeneutic Exploration
The analyst wants to explore interpretive approaches without a fixed code object. Focus on:
- Discussing hermeneutic frameworks for code analysis
- Exploring the triadic structure (intention, generation, execution)
- Connecting to critical theory and digital humanities
- Helping them develop their interpretive toolkit`;
    case "create":
      const lang = createLanguage || "Python";
      return `## Mode: Code Creation (Vibe Coding)
The user wants to learn by building. Help them create simple implementations of classic algorithms to understand how they work.

**IMPORTANT: Generate all code in ${lang}.** This is the user's chosen language.

Focus on:
- Exploring what algorithm or code pattern to implement
- Building step-by-step with explanations
- Understanding the underlying logic and design choices
- Connecting to historical examples and inspirations
- Keeping implementations simple and readable for critique

### Classic Algorithm Inspirations
Suggest and help implement simple versions of:
- **ELIZA**: Pattern matching and response generation (Weizenbaum, 1966)
- **Love Letter Generator**: Combinatorial text generation (Strachey, 1952)
- **Poetry generators**: Like Nick Montfort's ppg256 (https://collection.eliterature.org/2/works/montfort_ppg256/ppg256.html)
- **Sorting algorithms**: Bubble sort, selection sort for algorithmic thinking
- **Cellular automata**: Simple rule-based generation
- **Markov chains**: Text generation from patterns

### Implementation Approach
- Write all code in ${lang}
- Start with the simplest possible version
- Build incrementally, explaining each addition
- Keep code readable and well-commented
- Version each iteration so the user can see progress
- When satisfied, offer to transfer to critique mode for close reading`;
    default:
      return "";
  }
}

function getPhaseGuidance(phase: string): string {
  switch (phase) {
    // Critique/interpret phases
    case "opening":
      return `You're beginning the analysis. Understand what code they're examining and what drew their attention to it. If they haven't shared code yet, invite them to do so.`;
    case "surface":
      return `Focus on surface-level reading: syntax, structure, naming conventions, comments. What patterns are visible? What choices stand out?`;
    case "context":
      return `Explore the code's context: When was it written? For what platform? By whom? Under what constraints? How does historical moment shape the code?`;
    case "interpretation":
      return `Move into deeper hermeneutic analysis. What does the code mean? What values does it embody? How do different readings complement or contradict each other?`;
    case "synthesis":
      return `Help draw together the interpretive threads. What larger argument or reading emerges from the analysis? What remains unresolved or ambiguous?`;
    case "output":
      return `The analyst is ready to generate outputs. Help shape their interpretation into a code critique, annotated reading, or scholarly analysis.`;
    // Create mode phases
    case "concept":
      return `Explore what the user wants to create. Discuss classic algorithms, their history, and what makes them interesting. Help them choose something to implement.`;
    case "scaffolding":
      return `Set up the basic structure of the code. Explain the fundamental approach and create a minimal working version.`;
    case "iteration":
      return `Refine and develop the code together. Add features, improve readability, and explain design decisions. Each iteration should be marked as a new version.`;
    case "reflection":
      return `Step back and examine what was created. Discuss the design choices, what the code reveals about the algorithm, and how it could be analysed critically.`;
    case "transfer":
      return `The user is ready to move their created code into critique mode. Help them prepare for close reading of what they built.`;
    default:
      return `Continue the natural flow of interpretation while deepening engagement with the code.`;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const clientId = getClientIdentifier(request);
    const rateLimitResult = checkRateLimit(clientId, RATE_LIMITS.chat);

    if (!rateLimitResult.allowed) {
      const waitSeconds = Math.ceil(rateLimitResult.resetIn / 1000);
      return NextResponse.json(
        {
          error: "rate_limit",
          message: `You're sending messages too quickly. Please wait ${waitSeconds} seconds before trying again.`,
          retryAfter: waitSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": waitSeconds.toString(),
            "X-RateLimit-Limit": rateLimitResult.limit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": Math.ceil(Date.now() / 1000 + rateLimitResult.resetIn / 1000).toString(),
          },
        }
      );
    }

    const body: ChatRequest = await request.json();
    const { messages, currentPhase, experienceLevel, analysisContext, literatureContext, mode, codeContext, createLanguage, defaultLanguage } = body;

    // Extract conversation style settings from headers (moved from session to AI settings)
    const beDirectMode = request.headers.get("X-AI-Be-Direct") === "true";
    const teachMeMode = request.headers.get("X-AI-Teach-Me") === "true";
    const settings = { beDirectMode, teachMeMode };

    // Build context from code files and analysis if available
    let additionalContext = "";

    // Include code context if present
    if (codeContext && codeContext.length > 0) {
      // Check if any code has annotations (lines containing "// An:")
      const hasAnnotations = codeContext.some((code: { content?: string }) =>
        code.content?.includes("// An:")
      );

      additionalContext += "\n\n## Code Under Analysis\n";

      // If annotations present, explain the annotation system
      if (hasAnnotations) {
        additionalContext += `**Analyst Annotations**: The code below includes inline annotations marked with \`// An:TYPE:\` where TYPE indicates the kind of observation:
- **Obs** (Observation): A notable feature, pattern, or detail the analyst has identified
- **Q** (Question): Something the analyst wants to explore or understand better
- **Met** (Metaphor): A metaphorical or figurative interpretation of the code
- **Pat** (Pattern): A recurring structure, idiom, or convention identified
- **Ctx** (Context): Historical, cultural, or situational context relevant to this line
- **Crit** (Critique): A critical observation or interpretive claim

Engage with these annotations in your response. They represent the analyst's developing interpretation and are entry points for deeper discussion.\n\n`;
      }

      codeContext.forEach((code: { name: string; language?: string; content?: string; author?: string; date?: string; platform?: string; context?: string }) => {
        additionalContext += `### ${code.name}`;
        if (code.language) additionalContext += ` (${code.language})`;
        additionalContext += "\n";
        if (code.author) additionalContext += `Author: ${code.author}\n`;
        if (code.date) additionalContext += `Date: ${code.date}\n`;
        if (code.platform) additionalContext += `Platform: ${code.platform}\n`;
        if (code.context) additionalContext += `Context: ${code.context}\n`;
        if (code.content) {
          additionalContext += "\n```\n" + code.content + "\n```\n\n";
        }
      });
    }

    // Include analysis results if available
    if (analysisContext && analysisContext.length > 0) {
      additionalContext += "\n\n## Analysis Notes\n";
      analysisContext.forEach((result) => {
        additionalContext += `### ${result.type.charAt(0).toUpperCase() + result.type.slice(1)} Analysis\n`;
        additionalContext += `${result.summary}\n`;
        if (result.notes && result.notes.length > 0) {
          additionalContext += "\nInterpretive notes:\n";
          result.notes.forEach((note: { type: string; message: string; lineReference?: string }) => {
            additionalContext += `- [${note.type}]${note.lineReference ? ` (${note.lineReference})` : ""}: ${note.message}\n`;
          });
        }
        additionalContext += "\n";
      });
    }

    // Include reference context if available
    if (literatureContext && literatureContext.length > 0) {
      additionalContext += "\n\n## Related References\n";
      literatureContext.forEach((ref) => {
        additionalContext += `- ${ref.title}`;
        if (ref.year) additionalContext += ` (${ref.year})`;
        if (ref.repository) additionalContext += ` [${ref.repository}]`;
        if (ref.isHistorical) additionalContext += " [Historical]";
        additionalContext += "\n";
      });
    }

    // Build system prompt with experience level and mode context
    const systemPrompt = buildSystemPrompt(settings, currentPhase, experienceLevel, mode, createLanguage, defaultLanguage) + additionalContext;

    // Extract and validate AI configuration from request headers
    const aiConfig = extractAIConfig(request);
    const validation = validateAIConfig(aiConfig);

    if (!validation.valid) {
      return NextResponse.json(
        {
          error: "configuration_error",
          message: validation.error || "Invalid AI configuration. Please check your settings.",
          requiresSetup: validation.requiresSetup,
        },
        { status: 503 }
      );
    }

    // Check if we have code context to include
    const hasCode = codeContext && codeContext.length > 0 &&
      codeContext.some((code: { content?: string }) => code.content);
    const hasAnnotations = hasCode &&
      codeContext!.some((code: { content?: string }) => code.content?.includes("// An:"));

    // Helper to add line numbers to code
    const addLineNumbers = (code: string): string => {
      const lines = code.split("\n");
      return lines.map((line, i) => `${String(i + 1).padStart(3, " ")} | ${line}`).join("\n");
    };

    // Convert messages to AI SDK format
    const aiMessages = messages
      .filter((m) => m.role !== "system")
      .map((m, index, arr) => {
        let content = m.content;

        // For the last user message, include the code with line numbers
        // This ensures the LLM can reference specific lines accurately
        if (m.role === "user" && index === arr.length - 1 && hasCode) {
          let codeBlock = hasAnnotations
            ? "**Code with my annotations (line numbers shown):**\n\n"
            : "**Code being analysed (line numbers shown):**\n\n";
          codeContext!.forEach((code: { name: string; language?: string; content?: string }) => {
            if (code.content) {
              const numberedCode = addLineNumbers(code.content);
              codeBlock += `File: ${code.name}\n\`\`\`\n${numberedCode}\n\`\`\`\n\n`;
            }
          });
          if (hasAnnotations) {
            codeBlock += "Please engage with my `// An:TYPE:` annotations above.\n\n";
          } else {
            codeBlock += "When suggesting annotations, use the exact line numbers shown above.\n\n";
          }
          content = codeBlock + content;
        }

        return {
          role: m.role as "user" | "assistant",
          content,
        };
      });

    const modelName = getModelDisplayName(aiConfig.provider, aiConfig.model);

    // For browser-direct providers, return the prepared payload so the
    // browser can dispatch the model call itself. The route still does
    // all prompt building (methodology, code with line numbers,
    // experience-level guidance); only the final model call moves.
    //
    // - Ollama: the deployed serverless route cannot reach the user's
    //   localhost; the browser can (loopback exemption).
    // - Anthropic: opting browser-direct removes the server dependency
    //   for the default case so CCS-WB runs as a host-independent SPA.
    //
    // The envelope is provider-tagged so the client switches on
    // `payload.provider` to choose its dispatcher.
    if (aiConfig.provider === "ollama") {
      return NextResponse.json({
        browserDirect: true,
        provider: "ollama",
        // Legacy shape preserved for backwards compatibility with hooks
        // not yet migrated to the generalised envelope.
        ollamaPayload: {
          baseUrl: aiConfig.baseUrl || "http://localhost:11434",
          model: aiConfig.model,
          system: systemPrompt,
          messages: aiMessages,
          maxTokens: 1024,
        },
        payload: {
          provider: "ollama",
          baseUrl: aiConfig.baseUrl || "http://localhost:11434",
          model: aiConfig.model,
          system: systemPrompt,
          messages: aiMessages,
          maxTokens: 1024,
        },
        messageTemplate: {
          id: generateId(),
          role: "assistant",
          timestamp: getCurrentTimestamp(),
          metadata: { phase: currentPhase, model: modelName },
        },
      });
    }

    if (aiConfig.provider === "anthropic" && aiConfig.apiKey) {
      return NextResponse.json({
        browserDirect: true,
        provider: "anthropic",
        payload: {
          provider: "anthropic",
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
          system: systemPrompt,
          messages: aiMessages,
          maxTokens: 1024,
        },
        messageTemplate: {
          id: generateId(),
          role: "assistant",
          timestamp: getCurrentTimestamp(),
          metadata: { phase: currentPhase, model: modelName },
        },
      });
    }

    if (aiConfig.provider === "openai" && aiConfig.apiKey) {
      return NextResponse.json({
        browserDirect: true,
        provider: "openai",
        payload: {
          provider: "openai",
          apiKey: aiConfig.apiKey,
          baseUrl: aiConfig.baseUrl || undefined,
          model: aiConfig.model,
          system: systemPrompt,
          messages: aiMessages,
          maxTokens: 1024,
        },
        messageTemplate: {
          id: generateId(),
          role: "assistant",
          timestamp: getCurrentTimestamp(),
          metadata: { phase: currentPhase, model: modelName },
        },
      });
    }

    if (
      (aiConfig.provider === "openrouter" ||
        aiConfig.provider === "huggingface" ||
        aiConfig.provider === "openai-compatible") &&
      aiConfig.apiKey
    ) {
      // For openai-compatible, the user must have supplied a baseUrl;
      // for OpenRouter/HF the per-provider dispatcher fills the default.
      return NextResponse.json({
        browserDirect: true,
        provider: aiConfig.provider,
        payload: {
          provider: aiConfig.provider,
          apiKey: aiConfig.apiKey,
          baseUrl: aiConfig.baseUrl || undefined,
          model: aiConfig.model,
          system: systemPrompt,
          messages: aiMessages,
          maxTokens: 1024,
        },
        messageTemplate: {
          id: generateId(),
          role: "assistant",
          timestamp: getCurrentTimestamp(),
          metadata: { phase: currentPhase, model: modelName },
        },
      });
    }

    // Call AI API using unified client
    const responseContent = await generateAIResponse(aiConfig, {
      system: systemPrompt,
      messages: aiMessages,
      maxTokens: 1024,
    });

    // Build response message
    const assistantMessage: Message = {
      id: generateId(),
      role: "assistant",
      content: responseContent,
      timestamp: getCurrentTimestamp(),
      metadata: {
        phase: currentPhase as NonNullable<Message["metadata"]>["phase"],
        model: modelName,
      },
    };

    const chatResponse: ChatResponse = {
      message: assistantMessage,
    };

    return NextResponse.json(chatResponse);
  } catch (error) {
    console.error("Chat API error:", error);

    // Pass through meaningful error messages from AI providers
    const errorMessage = error instanceof Error
      ? error.message
      : "Failed to process chat message. Please try again.";

    return NextResponse.json(
      {
        error: "chat_error",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
