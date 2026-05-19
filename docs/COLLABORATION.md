# Collaboration model

CCS-WB supports collaborating on annotations in **two deliberately
different modes**. They are not competing implementations of the same
thing — they serve different scholarly workflows and sit at very
different levels of complexity. Most users only need Mode 1.

---

## Mode 1 — File-based merge (simple, default, zero infrastructure)

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

## Mode 2 — Cloud sync (advanced, optional, opt-in)

**What it is.** Real-time multi-user collaboration backed by Supabase:
shared cloud projects, OAuth sign-in, members and roles, invite links,
live annotation/code sync, presence, a public library.

**Why it is gated.** It is considerably heavier than Mode 1 — it needs a
configured Supabase backend and accounts, and on the free tier the
backend **auto-pauses when idle**, so the first requests of a live
session can stall until it wakes. It is controlled by a master switch in
**Settings → Profile → Cloud Collaboration**:

- Default on (when Supabase is configured for the deployment).
- When off: all sign-in and cloud UI is hidden, CCS-WB is a clean
  local-only workbench, and **no requests are made to Supabase** — a
  paused free-tier instance is never even woken.
- The toggle stays visible whenever Supabase is configured, so it can
  always be turned back on.
- Mode 1 (file merge), local annotation, and `.ccs` save/load are
  unaffected by this switch.

Setup lives in `docs/SUPABASE_SETUP.md`.

---

## Why two modes, and why not a third (Yjs/PartyKit) right now

A lightweight **real-time** tier was evaluated (Yjs CRDT over a single
WebSocket relay such as PartyKit, or self-hosted `y-websocket`). It would
give conflict-free live co-annotation without Supabase's account/RLS
weight or free-tier auto-pause, and would sidestep WebRTC's NAT/TURN
problems on university networks.

**Decision: not built, deliberately parked.** The combination of Mode 1
(shipped) plus Mode 2 behind the opt-in switch (shipped) is a coherent
stopping point for a solo-maintained project:

- Mode 1 covers the common asynchronous workflow with zero infrastructure.
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
