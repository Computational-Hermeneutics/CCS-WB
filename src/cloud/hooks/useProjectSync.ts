"use client";

/**
 * useProjectSync Hook
 *
 * Subscribes to real-time changes on the current project.
 * When another user saves the project, this hook notifies the local user
 * so they can reload or merge the changes.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "@/cloud/lib/supabase/client";
import { useAuth } from "@/cloud/context/AuthContext";
import { useProjects } from "@/cloud/context/ProjectsContext";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Session } from "@/types/session";

// Time window (ms) to ignore updates after we save (to skip our own updates)
const SELF_UPDATE_WINDOW_MS = 5000;

interface UseProjectSyncOptions {
  /** Called when the project is updated by another user */
  onRemoteUpdate?: (session: Session) => void;
  /** Whether to auto-reload on remote changes (default: false, show notification instead) */
  autoReload?: boolean;
}

export function useProjectSync({
  onRemoteUpdate,
  autoReload = false,
}: UseProjectSyncOptions = {}) {
  const { user, isAuthenticated } = useAuth();
  const { currentProjectId, loadProject } = useProjects();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [hasRemoteChanges, setHasRemoteChanges] = useState(false);
  const [lastUpdatedBy, setLastUpdatedBy] = useState<string | null>(null);
  // Track when we last saved (timestamp in ms) to skip our own updates
  const lastSaveTimeRef = useRef<number>(0);

  const supabase = isSupabaseConfigured() ? getSupabaseClient() : null;

  // Store onRemoteUpdate in a ref to avoid dependency issues
  const onRemoteUpdateRef = useRef(onRemoteUpdate);
  onRemoteUpdateRef.current = onRemoteUpdate;

  // Reload the project from Supabase
  const reloadProject = useCallback(async () => {
    if (!currentProjectId) {
      console.log("reloadProject: No currentProjectId");
      return;
    }

    console.log("reloadProject: Loading project", currentProjectId);
    const { session, error } = await loadProject(currentProjectId);

    if (error) {
      console.error("Error reloading project:", error);
      return;
    }

    console.log("reloadProject: Got session", session ? "yes" : "no");
    console.log("reloadProject: Session mode:", session?.mode);
    console.log("reloadProject: Session codeFiles:", session?.codeFiles?.length);

    if (session && onRemoteUpdateRef.current) {
      console.log("reloadProject: Calling onRemoteUpdate");
      onRemoteUpdateRef.current(session);
    } else {
      console.log("reloadProject: No session or no onRemoteUpdate callback");
    }

    setHasRemoteChanges(false);
  }, [currentProjectId, loadProject]);

  // Dismiss the remote changes notification
  const dismissChanges = useCallback(() => {
    setHasRemoteChanges(false);
  }, []);

  // Realtime subscription disabled due to persistent "mismatch between server and client bindings" error
  // Annotation sync uses polling instead. Re-enable once Supabase issue is resolved.
  /*
  useEffect(() => {
    console.log("useProjectSync: Checking subscription conditions", {
      hasSupabase: !!supabase,
      isAuthenticated,
      currentProjectId,
    });

    if (!supabase || !isAuthenticated || !currentProjectId) {
      console.log("useProjectSync: Skipping subscription - missing requirements");
      return;
    }

    let isMounted = true;

    if (channelRef.current) {
      console.log("useProjectSync: Cleaning up existing channel before creating new one");
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const setupChannel = () => {
      if (!isMounted) return;

      const channelName = `project:${currentProjectId}:${Date.now()}`;
      console.log("useProjectSync: Creating channel", channelName);

      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "projects",
            filter: `id=eq.${currentProjectId}`,
          },
          (payload) => {
            if (!isMounted) return;

            console.log("Project update received:", payload);

            const timeSinceLastSave = Date.now() - lastSaveTimeRef.current;
            if (timeSinceLastSave < SELF_UPDATE_WINDOW_MS) {
              console.log("Skipping update - likely our own save");
              return;
            }

            if (autoReload) {
              loadProject(currentProjectId).then(({ session }) => {
                if (session && isMounted && onRemoteUpdateRef.current) {
                  onRemoteUpdateRef.current(session);
                }
              });
            } else {
              setHasRemoteChanges(true);
              setLastUpdatedBy(null);
            }
          }
        )
        .subscribe((status, err) => {
          console.log("Project sync subscription status:", status);
          if (err) {
            console.error("Project sync subscription error:", err);
          }
        });

      channelRef.current = channel;
    };

    const timeoutId = setTimeout(setupChannel, 100);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [supabase, isAuthenticated, currentProjectId, autoReload, loadProject]);
  */

  // Mark current time when we save (to skip our own updates)
  const markLocalUpdate = useCallback(() => {
    lastSaveTimeRef.current = Date.now();
    console.log("markLocalUpdate: Set save time to", lastSaveTimeRef.current);
  }, []);

  return {
    /** Whether there are unloaded remote changes */
    hasRemoteChanges,
    /** Who made the last remote change (if known) */
    lastUpdatedBy,
    /** Reload the project to get remote changes */
    reloadProject,
    /** Dismiss the remote changes notification */
    dismissChanges,
    /** Call this before saving to prevent detecting our own update */
    markLocalUpdate,
    /** Whether real-time sync is connected */
    isConnected: !!channelRef.current,
  };
}
