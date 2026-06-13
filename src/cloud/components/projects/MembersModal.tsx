"use client";

/**
 * Members Modal
 *
 * Modal for managing project members and generating invite links.
 */

import { useState, useEffect, useCallback } from "react";
import { useProjects } from "@/cloud/context/ProjectsContext";
import { useAuth } from "@/cloud/context/AuthContext";
import { cn } from "@/lib/utils";
import {
  X,
  Users,
  User,
  Loader2,
  Copy,
  Check,
  Trash2,
  Shield,
  Link,
  ChevronDown,
} from "lucide-react";
import type { MemberWithProfile, MemberRole } from "@/cloud/lib/supabase/types";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

const ROLE_LABELS: Record<"editor" | "viewer", string> = {
  editor: "Can edit",
  viewer: "View only",
};

export function MembersModal() {
  const { user } = useAuth();
  const {
    projects,
    showMembersModal,
    setShowMembersModal,
    membersModalProjectId,
    setMembersModalProjectId,
    getProjectMembers,
    createInviteLink,
    removeMember,
    updateMemberRole,
  } = useProjects();

  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<MemberWithProfile | null>(null);

  // Find the project
  const project = projects.find((p) => p.id === membersModalProjectId);
  const isOwner = user?.id === project?.owner_id;

  // Load members when modal opens
  const loadMembers = useCallback(async () => {
    if (!membersModalProjectId) return;

    setIsLoadingMembers(true);
    const { members: loadedMembers, error } = await getProjectMembers(membersModalProjectId);
    if (error) {
      setError(error.message);
    } else {
      setMembers(loadedMembers);
    }
    setIsLoadingMembers(false);
  }, [membersModalProjectId, getProjectMembers]);

  useEffect(() => {
    if (showMembersModal && membersModalProjectId) {
      loadMembers();
      setInviteUrl(null);
      setCopiedLink(false);
    }
  }, [showMembersModal, membersModalProjectId, loadMembers]);

  if (!showMembersModal || !project) return null;

  const handleClose = () => {
    setShowMembersModal(false);
    setMembersModalProjectId(null);
    setMembers([]);
    setInviteUrl(null);
    setCopiedLink(false);
    setError(null);
    setInviteRole("editor");
  };

  const handleGenerateLink = async () => {
    if (!membersModalProjectId) return;

    setIsGeneratingLink(true);
    setError(null);

    const { inviteUrl: url, error } = await createInviteLink(membersModalProjectId, inviteRole);

    if (error) {
      setError(error.message);
    } else if (url) {
      setInviteUrl(url);
    }

    setIsGeneratingLink(false);
  };

  const handleCopyLink = async () => {
    if (!inviteUrl) return;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setError("Failed to copy link");
    }
  };

  const handleRoleChange = async (member: MemberWithProfile, newRole: MemberRole) => {
    if (!membersModalProjectId) return;

    setActionLoading(`role-${member.id}`);
    setError(null);

    const { error } = await updateMemberRole(membersModalProjectId, member.user_id, newRole);

    if (error) {
      setError(error.message);
    } else {
      // Update local state
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m))
      );
    }

    setActionLoading(null);
  };

  const handleRemoveClick = (member: MemberWithProfile) => {
    setMemberToRemove(member);
  };

  const handleRemoveConfirm = async () => {
    if (!memberToRemove || !membersModalProjectId) return;

    setMemberToRemove(null);
    setActionLoading(`remove-${memberToRemove.id}`);
    setError(null);

    const { error } = await removeMember(membersModalProjectId, memberToRemove.user_id);

    if (error) {
      setError(error.message);
    } else {
      // Update local state
      setMembers((prev) => prev.filter((m) => m.id !== memberToRemove.id));
    }

    setActionLoading(null);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
          onClick={handleClose}
        />

        {/* Modal */}
        <div className="relative bg-popover rounded-sm shadow-lg border border-parchment max-w-md w-full max-h-[80vh] flex flex-col modal-content">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-parchment">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-burgundy" />
              <h2 className="font-serif text-ui-title text-ink">Project Members</h2>
            </div>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-cream rounded transition-colors"
            >
              <X className="h-4 w-4 text-slate" />
            </button>
          </div>

          {/* Project name */}
          <div className="px-5 py-2 bg-cream/50 border-b border-parchment">
            <p className="font-sans text-ui-base text-ink truncate" title={project.name}>{project.name}</p>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Error */}
            {error && (
              <div className="p-3 bg-burgundy/10 border border-burgundy/20 rounded-lg">
                <p className="font-sans text-ui-base text-burgundy">{error}</p>
              </div>
            )}

            {/* Invite Section (owner only) */}
            {isOwner && (
              <div className="space-y-3">
                <h3 className="font-sans text-ui-xs font-medium text-slate uppercase tracking-wide">
                  Invite People
                </h3>

                <div className="flex items-center gap-2">
                  {/* Role dropdown */}
                  <div className="relative">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
                      className={cn(
                        "appearance-none pl-3 pr-8 py-2 font-sans text-ui-base",
                        "bg-card border border-parchment rounded-lg",
                        "focus:outline-none focus:ring-1 focus:ring-burgundy"
                      )}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate pointer-events-none" />
                  </div>

                  {/* Generate button */}
                  <button
                    onClick={handleGenerateLink}
                    disabled={isGeneratingLink}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2",
                      "font-sans text-ui-base text-ivory",
                      "bg-burgundy hover:bg-burgundy-dark rounded-lg",
                      "transition-colors",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {isGeneratingLink ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link className="h-4 w-4" />
                    )}
                    Generate Link
                  </button>
                </div>

                {/* Generated link */}
                {inviteUrl && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={inviteUrl}
                        readOnly
                        className={cn(
                          "flex-1 px-3 py-2 font-mono text-ui-xs",
                          "bg-cream border border-parchment rounded-lg",
                          "text-slate truncate"
                        )}
                      />
                      <button
                        onClick={handleCopyLink}
                        className={cn(
                          "flex items-center gap-1 px-3 py-2",
                          "font-sans text-ui-base",
                          "border border-parchment rounded-lg",
                          "hover:bg-cream transition-colors",
                          copiedLink && "bg-emerald-50 border-emerald-200 text-emerald-700"
                        )}
                      >
                        {copiedLink ? (
                          <>
                            <Check className="h-4 w-4" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <p className="font-sans text-ui-xs text-slate">
                      Anyone with this link can join as {ROLE_LABELS[inviteRole].toLowerCase()}. Link expires in 1 month.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Members List */}
            <div className="space-y-3">
              <h3 className="font-sans text-ui-xs font-medium text-slate uppercase tracking-wide">
                Members ({members.length + 1})
              </h3>

              <div className="space-y-2">
                {/* Owner (always shown) */}
                <div className="flex items-center justify-between p-3 bg-cream/50 rounded-lg border border-parchment">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-burgundy text-ivory font-sans text-ui-xs font-medium">
                      {project.owner?.initials ||
                        project.owner?.display_name?.slice(0, 2)?.toUpperCase() ||
                        "??"}
                    </div>
                    <div>
                      <p className="font-sans text-ui-base text-ink">
                        {project.owner?.display_name || "Project Owner"}
                        {user?.id === project.owner_id && (
                          <span className="text-slate ml-1">(you)</span>
                        )}
                      </p>
                      {project.owner?.affiliation && (
                        <p className="font-sans text-ui-xs text-slate">
                          {project.owner.affiliation}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 bg-slate/10 text-slate rounded-full">
                    <Shield className="h-3 w-3" />
                    <span className="font-sans text-ui-xs font-medium">Owner</span>
                  </div>
                </div>

                {/* Loading state */}
                {isLoadingMembers && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-slate" />
                  </div>
                )}

                {/* Members */}
                {!isLoadingMembers &&
                  members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-card rounded-lg border border-parchment"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-slate/20 text-ink font-sans text-ui-xs font-medium">
                          {member.profile?.initials ||
                            member.profile?.display_name?.slice(0, 2)?.toUpperCase() ||
                            "??"}
                        </div>
                        <div>
                          <p className="font-sans text-ui-base text-ink">
                            {member.profile?.display_name || "Member"}
                            {user?.id === member.user_id && (
                              <span className="text-slate ml-1">(you)</span>
                            )}
                          </p>
                          {member.profile?.affiliation && (
                            <p className="font-sans text-ui-xs text-slate">
                              {member.profile.affiliation}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Role selector (owner only, not for self) */}
                        {isOwner && user?.id !== member.user_id ? (
                          <>
                            <div className="relative">
                              <select
                                value={member.role}
                                onChange={(e) =>
                                  handleRoleChange(member, e.target.value as MemberRole)
                                }
                                disabled={actionLoading === `role-${member.id}`}
                                className={cn(
                                  "appearance-none pl-2 pr-6 py-1 font-sans text-ui-xs",
                                  "bg-cream border border-parchment rounded cursor-pointer",
                                  "focus:outline-none focus:ring-1 focus:ring-burgundy",
                                  "disabled:opacity-50 disabled:cursor-not-allowed"
                                )}
                              >
                                <option value="viewer">Viewer</option>
                                <option value="editor">Editor</option>
                              </select>
                              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate pointer-events-none" />
                            </div>

                            <button
                              onClick={() => handleRemoveClick(member)}
                              disabled={actionLoading === `remove-${member.id}`}
                              className={cn(
                                "p-1 rounded hover:bg-burgundy/10 transition-colors",
                                "text-slate hover:text-burgundy",
                                "disabled:opacity-50"
                              )}
                              title="Remove member"
                            >
                              {actionLoading === `remove-${member.id}` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </>
                        ) : (
                          <span className="px-2 py-1 font-sans text-ui-xs text-slate bg-cream rounded">
                            {ROLE_LABELS[member.role as "editor" | "viewer"] || member.role}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                {/* Empty state */}
                {!isLoadingMembers && members.length === 0 && (
                  <p className="font-sans text-ui-base text-slate text-center py-4">
                    No members yet. Generate an invite link to add people.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-parchment">
            <button
              onClick={handleClose}
              className="w-full px-3 py-2 font-sans text-ui-base text-slate hover:text-ink hover:bg-cream rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Remove member confirmation */}
      <ConfirmDialog
        isOpen={memberToRemove !== null}
        title={`Remove "${memberToRemove?.profile?.display_name || "member"}"?`}
        message="They will lose access to this project and its annotations."
        variant="danger"
        confirmLabel="Remove"
        onConfirm={handleRemoveConfirm}
        onCancel={() => setMemberToRemove(null)}
      />
    </>
  );
}
