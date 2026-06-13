// CCS-WB cloud-feature build-time master switch.
//
// This module reads `cloud.config.json` at the repo root and exports
// the single boolean `CLOUD_ENABLED` that gates every cloud-related
// path in the app. It is the source of truth that pairs with the
// physical ring-fence of cloud code in `src/cloud/`: change one JSON
// file, and the cloud subtree goes dormant across the whole build
// regardless of env vars, user toggles, or persisted settings.
//
// Three layered gates exist by design — each strictly narrows the
// previous, and each can be flipped independently:
//
//   1. CLOUD_ENABLED                      (this flag, build-time)
//   2. isSupabaseConfigured()             (env vars or user-supplied
//                                          runtime config — deploy /
//                                          per-browser scope)
//   3. appSettings.collaborationEnabled   (per-user master toggle in
//                                          Settings → Cloud)
//
// When (1) is false the cloud UI never appears, no hook ever talks
// to Supabase, and `isSupabaseEnabled` in AuthContext is forced false
// even if (2) and (3) would otherwise be true. That's the intended
// "ring-fenced and inert" state — cloud code still ships in the
// bundle (it isn't dynamically excluded; that's a deeper refactor),
// but it never runs.
//
// To fully remove the cloud feature from a fork: set
// `cloud.config.json` -> `enabled: false`, and (separately) delete
// the `src/cloud/` subtree. The rest of the app builds and runs
// unchanged because every cloud-using file references the cloud
// subtree through one explicit import alias.

import cloudConfig from "../../cloud.config.json";

export const CLOUD_ENABLED: boolean = !!cloudConfig.enabled;
