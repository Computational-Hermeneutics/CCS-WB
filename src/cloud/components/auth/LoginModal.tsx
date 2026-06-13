"use client";

/**
 * Login Modal
 *
 * Provides sign-in options for collaborative features:
 * - Google OAuth
 * - GitHub OAuth
 * - Magic link (email)
 */

import { useState } from "react";
import { useAuth, type AuthProvider } from "@/cloud/context/AuthContext";
import { cn } from "@/lib/utils";
import { X, Loader2, Mail, AlertCircle, CheckCircle } from "lucide-react";

// Provider icons as simple SVGs
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

export function LoginModal() {
  const { showLoginModal, setShowLoginModal, signInWithProvider, signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState<AuthProvider | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  if (!showLoginModal) return null;

  const handleProviderSignIn = async (provider: AuthProvider) => {
    setIsLoading(provider);
    setError(null);

    const { error } = await signInWithProvider(provider);

    if (error) {
      setError(error.message);
      setIsLoading(null);
    }
    // On success, the page will redirect via OAuth
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading("email");
    setError(null);
    setMagicLinkSent(false);

    const { error } = await signInWithMagicLink(email.trim());

    if (error) {
      setError(error.message);
    } else {
      setMagicLinkSent(true);
    }
    setIsLoading(null);
  };

  const handleClose = () => {
    setShowLoginModal(false);
    setEmail("");
    setError(null);
    setMagicLinkSent(false);
    setIsLoading(null);
  };

  return (
    <div
      className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        className="bg-popover rounded-sm shadow-lg w-full max-w-xs mx-4 modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment">
          <h2 className="font-display text-caption text-ink">Sign in to collaborate</h2>
          <button
            onClick={handleClose}
            className="p-1 text-slate hover:text-ink transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 p-2 bg-error/10 border border-error/30 rounded-sm">
              <AlertCircle className="h-3.5 w-3.5 text-error flex-shrink-0 mt-0.5" />
              <p className="font-sans text-[10px] text-error">{error}</p>
            </div>
          )}

          {/* Magic link success message */}
          {magicLinkSent && (
            <div className="flex items-start gap-2 p-2 bg-success/10 border border-success/30 rounded-sm">
              <CheckCircle className="h-3.5 w-3.5 text-success flex-shrink-0 mt-0.5" />
              <p className="font-sans text-[10px] text-success">
                Check your email for a sign-in link.
              </p>
            </div>
          )}

          {/* OAuth providers */}
          <div className="space-y-2">
            <button
              onClick={() => handleProviderSignIn("google")}
              disabled={isLoading !== null}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-3 py-2",
                "bg-white border border-parchment-dark rounded-sm",
                "font-sans text-caption text-ink",
                "hover:bg-cream transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isLoading === "google" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GoogleIcon className="h-3.5 w-3.5" />
              )}
              Continue with Google
            </button>

            <button
              onClick={() => handleProviderSignIn("github")}
              disabled={isLoading !== null}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-3 py-2",
                "bg-ink border border-ink rounded-sm",
                "font-sans text-caption text-ivory",
                "hover:bg-ink/90 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isLoading === "github" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitHubIcon className="h-3.5 w-3.5" />
              )}
              Continue with GitHub
            </button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-parchment" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-2 bg-popover font-sans text-[10px] text-slate-muted">
                or
              </span>
            </div>
          </div>

          {/* Magic link form */}
          <form onSubmit={handleMagicLink} className="space-y-2">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                disabled={isLoading !== null}
                className={cn(
                  "w-full pl-8 pr-3 py-2",
                  "bg-card border border-parchment-dark rounded-sm",
                  "font-sans text-caption text-ink",
                  "placeholder:text-slate-muted",
                  "focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              />
            </div>
            <button
              type="submit"
              disabled={!email.trim() || isLoading !== null}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-3 py-2",
                "bg-burgundy border border-burgundy rounded-sm",
                "font-sans text-caption text-ivory",
                "hover:bg-burgundy-dark transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isLoading === "email" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Send magic link"
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="font-sans text-[10px] text-slate-muted text-center">
            Sign in to create and join shared annotation projects.
            Your local projects will remain available without signing in.
          </p>
        </div>
      </div>
    </div>
  );
}
