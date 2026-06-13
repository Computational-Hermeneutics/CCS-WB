# Collaboration model

CCS-WB has **two collaboration tiers**, *Local* and *Cloud*. They are
not competing implementations of the same thing — they serve different
scholarly workflows and sit at very different levels of complexity.
Most users only need Local.

---

## Local — annotation, comments, and file-based collaboration (simple, default, zero infrastructure)

**What it is.** Asynchronous collaboration by exchanging `.ccs` files.
You and a collaborator annotate the same code independently, then one of
you merges the other's file in. No backend, no accounts, no network, works
offline.

**Why it exists.** This matches how close reading is actually
co-authored: someone marks up the code, sends it on, someone else marks
it up, and the two passes are combined. It is the right default for
co-authored analyses and teaching where students hand in `.ccs` files.

**How it works.**

- The *Merge annotations* button (next to *Load session* in the header)
  imports a collaborator's `.ccs`.
- **Additive only.** Nothing local is ever overwritten or deleted.
- **File matching is by name.** `codeFileId` is a random per-session
  UUID, so the same source file has a different ID in each person's
  `.ccs`. Files are matched across sessions by name; incoming annotations
  are remapped onto the local file's ID.
- **Union by annotation ID.** Annotation IDs are globally unique, so the
  union is keyed on them — re-merging the same file is idempotent (adds
  nothing the second time).
- **Drift-aware.** If a matched file's *content* differs from your local
  copy, the incoming annotations are still imported but flagged
  (`orphaned`) for review, because their line anchors may no longer line
  up. Better visible than silently wrong.
- **Reply threads** merge by reply ID into annotations that exist on both
  sides.
