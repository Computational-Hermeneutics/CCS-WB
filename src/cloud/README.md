# `src/cloud/` — the Supabase cloud-collaboration ring-fence

Everything in this subtree exists to support **Cloud** collaboration
(see `docs/COLLABORATION.md`): real-time multi-user sync of code and
annotations via Supabase, OAuth sign-in, members and roles, invite
links, the public library. The rest of CCS-WB does not import from
here unless it is explicitly cloud-using (the few places that do are
listed below).

CCS-WB ships **local-first**. Cloud is opt-in, self-hosted (bring your
own Supabase project), gated behind three layers, and the entire
subtree can be physically removed without breaking the rest of the
app.

## Layout

```
src/cloud/
├── config.ts                  # reads cloud.config.json → CLOUD_ENABLED
├── lib/
│   ├── supabase/              # the Supabase client, server, types, runtime config
│   ├── sync/                  # cloud-only sync plumbing (operation queue, merge strategies)
│   └── xp-utils.ts            # XP rewards / level math (cloud-only)
├── context/
│   ├── AuthContext.tsx        # OAuth + magic link, profile, session
│   └── ProjectsContext.tsx    # cloud projects, members, library, admin
├── hooks/
│   ├── useProjectCRUD.ts
│   ├── useProjectSave.ts
│   ├── useProjectSharing.ts
│   ├── useProjectMembers.ts
│   ├── useProjectLibrary.ts
│   ├── useProjectAdmin.ts
│   ├── useProjectTrash.ts
│   ├── useProjectModals.ts
│   ├── useProjectSync.ts
│   ├── useCollaborativeSession.ts
│   ├── useAnnotationsSync.ts
│   ├── useCodeFilesSync.ts
│   ├── useConnectionHealth.ts
│   └── useXPSystem.ts
└── components/
    ├── auth/                  # UserMenu, LoginModal
    ├── projects/              # ProjectsModal, MembersModal, LibraryModal, AdminModal, ProjectSyncBanner
    └── ConnectionStatus.tsx
```

The Next.js routes that handle OAuth callback (`src/app/auth/callback/`)
and invite tokens (`src/app/invite/[token]/`) cannot move into this
subtree — Next requires routes under `src/app/` — but they import
exclusively from here and have no logic of their own.

## The three gates

Cloud features are active only when **all three** of these hold:

| # | Where | Who controls it | What it means |
|---|---|---|---|
| 1 | `cloud.config.json` (`CLOUD_ENABLED`) | the maintainer of this fork at build time | Is cloud code active at all in this build? |
| 2 | `isSupabaseConfigured()` (env vars **or** runtime UI config) | the deploy or per-browser user | Is there a Supabase URL + key to talk to? |
| 3 | `appSettings.collaborationEnabled` (Settings → Cloud → Enable Cloud Collaboration) | the user, per browser | Did the user opt in? |

`isSupabaseConfigured()` folds (1) into itself, so most consumers only
need to check the function. `AuthContext` ANDs the result with (3).

## How to remove cloud entirely from a fork

1. Set `cloud.config.json` → `"enabled": false`.
2. Delete `src/cloud/`.
3. Delete the routes that import from it:
   - `src/app/auth/callback/`
   - `src/app/invite/`
   - `src/app/api/profile/update-color/` (if present)
4. `tsc` will report exactly which files still expected cloud
   imports — there's a small handful (`AppSettingsContext.tsx`,
   `SessionContext.tsx`, `WorkbenchLayout.tsx`, `SettingsModal.tsx`,
   `useAnnotationReplies.ts`) and each guards every cloud touchpoint
   with the gates above; remove the imports and any `if (cloud)…`
   branches.
5. Local (Mode-0 / file-merge) collaboration continues to work
   unchanged. Annotation comments are part of the local data model
   (see `SessionContext` → `ADD_ANNOTATION_REPLY`).

## How to add cloud back to a fork that removed it

The opposite of the above. Copy this subtree back, restore the
routes, add the gate calls to the cloud-using files, set
`cloud.config.json → enabled: true`, follow `docs/SUPABASE_SETUP.md`.

## What does **not** live here

These are cloud-*using* but not cloud-*only*, and stay where they
are:

- `src/context/AppSettingsContext.tsx` — local profile + settings;
  imports `isSupabaseConfigured` to decide whether to show the
  collaboration UI.
- `src/context/SessionContext.tsx` — the local session model;
  optionally dispatches to cloud sync hooks if available.
- `src/components/layouts/WorkbenchLayout.tsx` — top-level layout;
  threads cloud props into children only when cloud is active.
- `src/components/settings/SettingsModal.tsx` — local settings
  modal; conditionally renders the Cloud tab.
- `src/hooks/useAnnotationReplies.ts` — annotation comments;
  writes locally first, best-effort pushes to cloud if available.
- `src/lib/sync/file-merge.ts` — the **local** `.ccs` merge logic
  (Tier A in `docs/COLLABORATION.md`). Not cloud — explicitly
  local-first asynchronous collaboration.
