/**
 * Connection Status Component
 *
 * Displays real-time cloud connection status and pending operations.
 * Similar to Google Docs connection indicator.
 */

import React, { useState } from "react";
import { Wifi, WifiOff, AlertCircle, RefreshCw, CheckCircle } from "lucide-react";
import type { ConnectionHealth } from "@/hooks/useConnectionHealth";

export interface ConnectionStatusProps {
  health: ConnectionHealth;
  onForceSync?: () => void;
  className?: string;
}

/**
 * Connection Status Indicator
 * Shows: Connected, Reconnecting, Disconnected, Degraded
 */
export function ConnectionStatus({
  health,
  onForceSync,
  className = "",
}: ConnectionStatusProps): React.ReactElement {
  const [showDropdown, setShowDropdown] = useState(false);

  // Determine display based on status
  let icon: React.ReactNode;
  let text: string;
  let colorClass: string;
  let dotColor: string;

  switch (health.status) {
    case "connected":
      icon = <CheckCircle className="h-3.5 w-3.5" />;
      text = health.pendingOperations > 0 ? "Syncing..." : "Synced";
      colorClass = "text-green-600";
      dotColor = "bg-green-500";
      break;

    case "reconnecting":
      icon = <RefreshCw className="h-3.5 w-3.5 animate-spin" />;
      text = "Reconnecting...";
      colorClass = "text-orange-600";
      dotColor = "bg-orange-500";
      break;

    case "degraded":
      icon = <AlertCircle className="h-3.5 w-3.5" />;
      text = "Connection slow";
      colorClass = "text-yellow-600";
      dotColor = "bg-yellow-500";
      break;

    case "disconnected":
      icon = <WifiOff className="h-3.5 w-3.5" />;
      text = "Disconnected";
      colorClass = "text-red-600";
      dotColor = "bg-red-500";
      break;

    default:
      icon = <Wifi className="h-3.5 w-3.5" />;
      text = "Unknown";
      colorClass = "text-slate-500";
      dotColor = "bg-slate-500";
  }

  // Format last sync time
  const formatLastSync = () => {
    if (!health.lastSuccessfulSync) return "Never";

    const now = new Date();
    const then = new Date(health.lastSuccessfulSync);
    const diffMs = now.getTime() - then.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 10) return "just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  };

  return (
    <div className={`relative ${className}`}>
      {/* Connection status button */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${colorClass} hover:bg-slate-100 transition-colors`}
        title={text}
      >
        <div className={`h-2 w-2 rounded-full ${dotColor}`} />
        {icon}
        <span className="hidden sm:inline">{text}</span>
        {health.pendingOperations > 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-slate-200 rounded-full text-[10px] text-slate-700">
            {health.pendingOperations}
          </span>
        )}
      </button>

      {/* Dropdown with details */}
      {showDropdown && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowDropdown(false)}
          />

          {/* Dropdown content */}
          <div className="absolute top-full right-0 mt-1 w-64 bg-white rounded-md shadow-lg border border-slate-200 p-3 z-20">
            <div className="space-y-2">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Status</span>
                <div className={`flex items-center gap-1.5 text-xs ${colorClass}`}>
                  <div className={`h-2 w-2 rounded-full ${dotColor}`} />
                  <span className="font-medium">{text}</span>
                </div>
              </div>

              {/* Last synced */}
              {health.lastSuccessfulSync && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Last synced</span>
                  <span className="text-xs text-slate-900">{formatLastSync()}</span>
                </div>
              )}

              {/* Pending operations */}
              {health.pendingOperations > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Pending changes</span>
                  <span className="text-xs text-slate-900 font-medium">
                    {health.pendingOperations}
                  </span>
                </div>
              )}

              {/* Failed attempts */}
              {health.failedAttempts > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Failed attempts</span>
                  <span className="text-xs text-red-600 font-medium">
                    {health.failedAttempts}
                  </span>
                </div>
              )}

              {/* Online status */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Network</span>
                <span className="text-xs text-slate-900">
                  {health.isOnline ? "Online" : "Offline"}
                </span>
              </div>

              {/* Tab visibility */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Tab</span>
                <span className="text-xs text-slate-900">
                  {health.isVisible ? "Active" : "Background"}
                </span>
              </div>

              {/* Force sync button */}
              {onForceSync && (
                <>
                  <div className="border-t border-slate-200 my-2" />
                  <button
                    onClick={() => {
                      onForceSync();
                      setShowDropdown(false);
                    }}
                    className="w-full px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                    disabled={health.status === "disconnected"}
                  >
                    Force Sync Now
                  </button>
                </>
              )}

              {/* Help text */}
              {health.status === "disconnected" && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  Cloud connection lost. Your changes are saved locally and will sync when connection is restored.
                </div>
              )}

              {health.status === "reconnecting" && (
                <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">
                  Attempting to reconnect to cloud...
                </div>
              )}

              {health.status === "degraded" && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                  Connection is slow. Changes may take longer to sync.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
