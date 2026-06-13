/**
 * Hook for project member management
 * Handles invites, roles, and member CRUD operations
 */

import { useCallback } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  Profile,
  MemberWithProfile,
  MemberRole,
  Project,
} from "@/cloud/lib/supabase/types";

export interface ProjectMembersParams {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: Profile | null;
  refreshProjects: () => Promise<void>;
}

export interface ProjectMembersState {
  getProjectMembers: (projectId: string) => Promise<{
    members: MemberWithProfile[];
    error: Error | null;
  }>;
  createInviteLink: (
    projectId: string,
    role: "editor" | "viewer"
  ) => Promise<{ inviteUrl: string | null; error: Error | null }>;
  removeMember: (projectId: string, userId: string) => Promise<{ error: Error | null }>;
  updateMemberRole: (
    projectId: string,
    userId: string,
    role: MemberRole
  ) => Promise<{ error: Error | null }>;
  joinProjectByInvite: (token: string) => Promise<{
    project: Project | null;
    error: Error | null;
  }>;
}

/**
 * Custom hook for member management
 */
export function useProjectMembers({
  supabase,
  user,
  profile,
  refreshProjects,
}: ProjectMembersParams): ProjectMembersState {
  // Get project members with profile info
  const getProjectMembers = useCallback(
    async (projectId: string) => {
      if (!supabase) {
        return { members: [], error: new Error("Supabase not configured") };
      }

      try {
        // Fetch members first
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: membersData, error: membersError } = await (supabase as any)
          .from("project_members")
          .select("*")
          .eq("project_id", projectId);

        if (membersError) {
          return { members: [], error: new Error(membersError.message) };
        }

        if (!membersData || membersData.length === 0) {
          return { members: [], error: null };
        }

        // Fetch profiles for all members
        const userIds = membersData.map((m: { user_id: string }) => m.user_id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profilesData, error: profilesError } = await (supabase as any)
          .from("profiles")
          .select("*")
          .in("id", userIds);

        if (profilesError) {
          console.error("Error fetching profiles:", profilesError);
        }

        // Create a map of profiles by user_id
        const profilesMap: Record<string, Profile> = {};
        for (const profile of profilesData || []) {
          profilesMap[profile.id] = profile;
        }

        // Combine members with their profiles
        const membersWithProfiles: MemberWithProfile[] = membersData.map(
          (member: {
            id: string;
            project_id: string;
            user_id: string;
            role: string;
            joined_at: string;
          }) => ({
            ...member,
            profile: profilesMap[member.user_id] || null,
          })
        );

        return { members: membersWithProfiles, error: null };
      } catch (error) {
        return { members: [], error: error as Error };
      }
    },
    [supabase]
  );

  // Create a shareable invite link
  const createInviteLink = useCallback(
    async (projectId: string, role: "editor" | "viewer") => {
      if (!supabase || !user) {
        return { inviteUrl: null, error: new Error("Not authenticated") };
      }

      try {
        const token = crypto.randomUUID();
        const expiresAt = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(); // 1 month

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("project_invites").insert({
          project_id: projectId,
          token,
          role,
          created_by: user.id,
          expires_at: expiresAt,
        });

        if (error) {
          return { inviteUrl: null, error: new Error(error.message) };
        }

        const inviteUrl = `${window.location.origin}/invite/${token}`;
        return { inviteUrl, error: null };
      } catch (error) {
        return { inviteUrl: null, error: error as Error };
      }
    },
    [supabase, user]
  );

  // Remove a member from a project
  const removeMember = useCallback(
    async (projectId: string, userId: string) => {
      if (!supabase) {
        return { error: new Error("Supabase not configured") };
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("project_members")
          .delete()
          .eq("project_id", projectId)
          .eq("user_id", userId);

        if (error) {
          return { error: new Error(error.message) };
        }

        return { error: null };
      } catch (error) {
        return { error: error as Error };
      }
    },
    [supabase]
  );

  // Update a member's role
  const updateMemberRole = useCallback(
    async (projectId: string, userId: string, role: MemberRole) => {
      if (!supabase) {
        return { error: new Error("Supabase not configured") };
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("project_members")
          .update({ role })
          .eq("project_id", projectId)
          .eq("user_id", userId);

        if (error) {
          return { error: new Error(error.message) };
        }

        return { error: null };
      } catch (error) {
        return { error: error as Error };
      }
    },
    [supabase]
  );

  // Join a project via invite token
  const joinProjectByInvite = useCallback(
    async (token: string) => {
      if (!supabase || !user) {
        return { project: null, error: new Error("Not authenticated") };
      }

      try {
        // Fetch the invite and validate it
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: invite, error: inviteError } = await (supabase as any)
          .from("project_invites")
          .select("*")
          .eq("token", token)
          .gt("expires_at", new Date().toISOString())
          .single();

        if (inviteError || !invite) {
          return { project: null, error: new Error("Invalid or expired invite link") };
        }

        // Check if already a member
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (supabase as any)
          .from("project_members")
          .select("id")
          .eq("project_id", invite.project_id)
          .eq("user_id", user.id)
          .single();

        // If not already a member, add them FIRST (before trying to read project)
        // This is needed because RLS on projects table only allows owners/members to read
        if (!existing) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: memberError } = await (supabase as any)
            .from("project_members")
            .insert({
              project_id: invite.project_id,
              user_id: user.id,
              role: invite.role,
              joined_at: new Date().toISOString(),
            });

          if (memberError) {
            // If it's a duplicate key error, they're already a member (race condition)
            if (!memberError.message?.includes("duplicate")) {
              return { project: null, error: new Error(memberError.message) };
            }
          }
        }

        // NOW fetch the project (user is now a member, so RLS allows it)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: project, error: projectError } = await (supabase as any)
          .from("projects")
          .select("*")
          .eq("id", invite.project_id)
          .single();

        if (projectError || !project) {
          return { project: null, error: new Error("Project not found") };
        }

        // Refresh projects list to include new project
        await refreshProjects();

        return { project: project as Project, error: null };
      } catch (error) {
        return { project: null, error: error as Error };
      }
    },
    [supabase, user, refreshProjects]
  );

  return {
    getProjectMembers,
    createInviteLink,
    removeMember,
    updateMemberRole,
    joinProjectByInvite,
  };
}
