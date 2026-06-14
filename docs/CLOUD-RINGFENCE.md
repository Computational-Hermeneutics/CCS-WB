# Cloud ring-fence — how the Supabase code lives in CCS-WB

CCS-WB ships **local-first**: annotation, threaded comments,
`.ccs` save/load, and asynchronous file-based collaboration via
the *Merge annotations* button all work fully offline, with no
account and no backend. The optional cloud collaboration tier
(Supabase: real-time multi-user sync, OAuth sign-in, members,
public library) is **physically isolated** in the codebase so
that:

1. A maintainer who wants the cloud features disabled in a build
   can do so with **one JSON flag** — no source edits.
2. A maintainer who wants to remove the cloud features entirely
   from a fork can do so with **one folder deletion** plus a
   short, deterministic clean-up the type checker will guide
   them through.
3. A maintainer who wants to *add* cloud back in (or hand the
   subtree to someone else to host) has a single self-contained
   location.

The cloud subtree never imports from outside itself except for
the standard local types and utilities the rest of the app
provides; nothing local-only imports from the cloud subtree
except a small enumerated handful of files, each of which gates
every cloud touchpoint behind explicit conditions.

This document is the **user/maintainer-facing** reference for
the ring-fence. The technical reference, including the full file
list and the integration boundary, is in
[`src/cloud/README.md`](../src/cloud/README.md).

---

## The three gates

Cloud features are active only when **all three** of these hold.
They strictly narrow each other, and each can be flipped
independently.

| # | Layer | Where | Who controls it |
|---|---|---|---|
| 1 | Build-time | [`cloud.config.json`](../cloud.config.json) at repo root — `{ "enabled": boolean }` | the maintainer of your fork |
| 2 | Deploy-time | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars, **or** the runtime config UI in Settings → Cloud → Cloud Backend (Supabase) | the deploy or per-browser user |
| 3 | Per-user runtime | Settings → Cloud → *Enable Cloud Collaboration* | the user, persisted to their browser |

When (1) is `false` the cloud subtree is **inert**: no Supabase
client is ever instantiated, no requests are made, the cloud UI
is hidden everywhere. The code still ships in the bundle (it
isn't dynamically excluded — that's a deeper refactor we
deliberately did not do). For everyday running of CCS-WB,
"inert" is operationally indistinguishable from "deleted".

When (1) is `true` but (2) is empty the cloud tab shows a
friendly null-state — "No backend configured yet…" — pointing the
user at the runtime config. Modes 0 and 1 (local + file merge)
remain fully functional regardless of any of these.

When (1) is `true` and (2) is set but (3) is off, the cloud UI
hides itself but the Cloud tab in Settings stays visible so the
user can re-enable when they're ready. **This is the default for
new installations** as of v4.2.0.

---

## How to ship a CCS-WB build with cloud turned off

Edit [`cloud.config.json`](../cloud.config.json):

```json
{
  "enabled": false
}
```

That's the whole change. Rebuild, deploy. The cloud subtree
remains in the source tree (so re-enabling later is a one-line
flip back), but nothing in the build talks to Supabase, no
sign-in UI ever appears, and **every cloud touch in the UI is
removed at the JSX level** — the Cloud tab in Settings is gone,
the Profile-tab breadcrumb that pointed at it is gone, the cloud
projects button and UserMenu in the workbench header are gone,
the "Local vs Cloud Mode" and "Cloud sync (advanced)" sections
in the Interface Guide popover are gone (the Collaborating
section collapses to a single paragraph about file-based merge).
A user landing on a deployment with `enabled: false` sees no
trace of cloud features anywhere; the workbench reads as a
purely local app.

You can verify the off state by clearing `localStorage` and
inspecting Settings → Cloud — the master toggle won't appear
even if the Supabase env vars are set, because gate (1) is
forcing `isSupabaseConfigured()` to return `false`.

---

## How to remove cloud entirely from a fork

For a maintainer who wants to delete the cloud code rather than
keep it dormant:

