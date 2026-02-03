"use client";

/**
 * Library Modal
 *
 * Browse and copy public projects from the library.
 * Projects in the library are approved public projects that can be previewed
 * (read-only) or copied to the user's own projects.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProjects } from "@/context/ProjectsContext";
import { useSession } from "@/context/SessionContext";
import { cn } from "@/lib/utils";
import {
  X,
  Library,
  BookOpen,
  Copy,
  Eye,
  Loader2,
  Clock,
  User,
  Search,
  FileCode,
  CheckCircle,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { LibraryProject } from "@/lib/supabase/types";
import type { EntryMode } from "@/types/session";
import { getSupabaseClient } from "@/lib/supabase/client";

const MODE_LABELS: Record<EntryMode, string> = {
  critique: "Critique",
  interpret: "Interpret",
  create: "Create",
};

const MODE_COLORS: Record<EntryMode, string> = {
  critique: "bg-burgundy/10 text-burgundy",
  interpret: "bg-blue-100 text-blue-700",
  create: "bg-emerald-100 text-emerald-700",
};

export function LibraryModal() {
  const router = useRouter();
  const {
    libraryProjects,
    isLoadingLibrary,
    showLibraryModal,
    setShowLibraryModal,
    fetchLibraryProjects,
    loadLibraryProject,
    copyLibraryProject,
    setViewingLibraryProjectId,
  } = useProjects();
  const { importSession, resetSession } = useSession();

  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedProjectId, setCopiedProjectId] = useState<string | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [loadingReadme, setLoadingReadme] = useState(false);
  const [activeTab, setActiveTab] = useState<"library" | "early-access">("library");

  // Fetch library projects when modal opens
  useEffect(() => {
    if (showLibraryModal) {
      fetchLibraryProjects();
      setError(null);
      setCopiedProjectId(null);
    }
  }, [showLibraryModal, fetchLibraryProjects]);

  if (!showLibraryModal) return null;

  const handleClose = () => {
    setShowLibraryModal(false);
    setSearchQuery("");
    setError(null);
    setCopiedProjectId(null);
    setExpandedProjectId(null);
    setReadmeContent(null);
  };

  const handleToggleInfo = async (project: LibraryProject) => {
    // If already expanded, collapse it
    if (expandedProjectId === project.id) {
      setExpandedProjectId(null);
      setReadmeContent(null);
      return;
    }

    setExpandedProjectId(project.id);
    setLoadingReadme(true);
    setReadmeContent(null);

    // Fetch README.md from the project's code_files
    const supabase = getSupabaseClient();
    if (!supabase) {
      setReadmeContent("Unable to load README.");
      setLoadingReadme(false);
      return;
    }

    const { data, error } = await (supabase as any)
      .from("code_files")
      .select("content, filename")
      .eq("project_id", project.id)
      .ilike("filename", "%readme%")
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching README:", error);
      setReadmeContent(`Error loading README: ${error.message}`);
    } else if (!data) {
      // Try to list all files to debug
      const { data: files } = await (supabase as any)
        .from("code_files")
        .select("filename")
        .eq("project_id", project.id);
      console.log("Files in project:", files?.map((f: { filename: string }) => f.filename));
      setReadmeContent("No README.md file found in this project.");
    } else {
      setReadmeContent((data as { content: string }).content || "README.md is empty.");
    }

    setLoadingReadme(false);
  };

  const handlePreview = async (project: LibraryProject) => {
    setActionLoading(`preview-${project.id}`);
    setError(null);

    // Clear any existing preview state first
    setViewingLibraryProjectId(null);

    // Reset current session before loading library project
    resetSession();

    // Load project in read-only mode
    const { session, error } = await loadLibraryProject(project.id);

    if (error) {
      setError(error.message);
      setActionLoading(null);
      return;
    }

    if (session) {
      importSession(session);
      handleClose();
      router.push("/conversation");
    }

    setActionLoading(null);
  };

  const handleCopy = async (project: LibraryProject) => {
    setActionLoading(`copy-${project.id}`);
    setError(null);

    const { project: newProject, error } = await copyLibraryProject(project.id);

    if (error) {
      setError(error.message);
    } else if (newProject) {
      // Show success state briefly
      setCopiedProjectId(project.id);
      setTimeout(() => {
        setCopiedProjectId(null);
      }, 2000);
    }

    setActionLoading(null);
  };

  // Filter projects by search query (search against display name without $ prefix)
  const filteredProjects = libraryProjects.filter(project => {
    const name = project.name.startsWith("$") ? project.name.slice(1) : project.name;
    return name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.owner?.display_name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Separate approved library projects from Early Access (submitted) projects
  const approvedProjects = filteredProjects.filter(p => p.accession_status === "approved");
  const earlyAccessProjects = filteredProjects.filter(p => p.accession_status === "submitted");

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Unknown";
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Strip $ namespace prefix from library project names for display
  const displayName = (name: string) => {
    return name.startsWith("$") ? name.slice(1) : name;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-popover rounded-sm shadow-lg border border-parchment max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden modal-content">
        {/* Header */}
        <div className="relative px-5 py-4 bg-gradient-to-r from-cream to-ivory border-b border-parchment">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-burgundy/10 rounded-lg">
              <Library className="h-5 w-5 text-burgundy" />
            </div>
            <div>
              <h2 className="font-serif text-ui-title text-ink">Project Library</h2>
              <p className="font-sans text-ui-xs text-slate">
                Browse and copy published CCS projects
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1.5 hover:bg-parchment/50 rounded-lg transition-colors"
          >
            <X className="h-4 w-4 text-slate" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 py-2 border-b border-parchment bg-cream/30 flex gap-2">
          <button
            onClick={() => setActiveTab("library")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium transition-colors",
              activeTab === "library"
                ? "bg-burgundy text-white"
                : "bg-burgundy/10 text-burgundy hover:bg-burgundy/20"
            )}
          >
            <Library className="h-3.5 w-3.5" />
            Library
            {approvedProjects.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-white/30 rounded-full text-[10px]">
                {approvedProjects.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("early-access")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-ui-xs font-medium transition-colors",
              activeTab === "early-access"
                ? "bg-amber-500 text-white"
                : "bg-amber-100 text-amber-700 hover:bg-amber-200"
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            Early Access
            {earlyAccessProjects.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-white/30 rounded-full text-[10px]">
                {earlyAccessProjects.length}
              </span>
            )}
          </button>
        </div>

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-parchment">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === "library" ? "Search library..." : "Search early access..."}
              className={cn(
                "w-full pl-9 pr-3 py-2",
                "font-sans text-ui-base text-ink placeholder:text-slate/50",
                "bg-ivory border border-parchment rounded-lg",
                "focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy"
              )}
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-5 mt-4 px-3 py-2 bg-burgundy/10 border border-burgundy/20 rounded-lg">
            <p className="font-sans text-ui-base text-burgundy">{error}</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoadingLibrary ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-burgundy mb-2" />
              <p className="font-sans text-ui-base text-slate">Loading library...</p>
            </div>
          ) : activeTab === "library" ? (
            /* Library Tab */
            approvedProjects.length === 0 ? (
              <div className="text-center py-8 px-4">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-cream to-parchment/50 rounded-2xl mb-4 shadow-sm">
                  <BookOpen className="h-7 w-7 text-burgundy/40" />
                </div>
                <h3 className="font-serif text-ui-lg text-ink mb-2">
                  {searchQuery ? "No matching projects" : "No projects in library"}
                </h3>
                <p className="font-sans text-ui-xs text-slate max-w-[220px] mx-auto leading-relaxed">
                  {searchQuery
                    ? "Try a different search term"
                    : "Approved public projects will appear here"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {approvedProjects.map((project) => (
                <div
                  key={project.id}
                  className="group p-4 rounded-xl border border-parchment bg-ivory hover:border-parchment-dark hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-serif text-ui-base text-ink truncate" title={displayName(project.name)}>
                        {displayName(project.name)}
                      </h4>
                      {/* Owner info - "Library" for approved, original owner for Early Access */}
                      <p className="font-sans text-ui-xs text-slate/60 mb-1 flex items-center gap-1">
                        {project.accession_status === "approved" ? (
                          <>
                            <Library className="h-2.5 w-2.5" />
                            <span>Library</span>
                          </>
                        ) : (
                          <>
                            <User className="h-2.5 w-2.5" />
                            <span>{project.owner?.display_name || "Unknown"}</span>
                            {project.owner?.affiliation && (
                              <span className="text-slate/40">
                                ({project.owner.affiliation})
                              </span>
                            )}
                          </>
                        )}
                      </p>
                      {project.description && (
                        <p className="font-sans text-ui-xs text-slate mb-2 line-clamp-2">
                          {project.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-ui-xs font-sans font-medium",
                          MODE_COLORS[project.mode as EntryMode] || "bg-slate/10 text-slate"
                        )}>
                          {MODE_LABELS[project.mode as EntryMode] || project.mode}
                        </span>
                        {/* Early Access badge for submitted (not yet approved) projects */}
                        {project.accession_status === "submitted" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-ui-xs font-sans font-medium bg-amber-500 text-white">
                            Early Access
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-ui-xs text-slate/60 font-sans">
                          <Clock className="h-3 w-3" />
                          {project.accession_status === "submitted"
                            ? formatDate(project.submitted_at)
                            : formatDate(project.approved_at)}
                        </span>
                        {/* More info toggle */}
                        <button
                          onClick={() => handleToggleInfo(project)}
                          className={cn(
                            "flex items-center gap-1 text-ui-xs font-sans",
                            "text-burgundy/70 hover:text-burgundy",
                            "transition-colors"
                          )}
                        >
                          <Info className="h-3 w-3" />
                          <span>More info</span>
                          {expandedProjectId === project.id ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => handlePreview(project)}
                        disabled={!!actionLoading}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                          "font-sans text-ui-xs font-medium",
                          "bg-slate/10 text-slate hover:bg-slate/20",
                          "transition-colors",
                          "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                      >
                        {actionLoading === `preview-${project.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                        Preview
                      </button>
                      <button
                        onClick={() => handleCopy(project)}
                        disabled={!!actionLoading || copiedProjectId === project.id}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                          "font-sans text-ui-xs font-medium",
                          "transition-colors",
                          "disabled:opacity-50 disabled:cursor-not-allowed",
                          copiedProjectId === project.id
                            ? "bg-emerald-500 text-white"
                            : "bg-burgundy text-ivory hover:bg-burgundy-dark"
                        )}
                      >
                        {actionLoading === `copy-${project.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : copiedProjectId === project.id ? (
                          <>
                            <CheckCircle className="h-3.5 w-3.5" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy <span className="text-[10px] opacity-80">to my projects</span></span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expandable README section */}
                  {expandedProjectId === project.id && (
                    <div className="mt-3 pt-3 border-t border-parchment">
                      {loadingReadme ? (
                        <div className="flex items-center gap-2 text-slate/60">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="font-sans text-ui-xs">Loading README...</span>
                        </div>
                      ) : (
                        <div className="bg-cream/50 rounded-lg p-3 max-h-48 overflow-y-auto">
                          <pre className="font-mono text-ui-xs text-ink whitespace-pre-wrap break-words">
                            {readmeContent}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                ))}
              </div>
            )
          ) : (
            /* Early Access Tab */
            earlyAccessProjects.length === 0 ? (
              <div className="text-center py-8 px-4">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-2xl mb-4 shadow-sm">
                  <Clock className="h-7 w-7 text-amber-500/40" />
                </div>
                <h3 className="font-serif text-ui-lg text-ink mb-2">
                  {searchQuery ? "No matching projects" : "No early access projects"}
                </h3>
                <p className="font-sans text-ui-xs text-slate max-w-[220px] mx-auto leading-relaxed">
                  {searchQuery
                    ? "Try a different search term"
                    : "Projects pending approval will appear here"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {earlyAccessProjects.map((project) => (
                  <div
                    key={project.id}
                    className="group p-4 rounded-xl border border-amber-200 bg-amber-50/50 hover:border-amber-300 hover:shadow-sm transition-all dark:border-amber-500/30 dark:bg-amber-500/10"
                  >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-serif text-ui-base text-ink truncate" title={displayName(project.name)}>
                              {displayName(project.name)}
                            </h4>
                            <p className="font-sans text-ui-xs text-slate/60 mb-1 flex items-center gap-1">
                              <User className="h-2.5 w-2.5" />
                              <span>{project.owner?.display_name || "Unknown"}</span>
                              {project.owner?.affiliation && (
                                <span className="text-slate/40">
                                  ({project.owner.affiliation})
                                </span>
                              )}
                            </p>
                            {project.description && (
                              <p className="font-sans text-ui-xs text-slate mb-2 line-clamp-2">
                                {project.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-ui-xs font-sans font-medium",
                                MODE_COLORS[project.mode as EntryMode] || "bg-slate/10 text-slate"
                              )}>
                                {MODE_LABELS[project.mode as EntryMode] || project.mode}
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-ui-xs font-sans font-medium bg-amber-500 text-white">
                                Early Access
                              </span>
                              <span className="flex items-center gap-1 text-ui-xs text-slate/60 font-sans">
                                <Clock className="h-3 w-3" />
                                {formatDate(project.submitted_at)}
                              </span>
                              <button
                                onClick={() => handleToggleInfo(project)}
                                className={cn(
                                  "flex items-center gap-1 text-ui-xs font-sans",
                                  "text-burgundy/70 hover:text-burgundy",
                                  "transition-colors"
                                )}
                              >
                                <Info className="h-3 w-3" />
                                <span>More info</span>
                                {expandedProjectId === project.id ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => handlePreview(project)}
                              disabled={!!actionLoading}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                                "font-sans text-ui-xs font-medium",
                                "bg-slate/10 text-slate hover:bg-slate/20",
                                "transition-colors",
                                "disabled:opacity-50 disabled:cursor-not-allowed"
                              )}
                            >
                              {actionLoading === `preview-${project.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                              Preview
                            </button>
                            <button
                              onClick={() => handleCopy(project)}
                              disabled={!!actionLoading || copiedProjectId === project.id}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                                "font-sans text-ui-xs font-medium",
                                "transition-colors",
                                "disabled:opacity-50 disabled:cursor-not-allowed",
                                copiedProjectId === project.id
                                  ? "bg-emerald-500 text-white"
                                  : "bg-burgundy text-ivory hover:bg-burgundy-dark"
                              )}
                            >
                              {actionLoading === `copy-${project.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : copiedProjectId === project.id ? (
                                <>
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" />
                                  <span>Copy <span className="text-[10px] opacity-80">to my projects</span></span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                    {/* Expandable README section */}
                    {expandedProjectId === project.id && (
                      <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-500/30">
                        {loadingReadme ? (
                          <div className="flex items-center gap-2 text-slate/60">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="font-sans text-ui-xs">Loading README...</span>
                          </div>
                        ) : (
                          <div className="bg-cream/50 rounded-lg p-3 max-h-48 overflow-y-auto">
                            <pre className="font-mono text-ui-xs text-ink whitespace-pre-wrap break-words">
                              {readmeContent}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-parchment bg-cream/30">
          <p className="font-sans text-ui-xs text-slate/70 text-center">
            {activeTab === "library"
              ? `${approvedProjects.length} project${approvedProjects.length !== 1 ? "s" : ""} in library`
              : `${earlyAccessProjects.length} project${earlyAccessProjects.length !== 1 ? "s" : ""} pending approval`}
          </p>
        </div>
      </div>
    </div>
  );
}
