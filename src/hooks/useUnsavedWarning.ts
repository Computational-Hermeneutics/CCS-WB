/**
 * Unsaved Changes Warning Hook
 *
 * Warns users before:
 * - Closing the browser tab (beforeunload event)
 * - Navigating away (Next.js route change)
 * - Refreshing the page
 *
 * Only triggers if there are unsaved changes (isDirty = true)
 */

import { useEffect } from "react";

/**
 * Hook to warn users before navigating away with unsaved changes
 *
 * @param isDirty - Whether there are unsaved changes
 * @param enabled - Whether the warning is enabled (default: true)
 */
export function useUnsavedWarning(isDirty: boolean, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled || !isDirty) {
      return;
    }

    /**
     * Handle beforeunload event (browser tab close/refresh)
     * Modern browsers show a generic message regardless of what we return
     */
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Cancel the event (required for Chrome)
      e.preventDefault();

      // Chrome requires returnValue to be set
      e.returnValue = "";

      // Return empty string (some browsers show this)
      return "";
    };

    // Add event listener
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Cleanup
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty, enabled]);

  // Note: Next.js route change warning would go here if needed
  // For now, just handling browser navigation
  // Future: Add router.events.on('routeChangeStart') handler
}
