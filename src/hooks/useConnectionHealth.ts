/**
 * Connection Health Monitor Hook
 *
 * Monitors cloud connection health and detects stale/broken connections.
 *
 * Features:
 * - Heartbeat every 15 seconds (lightweight Supabase query)
 * - Tracks last successful sync timestamp
 * - Detects stale connections (no successful sync in 30s)
 * - Integrates with Page Visibility API (pause when hidden)
 * - Reports connection status: connected, reconnecting, disconnected, degraded
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getPendingOperationCount } from "@/lib/sync/operation-queue";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected" | "degraded";

export interface ConnectionHealth {
  status: ConnectionStatus;
  lastSuccessfulSync: string | null;
  failedAttempts: number;
  pendingOperations: number;
  isOnline: boolean;
  isVisible: boolean;
  lastHeartbeat: string | null;
}

export interface UseConnectionHealthOptions {
  projectId: string | null;
  enabled?: boolean;
  heartbeatInterval?: number; // milliseconds (default: 15000 = 15s)
  staleThreshold?: number; // milliseconds (default: 30000 = 30s)
  onConnectionLost?: () => void;
  onConnectionRestored?: () => void;
}

/**
 * Hook to monitor connection health for cloud projects
 *
 * @param options - Configuration options
 * @returns Connection health state and control functions
 */
