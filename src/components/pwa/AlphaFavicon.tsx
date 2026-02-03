"use client";

import { useEffect } from "react";

/**
 * AlphaFavicon Component
 *
 * Dynamically updates the favicon to yellow when running on alpha/test/staging environments.
 * Uses a clean approach that works with Next.js without DOM manipulation conflicts.
 */
export function AlphaFavicon() {
  useEffect(() => {
    // Only run in browser
    if (typeof window === "undefined") return;

    // Check if we're on alpha/test/staging deployment
    const isAlpha =
      window.location.hostname.includes("alpha") ||
      window.location.hostname.includes("test") ||
      window.location.hostname.includes("staging");

    if (!isAlpha) return;

    // Find the existing favicon link (Next.js adds it)
    const existingIcon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');

    if (existingIcon) {
      // Just update the href, don't remove/add nodes
      existingIcon.href = "/icon-yellow.svg";
    } else {
      // If no icon exists, create one (shouldn't happen with Next.js)
      const link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/svg+xml";
      link.href = "/icon-yellow.svg";
      document.head.appendChild(link);
    }
  }, []); // Run once on mount

  return null; // This component doesn't render anything
}
