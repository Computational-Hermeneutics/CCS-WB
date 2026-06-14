# CCS Workbench - AI Assistant Context

This file provides context for Claude Code or other AI assistants working on this project.

## Project Overview

**CCS-WB** (Critical Code Studies Workbench) is a web application for close reading and hermeneutic analysis of software as cultural artefact. It implements critical code studies methodology based on the work of Mark Marino and David M. Berry.

**Version**: 5.1.0 | CCS Methodology v2.7

## Technology Stack

- **Framework**: Next.js 16 with React 19, TypeScript 5 (strict)
- **Bundler**: Turbopack (Next.js 16 default)
- **Styling**: Tailwind CSS with custom editorial design tokens
- **State**: React Context + useReducer (no external state library)
- **UI Components**: Radix UI primitives, Lucide icons
- **Code Editor**: CodeMirror 6 with custom language modes and annotation extensions
- **AI Integration**: Multi-provider (Anthropic, OpenAI, Google, Ollama, OpenRouter, Hugging Face, OpenAI-Compatible). Default path is **browser-direct dispatch** for every provider via `src/lib/ai/browser-direct.ts` (`dispatchBrowserDirect` + `ping*` per provider); the `/api/*` routes still build the prompt but return a `{ browserDirect, provider, payload, messageTemplate }` envelope for the browser to complete the call. Server-side `generateAIResponse` via Vercel AI SDK is the fallback for env-var-keyed deployments only.
- **Cloud**: Supabase (auth, project storage, real-time sync)
- **PDF Export**: jsPDF

## Key Architecture Decisions

### Entry Modes
The app has three entry modes, each with distinct UI, AI engagement style, and prompts:
- `critique` (Analyze Code) - IDE-style three-panel layout (file tree, code editor, chat). AI acts as expert practitioner.
- `interpret` (Learn Methods) - Exploring CCS methodology and hermeneutic frameworks. AI acts as beginner-friendly guide.
- `create` (Create Code) - "Vibe coding" to understand algorithms by building them. AI acts as intermediate practitioner.

### Session State
All session state flows through `SessionContext.tsx` using useReducer. The `Session` type in `types/session.ts` is the central data structure.

### CCS Methodology
The LLM system prompts are generated from `Critical-Code-Studies-Skill.md` (a skill document loaded at runtime via `lib/prompts/ccs-methodology.ts`). This contains the CCS methodology, conversation phases, and annotation types.

### Collaboration (two tiers — see `docs/COLLABORATION.md`)
There are **two deliberately different collaboration tiers, Local and
Cloud**. Read `docs/COLLABORATION.md` before changing anything here — it
records the model and the parked-tier decisions.

- **Local (simple, default, zero infra):** annotation, threaded
  comments on annotations, `.ccs` save/load, AND asynchronous
  file-based collaboration via the *Merge annotations* button. Key
  files: `src/lib/sync/file-merge.ts` (pure `computeAnnotationMerge`),
  the `MERGE_LINE_ANNOTATIONS` reducer case in `SessionContext`, and
  `handleMergeAnnotationsFile` in `useWorkbenchProject`. Additive only,
  name-based file matching, idempotent union by annotation UUID,
  drift-flags via `orphaned`, reply-thread union, then a save-master
  prompt.
- **Cloud (advanced, opt-in, self-hosted Supabase):** OAuth (Google,
  GitHub, Apple), real-time sync (5-second polling), invite links,
  member management; operation queue + IndexedDB for offline. Gated by
  three layers: `cloud.config.json` → `enabled` (build-time master),
  `isSupabaseConfigured()` (env vars / runtime config), and the
  `collaborationEnabled` app setting (per-user). All cloud-only code
  lives in `src/cloud/` and is removable as a folder — see
  `docs/CLOUD-RINGFENCE.md` and `src/cloud/README.md` before changing
  anything cloud-related.

**Parked, do not build speculatively:** a live Yjs/PartyKit tier and a
shared append-only UUID log (Git/JSONL, KV endpoint, or Google Sheets).
Both have written rationale and explicit revisit triggers in
`docs/COLLABORATION.md`. Implement only when a concrete workflow demands
it.

### Custom Skins
10 nostalgic visual themes (Atari 2600, BBC Micro, C64, ELIZA, Geocities, HyperCard, Myspace, Teams, Teletext, Vaporwave) managed via `SkinsContext.tsx` and loaded from `public/skins/`.

## Directory Structure

