# Critical Code Studies Workbench

**Version 5.0.0** | CCS Methodology v2.7

A web application for close reading and hermeneutic analysis of software as cultural artefact.

## Overview

The Critical Code Studies Workbench facilitates rigorous interpretation of code through the lens of critical code studies methodology. It supports:

- **Code critique** - Close reading, annotation, and interpretation in the Marino tradition
- **Hermeneutic analysis** - Navigating the triadic structure of human intention, computational generation, and executable code
- **Vibe coding** - Creating code to understand algorithms through building

Software deserves the same close reading we give literature. The Workbench helps scholars engage with code as meaningful text.

## Features

### Three Analysis Modes
- **Analyze Code (Critique)**: Close reading and annotation of existing code through IDE-style interface with inline annotations. AI engagement style: expert practitioner (peer dialogue, challenges interpretations, technical depth)
- **Learn Methods (Interpret)**: Exploring CCS methodology, hermeneutic frameworks, and archaeological recovery of historical software. AI engagement style: beginner-friendly (scaffolding, explains concepts, suggests readings)
- **Create Code**: Generative coding to understand algorithms by building them. AI engagement style: intermediate practitioner (uses CCS vocabulary, encourages experimentation)

### IDE-Style Workbench Layout
Both Analyze and Learn modes use a unified three-panel IDE interface for focused code analysis:

1. **Left panel**: File tree with colour-coded filenames by type
   - Collapsible and resizable (drag divider)
   - Blue: Code files (Python, JavaScript, etc.)
   - Orange: Web files (HTML, CSS, JSX)
   - Green: Data files (JSON, YAML, XML)
   - Amber: Shell scripts
   - Grey: Text and other files
   - Annotation summary panel at bottom showing counts by type

2. **Centre panel**: Code editor with line numbers
   - Toggle between Edit and Annotate modes
   - Click any line (or select a range) to add an annotation
   - Six annotation types: Observation, Question, Metaphor, Pattern, Context, Critique
   - **AI auto-annotation**: Click ✨ Sparkles button to request AI-suggested annotations, review and add/discard suggestions
   - Annotations display inline with colour-coded type badges (pills)
   - Annotations fade into background for distraction-free reading, brighten on hover
   - **Line highlighting**: Adjustable intensity (off/low/medium/high/full) with type-coloured right-side bars
   - **Focus mode**: Dims unannotated code to spotlight annotations (toggle with highlighter button)
   - Full screen mode hides files pane and chat for focused annotation work
   - Real-time line and column indicator (updates on hover)
   - Download annotated code with annotations preserved
   - Customisable font size and display settings

3. **Right panel**: Chat interface with guided prompts
   - Collapsible with vertical label; resizable divider
   - Context preview shows what the LLM sees
   - Phase-appropriate questions guide analysis
   - "Help Annotate" asks the LLM to suggest annotations
   - **Code extraction**: Extract code snippets from AI responses to files (all modes)
   - **Save responses**: Save entire AI responses as markdown files (FileDown button)
   - Clean interface (internal system messages hidden)
   - Customisable chat font size

### Project Management
- **Save/Load projects** as `.ccs` files (JSON internally)
- **Load Project** button on landing page auto-detects mode
- **Export session logs** in JSON, Text, or PDF format for research documentation
- Session logs include metadata, annotated code, full conversation, and statistics
- Click filename in header to rename project

### Collaboration

CCS-WB has **two collaboration tiers, *Local* and *Cloud***, deliberately at
different levels of complexity. Most users want Local. See
[`docs/COLLABORATION.md`](docs/COLLABORATION.md) for the full model and the
rationale behind keeping both.

The optional Cloud tier is **physically ring-fenced** in the codebase:
one JSON flag at the repo root (`cloud.config.json`) gates whether
cloud features activate, and the entire Supabase code lives under
`src/cloud/` and can be removed with one folder deletion if you're
forking and don't want it. See
[`docs/CLOUD-RINGFENCE.md`](docs/CLOUD-RINGFENCE.md) for a maintainer
guide.

#### Local — annotation, comments, and file-based collaboration (simple, recommended, zero infrastructure)

Everything that doesn't need a backend: annotate code, write threaded
comments on annotations, save/load `.ccs` files, and merge collaborators'
`.ccs` files into yours. Asynchronous, no accounts, no network — ideal for
co-authored close readings and the common "you mark it up, I mark it up,
we combine" workflow.

- **Merge annotations**: the merge button (next to *Load session*) pulls a
  collaborator's `.ccs` into your session. **Additive only** — nothing of yours
  is ever overwritten or deleted.
- **Name-based file matching**: files are matched across `.ccs` files by name
  (the per-session file IDs differ between machines), and the union is keyed by
  the globally-unique annotation ID, so re-merging the same file is idempotent.
- **Drift-aware**: if a collaborator's copy of a file differs from yours, their
  annotations still import but are flagged for review, so misaligned line
  anchors are visible rather than silently wrong.
- **Reply threads merge** by reply ID; a confirmation summarises exactly what
  will change before anything happens.
- **Master copy**: after a merge the session holds the union of everyone's
  annotations — a prompt offers to save it straight back out, so the combined
  master is never lost. The saved `.ccs` keeps every annotation with its author,
  replies, and review flags.

#### Cloud — real-time multi-user sync (advanced, **self-hosted**, opt-in)

