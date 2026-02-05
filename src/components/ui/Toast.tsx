/**
 * Toast Notification Component
 *
 * Simple toast notification that auto-dismisses after a few seconds
 */

import React, { useEffect, useRef } from "react";
import { X, CheckCircle, AlertCircle, Info, CloudCog } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "info" | "reconnect";

export interface ToastProps {
  message: string | React.ReactNode;
  type?: ToastType;
  duration?: number; // milliseconds
  onClose: () => void;
  className?: string;
}

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="h-4 w-4" />,
  error: <AlertCircle className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
  reconnect: <CloudCog className="h-4 w-4" />,
};

const TOAST_STYLES: Record<ToastType, string> = {
  success: "bg-green-100 dark:bg-green-900/90 border-green-300 dark:border-green-700 text-green-900 dark:text-green-100",
  error: "bg-red-100 dark:bg-red-900/90 border-red-300 dark:border-red-700 text-red-900 dark:text-red-100",
  info: "bg-blue-100 dark:bg-blue-900/90 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-100",
  reconnect: "bg-blue-100 dark:bg-blue-900/90 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-100",
};

const TOAST_ICON_STYLES: Record<ToastType, string> = {
  success: "text-green-600 dark:text-green-400",
  error: "text-red-600 dark:text-red-400",
  info: "text-blue-600 dark:text-blue-400",
  reconnect: "text-blue-600 dark:text-blue-400",
};

const TOAST_BUTTON_STYLES: Record<ToastType, string> = {
  success: "text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200",
  error: "text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200",
  info: "text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200",
  reconnect: "text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200",
};

export function Toast({
  message,
  type = "info",
  duration = 4000,
  onClose,
  className = "",
}: ToastProps): React.ReactElement {
  // Store onClose in a ref to avoid resetting timer when parent re-renders
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timer = setTimeout(() => {
      onCloseRef.current();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]); // Only depend on duration, not onClose

  return (
    <div
      className={cn(
        "fixed top-4 right-4 z-[100] max-w-md",
        "px-4 py-3 rounded-lg border shadow-lg",
        "animate-in slide-in-from-top-2 duration-300",
        TOAST_STYLES[type],
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={cn("flex-shrink-0", TOAST_ICON_STYLES[type])}>
            {TOAST_ICONS[type]}
          </div>
          <div className="font-sans text-[11px] min-w-0">
            {message}
          </div>
        </div>
        <button
          onClick={onClose}
          className={cn("flex-shrink-0 transition-colors", TOAST_BUTTON_STYLES[type])}
          aria-label="Close notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
