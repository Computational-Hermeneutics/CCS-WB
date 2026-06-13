"use client";

/**
 * User Menu Component
 *
 * Displays user avatar and dropdown menu for authenticated users.
 * Shows sign-in button for unauthenticated users.
 */

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/cloud/context/AuthContext";
import { useProjects } from "@/cloud/context/ProjectsContext";
import { useAppSettings } from "@/context/AppSettingsContext";
import { cn } from "@/lib/utils";
import { User, LogOut, Users, Loader2, FolderOpen } from "lucide-react";

interface UserMenuProps {
  className?: string;
  /** Called when Profile is clicked (for wiring to settings modal) */
  onProfileClick?: () => void;
}

export function UserMenu({ className, onProfileClick }: UserMenuProps) {
  const {
    isSupabaseEnabled,
    isAuthenticated,
    isLoading,
    profile: authProfile,
    user,
    setShowLoginModal,
    signOut,
  } = useAuth();

  const { setShowProjectsModal } = useProjects();
  const { profile: appProfile } = useAppSettings();

  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [profileTimeout, setProfileTimeout] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Timeout for profile loading - don't spin forever
  useEffect(() => {
    if (isAuthenticated && !authProfile && !profileTimeout) {
      const timer = setTimeout(() => {
        console.warn("Profile loading timed out, using fallback");
        setProfileTimeout(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
    // Reset timeout flag when profile loads
    if (authProfile) {
      setProfileTimeout(false);
    }
  }, [isAuthenticated, authProfile, profileTimeout]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // If Supabase is not enabled, don't render anything
  if (!isSupabaseEnabled) {
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("flex items-center", className)}>
        <Loader2 className="h-3 w-3 animate-spin text-slate" />
      </div>
    );
  }

  // Not authenticated - show sign in button
  if (!isAuthenticated) {
    return (
      <button
        onClick={() => setShowLoginModal(true)}
        className={cn(
          "flex items-center gap-1 px-1.5 py-0.5",
          "font-sans text-[10px] text-slate",
          "hover:text-ink transition-colors",
          "border border-parchment rounded hover:border-parchment-dark",
          className
        )}
      >
        <Users className="h-3 w-3" />
        <span className="hidden sm:inline">Collaborate</span>
      </button>
    );
  }

  // Show loading while profile is being fetched (but not forever)
  if (isAuthenticated && !authProfile && !profileTimeout) {
    return (
      <div className={cn("flex items-center", className)}>
        <Loader2 className="h-3 w-3 animate-spin text-slate" />
      </div>
    );
  }

  // Get avatar display - use auth profile for avatar, app profile for user-specified initials
  const avatarUrl = authProfile?.avatar_url || user?.user_metadata?.avatar_url;
  const fallbackName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const fallbackInitials = fallbackName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  // Prefer user-specified initials from app settings, fall back to auth profile
  const initials = appProfile.initials || authProfile?.initials || authProfile?.display_name?.slice(0, 2)?.toUpperCase() || fallbackInitials;
  const displayName = authProfile?.display_name || fallbackName;

  const handleSignOut = () => {
    setIsSigningOut(true);
    // Clear Supabase auth storage directly
    const storageKey = `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`;
    localStorage.removeItem(storageKey);
    // Also try the generic key pattern
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.removeItem(key);
      }
    });
    // Reload immediately
    window.location.reload();
  };

  return (
    <div ref={menuRef} className={cn("relative", className)}>
      {/* Avatar button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center rounded transition-colors p-0.5",
          isOpen ? "bg-cream" : "hover:bg-cream"
        )}
        title={displayName}
      >
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-burgundy text-ivory",
            "font-sans text-[8px] font-medium h-5 w-5"
          )}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className={cn(
            "absolute right-0 top-full mt-1 z-50",
            "min-w-[140px] py-0.5",
            "bg-card rounded shadow-lg border border-parchment"
          )}
        >
          {/* User info header */}
          <div className="px-2 py-1.5 border-b border-parchment">
            <p className="font-sans text-[11px] font-medium text-ink truncate">
              {displayName}{initials && ` (${initials})`}
            </p>
            {authProfile?.affiliation && (
              <p className="font-sans text-[9px] text-slate truncate">
                {authProfile.affiliation}
              </p>
            )}
          </div>

          {/* Menu items */}
          <div className="py-0.5">
            <button
              onClick={() => {
                setIsOpen(false);
                setShowProjectsModal(true);
              }}
              className={cn(
                "w-full flex items-center gap-1.5 px-2 py-1",
                "font-sans text-[10px] text-ink",
                "hover:bg-cream transition-colors"
              )}
            >
              <FolderOpen className="h-3 w-3 text-slate" />
              Projects
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                onProfileClick?.();
              }}
              className={cn(
                "w-full flex items-center gap-1.5 px-2 py-1",
                "font-sans text-[10px] text-ink",
                "hover:bg-cream transition-colors"
              )}
            >
              <User className="h-3 w-3 text-slate" />
              Profile
            </button>
          </div>

          {/* Sign out */}
          <div className="pt-0.5 border-t border-parchment">
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className={cn(
                "w-full flex items-center gap-1.5 px-2 py-1",
                "font-sans text-[10px] text-slate",
                "hover:bg-cream hover:text-ink transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isSigningOut ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <LogOut className="h-3 w-3" />
              )}
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
