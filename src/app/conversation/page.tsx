"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { X } from "lucide-react";
import { WorkbenchLayout, type WorkbenchLayoutRef } from "@/components/layouts";

export default function ConversationPage() {
  const router = useRouter();
  const { session, hasSavedSession } = useSession();

  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [triggerCritiqueSave, setTriggerCritiqueSave] = useState(false);
  const [navigateHomeAfterSave, setNavigateHomeAfterSave] = useState(false);

  const workbenchLayoutRef = useRef<WorkbenchLayoutRef>(null);

  // Use ref for session to avoid stale closure issues in hasUnsavedChanges
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Guard: Redirect to main page if accessing /conversation directly without proper mode selection
  // This prevents React errors from components rendering without proper initialization
  useEffect(() => {
    // Only run this check once on mount
    const hasProperMode = session.mode && ['critique', 'interpret', 'create'].includes(session.mode);
    const hasSavedContent = session.mode ? hasSavedSession(session.mode as any) : false;

    // If no proper mode and no saved session to restore, redirect to main page
    if (!hasProperMode && !hasSavedContent) {
      console.log('[Guard] No valid mode detected, redirecting to main page');
      router.replace('/');
    }
  }, []); // Empty deps - only run once on mount

  // Check if there are unsaved changes (more than just the initial assistant message)
  const hasUnsavedChanges = useCallback(() => {
    // For critique mode, use the ref method if available
    if (sessionRef.current.mode === "critique" && workbenchLayoutRef.current) {
      return workbenchLayoutRef.current.hasUnsavedChanges();
    }

    // For other modes, check directly using ref to get latest session data
    const currentSession = sessionRef.current;
    // User has sent at least one message
    const hasUserMessages = currentSession.messages.some(m => m.role === 'user');
    // Has code files
    const hasCode = currentSession.codeFiles.length > 0;
    // Has analysis results
    const hasAnalysis = currentSession.analysisResults.length > 0;
    // Has references
    const hasRefs = currentSession.references.length > 0;
    // Has generated outputs
    const hasOutputs = currentSession.critiqueArtifacts.length > 0;

    return hasUserMessages || hasCode || hasAnalysis || hasRefs || hasOutputs;
  }, []); // No dependencies needed - we use ref to access latest session

  // Warn user before closing tab/window if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Handle navigation to home with warning
  const handleNavigateHome = useCallback(() => {
    if (hasUnsavedChanges()) {
      setShowUnsavedWarning(true);
    } else {
      router.push('/');
    }
  }, [hasUnsavedChanges, router]);

  // Navigate home after save completes (when user clicked "Save First")
  useEffect(() => {
    if (navigateHomeAfterSave && !triggerCritiqueSave) {
      // Save has completed (triggerCritiqueSave was reset to false)
      setNavigateHomeAfterSave(false);
      router.push('/');
    }
  }, [navigateHomeAfterSave, triggerCritiqueSave, router]);

  // All three modes use WorkbenchLayout (unified IDE-style interface)
  if (session.mode === "critique" || session.mode === "interpret" || session.mode === "create") {
    return (
      <>
        <WorkbenchLayout
          ref={workbenchLayoutRef}
          onNavigateHome={handleNavigateHome}
          triggerSave={triggerCritiqueSave}
          onSaveTriggered={() => setTriggerCritiqueSave(false)}
        />
        {/* Unsaved Changes Warning Modal */}
        {showUnsavedWarning && (
          <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
            <div className="bg-popover rounded-sm shadow-editorial-lg p-6 w-full max-w-md mx-4 border border-parchment modal-content">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-display-md text-ink">Unsaved Changes</h3>
                <button
                  onClick={() => setShowUnsavedWarning(false)}
                  className="text-slate-muted hover:text-ink transition-colors"
                >
                  <X className="h-5 w-5" strokeWidth={1.5} />
                </button>
              </div>
              <p className="font-body text-body-sm text-slate mb-6">
                You have unsaved work{workbenchLayoutRef.current?.getProjectName() ? ` in "${workbenchLayoutRef.current.getProjectName()}"` : ""}. Would you like to save before leaving?
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setShowUnsavedWarning(false);
                    setNavigateHomeAfterSave(true);
                    // Trigger save via prop (more reliable than ref)
                    setTriggerCritiqueSave(true);
                  }}
                  className="w-full btn-editorial-primary py-3"
                >
                  Save First
                </button>
                <button
                  onClick={() => {
                    setShowUnsavedWarning(false);
                    router.push('/');
                  }}
                  className="w-full btn-editorial bg-gold text-ink border-gold hover:bg-gold-light py-3"
                >
                  Leave Without Saving
                </button>
                <button
                  onClick={() => setShowUnsavedWarning(false)}
                  className="w-full btn-editorial-ghost py-3"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback: should not reach here due to route guard, but return null during redirect
  return null;
}
