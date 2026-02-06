/**
 * Annotation replies hook extracted from WorkbenchLayout
 * Handles reply toggling, adding, deleting, and annotation deletion with ownership checks
 */

import { useState, useCallback } from "react";
import type { Session } from "@/types";
import type { User } from "@supabase/supabase-js";

interface UseAnnotationRepliesParams {
  session: Session;
  pushReply: ((annotationId: string, content: string) => Promise<any>) | undefined;
  deleteReply: ((replyId: string) => Promise<{ success: boolean; error?: string }>) | undefined;
  removeLineAnnotation: ((annotationId: string) => Promise<any>) | undefined;
  user: User | null | undefined;
  projects: any[];
  currentProjectId: string | null;
}

export function useAnnotationReplies({
  session,
  pushReply,
  deleteReply,
  removeLineAnnotation,
  user,
  projects,
  currentProjectId,
}: UseAnnotationRepliesParams) {
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
    if (!pushReply) return;
    await pushReply(annotationId, content);
    // Close the reply input after submitting
    setReplyInputOpenFor(null);
  }, [pushReply]);

  const handleDeleteReply = useCallback(async (replyId: string) => {
    if (!deleteReply) return;

    // Check if user is deleting someone else's reply (project owner deleting member's reply)
    let needsConfirmation = false;
    let replyAuthor: string | undefined;

    // Find the reply in annotations to check ownership
    for (const annotation of session.lineAnnotations || []) {
      const reply = annotation.replies?.find(r => r.id === replyId);
      if (reply) {
        replyAuthor = reply.addedBy;
        // Need confirmation if:
        // 1. Reply has an author (not the current user's initials)
        // 2. Current user is project owner (can delete anyone's reply via RLS)
        // 3. Reply author doesn't match current user's initials
        const currentUserInitials = user?.user_metadata?.initials || user?.email?.substring(0, 3).toUpperCase();
        const currentProject = projects.find(p => p.id === currentProjectId);
        const isOwner = currentProject?.owner_id === user?.id;

        if (isOwner && reply.addedBy && reply.addedBy !== currentUserInitials) {
          needsConfirmation = true;
        }
        break;
      }
    }

    // Show confirmation if project owner is deleting someone else's reply
    if (needsConfirmation) {
      const confirmed = window.confirm(
        `Delete reply by ${replyAuthor}?\n\nThis will permanently delete this reply.`
      );
      if (!confirmed) return;
    }

    const result = await deleteReply(replyId);
    if (!result.success) {
      console.warn("Failed to delete reply:", result.error);
      alert(result.error || "Failed to delete reply. You may not have permission to delete this reply.");
    }
  }, [deleteReply, session.lineAnnotations, user, projects, currentProjectId]);

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
