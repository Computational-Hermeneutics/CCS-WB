/**
 * Save Status Indicator Component
 *
 * Displays the current auto-save status in the UI.
 * Shows: Saving..., Saved 2m ago, Save failed, Unsaved changes
 */

import React from "react";
import { Loader2, Check, AlertCircle, Circle, Save } from "lucide-react";
import type { SaveStatus } from "@/lib/file-system/types";

/**
 * Props for SaveStatusIndicator
 */
export interface SaveStatusIndicatorProps {
  status: SaveStatus;
  lastSaved: string | null;
  isDirty: boolean;
  className?: string;
  /** Inline mode: shows only text without icons, for integration with project name */
  inline?: boolean;
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
  inline = false,
}: SaveStatusIndicatorProps): React.ReactElement {
  // Inline mode: return text-only status for integration with project name
  if (inline) {
    let text: string | null = null;
    let colorClass = "";

    switch (status) {
      case "saving":
        text = "Saving...";
        colorClass = "text-slate-600";
        break;

      case "saved":
        text = lastSaved ? `Saved ${formatRelativeTime(lastSaved)}` : "Saved";
        colorClass = "text-green-600";
        break;

      case "error":
        text = "Save failed";
        colorClass = "text-red-600";
        break;

      case "dirty":
        text = "Unsaved";
        colorClass = "text-red-600";
        break;

      case "idle":
      default:
        if (lastSaved) {
          text = `Saved ${formatRelativeTime(lastSaved)}`;
          colorClass = "text-slate-500";
        } else if (isDirty) {
          text = "Unsaved";
          colorClass = "text-red-600";
        }
        break;
    }

    if (!text) return <></>;

    return (
      <span
        className={`font-sans text-[10px] ${colorClass} ${className}`}
        role="status"
        aria-live="polite"
      >
        {text}
      </span>
    );
  }

  // Standard mode: icon + text
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
      // Show save icon with red dot on right
      return (
        <div
          className={`flex items-center gap-1 ${className}`}
          role="status"
          aria-live="polite"
          title="Unsaved changes"
        >
          <Save className="h-3 w-3 text-slate" />
          <Circle className="h-2 w-2 fill-red-500" />
        </div>
      );

    case "idle":
    default:
      // Show last saved time if available, otherwise nothing
      if (lastSaved) {
        icon = <Check className="h-3 w-3" />;
        text = `Saved ${formatRelativeTime(lastSaved)}`;
        colorClass = "text-slate-500";
      } else if (isDirty) {
        // Show save icon with red dot on right
        return (
          <div
            className={`flex items-center gap-1 ${className}`}
            role="status"
            aria-live="polite"
            title="Unsaved changes"
          >
            <Save className="h-3 w-3 text-slate" />
            <Circle className="h-2 w-2 fill-red-500" />
          </div>
        );
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