```
src/
├── app/                          # Next.js app router
│   ├── api/                      # API routes
│   │   ├── analyze/              # Code analysis
│   │   ├── chat/                 # Main dialogue API
│   │   ├── export/               # Export operations
│   │   ├── generate/             # Output generation
│   │   ├── literature/           # Literature search
│   │   ├── profile/              # User profile
│   │   ├── skill-document/       # CCS methodology loader
│   │   ├── test-connection/      # AI provider connection test
│   │   ├── upload/               # File upload
│   │   └── version/              # Version endpoint
│   ├── auth/                     # OAuth callback handling
│   ├── conversation/page.tsx     # Main conversation page
│   ├── invite/                   # Shareable invite links
│   └── page.tsx                  # Landing page with mode selection
├── components/
│   ├── auth/                     # LoginModal, UserMenu
│   ├── ccs/                      # CCS guidance panel, method cards, smart hints
│   ├── chat/                     # WorkbenchChatPanel, ContextPreview, MessageBubble
│   ├── code/                     # CodeEditorPanel, CodeMirrorEditor, CodeDiffViewer,
│   │                             # AnnotatedCodeViewer, cm-annotations*, cm-lang-*, cm-theme
│   ├── easter-eggs/              # Clippy
│   ├── layouts/                  # WorkbenchLayout (orchestrator), WorkbenchHeader, WorkbenchModals
│   ├── projects/                 # ProjectsModal, LibraryModal, MembersModal, AdminModal
│   ├── prompts/                  # GuidedPrompts (phase-appropriate questions)
│   ├── pwa/                      # InstallPrompt, AlphaFavicon
│   ├── settings/                 # SettingsModal, AIProviderSettings, AISettingsPanel
│   ├── shared/                   # ConfirmDialog, ConnectionStatus, SaveStatusIndicator, Toast
│   └── ui/                       # Base UI primitives
├── hooks/                        # 24 custom hooks
│   ├── useWorkbenchChat.ts       # Chat state and AI messaging
│   ├── useWorkbenchProject.ts    # Project save/load/export
│   ├── useWorkbenchFileManagement.ts # File add/remove/rename
│   ├── useAnnotation*.ts         # Annotation suggestions, replies, sync
│   ├── useProject*.ts            # CRUD, save, sharing, sync, trash, admin, library, members, modals
│   ├── useCollaborativeSession.ts # Collaborative session management
│   ├── useConnectionHealth.ts    # Connection health monitoring
│   ├── useCCSGuidance.ts         # CCS methodology guidance
│   └── ...                       # AutoSave, CodeFilesSync, LibraryRatings, ReferenceSearch, etc.
├── context/
│   ├── SessionContext.tsx        # Main session state (useReducer)
│   ├── AISettingsContext.tsx      # AI provider config
│   ├── AppSettingsContext.tsx     # App-wide settings
│   ├── AuthContext.tsx            # Authentication state
│   ├── ProjectsContext.tsx        # Projects state
│   └── SkinsContext.tsx           # Visual skins state
├── lib/
│   ├── ai/                       # Multi-provider client, config, model loader
│   ├── export/                   # Session log export utilities
│   ├── file-system/              # File System Access API integration
│   ├── prompts/                  # CCS methodology loader
│   ├── supabase/                 # Supabase client, server, types
│   ├── sync/                     # Operation queue, merge strategies, offline support
│   ├── code-extraction.ts        # Extract code from AI responses
│   └── ...                       # config, utils, rate-limit, session-storage, etc.
└── types/
    ├── session.ts                # Core types + GUIDED_PROMPTS
    ├── ai-settings.ts
    ├── app-settings.ts
    ├── api.ts
    └── index.ts
```

## Common Tasks

### Adding a new annotation type
1. Add to `LineAnnotationType` union in `types/session.ts`
2. Add to `LINE_ANNOTATION_TYPES` array and `LINE_ANNOTATION_LABELS` object
3. Add colour and prefix mappings in `components/code/cm-annotations-config.ts`

### Modifying the CCS methodology
Edit `Critical-Code-Studies-Skill.md` at the project root. This is loaded by `lib/prompts/ccs-methodology.ts` and injected into chat API system prompts.

### Adding a new conversation phase
1. Add to `ConversationPhase` type in `types/session.ts`
2. Add guided prompts to `GUIDED_PROMPTS` constant
3. Update phase transition logic in chat API route

### Adding a new sample project
1. Create a `.ccs` project file in the CCS Workbench
2. Create a subfolder in `public/sample-code/`
3. Add an entry to `public/sample-code/Samples.md`

### Adding a new skin
1. Create a subfolder in `public/skins/` with `skin.json` and optional assets
2. Follow the format documented in `public/skins/README.md`

### Adding a new CodeMirror language mode
1. Create `cm-lang-[name].ts` in `components/code/`
2. Register it in `cm-languages.ts`

### Changing the UI design
The design uses custom Tailwind tokens defined in `tailwind.config.ts`:
- Colours: `burgundy`, `ink`, `parchment`, `cream`, `ivory`, `slate`, `slate-muted`
- Fonts: `font-display` (Playfair Display), `font-body` (Source Serif), `font-sans` (Inter)
- Theme colours: Six accent palettes (Burgundy, Forest, Navy, Plum, Rust, Slate)

## Project Files

| File | Purpose |
|------|---------|
| `Critical-Code-Studies-Skill.md` | CCS methodology v2.7 for LLM context |
| `CCS-Bibliography.md` | Reference bibliography for CCS |
| `public/models.md` | User-editable AI models configuration |
| `public/sample-code/Samples.md` | Sample project registry |
| `public/skins/Skins.md` | Skin definitions |
| `docs/` | Setup guides (Supabase, Vercel, configuration) |
| `.env.example` | Environment variables template |

## Development Commands

```bash
npm run dev      # Start dev server (Turbopack)
npm run build    # Production build
npm run lint     # ESLint
npm run test     # Jest tests
```

## Notes for AI Assistants

- `WorkbenchLayout.tsx` is the main layout orchestrator (refactored from 4,748 to 1,163 lines in v3.2.0)
- `conversation/page.tsx` delegates to WorkbenchLayout (refactored from 2,191 to 155 lines in v3.2.0)
- Session persistence uses `.ccs` files (JSON format) saved/loaded via browser or cloud
- API keys are stored in browser localStorage, not server-side
- The annotation system uses CodeMirror 6 extensions (`cm-annotations*.ts`) with six types: Observation, Question, Metaphor, Pattern, Context, Critique
- Custom language modes exist for AGC, BASIC, FORTRAN, IPL-V, and MAD
- Cloud projects use Supabase with real-time polling (5-second intervals)
- The `init.sh` script handles development environment setup
