"use client";

/**
 * Authentication Context for Supabase
 *
 * Provides user authentication state and methods for sign-in/sign-out.
 * When Supabase is not configured, all auth features are gracefully disabled.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAppSettings } from "@/context/AppSettingsContext";
import type { User, Session, AuthError } from "@supabase/supabase-js";
import type { Database, Profile, ProfileInsert } from "@/lib/supabase/types";

// Auth provider types
export type AuthProvider = "google" | "github" | "apple";

interface AuthContextValue {
  // Configuration state
  isSupabaseEnabled: boolean;

  // User state
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;

  // Auth methods
  signInWithProvider: (provider: AuthProvider) => Promise<{ error: AuthError | null }>;
  signInWithMagicLink: (email: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;

  // Profile methods
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;

  // Modal state (controlled by context for easy access)
  showLoginModal: boolean;
  setShowLoginModal: (show: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Collaboration is gated by BOTH the deployment-level Supabase config
  // (env vars) AND the user-facing master switch in App Settings. When
  // the user disables collaboration, isSupabaseEnabled goes false and
  // every collaborative surface that already checks this flag hides,
  // and no Supabase client is created so no requests are made (the
  // Supabase free tier auto-pauses when unused — this keeps it unused).
  const { settings: appSettings } = useAppSettings();
  // Three-layer gate. isSupabaseConfigured() already folds in the
  // build-time CLOUD_ENABLED flag (see src/lib/supabase/client.ts
  // and src/cloud/config.ts) and the deploy-time URL+key check, so
  // we only AND with the per-user toggle here.
  const isSupabaseEnabled =
    isSupabaseConfigured() && appSettings.collaborationEnabled;
  const supabase = isSupabaseEnabled ? getSupabaseClient() : null;

  // Cache key for localStorage
  const PROFILE_CACHE_KEY = "ccs-profile-cache";

  // Get cached profile from localStorage
  const getCachedProfile = useCallback((userId: string): Profile | null => {
    try {
      const cached = localStorage.getItem(PROFILE_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Only use cache if it's for the same user and not too old (5 minutes)
        // Shorter TTL ensures profile changes (like is_admin) propagate faster
        if (parsed.id === userId && Date.now() - parsed._cachedAt < 300000) {
          return parsed;
        }
      }
    } catch {
      // Ignore cache errors
    }
    return null;
  }, []);

  // Save profile to localStorage cache
  const cacheProfile = useCallback((profile: Profile) => {
    try {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
        ...profile,
        _cachedAt: Date.now(),
      }));
    } catch {
      // Ignore cache errors
    }
  }, []);

  // Fetch user profile from database with timeout and cache fallback
  const fetchProfile = useCallback(async (userId: string) => {
    if (!supabase) return null;

    // Try cache first for immediate display
    const cached = getCachedProfile(userId);

    console.log("Fetching profile for user:", userId, cached ? "(have cache)" : "(no cache)");

    try {
      // Add timeout to the query
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single()
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) {
        // PGRST116 means no rows found - this is expected for new users
        if (error.code !== "PGRST116") {
          console.warn("Profile fetch issue (non-critical):", error.message || error.code);
        }
        return cached; // Return cached profile if query fails
      }

      // Cache the fresh profile
      if (data) {
        cacheProfile(data);
      }

      return data;
    } catch (err) {
      // On timeout or error, return cached profile
      if (cached) {
        console.log("Using cached profile due to fetch timeout/error");
        return cached;
      }
      console.warn("Profile fetch failed - continuing without profile:", err);
      return null;
    }
  }, [supabase, getCachedProfile, cacheProfile]);

  // Create profile if it doesn't exist
  const createProfile = useCallback(async (user: User) => {
    if (!supabase) return null;

    console.log("Creating profile for user:", user.id);

    // Generate initials from email or name
    // If user has Google/OAuth metadata with initials, prefer those
    const providedInitials = user.user_metadata?.initials;
    const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";

    let initials: string;
    if (providedInitials) {
      // Use provider-supplied initials
      initials = providedInitials.toUpperCase().slice(0, 3);
    } else {
      const nameParts = displayName.split(" ").filter((n: string) => n.length > 0);
      if (nameParts.length === 1) {
        // Single name (likely email prefix) - use first 3 characters
        initials = nameParts[0].slice(0, 3).toUpperCase();
      } else {
        // Multiple names - use first letter of each (up to 3)
        initials = nameParts
          .map((n: string) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 3);
      }
    }

    const newProfile: ProfileInsert = {
      id: user.id,
      display_name: displayName,
      initials,
      affiliation: null,
      avatar_url: user.user_metadata?.avatar_url || null,
    };

    console.log("New profile data:", newProfile);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("profiles")
        .upsert(newProfile, { onConflict: "id" })
        .select()
        .single();

      console.log("Profile upsert result:", { data, error });

      if (error) {
        console.error("Error creating profile:", JSON.stringify(error, null, 2));
        // If upsert fails, try insert
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: insertData, error: insertError } = await (supabase as any)
          .from("profiles")
          .insert(newProfile)
          .select()
          .single();

        if (insertError) {
          console.error("Error inserting profile:", insertError);
          return null;
        }
        return insertData;
      }

      return data;
    } catch (err) {
      console.error("Profile creation failed:", err);
      return null;
    }
  }, [supabase]);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    if (!supabase) {
      setIsLoading(false);
      return;
    }

    // Get initial session with timeout
    const initAuth = async () => {
      // Set a timeout to ensure loading doesn't hang forever
      const timeoutId = setTimeout(() => {
        if (mounted) {
          console.warn("Auth initialization timed out");
          setIsLoading(false);
        }
      }, 5000);

      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();

        if (error) {
          console.error("Error getting session:", error);
        } else if (initialSession?.user && mounted) {
          setSession(initialSession);
          setUser(initialSession.user);

          // Fetch or create profile (don't block loading)
          fetchProfile(initialSession.user.id).then(async (userProfile) => {
            if (!mounted) return;
            if (!userProfile) {
              userProfile = await createProfile(initialSession.user);
            }
            if (mounted) setProfile(userProfile);
          });
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
      } finally {
        clearTimeout(timeoutId);
        if (mounted) setIsLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;

        console.log("Auth state changed:", event, newSession?.user ? "user present" : "no user");

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // Fetch or create profile on sign in or token refresh
          let userProfile = await fetchProfile(newSession.user.id);
          if (!userProfile) {
            userProfile = await createProfile(newSession.user);
          }
          if (mounted) setProfile(userProfile);

          // Close login modal on successful sign in
          if (event === "SIGNED_IN") {
            setShowLoginModal(false);
          }

          // When session is refreshed after inactivity, trigger projects reload
          if (event === "TOKEN_REFRESHED") {
            console.log("Session refreshed - projects may need reloading");
            // Dispatch custom event that ProjectsContext can listen to
            window.dispatchEvent(new CustomEvent("auth-session-refreshed"));
          }
        } else {
          setProfile(null);

          // Session expired - show login modal
          if (event === "SIGNED_OUT") {
            console.log("Session expired - user signed out");
          }
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile, createProfile]);

  // Sign in with OAuth provider (Google, GitHub)
  const signInWithProvider = useCallback(async (provider: AuthProvider) => {
    if (!supabase) {
      return { error: new Error("Supabase not configured") as unknown as AuthError };
    }

    // Include current path so user returns to same page after auth
    const currentPath = window.location.pathname;
    const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(currentPath)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUrl,
      },
    });

    return { error };
  }, [supabase]);

  // Sign in with magic link (email)
  const signInWithMagicLink = useCallback(async (email: string) => {
    if (!supabase) {
      return { error: new Error("Supabase not configured") as unknown as AuthError };
    }

    // Include current path so user returns to same page after auth
    const currentPath = window.location.pathname;
    const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(currentPath)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    return { error };
  }, [supabase]);

  // Sign out with timeout
  const signOut = useCallback(async () => {
    if (!supabase) {
      return { error: new Error("Supabase not configured") as unknown as AuthError };
    }

    // Clear profile cache
    try {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch {
      // Ignore cache errors
    }

    // Add timeout to prevent hanging
    const signOutPromise = supabase.auth.signOut();
    const timeoutPromise = new Promise<{ error: AuthError }>((_, reject) => {
      setTimeout(() => reject(new Error("Sign out timed out")), 5000);
    });

    try {
      const result = await Promise.race([signOutPromise, timeoutPromise]);
      // Clear local state regardless
      setUser(null);
      setSession(null);
      setProfile(null);
      return result;
    } catch (err) {
      console.error("Sign out error:", err);
      // Force clear local state even on error
      setUser(null);
      setSession(null);
      setProfile(null);
      return { error: err as AuthError };
    }
  }, [supabase]);

  // Update user profile
  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!supabase || !user) {
      return { error: new Error("Not authenticated") };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("profiles")
      .update(updates)
      .eq("id", user.id);

    if (!error) {
      // Refresh profile after update
      const updatedProfile = await fetchProfile(user.id);
      setProfile(updatedProfile);
    }

    return { error: error ? new Error(error.message) : null };
  }, [supabase, user, fetchProfile]);

  // Refresh profile from database
  const refreshProfile = useCallback(async () => {
    if (user) {
      const updatedProfile = await fetchProfile(user.id);
      setProfile(updatedProfile);
    }
  }, [user, fetchProfile]);

  return (
    <AuthContext.Provider
      value={{
        isSupabaseEnabled,
        user,
        profile,
        session,
        isLoading,
        isAuthenticated: !!user,
        isAdmin: profile?.is_admin ?? false,
        signInWithProvider,
        signInWithMagicLink,
        signOut,
        updateProfile,
        refreshProfile,
        showLoginModal,
        setShowLoginModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