Real-time multi-user collaboration backed by Supabase — more capable but
heavier and **self-hosted**: CCS-WB itself does not ship with a hosted
backend. To use Cloud you provide your own Supabase project (free tier
is fine) and either run your own CCS-WB build pointed at it or set the
env vars on your own Vercel deployment. See
[`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md). Note that on
Supabase's free tier the backend auto-pauses when idle, so the first
request of a session after inactivity can stall briefly — fine for
small groups, plan a warm-up if you're starting a live seminar.

**Annotation comments do not require Cloud.** Threaded comments on
individual annotations are part of the local data model: they are saved
into the `.ccs` file, survive load, and merge correctly via Local file
merge. Cloud only adds *real-time multi-user sync* of those comments
on top.

- **Master switch**: Cloud can be turned off entirely in **Settings → Cloud → Enable Cloud Collaboration**. When off, all sign-in and cloud UI is hidden, CCS-WB runs as a clean local-only workbench, and no requests are made to the backend (so a paused free-tier Supabase instance is never woken). Default on; the toggle stays available whenever Supabase is configured so it can be re-enabled. Local (annotation, comments, `.ccs` save/load, file merge) is unaffected by this switch.
- **Real-time sync**: Annotations and code files sync automatically (5-second polling)
- **Connection resilience**: Google Docs-style data protection with automatic reconnection
  - **Operation queue**: Failed operations queued locally (IndexedDB) and retried automatically
  - **Smart merge**: Local changes preserved during reconnection (no data loss)
  - **Connection health**: Real-time status indicator shows sync state (connected/reconnecting/disconnected)
  - **Heartbeat monitoring**: Detects stale connections and triggers automatic recovery
  - **Works offline**: Continue editing when connection lost; changes sync when restored
- **OAuth login**: Sign in with Google, GitHub, or Apple
- **Shareable invite links**: Generate links to invite collaborators as viewers or editors
- **Member management**: View and manage project members and their roles
- **User attribution**: Annotations show author initials for multi-user projects
- **Staleness detection**: Prevents overwriting collaborators' changes
- **Trash can**: Deleted files and projects move to trash for recovery
  - Projects: Trash tab in Projects modal with restore and permanent delete
  - Files: Trash icon in files pane header with dropdown for restore/delete

### Sample Projects
Load pre-packaged historical code for immediate critique and analysis:

**1950s - Early Programming Languages:**
- **FLOW-MATIC (1958)**: Grace Hopper's business English programming language - first natural language programming
- **IPL-V (1958)**: Newell, Shaw, and Simon's list processing - Logic Theorist and General Problem Solver

**1960s - AI and Space Exploration:**
- **ELIZA (1965b)**: Weizenbaum's chatbot with 30+ scholarly annotations
- **Apollo 11 Comanche055 (1969)**: Command Module guidance computer source code (85 AGC files)
- **Apollo 11 Luminary099 (1969)**: Lunar Module guidance computer source code (90 AGC files)

**1970s - Adventure Gaming and Protocols:**
- **Colossal Cave Adventure (1977)**: Will Crowther's original FORTRAN IV source code
- **XMODEM Protocol (1977)**: Ward Christensen's MODEM.ASM - foundational BBS file transfer protocol

**1980s-1990s - Free Software and Electronic Literature:**
- **GNU Emacs (1985)**: Richard Stallman's free software manifesto - GPL, hacker culture, and software freedom
- **Agrippa (1992)**: William Gibson's self-encrypting poem - electronic literature and digital preservation
- **My Boyfriend Came Back from the War (1996)**: Olia Lialina's frame-splitting narrative - net.art and vernacular web aesthetics

**2000s-Present - Plain Text, Feminist Computing, and Contemporary Analysis:**
- **Markdown (2004)**: John Gruber's plain text formatting - readability over parseability, gift economy, and the plain text ideology
- **Git Stash (2007)**: Nanako Shiraishi's original script - feminist computing history and workplace interruption
- **10 PRINT CHR$(205.5+RND(1)); GOTO 10 (2013)**: Montfort et al.'s book-length analysis of one line of C64 BASIC
- **Transformer Architecture (2017)**: Attention Is All You Need - multi-head attention and the foundation of modern LLMs
- **Esoteric Programming Languages Collection (2026)**: Nine foundational esolangs (INTERCAL, FALSE, brainfuck, Befunge, Malbolge, Piet, Shakespeare, Chef, Whitespace) demonstrating computational critique and hacker folk art

Sample projects demonstrate annotation practices and provide rich material for exploring computational culture from 1958 to the present. Add your own samples by editing `public/sample-code/Samples.md`.

### Conversation Phases

**Critique/Interpret modes:**
1. **Opening**: Initial code presentation and context gathering
2. **Surface**: Syntax, structure, naming conventions
3. **Context**: Historical, cultural, platform context
4. **Interpretation**: Deep hermeneutic analysis
5. **Synthesis**: Drawing together interpretive threads
6. **Output**: Generating critique artefacts

**Create mode (vibe coding):**
1. **Concept**: Exploring what algorithm to create
2. **Scaffolding**: Setting up basic structure
3. **Iteration**: Refining and developing the code
4. **Reflection**: Understanding what was created
5. **Transfer**: Moving created code to critique mode

### Create Mode: Vibe Coding

Create mode helps you understand algorithms by building simple implementations:

- **ELIZA**: Pattern matching and response generation (Weizenbaum, 1966)
- **Love Letter Generator**: Combinatorial text generation (Strachey, 1952)
- **Poetry generators**: Inspired by Nick Montfort's ppg256
- **Sorting algorithms**: Bubble sort, selection sort
- **Cellular automata**: Simple rule-based generation
- **Markov chains**: Text generation from patterns

Choose your preferred language: Python, JavaScript, BASIC, Lisp, Pseudocode, or specify your own.

### Multi-Provider AI Support
Choose your preferred AI provider in browser settings:
- **Anthropic Claude** (Claude Sonnet 4, Claude 3.5 Haiku)
- **OpenAI** (GPT-4o, GPT-4o Mini, o1, o1-mini)
- **Google Gemini** (Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.5 Flash-Lite)
- **Ollama** (Local models: Llama 3.2, Mistral, Mixtral, etc.)
- **OpenRouter** (300+ models behind one key: Claude, GPT-4o, Llama 3.3, Qwen, Mistral, etc.)
- **Hugging Face** (Open-weights via Inference Providers: Llama 3.3, Qwen 2.5, DeepSeek R1/V3, etc.)
- **OpenAI-Compatible** (Any Chat Completions endpoint: vLLM, Groq, Together, Fireworks, etc.)

Models can be customised by editing `public/models.md`. Add or remove models without changing code.

### Appearance
- **Dark mode**: Light, dark, or system-matched themes via Settings → Appearance
- **Theme colours**: Six accent colour palettes (Burgundy, Forest, Navy, Plum, Rust, Slate) that tint both UI elements and backgrounds
- **Custom skins**: 10 nostalgic visual themes (Atari 2600, BBC Micro, C64, ELIZA, Geocities, HyperCard, Myspace, Teams, Teletext, Vaporwave) with custom colours, fonts, and Clippy messages; create your own skins in `public/skins/`
- **Customisable fonts**: Adjust code, chat, and UI font sizes independently

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + S` | Save project |
| `Cmd/Ctrl + O` | Open/Load project |
| `Cmd/Ctrl + E` | Export session log |
| `Cmd/Ctrl + /` | Focus chat input |
| `Enter` | Send message |
| `Shift + Enter` | New line in message |
| `Escape` | Close popovers and modals |

### Data Privacy
- All data processed transiently, never stored on servers
- API keys stored only in your browser's localStorage
- Save projects locally as `.ccs` files
- Export session logs for research documentation
- No user accounts or authentication required

## Technology Stack

### Frontend
- **Framework**: Next.js 16 with React 19 and TypeScript
- **Bundler**: Turbopack (Next.js 16 default)
- **Styling**: Tailwind CSS with editorial design system
- **State**: React Context + useReducer
- **PDF Export**: jsPDF

### Backend
- **API Routes**: Next.js API routes (Node.js)
- **AI Integration**: Multi-provider support (Anthropic, OpenAI, Google, Ollama)

## Getting Started

### Prerequisites
- Node.js 18+

### Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/dmberry/CCS-WB.git
   cd CCS-WB
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000)

