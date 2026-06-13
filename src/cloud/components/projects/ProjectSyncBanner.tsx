"use client";

/**
 * ProjectSyncBanner Component
 *
 * Shows a notification when another collaborator has updated the project.
 * Allows the user to reload the session to get the latest changes.
 */

import { useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useProjectSync } from "@/cloud/hooks/useProjectSync";
import { useSession } from "@/context/SessionContext";
import { useProjects } from "@/cloud/context/ProjectsContext";
import { cn } from "@/lib/utils";
import { RefreshCw, X, Users } from "lucide-react";

export function ProjectSyncBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const { importSession } = useSession();
  const { currentProjectId } = useProjects();

  const handleRemoteUpdate = useCallback(
    (session: Parameters<typeof importSession>[0]) => {
      console.log("ProjectSyncBanner: handleRemoteUpdate called");
      console.log("ProjectSyncBanner: Session mode:", session?.mode);
      console.log("ProjectSyncBanner: Session has codeFiles:", session?.codeFiles?.length);
      console.log("ProjectSyncBanner: Session has messages:", session?.messages?.length);
      importSession(session);
      console.log("ProjectSyncBanner: importSession called successfully");

      // Navigate to conversation page if not already there
      if (pathname !== "/conversation") {
        console.log("ProjectSyncBanner: Navigating to /conversation");
        router.push("/conversation");
      }
    },
    [importSession, pathname, router]
  );

  const {
    hasRemoteChanges,
    reloadProject,
    dismissChanges,
    isConnected,
  } = useProjectSync({
    onRemoteUpdate: handleRemoteUpdate,
  });

  // Don't render if not connected to a project
  if (!currentProjectId || !isConnected) {
    return null;
  }

  // Don't render if no remote changes
  if (!hasRemoteChanges) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-3 px-4 py-2.5",
        "bg-burgundy text-ivory rounded-xl shadow-lg",
        "font-sans text-sm",
        "animate-in slide-in-from-bottom-4 fade-in duration-300"
      )}
    >
      <Users className="h-4 w-4 flex-shrink-0" />
      <span>A collaborator updated this project</span>
      <button
        onClick={reloadProject}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1",
          "bg-ivory/20 hover:bg-ivory/30 rounded-lg",
          "transition-colors"
        )}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Reload
      </button>
      <button
        onClick={dismissChanges}
        className="p-1 hover:bg-ivory/20 rounded-lg transition-colors"
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
