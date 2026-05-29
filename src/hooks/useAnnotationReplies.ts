/**
 * Annotation replies hook extracted from WorkbenchLayout
 * Handles reply toggling, adding, deleting, and annotation deletion with ownership checks
 */

import { useState, useCallback } from "react";
import type { Session } from "@/types";
import type { AnnotationReplyData } from "@/types/session";
import type { User } from "@supabase/supabase-js";
import { generateId, getCurrentTimestamp } from "@/lib/utils";

interface UseAnnotationRepliesParams {
  session: Session;
  /** Optional: when sync is active, pushes the reply to Supabase too.
   *  When undefined, the local dispatch is the only writer. */
  pushReply: ((annotationId: string, content: string) => Promise<any>) | undefined;
  deleteReply: ((replyId: string) => Promise<{ success: boolean; error?: string }>) | undefined;
  removeLineAnnotation: ((annotationId: string) => Promise<any>) | undefined;
  /** Local-first reply mutators (from SessionContext). Used when not
   *  signed in / not in a cloud project, and also alongside the cloud
   *  push so the UI updates immediately without waiting for a poll. */
  addAnnotationReplyLocal: (annotationId: string, reply: AnnotationReplyData) => void;
  deleteAnnotationReplyLocal: (annotationId: string, replyId: string) => void;
  /** Local profile attribution used when there's no Supabase user. */
  profileInitials?: string;
  profileColor?: string;
  user: User | null | undefined;
  projects: any[];
  currentProjectId: string | null;
}

export function useAnnotationReplies({
  session,
  pushReply,
  deleteReply,
  removeLineAnnotation,
  addAnnotationReplyLocal,
  deleteAnnotationReplyLocal,
  profileInitials,
  profileColor,
  user,
  projects,
  currentProjectId,
}: UseAnnotationRepliesParams) {

  // Initials to attach to a reply written by the current user. Prefer
  // Supabase user metadata when signed in (matches existing cloud
  // behaviour); fall back to the local AppSettings profile so replies
  // are still attributed when working offline.
  const currentUserInitials =
    user?.user_metadata?.initials ||
    user?.email?.substring(0, 3).toUpperCase() ||
    profileInitials ||
    undefined;
  const [expandedAnnotationId, setExpandedAnnotationId] = useState<string | null>(null);
  const [replyInputOpenFor, setReplyInputOpenFor] = useState<string | null>(null);

  const handleToggleReplies = useCallback((annotationId: string) => {
    setExpandedAnnotationId(prev => {
      if (prev === annotationId) {
        // Already expanded - collapse
        setReplyInputOpenFor(null);
        return null;
      }
      // Expand
      return annotationId;
    });
  }, []);

  const handleOpenReplyInput = useCallback((annotationId: string) => {
    console.log("handleOpenReplyInput called for:", annotationId);
    setReplyInputOpenFor(annotationId);
  }, []);

  const handleCloseReplyInput = useCallback(() => {
    setReplyInputOpenFor(null);
  }, []);

  const handleAddReply = useCallback(async (annotationId: string, content: string) => {
    // Always write locally first so the UI updates immediately and the
    // reply persists in the .ccs file, regardless of cloud state. If the
    // optional cloud sync is also active, push the same reply id so the
    // remote row reconciles with the local one (reducer is idempotent on
    // reply id).
    const reply: AnnotationReplyData = {
      id: generateId(),
      content,
      createdAt: getCurrentTimestamp(),
      addedBy: currentUserInitials,
      profileColor: profileColor,
    };
    addAnnotationReplyLocal(annotationId, reply);
    if (pushReply) {
      try { await pushReply(annotationId, content); } catch {
        // Cloud failure does not lose the local reply.
      }
    }
    setReplyInputOpenFor(null);
  }, [pushReply, addAnnotationReplyLocal, currentUserInitials, profileColor]);

  const handleDeleteReply = useCallback(async (replyId: string) => {
    // Find the annotation and reply (and author) for confirmation/local-delete.
    let parentAnnotationId: string | undefined;
    let replyAuthor: string | undefined;
    for (const annotation of session.lineAnnotations || []) {
      const reply = annotation.replies?.find(r => r.id === replyId);
      if (reply) {
        parentAnnotationId = annotation.id;
        replyAuthor = reply.addedBy;
        break;
      }
    }
    if (!parentAnnotationId) return;

    // When the user is the project owner deleting someone else's reply via
    // the cloud RLS path, surface a confirmation. Local-only deletes don't
    // need this (the .ccs is the user's own file).
    if (deleteReply) {
      const currentProject = projects.find(p => p.id === currentProjectId);
      const isOwner = currentProject?.owner_id === user?.id;
      if (isOwner && replyAuthor && replyAuthor !== currentUserInitials) {
        const confirmed = window.confirm(
          `Delete reply by ${replyAuthor}?\n\nThis will permanently delete this reply.`
        );
        if (!confirmed) return;
      }
    }

    // Local delete first (UI updates immediately and the .ccs reflects it).
    deleteAnnotationReplyLocal(parentAnnotationId, replyId);

    // Best-effort cloud delete when sync is active.
    if (deleteReply) {
      const result = await deleteReply(replyId);
      if (!result.success) {
        console.warn("Cloud delete failed (local delete still applied):", result.error);
      }
    }
  }, [deleteReply, deleteAnnotationReplyLocal, session.lineAnnotations, user, projects, currentProjectId, currentUserInitials]);

  const handleDeleteAnnotation = useCallback(async (annotationId: string, skipConfirmation = false) => {
    if (!removeLineAnnotation) return;

    // Skip confirmation if Cmd/Ctrl+Click was used
    if (!skipConfirmation) {
      // Find the annotation to check ownership
      const annotation = session.lineAnnotations?.find(a => a.id === annotationId);
      let confirmMessage = "Delete this annotation?\n\nThis will permanently delete the annotation and all its replies.";

      if (annotation) {
        const annotationAuthor = annotation.addedBy;
        const currentUserInitials = user?.user_metadata?.initials || user?.email?.substring(0, 3).toUpperCase();
        const currentProject = projects.find(p => p.id === currentProjectId);
        const isOwner = currentProject?.owner_id === user?.id;

        // Different message if owner is deleting someone else's annotation
        if (isOwner && annotationAuthor && annotationAuthor !== currentUserInitials) {
          confirmMessage = `Delete annotation by ${annotationAuthor}?\n\nThis will permanently delete this annotation and all its replies.`;
        }
      }

      // Show confirmation for annotation deletion
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) return;
    }

    // Call the wrapped removeLineAnnotation
    await removeLineAnnotation(annotationId);
  }, [removeLineAnnotation, session.lineAnnotations, user, projects, currentProjectId]);

  return {
    expandedAnnotationId,
    replyInputOpenFor,
    handleToggleReplies,
    handleOpenReplyInput,
    handleCloseReplyInput,
    handleAddReply,
    handleDeleteReply,
    handleDeleteAnnotation,
  };
}