1. Set `cloud.config.json` → `"enabled": false`.
2. `rm -rf src/cloud/`.
3. Delete the three Next.js routes that import from the subtree
   (they cannot live inside `src/cloud/` because Next requires
   routes under `src/app/`):
   - `src/app/auth/callback/`
   - `src/app/invite/`
   - `src/app/api/profile/update-color/` *(if present in your fork)*
4. Run `npx tsc --noEmit`. The type checker will report exactly
   which files still expected cloud imports — there's a small
   enumerated handful listed in
   [`src/cloud/README.md`](../src/cloud/README.md) §*"What does
   not live here"*. Each one already guards every cloud touch
   behind the three gates above, so removing the cloud imports
   and the now-unreachable conditional branches is mechanical.
5. Local annotation, comments, `.ccs` save/load, and the *Merge
   annotations* button keep working unchanged. Threaded comments
   are part of the local data model (`SessionContext` →
   `ADD_ANNOTATION_REPLY` / `DELETE_ANNOTATION_REPLY`) and
   persist in `.ccs` files; they have no cloud dependency.

If you want to put the cloud code somewhere else later (e.g.
extract it into a separate npm package or a sibling app), the
subtree is self-contained enough to lift wholesale.

---

## How to add cloud back to a fork that removed it

The opposite of the removal: copy the `src/cloud/` subtree and
the three routes back, restore the `if (cloud) …` branches in
the files listed in §*"What does not live here"*, set
`cloud.config.json → "enabled": true`, and follow the Supabase
project setup in [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md).

---

## What's in the cloud subtree

A quick map for navigating; full enumeration is in
[`src/cloud/README.md`](../src/cloud/README.md).

```
src/cloud/
├── config.ts                     # reads cloud.config.json → CLOUD_ENABLED
├── README.md                     # technical reference (file-by-file)
├── lib/
│   ├── supabase/                 # client, server, types, runtime config
│   ├── sync/                     # operation queue, merge strategies
│   └── xp-utils.ts               # XP / level math (cloud-only)
├── context/
│   ├── AuthContext.tsx           # OAuth + magic link, profile, session
│   └── ProjectsContext.tsx       # shared projects, members, library, admin
├── hooks/                        # all cloud-only hooks (~14 files)
└── components/
    ├── auth/                     # UserMenu, LoginModal
    ├── projects/                 # Projects/Members/Library/Admin modals + ProjectSyncBanner
    └── ConnectionStatus.tsx
```

Plus three Next.js routes that have to live under `src/app/`
per Next's routing convention but contain no logic of their own
beyond importing from `src/cloud/`:

```
src/app/auth/callback/route.ts
src/app/invite/[token]/page.tsx
src/app/api/profile/update-color/route.ts
```

---

## Why ring-fence rather than delete or dynamic-import

Three reasonable approaches, three different tradeoffs:

| Approach | Cost | Effect |
|---|---|---|
| **Ring-fence + JSON flag** *(what we did)* | a moderate one-time refactor | one folder + one flag; clear boundary; the code still ships in the bundle |
| Delete outright | trivial commit | no cloud, no way back without git history |
| Dynamic-import / code-split | a more substantial refactor | smaller bundle when off, but two code paths to maintain |

The ring-fence wins on the property that matters most for an
academic open-source project: **a future contributor (or
future-you) can read or remove one folder cleanly, and the
default-off build doesn't pay any meaningful runtime cost for
the code being present**. The bundle-size argument for dynamic
imports doesn't move the needle for a project of CCS-WB's size,
and outright deletion forecloses the option for anyone who
wants the cloud features back. The flag-plus-folder approach
keeps every door open.

---

See also:

- [`docs/COLLABORATION.md`](COLLABORATION.md) — the two-tier
  collaboration model (Local + Cloud) at the user level.
- [`docs/SUPABASE_SETUP.md`](SUPABASE_SETUP.md) — how to
  provision the Supabase project that the cloud tier needs.
- [`src/cloud/README.md`](../src/cloud/README.md) — the
  technical, file-by-file reference for the subtree itself.