export function useConnectionHealth(options: UseConnectionHealthOptions) {
  const {
    projectId,
    enabled = true,
    heartbeatInterval = 15000,
    staleThreshold = 30000,
    onConnectionLost,
    onConnectionRestored,
  } = options;

  // Connection health state
  const [health, setHealth] = useState<ConnectionHealth>({
    status: "connected",
    lastSuccessfulSync: null,
    failedAttempts: 0,
    pendingOperations: 0,
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    isVisible: typeof document !== "undefined" ? document.visibilityState === "visible" : true,
    lastHeartbeat: null,
  });

  // Refs for managing intervals and state
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSuccessSyncRef = useRef<number>(Date.now());
  const failedAttemptsRef = useRef<number>(0);
  const previousStatusRef = useRef<ConnectionStatus>("connected");

  /**
   * Perform a lightweight heartbeat check
   * Just queries the current timestamp from Supabase
   */
  const performHeartbeat = useCallback(async (): Promise<boolean> => {
    if (!projectId || !enabled) {
      return false;
    }

    try {
      const supabase = getSupabaseClient();

      if (!supabase) {
        return false;
      }

      // Lightweight query - just get current timestamp
      const { error } = await supabase
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .single();

      if (error) {
        throw error;
      }

      // Success
      lastSuccessSyncRef.current = Date.now();
      failedAttemptsRef.current = 0;

      return true;
    } catch (error) {
      console.error("[ConnectionHealth] Heartbeat failed:", error);
      failedAttemptsRef.current++;
      return false;
    }
  }, [projectId, enabled]);

  /**
   * Update pending operations count
   */
  const updatePendingCount = useCallback(async () => {
    if (!projectId) {
      return 0;
    }

    try {
      const count = await getPendingOperationCount(projectId);
      return count;
    } catch (error) {
      console.error("[ConnectionHealth] Failed to get pending operation count:", error);
      return 0;
    }
  }, [projectId]);

  /**
   * Determine connection status based on health metrics
   */
  const determineStatus = useCallback((): ConnectionStatus => {
    const now = Date.now();
    const timeSinceLastSync = now - lastSuccessSyncRef.current;
    const failedAttempts = failedAttemptsRef.current;

    // Not online = disconnected
    if (!health.isOnline) {
      return "disconnected";
    }

    // Tab not visible = use last known status
    if (!health.isVisible) {
      return previousStatusRef.current;
    }

    // Multiple failed attempts = disconnected
    if (failedAttempts >= 3) {
      return "disconnected";
    }

    // Some failed attempts = reconnecting
    if (failedAttempts > 0) {
      return "reconnecting";
    }

    // Connection stale (no successful sync in threshold) = degraded
    if (timeSinceLastSync > staleThreshold) {
      return "degraded";
    }

    // All good
    return "connected";
  }, [health.isOnline, health.isVisible, staleThreshold]);

  /**
   * Update health state
   */
  const updateHealth = useCallback(async () => {
    const pendingCount = await updatePendingCount();
    const now = new Date().toISOString();

    setHealth((prev) => {
      const newStatus = determineStatus();

      // Detect status changes
      if (newStatus !== prev.status) {
        console.log(`[ConnectionHealth] Status changed: ${prev.status} → ${newStatus}`);

        if (newStatus === "disconnected" && prev.status !== "disconnected") {
          onConnectionLost?.();
        } else if (newStatus === "connected" && prev.status !== "connected") {
          onConnectionRestored?.();
        }

        previousStatusRef.current = newStatus;
      }

      return {
        ...prev,
        status: newStatus,
        lastSuccessfulSync:
          failedAttemptsRef.current === 0
            ? now
            : prev.lastSuccessfulSync,
        failedAttempts: failedAttemptsRef.current,
        pendingOperations: pendingCount,
        lastHeartbeat: now,
      };
    });
  }, [determineStatus, updatePendingCount, onConnectionLost, onConnectionRestored]);

  /**
   * Heartbeat loop
   */
  const startHeartbeat = useCallback(() => {
    if (!enabled || !projectId) {
      return;
    }

    // Clear any existing interval
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    // Perform initial heartbeat
    performHeartbeat().then(() => updateHealth());

    // Start interval
    heartbeatIntervalRef.current = setInterval(async () => {
      // Skip if tab not visible (save resources)
      if (!health.isVisible) {
        return;
      }

      await performHeartbeat();
      await updateHealth();
    }, heartbeatInterval);

    console.log(`[ConnectionHealth] Heartbeat started for project ${projectId}`);
  }, [enabled, projectId, heartbeatInterval, performHeartbeat, updateHealth, health.isVisible]);

  /**
   * Stop heartbeat
   */
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
      console.log("[ConnectionHealth] Heartbeat stopped");
    }
  }, []);

  /**
   * Manual sync trigger (force heartbeat + update)
   */
  const forceCheck = useCallback(async () => {
    console.log("[ConnectionHealth] Force checking connection...");
    await performHeartbeat();
    await updateHealth();
  }, [performHeartbeat, updateHealth]);

  /**
   * Record successful sync (called externally when sync succeeds)
   */
  const recordSuccess = useCallback(() => {
    lastSuccessSyncRef.current = Date.now();
    failedAttemptsRef.current = 0;
    updateHealth();
  }, [updateHealth]);

  /**
   * Record failed sync (called externally when sync fails)
   */
  const recordFailure = useCallback(() => {
    failedAttemptsRef.current++;
    updateHealth();
  }, [updateHealth]);

  /**
   * Handle online/offline events
   */
  useEffect(() => {
    const handleOnline = () => {
      console.log("[ConnectionHealth] Browser came online");
      setHealth((prev) => ({ ...prev, isOnline: true }));
      forceCheck();
    };

    const handleOffline = () => {
      console.log("[ConnectionHealth] Browser went offline");
      setHealth((prev) => ({ ...prev, isOnline: false }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [forceCheck]);

  /**
   * Handle visibility changes
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === "visible";

      console.log(`[ConnectionHealth] Tab visibility changed: ${isVisible ? "visible" : "hidden"}`);

      setHealth((prev) => ({ ...prev, isVisible }));

      if (isVisible) {
        // Tab became visible - force check
        forceCheck();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [forceCheck]);

  /**
   * Start/stop heartbeat based on enabled and projectId
   */
  useEffect(() => {
    if (enabled && projectId) {
      startHeartbeat();
    } else {
      stopHeartbeat();
    }

    return () => {
      stopHeartbeat();
    };
  }, [enabled, projectId, startHeartbeat, stopHeartbeat]);

  return {
    health,
    forceCheck,
    recordSuccess,
    recordFailure,
  };
}
