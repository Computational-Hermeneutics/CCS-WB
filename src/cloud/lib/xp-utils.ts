/**
 * XP System Utilities
 * Calculation functions for experience points and level progression
 */

import type { XPActionType } from "@/cloud/lib/supabase/types";

// XP rewards for each action type
export const XP_REWARDS: Record<XPActionType, number> = {
  annotation: 10,
  reply: 5,
  submit: 50,
  approved: 200,
  favorite_received: 3,
  rating_received: 10,
  project_created: 15,
  daily_login: 5,
};

// Level thresholds and titles
export const LEVEL_THRESHOLDS = [
  { level: 1, title: "Novice", xp: 0 },
  { level: 2, title: "Apprentice", xp: 100 },
  { level: 3, title: "Scholar", xp: 350 },
  { level: 4, title: "Expert", xp: 850 },
  { level: 5, title: "Wizard", xp: 1850 },
  { level: 6, title: "Master", xp: 3850 },
  { level: 7, title: "Grandmaster", xp: 8850 },
];

/**
 * Calculate level from total XP
 */
export function calculateLevel(totalXP: number): number {
  // Start from highest level and work down
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXP >= LEVEL_THRESHOLDS[i].xp) {
      return LEVEL_THRESHOLDS[i].level;
    }
  }
  return 1; // Default to Novice
}

/**
 * Get level title from level number
 */
export function getLevelTitle(level: number): string {
  const threshold = LEVEL_THRESHOLDS.find((t) => t.level === level);
  return threshold?.title || "Novice";
}

/**
 * Get XP progress information for next level
 */
export function getXPForNextLevel(
  currentXP: number,
  currentLevel: number
): {
  current: number;
  required: number;
  next_level: number;
} {
  const nextThreshold = LEVEL_THRESHOLDS.find((t) => t.level === currentLevel + 1);

  if (!nextThreshold) {
    // Max level reached
    return {
      current: currentXP,
      required: currentXP,
      next_level: currentLevel,
    };
  }

  return {
    current: currentXP,
    required: nextThreshold.xp,
    next_level: nextThreshold.level,
  };
}

/**
 * Get color class for level tier
 * Bronze (1-2), Silver (3-4), Gold (5+)
 */
export function getLevelColor(level: number): string {
  if (level <= 2) return "text-amber-700"; // Bronze
  if (level <= 4) return "text-gray-500"; // Silver
  return "text-yellow-500"; // Gold
}

/**
 * Get background color class for level tier
 */
export function getLevelBgColor(level: number): string {
  if (level <= 2) return "bg-amber-700"; // Bronze
  if (level <= 4) return "bg-gray-500"; // Silver
  return "bg-yellow-500"; // Gold
}

/**
 * Calculate XP progress percentage to next level
 */
export function getXPProgressPercentage(currentXP: number, currentLevel: number): number {
  const currentThreshold = LEVEL_THRESHOLDS.find((t) => t.level === currentLevel);
  const nextThreshold = LEVEL_THRESHOLDS.find((t) => t.level === currentLevel + 1);

  if (!currentThreshold || !nextThreshold) {
    return 100; // Max level reached
  }

  const xpIntoLevel = currentXP - currentThreshold.xp;
  const xpNeededForLevel = nextThreshold.xp - currentThreshold.xp;

  return Math.min(100, Math.max(0, (xpIntoLevel / xpNeededForLevel) * 100));
}