- A confirmation dialog summarises exactly what will change
  (e.g. "12 annotations to add, 1 new reply, 2 already present, 4 flagged
  for review, 1 file had no match here") before anything is applied.

**The master copy.** After a merge the session holds the *union* of
everyone's annotations — it is the combined master. A prompt offers to
save it straight back out via the normal Save flow. The saved `.ccs`
carries every annotation with its author (`addedBy`), reply threads, and
review flags, so the master round-trips losslessly:

```
open master.ccs → Merge collaborator-1.ccs → Merge collaborator-2.ccs → Save → master.ccs
```

Implementation: `src/lib/sync/file-merge.ts` (pure `computeAnnotationMerge`),
the `MERGE_LINE_ANNOTATIONS` reducer case in `src/context/SessionContext.tsx`,
and `handleMergeAnnotationsFile` in `src/hooks/useWorkbenchProject.ts`.

---

## Cloud — real-time multi-user sync (advanced, optional, self-hosted)

**What it is.** Real-time multi-user collaboration backed by Supabase:
shared cloud projects, OAuth sign-in, members and roles, invite links,
live annotation/code sync, presence, a public library.

**Why it is gated.** It is considerably heavier than Local — it needs a
configured Supabase backend and accounts, and on the free tier the
backend **auto-pauses when idle**, so the first requests of a live
session can stall until it wakes. It is controlled by a master switch in
**Settings → Cloud → Enable Cloud Collaboration**:

- Default on (when Supabase is configured for the deployment).
- When off: all sign-in and cloud UI is hidden, CCS-WB is a clean
  local-only workbench, and **no requests are made to Supabase** — a
  paused free-tier instance is never even woken.
- The toggle stays visible whenever Supabase is configured, so it can
  always be turned back on.
- Local (file merge, annotation, **threaded comments on
  annotations**, `.ccs` save/load) is unaffected by this switch.
  Comments are part of the local data model: they are added/deleted via
  the SessionContext (`ADD_ANNOTATION_REPLY` / `DELETE_ANNOTATION_REPLY`),
  saved into the `.ccs` file, and merged by `file-merge.ts` (reply union
  by id). When Supabase is connected, the optional `useAnnotationsSync`
  hook pushes the same rows for live multi-user sync; the local reducer
  is idempotent on reply id so a remote pull arriving after the local
  dispatch is a no-op.

Supabase is **self-hosted, not a service we run.** CCS-WB ships as a
local-first client and the public deployment does not depend on a hosted
backend; to use Cloud you bring your own Supabase project. Two ways to
plug it in:

- **At runtime, from the UI (recommended).** Settings → Cloud →
  **Cloud Backend (Supabase)** takes a URL + anon key, persists them to
  browser localStorage, and reloads. No fork, no rebuild, no env vars.
  See `src/cloud/lib/supabase/runtime-config.ts`.
- **At build time, via env vars.** For self-hosters running their own
  CCS-WB build: set `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The runtime-UI value takes
  precedence when both are present.

Full setup (project provisioning, RLS, schema) lives in
`docs/SUPABASE_SETUP.md`.

**Cloud is physically ring-fenced in the codebase (v5.0+).** All
cloud-only code lives in `src/cloud/`. A single JSON flag at the repo
root — `cloud.config.json` → `enabled` — gates the entire subtree:
when off, no Supabase client is ever instantiated, the cloud UI is
hidden, and the cloud tab in Settings shows the null state regardless
of env vars or runtime config. Maintainers who want to remove cloud
entirely from a fork can delete `src/cloud/`, fix a small enumerated
list of cloud-using files (the type checker reports them), and Local
keeps working unchanged. See `docs/CLOUD-RINGFENCE.md` for the
maintainer guide and `src/cloud/README.md` for the technical
file-by-file reference.

## AI provider dispatch is local-first too (v4.0+)

A related v4.0 architectural change worth recording alongside the
collaboration model: **every AI provider is now dispatched directly
from the browser** when an API key is in localStorage (the default
configuration). The `/api/chat`, `/api/test-connection` etc. routes
build the prompt server-side as before, but for browser-direct
providers they return a provider-tagged envelope
`{ browserDirect, provider, payload, messageTemplate }`; the client
calls the model itself via `src/lib/ai/browser-direct.ts`
(`dispatchBrowserDirect`).

Coverage as of v4.1: Ollama, Anthropic, OpenAI, OpenRouter, Hugging
Face, OpenAI-compatible, Google. Test Connection for each runs
browser-side. The server-side `/api/*` routes are preserved as a
fallback for deployments that wire provider keys via env vars.

Practical consequences:

- The static PWA shell can drive the entire workbench with no server
  running, completing v4.0's "fully local" framing.
- A deployed CCS-WB can reach a local Ollama (browser → `localhost`;
  the server route never could).
- CCS-WB is host-independent: any static-file host works.

---

## Why two tiers, and why not a third (Yjs/PartyKit) right now

A lightweight **real-time** tier was evaluated (Yjs CRDT over a single
WebSocket relay such as PartyKit, or self-hosted `y-websocket`). It would
give conflict-free live co-annotation without Supabase's account/RLS
weight or free-tier auto-pause, and would sidestep WebRTC's NAT/TURN
problems on university networks.

**Decision: not built, deliberately parked.** The combination of Local
(shipped) plus Cloud behind the opt-in switch (shipped) is a coherent
stopping point for a solo-maintained project:

- Local covers the common asynchronous workflow with zero infrastructure.
- The Cloud Collaboration switch already removed the *non-collaborator's*
  pain (clutter, auto-pause errors when you don't want cloud at all).
- A parallel Yjs stack is real net-new code and maintenance to build
  speculatively.

**Revisit trigger.** Build the Yjs/PartyKit real-time tier *if and when*
a live, synchronous session is actually bitten by Supabase's cold start
in front of people (or account friction blocks seminar participants).
At that point it is a known, scoped piece of work: PartyKit (`y-partykit`)
is the recommended approach — it avoids the WebRTC NAT/TURN trap on
university WiFi, has a free tier that does not auto-pause, and keeps the
no-accounts, room-as-URL property. Self-hosted `y-websocket` is the
fallback if no third-party service is acceptable.

This mirrors the project's general "add capacity only when a real
workflow needs it" principle rather than pre-building for hypothetical
load.

**LAN sharing is not a separate mode.** A frequently-asked-about
"share over the local network in a seminar room" feature is *the same
architecture* as the parked Yjs/PartyKit tier, just with the relay
deployed on someone's laptop on the LAN instead of in a cloud. Room =
URL, no accounts, ephemeral, CRDT/append-log; the only difference is
where the relay process runs. Record this here rather than tracking a
fourth mode: when/if a LAN-share spike is built, it is a deployment
variant of the parked real-time tier, not a new design.

---

## Parked option: shared append-only annotation log

A second future direction (distinct from the live Yjs tier) is a
**shared append-only log**: one immutable record per annotation, keyed
by its UUID; edits are superseding records (UUID + timestamp), deletes
are tombstones; every client folds the log into state. This is an
event-sourcing / CRDT-style model — conflict-free by construction and
well suited to low-contention scholarly annotation. It also produces a
**human-inspectable audit trail** (who annotated what, when), which has
scholarly value in its own right, not just engineering value.

The substrate is a separate choice from the model. Candidates,
audience-ranked:

- **Git / JSONL file** — annotations as an append-only `.jsonl` in a
  repo, one line per UUID, collaboration via commits/PRs. The most
  fitting option for a code-studies tool: the annotations of code are
  themselves version-controlled like code, fully auditable, zero new
  infrastructure if collaborators already use GitHub. Conceptually this
  is Local (file merge) made continuous.
- **Dumb KV / blob endpoint** — Cloudflare Workers + KV or a Durable
  Object, Val.town, or a tiny serverless function: `POST annotation` /
  `GET log since cursor`. ~50 lines, free tier that does not auto-pause,
  no schema, no OAuth; the room is an opaque URL/ID (the capability).
- **Google Sheets / Docs** — `spreadsheets.values.append`, one row per
  annotation. Unique virtue: a lay-readable shared surface, which
  genuinely matters for teaching and non-technical collaborators.
  Caveats: it does **not** deliver Local's zero-auth property (browser
  writes need Google OAuth, or a server-side service account; public
  reads need an API key), Sheets API quotas (~60 reads/min/user), no
  realtime (poll-based, like current Cloud), and a shared mutable sheet
  is fragile unless treated strictly as append-only and parsed by header
  + UUID with row order ignored.

**Assessment.** The append-only UUID log is the right abstraction if a
durable shared tier is ever built; it is orthogonal to the Yjs option
(Yjs optimises for *live* editing, the append-log for *durable,
auditable* shared state). Pick the substrate by audience: Git/JSONL for
technical co-authors, a tiny KV endpoint for seminars, Sheets only where
a human-readable shared spreadsheet is itself a requirement. Not built;
same revisit discipline as the Yjs tier — implement when a concrete
workflow demands it.
