// Asynchronous, file-based collaborative annotation.
//
// Tier (A) of the collaboration model: two people work on the same code
// independently, each saving a `.ccs` file, then one merges the other's
// annotations in. No backend, no accounts, no realtime — just a union
// of annotation sets.
//
// The hard part is that `codeFileId` is a random per-session UUID, so
// the same code file has a *different* id in each person's `.ccs`. We
// therefore match files across the two sessions by name, remap incoming
// annotations onto the local file id, and union by the globally-unique
// annotation id (so re-merging the same file is idempotent). If a
// matched file's content differs from the local copy, the incoming
// annotations are still imported but flagged `orphaned` so the user can
// see their line anchors may have drifted, rather than trusting silently
// misaligned line numbers.

import type { LineAnnotation, AnnotationReplyData, Session } from "@/types/session";

export interface ReplyMerge {
  annotationId: string;
  newReplies: AnnotationReplyData[];
}

export interface AnnotationMergeSummary {
  /** Annotations that will be added to the session. */
  toAdd: LineAnnotation[];
  /** New replies to append to annotations that already exist locally
   *  (keyed by annotation id). Applied immutably by the reducer — the
   *  merge computation never mutates the passed-in session. */
  replyMerges: ReplyMerge[];
  /** Count of incoming annotations skipped because their id already exists locally. */
  duplicates: number;
  /** Count of incoming annotations whose file matched but whose code content
   *  differs locally — imported but flagged `orphaned` for review. */
  flaggedForReview: number;
  /** Names of incoming files that had no match in the current session
   *  (their annotations cannot be placed and are skipped). */
  unmatchedFiles: string[];
  /** New replies merged into annotations that exist on both sides. */
  repliesAdded: number;
}

/** Minimal shape we read from a parsed `.ccs` export. */
interface ImportedExport {
  codeFiles?: Array<{ id: string; name: string }>;
  uploadedFiles?: Array<{ id: string; name: string }>;
  codeContents?: Record<string, string>;
  codeContentsMap?: Record<string, string>;
  lineAnnotations?: LineAnnotation[];
}

function normaliseName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Compute the additive merge of annotations from a parsed `.ccs` export
 * into the current session. Pure: returns what *would* change; the caller
 * decides whether to apply it (after showing the summary).
 *
 * Existing replies are unioned into annotations that are already present
 * locally (by annotation id, then reply id). New annotations bring their
 * replies with them.
 */
export function computeAnnotationMerge(
  session: Pick<Session, "codeFiles" | "codeContents" | "lineAnnotations">,
  imported: ImportedExport
): AnnotationMergeSummary {
  const importedFiles = imported.codeFiles ?? imported.uploadedFiles ?? [];
  const importedContents = imported.codeContents ?? imported.codeContentsMap ?? {};
  const importedAnnotations = Array.isArray(imported.lineAnnotations)
    ? imported.lineAnnotations
    : [];

  // Map: imported file id -> local file id (matched by name).
  const localByName = new Map<string, string>();
  for (const f of session.codeFiles) {
    localByName.set(normaliseName(f.name), f.id);
  }

  const importedFileById = new Map<string, { name: string; localId?: string; contentDiffers: boolean }>();
  const unmatched = new Set<string>();
  for (const f of importedFiles) {
    const localId = localByName.get(normaliseName(f.name));
    if (!localId) {
      unmatched.add(f.name);
      importedFileById.set(f.id, { name: f.name, contentDiffers: false });
      continue;
    }
    const localContent = session.codeContents[localId];
    const importedContent = importedContents[f.id];
    const contentDiffers =
      typeof localContent === "string" &&
      typeof importedContent === "string" &&
      localContent !== importedContent;
    importedFileById.set(f.id, { name: f.name, localId, contentDiffers });
  }

  const existingIds = new Set(session.lineAnnotations.map((a) => a.id));
  const localById = new Map(session.lineAnnotations.map((a) => [a.id, a]));

  const toAdd: LineAnnotation[] = [];
  const replyMerges: ReplyMerge[] = [];
  let duplicates = 0;
  let flaggedForReview = 0;
  let repliesAdded = 0;

  for (const ann of importedAnnotations) {
    const fileInfo = importedFileById.get(ann.codeFileId);

    // Annotation references a file that wasn't in the import's file list,
    // or a file we couldn't match locally: cannot place it.
    if (!fileInfo || !fileInfo.localId) continue;

    if (existingIds.has(ann.id)) {
      // Already have this annotation. Collect any new replies to union
      // in via the reducer — never mutate the passed-in session here.
      const local = localById.get(ann.id);
      if (local && Array.isArray(ann.replies) && ann.replies.length > 0) {
        const seen = new Set((local.replies ?? []).map((r) => r.id));
        const newReplies: AnnotationReplyData[] = ann.replies.filter(
          (r) => !seen.has(r.id)
        );
        if (newReplies.length > 0) {
          replyMerges.push({ annotationId: ann.id, newReplies });
          repliesAdded += newReplies.length;
        }
      }
      duplicates += 1;
      continue;
    }

    const remapped: LineAnnotation = {
      ...ann,
      codeFileId: fileInfo.localId,
    };
    if (fileInfo.contentDiffers) {
      remapped.orphaned = true;
      flaggedForReview += 1;
    }
    toAdd.push(remapped);
    existingIds.add(ann.id);
  }

  return {
    toAdd,
    replyMerges,
    duplicates,
    flaggedForReview,
    unmatchedFiles: [...unmatched],
    repliesAdded,
  };
}

/** One-line human summary for the confirmation dialog. */
export function describeMerge(s: AnnotationMergeSummary): string {
  const parts: string[] = [];
  parts.push(
    `${s.toAdd.length} annotation${s.toAdd.length === 1 ? "" : "s"} to add`
  );
  if (s.repliesAdded > 0) {
    parts.push(`${s.repliesAdded} new repl${s.repliesAdded === 1 ? "y" : "ies"}`);
  }
  if (s.duplicates > 0) {
    parts.push(`${s.duplicates} already present`);
  }
  if (s.flaggedForReview > 0) {
    parts.push(
      `${s.flaggedForReview} flagged for review (code differs locally)`
    );
  }
  if (s.unmatchedFiles.length > 0) {
    parts.push(
      `${s.unmatchedFiles.length} file${s.unmatchedFiles.length === 1 ? "" : "s"} had no match here`
    );
  }
  return parts.join(", ") + ".";
}
