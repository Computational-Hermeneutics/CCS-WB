/**
 * Hook for XP (Experience Points) system
 * Handles XP awarding, level progression, and gamification
 */

import { useCallback } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Profile, XPTransaction, XPActionType } from "@/cloud/lib/supabase/types";
import { XP_REWARDS, calculateLevel } from "@/cloud/lib/xp-utils";
import { handleProjectError } from "@/lib/projects-utils";

export interface XPSystemParams {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: Profile | null;
}

export interface XPSystemState {
  // Award XP
  awardXP: (
    actionType: XPActionType,
    referenceId?: string
  ) => Promise<{
    xp_earned: number;
    new_total_xp: number;
    new_level: number;
    leveled_up: boolean;
    error: Error | null;
  }>;

  // Fetch XP history
  fetchXPHistory: (limit?: number) => Promise<{
    transactions: XPTransaction[];
    error: Error | null;
  }>;

  // Check daily login
  checkDailyLogin: () => Promise<{ awarded: boolean; error: Error | null }>;
}

/**
 * Custom hook for XP system operations
 */
export function useXPSystem({
  supabase,
  user,
  profile,
}: XPSystemParams): XPSystemState {
  // Award XP for an action
  const awardXP = useCallback(
    async (actionType: XPActionType, referenceId?: string) => {
      if (!supabase || !user || !profile) {
        return {
          xp_earned: 0,
          new_total_xp: 0,
          new_level: 1,
          leveled_up: false,
          error: new Error("Not authenticated"),
        };
      }

      try {
        const xpAmount = XP_REWARDS[actionType];
        const now = new Date().toISOString();

        // Insert XP transaction
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: transactionError } = await (supabase as any)
          .from("xp_transactions")
          .insert({
            user_id: user.id,
            action_type: actionType,
            xp_earned: xpAmount,
            reference_id: referenceId || null,
            created_at: now,
          });

        if (transactionError) {
          return {
            xp_earned: 0,
            new_total_xp: profile.xp,
            new_level: profile.level,
            leveled_up: false,
            error: new Error(transactionError.message),
          };
        }

        // Calculate new XP and level
        const oldLevel = profile.level;
        const newTotalXP = profile.xp + xpAmount;
        const newLevel = calculateLevel(newTotalXP);
        const leveledUp = newLevel > oldLevel;

        // Determine which stat counter to increment
        const statUpdates: Record<string, number> = {};
        switch (actionType) {
          case "annotation":
            statUpdates.created_annotations = (profile.created_annotations || 0) + 1;
            break;
          case "reply":
            statUpdates.created_replies = (profile.created_replies || 0) + 1;
            break;
          case "project_created":
            statUpdates.created_projects = (profile.created_projects || 0) + 1;
            break;
          case "submit":
            statUpdates.library_submissions = (profile.library_submissions || 0) + 1;
            break;
          case "approved":
            statUpdates.library_approvals = (profile.library_approvals || 0) + 1;
            break;
        }

        // Update profile with new XP, level, and stats
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: profileError } = await (supabase as any)
          .from("profiles")
          .update({
            xp: newTotalXP,
            level: newLevel,
            ...statUpdates,
          })
          .eq("id", user.id);

        if (profileError) {
          return {
            xp_earned: 0,
            new_total_xp: profile.xp,
            new_level: profile.level,
            leveled_up: false,
            error: new Error(profileError.message),
          };
        }

        return {
          xp_earned: xpAmount,
          new_total_xp: newTotalXP,
          new_level: newLevel,
          leveled_up: leveledUp,
          error: null,
        };
      } catch (error) {
        return {
          xp_earned: 0,
          new_total_xp: profile.xp,
          new_level: profile.level,
          leveled_up: false,
          error: handleProjectError(error, "awardXP"),
        };
      }
    },
    [supabase, user, profile]
  );

  // Fetch XP transaction history
  const fetchXPHistory = useCallback(
    async (limit: number = 50) => {
      if (!supabase || !user) {
        return { transactions: [], error: new Error("Not authenticated") };
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("xp_transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) {
          return { transactions: [], error: new Error(error.message) };
        }

        return { transactions: data || [], error: null };
      } catch (error) {
        return {
          transactions: [],
          error: handleProjectError(error, "fetchXPHistory"),
        };
      }
    },
    [supabase, user]
  );

  // Check and award daily login XP
  const checkDailyLogin = useCallback(async () => {
    if (!supabase || !user || !profile) {
      return { awarded: false, error: new Error("Not authenticated") };
    }

    try {
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
      const lastLogin = profile.last_daily_login;

      // Check if already logged in today
      if (lastLogin === today) {
        return { awarded: false, error: null };
      }

      // Award daily login XP
      const result = await awardXP("daily_login");
      if (result.error) {
        return { awarded: false, error: result.error };
      }

      // Update last_daily_login date
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from("profiles")
        .update({ last_daily_login: today })
        .eq("id", user.id);

      if (updateError) {
        return { awarded: false, error: new Error(updateError.message) };
      }

      return { awarded: true, error: null };
    } catch (error) {
      return { awarded: false, error: handleProjectError(error, "checkDailyLogin") };
    }
  }, [supabase, user, profile, awardXP]);

  return {
    awardXP,
    fetchXPHistory,
    checkDailyLogin,
  };
}
