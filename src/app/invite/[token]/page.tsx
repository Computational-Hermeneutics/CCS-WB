"use client";

/**
 * Invite Page
 *
 * Handles project invite links. When a user visits an invite URL:
 * 1. If not logged in → shows sign-in prompt
 * 2. If logged in → auto-joins project and redirects to /conversation
 * 3. If invalid/expired → shows error message
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/cloud/context/AuthContext";
import { useProjects } from "@/cloud/context/ProjectsContext";
import { useSession } from "@/context/SessionContext";
import { cn } from "@/lib/utils";
import { Users, Loader2, AlertCircle, LogIn, CheckCircle } from "lucide-react";
import { LoginModal } from "@/cloud/components/auth/LoginModal";

type InviteStatus = "loading" | "needs_auth" | "joining" | "success" | "error" | "already_member";

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const { isAuthenticated, isLoading: authLoading, setShowLoginModal } = useAuth();
  const { joinProjectByInvite, loadProject, setCurrentProjectId } = useProjects();
  const { importSession } = useSession();

  const [status, setStatus] = useState<InviteStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const hasAttemptedJoin = useRef(false);

  // Handle joining the project
  const handleJoin = useCallback(async () => {
    if (!token) {
      console.error("InvitePage: No token provided");
      setStatus("error");
      setError("Invalid invite link");
      return;
    }

    console.log("InvitePage: Starting join process");
    setStatus("joining");
    setError(null);

    console.log("InvitePage: Calling joinProjectByInvite");
    const { project, error } = await joinProjectByInvite(token);

    if (error) {
      console.error("InvitePage: joinProjectByInvite failed:", error);
      setStatus("error");
      setError(error.message);
      return;
    }

    if (project) {
      console.log("InvitePage: Successfully joined project:", project.name);
      setProjectName(project.name);
      setStatus("success");

      // Load the project and import session data
      console.log("InvitePage: Setting current project ID");
      setCurrentProjectId(project.id);

      console.log("InvitePage: Loading project data");
      const { session, error: loadError } = await loadProject(project.id);

      if (loadError) {
        console.error("InvitePage: loadProject failed:", loadError);
      }

      if (session) {
        console.log("InvitePage: Importing session");
        importSession(session);
      } else {
        console.warn("InvitePage: No session data returned from loadProject");
      }

      // Small delay to show success state, then redirect
      console.log("InvitePage: Redirecting to /conversation in 1.5s");
      setTimeout(() => {
        router.push("/conversation");
      }, 1500);
    } else {
      console.error("InvitePage: joinProjectByInvite returned no project and no error");
      setStatus("error");
      setError("Failed to join project");
    }
  }, [token, joinProjectByInvite, loadProject, setCurrentProjectId, importSession, router]);

  // Effect to handle initial state and auto-join
  useEffect(() => {
    if (authLoading) {
      setStatus("loading");
      return;
    }

    if (!isAuthenticated) {
      setStatus("needs_auth");
      hasAttemptedJoin.current = false; // Reset on logout
      return;
    }

    // User is authenticated, try to join (but only once)
    if (!hasAttemptedJoin.current) {
      hasAttemptedJoin.current = true;
      console.log("InvitePage: Attempting to join project with token:", token);
      handleJoin().catch(err => {
        console.error("InvitePage: handleJoin failed with error:", err);
        setStatus("error");
        setError(err.message || "Failed to join project");
      });
    }
  }, [authLoading, isAuthenticated, handleJoin, token]);

  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Card */}
        <div className="bg-ivory rounded-xl shadow-lg border border-parchment-dark p-8 text-center">
          {/* Icon */}
          <div className={cn(
            "mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6",
            status === "error" ? "bg-burgundy/10" : "bg-burgundy/10"
          )}>
            {status === "loading" || status === "joining" ? (
              <Loader2 className="h-8 w-8 text-burgundy animate-spin" />
            ) : status === "error" ? (
              <AlertCircle className="h-8 w-8 text-burgundy" />
            ) : status === "success" || status === "already_member" ? (
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            ) : (
              <Users className="h-8 w-8 text-burgundy" />
            )}
          </div>

          {/* Loading state */}
          {status === "loading" && (
            <>
              <h1 className="font-serif text-xl text-ink mb-2">
                Loading...
              </h1>
              <p className="font-sans text-sm text-slate">
                Please wait while we verify your invite.
              </p>
            </>
          )}

          {/* Needs authentication */}
          {status === "needs_auth" && (
            <>
              <h1 className="font-serif text-xl text-ink mb-2">
                Join Project
              </h1>
              <p className="font-sans text-sm text-slate mb-6">
                Sign in to accept this invitation and join the project.
              </p>
              <button
                onClick={() => setShowLoginModal(true)}
                className={cn(
                  "flex items-center justify-center gap-2 w-full px-4 py-3",
                  "font-sans text-sm font-medium text-ivory",
                  "bg-burgundy hover:bg-burgundy-dark rounded-lg",
                  "transition-colors"
                )}
              >
                <LogIn className="h-4 w-4" />
                Sign In to Join
              </button>
            </>
          )}

          {/* Joining */}
          {status === "joining" && (
            <>
              <h1 className="font-serif text-xl text-ink mb-2">
                Joining Project...
              </h1>
              <p className="font-sans text-sm text-slate">
                Please wait while we add you to the project.
              </p>
            </>
          )}

          {/* Success */}
          {status === "success" && (
            <>
              <h1 className="font-serif text-xl text-ink mb-2">
                Welcome!
              </h1>
              <p className="font-sans text-sm text-slate mb-2">
                You&apos;ve joined <strong className="text-ink">{projectName}</strong>
              </p>
              <p className="font-sans text-xs text-slate">
                Redirecting to the workbench...
              </p>
            </>
          )}

          {/* Already a member */}
          {status === "already_member" && (
            <>
              <h1 className="font-serif text-xl text-ink mb-2">
                Already a Member
              </h1>
              <p className="font-sans text-sm text-slate mb-4">
                You&apos;re already a member of this project.
              </p>
              <button
                onClick={() => router.push("/conversation")}
                className={cn(
                  "flex items-center justify-center gap-2 w-full px-4 py-3",
                  "font-sans text-sm font-medium text-ivory",
                  "bg-burgundy hover:bg-burgundy-dark rounded-lg",
                  "transition-colors"
                )}
              >
                Go to Workbench
              </button>
            </>
          )}

          {/* Error */}
          {status === "error" && (
            <>
              <h1 className="font-serif text-xl text-ink mb-2">
                Invalid Invite
              </h1>
              <p className="font-sans text-sm text-slate mb-6">
                {error || "This invite link is invalid or has expired."}
              </p>
              <button
                onClick={() => router.push("/")}
                className={cn(
                  "flex items-center justify-center gap-2 w-full px-4 py-3",
                  "font-sans text-sm font-medium text-slate",
                  "bg-cream hover:bg-parchment border border-parchment-dark rounded-lg",
                  "transition-colors"
                )}
              >
                Go to Home
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center mt-4 font-sans text-xs text-slate">
          Critical Code Studies Workbench
        </p>
      </div>

      {/* Login modal */}
      <LoginModal />
    </div>
  );
}