5. Click the **Settings** icon and configure your AI provider:
   - Select your provider (Anthropic, OpenAI, Google, or Ollama)
   - Enter your API key (not needed for Ollama)
   - Click "Test Connection" to verify

### Using Ollama (Free, Local AI)

For a completely free setup using local AI:

1. Install [Ollama](https://ollama.ai/):
   ```bash
   # macOS - download from ollama.ai and drag to Applications

   # Linux
   curl -fsSL https://ollama.ai/install.sh | sh
   ```

2. Pull a model:
   ```bash
   ollama pull llama3.2
   ```

3. Start Ollama (runs automatically on macOS):
   ```bash
   ollama serve
   ```

4. In the Workbench settings, select "Ollama (Local)" as your provider.

Recommended models for code analysis: `llama3.2`, `gemma4`, `mistral`, `codellama`

#### Browser-direct dispatch and a deployed CCS-WB

Ollama is the one provider CCS-WB calls **directly from the browser**, bypassing the
Next.js API route. A deployed CCS-WB (e.g. on Vercel) runs its API routes as serverless
functions that cannot reach your laptop's `localhost:11434`; browsers, however, treat
`localhost`/`127.0.0.1` as a potentially-trustworthy origin and may call it from an HTTPS
page. The only remaining gate is **CORS** (Cross-Origin Resource Sharing): Ollama must
opt in to the page's origin via the `OLLAMA_ORIGINS` environment variable.

- **Local CCS-WB** (`npm run dev` on `localhost:3000`): a plain `ollama serve` is enough.
- **Deployed CCS-WB**: start Ollama with the deployed origin allowlisted, e.g.
  `OLLAMA_ORIGINS="https://your-ccs-wb.example,http://localhost:3000,http://127.0.0.1:3000" ollama serve`.
  The Settings → AI panel shows the exact command with your origin pre-filled and a copy button.
- **Safari note**: Safari blocks HTTPS pages from calling `http://localhost` regardless of
  CORS. Use Chrome, Firefox, Edge, Arc, or Brave to drive a local Ollama from a deployed
  CCS-WB; local dev works in Safari too.

The Settings → AI **Test Connection** for Ollama runs as a direct browser ping and reports
exactly which class of failure occurred, with the fix:

| Scenario | Headline | Command label | Command |
|----------|----------|---------------|---------|
| Local, Ollama not started | **Ollama is not running** | START IT IN YOUR TERMINAL | `ollama serve` |
| Deployed, CORS block | **Ollama is unreachable from this page (CORS)** | STOP OLLAMA, THEN RUN THIS IN YOUR TERMINAL | `OLLAMA_ORIGINS="…" ollama serve` |
| Reachable but rejecting | **Ollama responded with HTTP \<n\>** | *(no command — server is up)* | — |

## Project Structure

```
CCS-WB/
├── src/
│   ├── app/                          # Next.js app router
│   │   ├── api/                      # API routes
│   │   │   ├── analyze/route.ts
│   │   │   ├── chat/route.ts         # Main dialogue API
│   │   │   ├── export/route.ts
│   │   │   ├── generate/route.ts     # Output generation
│   │   │   ├── literature/route.ts   # Literature search
│   │   │   ├── profile/route.ts      # User profile
│   │   │   ├── skill-document/route.ts
│   │   │   ├── test-connection/route.ts
│   │   │   ├── upload/route.ts
│   │   │   └── version/route.ts
│   │   ├── auth/                     # OAuth callback handling
│   │   ├── conversation/page.tsx     # Main conversation page
│   │   ├── invite/                   # Shareable invite links
│   │   ├── layout.tsx
│   │   └── page.tsx                  # Landing page
│   ├── components/
│   │   ├── auth/                     # LoginModal, UserMenu
│   │   ├── ccs/                      # CCS guidance panel, method cards, smart hints
│   │   ├── chat/
│   │   │   ├── WorkbenchChatPanel.tsx # Chat panel with search and prompts
│   │   │   ├── ContextPreview.tsx    # Shows LLM context
│   │   │   └── MessageBubble.tsx     # Chat message styling
│   │   ├── code/
│   │   │   ├── CodeEditorPanel.tsx   # Code editor with annotations
│   │   │   ├── CodeMirrorEditor.tsx  # CodeMirror wrapper
│   │   │   ├── CodeDiffViewer.tsx    # Side-by-side comparison
│   │   │   ├── AnnotatedCodeViewer.tsx
│   │   │   ├── cm-annotations*.ts   # Annotation config, widgets, extensions
│   │   │   ├── cm-lang-*.ts         # Language modes (AGC, BASIC, FORTRAN, IPL-V, MAD)
│   │   │   ├── cm-languages.ts      # Language registry
│   │   │   └── cm-theme.ts          # Editor theme
│   │   ├── easter-eggs/             # Clippy
│   │   ├── layouts/
│   │   │   ├── WorkbenchLayout.tsx   # Main IDE layout orchestrator
│   │   │   ├── WorkbenchHeader.tsx   # Header bar with toolbar
│   │   │   └── WorkbenchModals.tsx   # Settings, export, save modals
│   │   ├── projects/                # Projects, Library, Members, Admin modals
│   │   ├── prompts/
│   │   │   └── GuidedPrompts.tsx     # Phase-appropriate questions
│   │   ├── pwa/                     # Install prompt, favicon
│   │   ├── settings/
│   │   │   ├── AIProviderSettings.tsx
│   │   │   ├── AISettingsPanel.tsx
│   │   │   └── SettingsModal.tsx
│   │   ├── shared/                  # ConfirmDialog, ConnectionStatus, SaveStatus, Toast
│   │   └── ui/                      # Base UI primitives
│   ├── hooks/
│   │   ├── useWorkbenchChat.ts      # Chat state and AI messaging
│   │   ├── useWorkbenchProject.ts   # Project save/load/export
│   │   ├── useWorkbenchFileManagement.ts # File add/remove/rename
│   │   ├── useAnnotationSuggestions.ts  # AI annotation suggestions
│   │   ├── useAnnotationReplies.ts  # Annotation reply threads
│   │   ├── useAnnotationsSync.ts    # Real-time annotation sync
│   │   ├── useAutoSave.ts           # File system auto-save
│   │   ├── useCCSGuidance.ts        # CCS methodology guidance
│   │   ├── useCodeFilesSync.ts      # Code file sync for collaboration
│   │   ├── useCollaborativeSession.ts # Collaborative session management
│   │   ├── useConnectionHealth.ts   # Connection health monitoring
│   │   ├── useLibraryRatings.ts     # Library project ratings
│   │   ├── useProjectCRUD.ts        # Project create/read/update/delete
│   │   ├── useProjectAdmin.ts       # Admin operations
│   │   ├── useProjectLibrary.ts     # Library management
│   │   ├── useProjectMembers.ts     # Member management
│   │   ├── useProjectModals.ts      # Modal state management
│   │   ├── useProjectSave.ts        # Project persistence
│   │   ├── useProjectSharing.ts     # Invite links and sharing
│   │   ├── useProjectSync.ts        # Project sync orchestration
│   │   ├── useProjectTrash.ts       # Soft delete and recovery
│   │   ├── useReferenceSearch.ts    # Literature search
│   │   ├── useUnsavedWarning.ts     # Unsaved changes detection
│   │   └── useXPSystem.ts           # Experience/gamification
│   ├── context/
│   │   ├── SessionContext.tsx        # Session state (useReducer)
│   │   ├── AISettingsContext.tsx     # AI provider config
│   │   ├── AppSettingsContext.tsx    # App-wide settings
│   │   ├── AuthContext.tsx           # Authentication state
│   │   ├── ProjectsContext.tsx       # Projects state
│   │   └── SkinsContext.tsx          # Visual skins state
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── client.ts             # Multi-provider AI client
│   │   │   ├── config.ts
│   │   │   └── load-models.ts        # Runtime model loading from models.md
│   │   ├── export/
│   │   │   └── session-log.ts        # Session log export utilities
│   │   ├── file-system/              # File System Access API integration
│   │   ├── prompts/
│   │   │   └── ccs-methodology.ts    # Loads skill document
│   │   ├── supabase/                 # Supabase client, server, types
│   │   ├── sync/                     # Operation queue, merge strategies, offline support
│   │   ├── ccs-content.ts            # CCS content utilities
│   │   ├── code-extraction.ts        # Extract code from AI responses
│   │   ├── config.ts
│   │   ├── projects-utils.ts         # Project helper utilities
│   │   ├── rate-limit.ts             # API rate limiting
│   │   ├── session-storage.ts        # Session persistence
│   │   ├── utils.ts
│   │   └── xp-utils.ts              # XP system utilities
│   └── types/
│       ├── session.ts                # Core types + GUIDED_PROMPTS
│       ├── ai-settings.ts
│       ├── app-settings.ts
│       ├── api.ts
│       └── index.ts
├── Critical-Code-Studies-Skill.md    # CCS methodology v2.7
├── CCS-Bibliography.md               # Reference bibliography
├── docs/                             # Setup guides (Supabase, Vercel, configuration)
├── scripts/                          # Utility scripts (sample generation)
├── init.sh                           # Development environment setup
└── public/
    ├── models.md                     # User-editable AI models config
    ├── sample-code/                  # 16 sample projects (1958-2026)
    │   └── Samples.md               # Sample project registry
    ├── assets/icons/                 # Shared retro icons for skins
    ├── skins/                        # 10 custom visual themes
    ├── manifest.json                 # PWA manifest
    └── service-worker.js             # Offline support
```

## Critical Code Studies Methodology

The Workbench is grounded in critical code studies scholarship:

### The Triadic Structure
- **Human intention**: What did the author(s) mean to accomplish?
- **Computational generation**: How does the code structure its logic?
- **Executable code**: What does it actually do when run?

### Layers of Reading
- **Lexical**: Variable names, function names, comments as linguistic choices
- **Syntactic**: Structure, control flow, organisation as rhetorical choices
- **Semantic**: What the code means, its logic and purpose
- **Pragmatic**: How the code functions in context, its effects
- **Cultural**: Historical moment, platform constraints, community conventions

### Annotation Types
When analysing code, use these annotation types:
- **Obs** (Observation): Notable features, patterns, or details
- **Q** (Question): Something to explore or understand better
- **Met** (Metaphor): Figurative interpretations of the code
- **Pat** (Pattern): Recurring structures, idioms, or conventions
- **Ctx** (Context): Historical, cultural, or situational context
- **Crit** (Critique): Critical observations or interpretive claims

## Version History

| Version | Changes |
|---------|---------|
| 5.0.0 | **Cloud ring-fence — the Supabase code is now one folder + one flag away from disabled or removed.** Two complementary mechanisms, designed to make CCS-WB easy to fork without the cloud features: **(a)** `cloud.config.json` at the repo root — a single `{ "enabled": boolean }` build-time master switch that gates the entire cloud subtree. Folded into `isSupabaseConfigured()` at the source so every existing consumer benefits automatically (no scattered checks). When `false`, the cloud UI never appears, no Supabase client is ever instantiated, and the cloud tab in Settings shows the null-state regardless of env vars. **(b)** Every cloud-only file physically moved into `src/cloud/` — Supabase client/server/types/runtime config, AuthContext, ProjectsContext, all 14 project hooks (CRUD, save, sharing, members, library, admin, trash, modals, sync, collaborative session, code/annotation sync, connection health, XP), all auth and project modals (UserMenu, LoginModal, Projects/Members/Library/Admin modals, ProjectSyncBanner, ConnectionStatus), operation queue + merge strategies, xp-utils. 27 files renamed via `git mv` to preserve history; 15 cloud-using files kept their place with imports rewritten through `@/cloud/...`. Routes that must live under `src/app/` per Next.js (auth callback, invite token page, profile color update) stay put but import only from the new subtree. A new [`docs/CLOUD-RINGFENCE.md`](docs/CLOUD-RINGFENCE.md) is the user/maintainer guide; `src/cloud/README.md` is the technical file-by-file reference. The major version bump reflects the architectural shift: from "cloud is intertwined" to "cloud is a removable module." Backwards-compatible for end users — default behaviour unchanged. |
| 4.2.0 | **Folders in the files pane** (and the Spacewar! sample reorganised to use them). `CodeReference` grows an optional `folder?: string` (slash-separated, empty = root; backwards-compatible). Files pane groups by folder with `📁 folder-name` headers; **README pinned to the top of its group in all sort modes**. Folder headers are **collapsible** (chevron, persisted to localStorage). Per-file menu gains **Move to folder…** and (for files already in a folder) **Move to root**. New file prompts for the target folder, defaulting to the currently-selected file's folder. Uploaded files inherit the current selection's folder. Spacewar! sample (26 files) reorganised into root (15 game source listings + README) + `supporting/` + `docs/` + `disassemblies/`. **Annotation type whitelist now enforced** — selecting 2 types and getting 6 back from a verbose model is fixed: hard post-filter drops unrequested types, prompt clause tightened, user-facing message distinguishes "all dropped by type filter" from generic empty result. **Added Spacewar! (1962) sample** — the complete masswerk + bitsavers corpus: 11 game versions v1 → v4.8, Landsteiner's 2016 modernised 2B and 2015 new program, MACRO defs, Peter Samson's actual star catalogue, hyperspace patch, sense-switches doc, three paper-tape disassemblies, the sibling Snowflake program. |
| 4.1.0 | **Architecture: browser-direct dispatch for every AI provider, BYO Supabase at runtime.** Completes v4.0's "fully local" framing. **(a) Browser-direct AI for all seven providers** (Anthropic, OpenAI, Google, Ollama, OpenRouter, Hugging Face, OpenAI-Compatible) via `src/lib/ai/browser-direct.ts` and a generalised `{browserDirect, provider, payload, messageTemplate}` envelope returned by `/api/chat`. With API keys in localStorage the static PWA shell drives the entire workbench with no server; the `/api/*` routes are preserved as a fallback for env-var-keyed deployments only. Each provider's *Test Connection* runs browser-side. **(b) Runtime Supabase config** in Settings → Cloud — paste URL + anon key, *Save & reload*, no fork or rebuild needed. Resolves runtime override over env-var fallback. **(c) Dedicated Cloud tab in Settings** with proper explanation of what Mode 2 is, what setting it up involves, and the free-tier auto-pause caveat. Profile tab now just personal identity. **(d) AI tab intro + per-provider setup guide** ported from LLMbench: collapsible cards per provider with cost / free-tier line, ordered setup steps, caveats, and Sign up / Get key links. **(e) Service worker fix** — the SW was intercepting cross-origin fetches and returning synthetic 503 responses, masking real CORS/network errors across every browser-direct provider (this was the root cause of misleading "Ollama responded with HTTP 503" diagnostics). Cross-origin requests now fall through to the browser default. **(f) Annotation suggestions hardened**: per-call `maxTokens` (annotation calls bump to 4096), JSON extractor walks a permissive recovery chain handling `<think>` blocks, fenced-with-trailing-prose, brace-counted balanced parsing, and partial-array rescue when the model is truncated by token limit. **(g) UX**: failed *Test Connection* label now reads "Connection failed — click to retry" and the Ollama failure panel grows its own inline Retry button so retesting doesn't require scrolling back up. |
| 4.0.0 | **Full local control and functionality — cloud is now a pure optional add-on.** This release completes the repositioning from "CCS-WB needs a cloud backend for core features" to "CCS-WB is a local-first workbench; the cloud is optional, self-hosted, and never required." Concretely: **(a)** threaded comments on annotations now work fully without Supabase — previously the data model was local but the add/delete UI and code paths were Supabase-gated, so comments effectively required a signed-in cloud project; they now write via the `SessionContext` reducer (`ADD_ANNOTATION_REPLY` / `DELETE_ANNOTATION_REPLY`), persist in `.ccs`, and union additively across collaborators' files (same-annotation different-replies → both kept; verified). **(b)** Asynchronous collaboration via file merge (Mode 1 — *Merge annotations* button): additive only, name-based file matching, idempotent union by annotation ID, drift-flagging when code differs, reply-thread merge, master save-back prompt. Zero infrastructure, no accounts. **(c)** Mode 2 (Cloud sync via Supabase) is reframed as **self-hosted** — CCS-WB does not ship with a hosted backend; bring your own Supabase project (see `docs/SUPABASE_SETUP.md`). When unconfigured, the cloud UI is hidden entirely and no network calls are made. **(d)** `docs/COLLABORATION.md` is the canonical model: Mode 1 (file merge), Mode 2 (optional self-hosted Supabase), and parked options (Yjs/PartyKit, append-only UUID log) with explicit revisit triggers. "LAN sharing" is a deployment variant of the parked Yjs tier, not a fourth mode. |
| 3.4.0 | **Cloud collaboration master switch** (Settings → Profile): one toggle hides all Supabase-backed UI and stops all backend requests for a clean local-only workbench (default on, always re-enableable). **Browser-direct Ollama dispatch**: a deployed CCS-WB can now drive a local Ollama — the browser calls `localhost:11434` directly (server routes can't), with origin-aware `OLLAMA_ORIGINS` guidance, a copyable command, the Safari caveat, and per-failure-kind Test Connection diagnostics. Added `gemma4`/`gemma3` to the Ollama model list. |
| 3.3.0 | **New providers**: OpenRouter (300+ models behind one key), Hugging Face (open-weights via Inference Providers), and a hardened OpenAI-Compatible adapter that now uses Chat Completions explicitly so it works against Ollama `/v1`, vLLM, Groq, Together, Fireworks, etc. Same Settings → Test Connection onboarding as the existing providers. Models editable in `public/models.md`. |
| 3.2.0 | **Architecture refactoring**: Extracted WorkbenchLayout.tsx (4,748 → 1,163 lines, 75% reduction) and conversation/page.tsx (2,191 → 155 lines, 93% reduction) into 6 custom hooks and 3 components. Pure structural refactor with zero logic changes. Fixed pre-existing auto-save bug where stale file handles threw errors instead of recovering gracefully. |
| 3.0.0 | **Critical fixes**: Code extraction in Create mode now handles AI responses with extra text after language fence (e.g., ` ```python # comment`), fixed CCS panel jump on click by deferring transition disable until actual drag starts, improved regex flexibility for markdown code blocks, handles unclosed code blocks gracefully. |
| 2.22.5 | **Save status fixes**: SaveStatusIndicator text now matches parent color (no separate colors in inline mode), save status only shown for local sessions when using File System Access API, prevents confusing "Unsaved" status for manual download saves. |
| 2.22.4 | **Interface refinements**: Cleaner chat interface (internal system messages hidden), code extraction available in all modes (not just Create), save AI responses as markdown files (FileDown button), CCS Methods Guide button improvements (Library icon, toggle behavior, stroke-weight state indication), experience level UI removed from WorkbenchLayout (now auto-derived from mode selection), updated help dropdowns with AI auto-annotation documentation. |
| 2.10.0 | **Architecture refactoring**: Split 2,381-line ProjectsContext into focused, maintainable modules - 7 domain hooks (useProjectCRUD, useProjectSave, useProjectSharing, useProjectTrash, useProjectMembers, useProjectLibrary, useProjectAdmin) + utilities + modals across 10 files. Improved maintainability, testability, and reusability while maintaining backward compatibility. Same API surface, zero breaking changes. |
| 2.9.5 | **Sync fix**: Fixed 406 errors when adding annotations - changed edit history check from `.single()` to `.maybeSingle()` to handle new annotations gracefully. Eliminates console errors during normal annotation workflow. |
| 2.9.4 | **Shared project indicator**: Clickable toolbar badge showing member count (icon + number), opens dropdown with member list (avatars, names, roles). **Permission handling**: Annotation/reply deletion now checks RLS permissions and prevents "phantom deletions" - items remain visible if user lacks permission, shows error alert. Badge positioned in right toolbar before help button with subtle styling matching other toolbar icons. |
| 2.9.3 | **Collaboration fixes**: Fixed annotation edit history nesting (strips previous brackets before wrapping), added RLS policy for project owners to delete member replies, replaced color picker with simple dropdown (10 preset colors + auto), direct Supabase profile updates bypass auth issues. **Polling optimization**: Fixed state check field mismatch that prevented annotation syncing between users. **UX improvements**: Reply input auto-closes when clicking away, auto-fork protection creates copies for collaborators when owner deletes shared project. **Code cleanup**: Reduced verbose console logging in useAnnotationsSync |
| 2.9.2 | **Critical fixes**: Fixed replies vanishing after submit (dependency array issue in useAnnotationsSync), fixed reply input delay (immediate focus), fixed "+" button breaking reply structure (append to correct parent), fixed color picker infinite reload loop (use onBlur + refreshProfile instead of onChange + window.reload), added cloud project reconnection on page reload with blue banner notification, improved profile color loading state |
| 2.9.1 | **Reply UI improvements**: Cleaner "+" button UI instead of always-visible input, author-specific coloring (each user gets unique color for their replies), customizable profile colors in Settings → Profile, replies persist in all save formats (cloud, .ccs files, localStorage, PDF exports), replies respect annotation opacity settings |
| 2.9.0 | **Annotation replies**: Threaded discussions on annotations with real-time sync, click 💬 button to expand/collapse reply threads, add and delete replies with 5s polling sync, reply counts displayed on annotations. **Code refactoring**: Split cm-annotations.ts (969 lines) into focused modules for better maintainability (config, widgets, extensions) |
| 2.8.4 | **Library versioning**: Approving submissions now creates library copy while preserving user's working copy, auto-replaces duplicate library entries, profiles table RLS policies for admin persistence, sample projects dated (ELIZA 1965b, Apollo 11 1969, Colossal Cave 1977) |
| 2.8.3 | **Apollo 11 sample projects**: Added Comanche055 (Command Module, 85 AGC files) and Luminary099 (Lunar Module, 90 AGC files) as critique mode samples, dynamic sample loading from Samples.md, AGC language support |
| 2.8.2 | **Skin fixes**: Removed underline from annotation widgets in Teams skin, fixed dropdown/popover text readability in 7 skins, fixed Geocities webring visibility, forced light mode backgrounds for Teams/Myspace/HyperCard skins |
| 2.8.1 | **Admin orphaned projects tab**: View, reassign, or delete projects with no owner (created when users are deleted), expanded Hackerman easter egg quotes (humanities scholars reading code, classic CS observations, AI/ML hacking jokes, Claude soul document and Gemini jokes) |
| 2.6.2 | **Trash can for files and projects**: Soft delete for cloud projects and files with recovery via Trash tabs/dropdowns, rename projects from cloud dropdown and Projects modal, admin library management (rename, delete, duplicate, deaccession approved projects) |
| 2.6.1 | **Library & accessioning**: Admin panel for reviewing library submissions (Submit to Library button for owners, Admin: Review Submissions for admins), BASIC syntax highlighting with full keyword support, code font selection (8 monospace fonts including Fira Code, JetBrains Mono, Source Code Pro) in Settings → Appearance |
| 2.6.0 | **Custom skins**: Retro-themed visual skins system with nostalgic Myspace skin included, skin-aware Clippy with custom messages, shared retro icons, skin credit box support; enable in Settings → Appearance |
| 2.5.1 | **Easter eggs**: Hidden features for the discerning scholar (try typing "clippy" or "hacker" anywhere outside text fields) |
| 2.5.0 | **File management & display settings**: New File button creates blank markdown files, Commit Changes saves current content as new base version, Download ZIP exports project with code files and annotations, OAuth redirect preserves current page, display settings (annotation font/indent/brightness, panel layout) persist per-project, files pane font size setting, Safari tab suspension fixes |
| 2.4.0 | **Cloud collaboration**: Supabase-powered project sharing with OAuth (Google, GitHub, Apple), shareable invite links, member management modal, real-time annotation and code sync with 5-second polling, staleness detection prevents overwriting collaborators' changes, user profiles with initials attribution on annotations |
| 2.3.4 | **Require connection test**: AI chat only works after successful connection test; clear messaging guides users to test connection before chatting |
| 2.3.3 | **Onboarding improvements**: AI disabled by default (user must configure and enable), PDF export now highlights annotation lines too, copy button fixed dimensions prevent toolbar height glitch |
| 2.3.2 | **PDF export enhancement**: Annotated code lines now have subtle type-coloured background highlighting matching the code editor, coloured right-side indicator bars, and improved annotation pills |
| 2.3.1 | **AI status indicator fix**: Status now shows yellow/amber until connection is verified with successful test; green only appears after "Test Connection" succeeds; status resets when provider, model, API key, or base URL changes |
| 2.3.0 | **Enhanced annotation highlighting**: Line highlight with adjustable intensity (off/low/medium/high/full), type-coloured right-side indicator bars matching annotation colours, focus mode toggle with prominent burgundy button to dim unannotated code, block annotations now position editor at end of block, auto-select newly loaded files, 80-column auto-extend respects user panel resizing, real-time line/column display on hover |
| 2.2.0 | **Flexible layout**: Collapsible chat panel with vertical label, collapsible and resizable code files pane, full screen mode for annotation pane (hides files and chat for focused work), streamlined chat header showing AI model, updated help with keyboard shortcuts |
| 2.1.0 | **Search functionality**: Code search (Cmd+F) in editor, chat search (Cmd+Shift+F) to filter messages; Help popover (?) with interface guide and keyboard shortcuts; PDF export includes coloured annotation type pills |
| 2.0.0 | **New annotation system**: Type badge pills with colour coding, annotations fade into background and brighten on hover, annotation summary panel in file tree showing counts by type in a grid layout, improved visual hierarchy for distraction-free reading |
| 1.8.2 | User profile (name/initials, affiliation, bio) displayed in chat and included in session exports, anonymous mode option, unified muted timestamp styling |
| 1.8.1 | User-editable AI models configuration via `public/models.md` file (add/remove models without code changes) |
| 1.8.0 | Custom theme colours (6 accent colours via dropdown), fixed dark mode annotation colours, updated AI models (Gemini 2.5 Flash/Pro, OpenAI o1), custom model input for all providers |
| 1.7.0 | Fixed unsaved changes detection (no more false warnings on fresh sessions), improved session state handling, default 70% code panel width in critique mode |
| 1.6.0 | **🌙 Dark mode!** Light/dark/system theme options in Settings → Appearance, UI font size setting for modals and windows, code upload works when AI disabled |
| 1.5.0 | Per-mode session persistence with localStorage auto-save, mode switcher preserves session state, click-outside-to-close for all modals, compact modal typography |
| 1.4.0 | Comprehensive settings architecture with tabbed modal (AI, Appearance, About), global and per-mode font size settings |
| 1.3.0 | AI enable/disable toggle with three-state status indicator (On/Off/Not Configured), annotation help popover fix |
| 1.2.4 | Fixed scroll jump when marking messages, inline timestamp/actions layout |
| 1.2.3 | Compact message layout with inline timestamp and action buttons, copy/mark available for all messages |
| 1.2.2 | PDF export improvements: gold margin bar and [MARKED] label for favourited messages, unicode sanitisation |
| 1.2.1 | Heart icon stays visible when message is marked/liked |
| 1.2.0 | Version sourced from package.json via environment variable, Cmd+S saves without exiting session |
| 1.1.0 | Compact toolbar with reduced height, Claude-style auto-expanding input, centered input area (80% width), font size popover control, keyboard shortcuts (Cmd+S/O/E), improved mobile/desktop viewport handling |
| 1.0.0 | Next.js 16 with Turbopack, React 19, unified font size controls, resizable panels, edit/annotate mode toggle, improved UI consistency |
| 0.2.0 | IDE-style critique layout, inline annotations, session log export, experience levels, Load Project |
| 0.1.0 | Initial release with four modes, multi-provider AI, create mode |

## Development

### Building for Production

```bash
npm run build
npm start
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT License](LICENSE)

## Acknowledgments

- Critical code studies methodology inspired by Mark Marino, David M. Berry, and the CCS community
- Built with [Next.js](https://nextjs.org/) and [Tailwind CSS](https://tailwindcss.com/)
- Developed with [Claude Code](https://claude.ai/claude-code) (Anthropic)
- Co-created at CCSWG 2026

<!-- It looks like you're reading a README. Would you like help with that? -->
