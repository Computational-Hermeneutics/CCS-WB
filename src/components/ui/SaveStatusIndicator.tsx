/**
 * Save Status Indicator Component
 *
 * Displays the current auto-save status in the UI.
 * Shows: Saving..., Saved 2m ago, Save failed, Unsaved changes
 */

import React from "react";
import { Loader2, Check, AlertCircle, Circle } from "lucide-react";
import type { SaveStatus } from "@/lib/file-system/types";

/**
 * Props for SaveStatusIndicator
 */
export interface SaveStatusIndicatorProps {
  status: SaveStatus;
  lastSaved: string | null;
  isDirty: boolean;
  className?: string;
}

/**
 * Format timestamp as relative time
 * e.g., "2m ago", "1h ago", "just now"
 */
function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 10) {
    return "just now";
  } else if (diffSec < 60) {
    return `${diffSec}s ago`;
  } else if (diffSec < 3600) {
    const minutes = Math.floor(diffSec / 60);
    return `${minutes}m ago`;
  } else if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diffSec / 86400);
    return `${days}d ago`;
  }
}

/**
 * Save Status Indicator Component
 */
export function SaveStatusIndicator({
  status,
  lastSaved,
  isDirty,
  className = "",
}: SaveStatusIndicatorProps): React.ReactElement {
  // Determine icon and text based on status
  let icon: React.ReactNode;
  let text: string;
  let colorClass: string;

  switch (status) {
    case "saving":
      icon = <Loader2 className="h-3 w-3 animate-spin" />;
      text = "Saving...";
      colorClass = "text-slate-600";
      break;

    case "saved":
      icon = <Check className="h-3 w-3" />;
      text = lastSaved ? `Saved ${formatRelativeTime(lastSaved)}` : "Saved";
      colorClass = "text-green-600";
      break;

    case "error":
      icon = <AlertCircle className="h-3 w-3" />;
      text = "Save failed";
      colorClass = "text-red-600";
      break;

    case "dirty":
      icon = <Circle className="h-3 w-3 fill-amber-500" />;
      text = "Unsaved changes";
      colorClass = "text-amber-600";
      break;

    case "idle":
    default:
      // Show last saved time if available, otherwise nothing
      if (lastSaved) {
        icon = <Check className="h-3 w-3" />;
        text = `Saved ${formatRelativeTime(lastSaved)}`;
        colorClass = "text-slate-500";
      } else if (isDirty) {
        icon = <Circle className="h-3 w-3 fill-amber-500" />;
        text = "Unsaved changes";
        colorClass = "text-amber-600";
      } else {
        return <></>;
      }
      break;
  }

  return (
    <div
      className={`flex items-center gap-1.5 text-xs ${colorClass} ${className}`}
      role="status"
      aria-live="polite"
    >
      {icon}
      <span>{text}</span>
    </div>
  );
}
