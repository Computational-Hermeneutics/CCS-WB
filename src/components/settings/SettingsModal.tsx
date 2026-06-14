"use client";

import { useState, useEffect } from "react";
import { X, Bot, Palette, Info, Minus, Plus, Code, User, Loader2, Mail, LogOut, Users, Cloud, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIProviderSettings } from "./AIProviderSettings";
import { AISetupGuide } from "./AISetupGuide";
import { useAppSettings } from "@/context/AppSettingsContext";
import { CLOUD_ENABLED } from "@/cloud/config";
import { useSkins } from "@/context/SkinsContext";
import { useAuth, type AuthProvider } from "@/cloud/context/AuthContext";
import { getSupabaseClient, isSupabaseConfigured, resetSupabaseClient } from "@/cloud/lib/supabase/client";
import {
  getRuntimeSupabaseConfig,
  setRuntimeSupabaseConfig,
  clearRuntimeSupabaseConfig,
  looksLikeSupabaseUrl,
  resolveSupabaseConfig,
} from "@/cloud/lib/supabase/runtime-config";
import type { UserProfile } from "@/types/app-settings";
import {
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
  UI_FONT_SIZE_MAX,
  ANNOTATION_FONT_SIZE_MIN,
  ANNOTATION_FONT_SIZE_MAX,
  ANNOTATION_INDENT_MIN,
  ANNOTATION_INDENT_MAX,
  FILES_PANE_FONT_SIZE_MIN,
  FILES_PANE_FONT_SIZE_MAX,
  PROGRAMMING_LANGUAGES,
  ACCENT_COLOURS,
  CODE_FONT_OPTIONS,
  type ProgrammingLanguageId,
  type ThemeMode,
  type AccentColourId,
  type CodeFontId,
} from "@/types/app-settings";

type SettingsTab = "profile" | "code" | "appearance" | "ai" | "cloud" | "about";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

export function SettingsModal({
  isOpen,
  onClose,
  initialTab = "appearance",
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // Sync activeTab when initialTab prop changes (e.g., when opened from different buttons)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const {
    settings,
    setGlobalCodeFontSize,
    setGlobalChatFontSize,
    setUiFontSize,
    setAnnotationFontSize,
    setAnnotationIndent,
    setFilesPaneFontSize,
    setCodeFont,
    setDefaultLanguage,
    setTheme,
    setAccentColour,
    effectiveTheme,
    profile,
    updateProfile,
    settings: appSettings,
    setCollaborationEnabled,
  } = useAppSettings();

  // Supabase configured at the deployment level (env vars present).
  // The collaboration toggle is shown whenever this is true, regardless
  // of the user's master switch, so it can always be turned back on.
  const supabaseConfigured = isSupabaseConfigured();

  const {
    isAuthenticated,
    profile: authProfile,
    user,
    isSupabaseEnabled,
    signInWithProvider,
    signInWithMagicLink,
    signOut,
    refreshProfile,
  } = useAuth();

  const {
    skinsEnabled,
    setSkinsEnabled,
    activeSkinId,
    setActiveSkinId,
    availableSkins,
    isLoadingManifest,
    activeSkin,
    isLoadingSkin,
    skinForcedMode,
  } = useSkins();

  // Collaboration login state
  const [collabEmail, setCollabEmail] = useState("");
  const [collabLoading, setCollabLoading] = useState<AuthProvider | "email" | "signout" | null>(null);
  const [collabError, setCollabError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Color picker state - track temporary color while user is selecting
  const [tempColor, setTempColor] = useState<string | null>(null);
  const [isSavingColor, setIsSavingColor] = useState(false);

  // Runtime Supabase config form (Cloud Backend section). Local form
  // state mirrors localStorage; Save persists it and reloads the page so
  // every hook picks up the new client.
  const initialRuntime = typeof window !== "undefined" ? getRuntimeSupabaseConfig() : null;
  const resolvedConfig = typeof window !== "undefined" ? resolveSupabaseConfig() : null;
  const [backendUrl, setBackendUrl] = useState(initialRuntime?.url ?? "");
  const [backendKey, setBackendKey] = useState(initialRuntime?.anonKey ?? "");
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendSaving, setBackendSaving] = useState(false);
  const [showBackendForm, setShowBackendForm] = useState(false);

  const handleSaveBackend = () => {
    setBackendError(null);
    const url = backendUrl.trim();
    const key = backendKey.trim();
    if (!url || !key) {
      setBackendError("Both URL and anon key are required.");
      return;
    }
    if (!looksLikeSupabaseUrl(url)) {
      setBackendError("URL must be a valid https:// URL (your Supabase project URL).");
      return;
    }
    setBackendSaving(true);
    setRuntimeSupabaseConfig({ url, anonKey: key });
    resetSupabaseClient();
    // Reload so AuthContext and every Supabase-consuming hook pick up the new client.
    window.location.reload();
  };

  const handleClearBackend = () => {
    if (!window.confirm("Remove your custom Supabase backend? Cloud sync will fall back to env-var config if any, otherwise be disabled. The page will reload.")) {
      return;
    }
    clearRuntimeSupabaseConfig();
    resetSupabaseClient();
    window.location.reload();
  };

  // When logged in, use auth profile name; otherwise use local profile name
  const displayName = isAuthenticated && authProfile?.display_name
    ? authProfile.display_name
    : profile.name;

  if (!isOpen) return null;

  // Collaboration handlers
  const handleProviderSignIn = async (provider: AuthProvider) => {
    setCollabLoading(provider);
    setCollabError(null);
    const { error } = await signInWithProvider(provider);
    if (error) {
      setCollabError(error.message);
      setCollabLoading(null);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collabEmail.trim()) return;
    setCollabLoading("email");
    setCollabError(null);
    setMagicLinkSent(false);
    const { error } = await signInWithMagicLink(collabEmail.trim());
    if (error) {
      setCollabError(error.message);
    } else {
      setMagicLinkSent(true);
    }
    setCollabLoading(null);
  };

  const handleSignOut = async () => {
    setCollabLoading("signout");
    await signOut();
    setCollabLoading(null);
  };

  // The Cloud tab only appears when the build-time CLOUD_ENABLED flag
  // is on. When off (cloud.config.json -> enabled: false), the entire
  // cloud subtree is inert and the tab would have nothing useful to
  // show — hide it from the tablist rather than render a null state.
  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: "Profile", icon: <User className="h-4 w-4" /> },
    { id: "code", label: "Code", icon: <Code className="h-4 w-4" /> },
    { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
    { id: "ai", label: "AI", icon: <Bot className="h-4 w-4" /> },
    ...(CLOUD_ENABLED
      ? [{ id: "cloud" as SettingsTab, label: "Cloud", icon: <Cloud className="h-4 w-4" /> }]
      : []),
    { id: "about", label: "About", icon: <Info className="h-4 w-4" /> },
  ];

  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

  return (
    <div
      className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-popover rounded-sm shadow-lg max-w-lg w-full mx-4 max-h-[85vh] flex flex-col modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment">
          <h2 className="font-display text-lg text-ink">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate hover:text-ink transition-colors"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-parchment px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 font-sans text-body-sm transition-colors relative",
                activeTab === tab.id
                  ? "text-burgundy"
                  : "text-slate-muted hover:text-ink"
              )}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-burgundy" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "profile" && (
            <div className="space-y-4">
              {/* Breadcrumb: cloud sign-in / backend config moved to its
                  own Cloud tab in v4.1 so the considerable explanation
                  it warrants has room to breathe. Profile is now just
                  the user's own identity (name, initials, etc.). The
                  breadcrumb itself is hidden when CLOUD_ENABLED is off,
                  since there's nowhere useful to point. */}
              {CLOUD_ENABLED && (
              <div className="pb-3 border-b border-parchment">
                <p className="font-sans text-[10px] text-slate-muted">
                  Looking for sign-in or shared cloud projects? Cloud
                  collaboration lives in its own tab now — see{" "}
                  <button
                    onClick={() => setActiveTab("cloud")}
                    className="text-burgundy hover:underline"
                  >
                    Settings → Cloud
                  </button>
                  .
                </p>
              </div>
              )}

              {/* Profile fields - Name, Initials, Affiliation on one row */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block font-sans text-[10px] font-medium text-ink mb-1">Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => !isAuthenticated && updateProfile({ name: e.target.value })}
                    placeholder="J. Smith"
                    readOnly={isAuthenticated}
                    className={cn(
                      "w-full px-2 py-1.5 font-sans text-caption border border-parchment-dark rounded-sm transition-colors placeholder:text-slate-muted/50 placeholder:italic",
                      isAuthenticated
                        ? "bg-muted text-slate-muted cursor-not-allowed"
                        : "bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy"
                    )}
                  />
                </div>
                <div className="w-14">
                  <label className="block font-sans text-[10px] font-medium text-ink mb-1">Initials</label>
                  <input
                    type="text"
                    value={profile.initials}
                    onChange={(e) => updateProfile({ initials: e.target.value.toUpperCase().slice(0, 4) })}
                    placeholder="DMB"
                    maxLength={4}
                    className="w-full px-1 py-1.5 font-sans text-caption text-foreground bg-card border border-parchment-dark rounded-sm focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy transition-colors placeholder:text-slate-muted/50 placeholder:italic uppercase text-center"
                  />
                </div>
                <div className="flex-1">
                  <label className="block font-sans text-[10px] font-medium text-ink mb-1">Affiliation</label>
                  <input
                    type="text"
                    value={profile.affiliation}
                    onChange={(e) => updateProfile({ affiliation: e.target.value })}
                    placeholder="University"
                    className="w-full px-2 py-1.5 font-sans text-caption text-foreground bg-card border border-parchment-dark rounded-sm focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy transition-colors placeholder:text-slate-muted/50 placeholder:italic"
                  />
                </div>
              </div>

              {/* Profile Color - only show when authenticated with cloud */}
              {isAuthenticated && (
                <div>
                  <label className="block font-sans text-[10px] font-medium text-ink mb-1">
                    Reply Color <span className="text-slate-muted font-normal">(shows on your replies in shared projects)</span>
                  </label>
                  {authProfile ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        {/* Color preview swatch */}
                        <div
                          className="w-8 h-8 rounded border-2 border-parchment-dark"
                          style={{ backgroundColor: tempColor || authProfile.profile_color || "#6b7280" }}
                        />

                        {/* Color dropdown */}
                        <select
                          value={tempColor || authProfile.profile_color || ""}
                          onChange={(e) => setTempColor(e.target.value)}
                          disabled={isSavingColor}
                          className="font-sans text-[10px] px-2 py-1 rounded border border-parchment-dark bg-parchment disabled:opacity-50"
                        >
                          <option value="">Auto (based on initials)</option>
                          <option value="#ef4444">Red</option>
                          <option value="#f97316">Orange</option>
                          <option value="#eab308">Yellow</option>
                          <option value="#22c55e">Green</option>
                          <option value="#06b6d4">Cyan</option>
                          <option value="#3b82f6">Blue</option>
                          <option value="#8b5cf6">Purple</option>
                          <option value="#ec4899">Pink</option>
                          <option value="#94a3b8">Gray</option>
                          <option value="#78716c">Brown</option>
                        </select>

                        {tempColor !== authProfile.profile_color && (
                          <button
                            onClick={async () => {
                              setIsSavingColor(true);
                              try {
                                const supabase = getSupabaseClient();
                                if (!supabase || !user?.id) {
                                  alert("Not authenticated");
                                  return;
                                }

                                // Update profile color directly
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const { error } = await (supabase as any)
                                  .from("profiles")
                                  .update({ profile_color: tempColor || null })
                                  .eq("id", user.id);

                                if (error) {
                                  console.error("Failed to update color:", error);
                                  alert(`Failed to save color: ${error.message}`);
                                  return;
                                }

                                await refreshProfile();
                                setTempColor(null);
                              } catch (err) {
                                console.error("Failed to update color:", err);
                                alert("Failed to save color. Please try again.");
                              } finally {
                                setIsSavingColor(false);
                              }
                            }}
                            disabled={isSavingColor}
                            className="px-3 py-1 bg-burgundy text-parchment font-sans text-[10px] rounded hover:bg-burgundy-dark disabled:opacity-50"
                          >
                            {isSavingColor ? "Saving..." : "Save"}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-muted italic">
                      Loading profile...
                    </div>
                  )}
                </div>
              )}

              {/* Bio */}
              <div>
                <label className="block font-sans text-[10px] font-medium text-ink mb-1">
                  Bio <span className="text-slate-muted font-normal">(for exports)</span>
                </label>
                <textarea
                  value={profile.bio}
                  onChange={(e) => updateProfile({ bio: e.target.value })}
                  placeholder="Researcher in critical code studies..."
                  rows={2}
                  className="w-full px-2 py-1.5 font-sans text-caption text-foreground bg-card border border-parchment-dark rounded-sm focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy transition-colors resize-none placeholder:text-slate-muted/50 placeholder:italic"
                />
              </div>

              {/* Anonymous Mode */}
              <div className="flex items-center justify-between gap-4 pt-2">
                <div>
                  <span className="font-sans text-[10px] font-medium text-ink">Anonymous Mode</span>
                  <span className="font-sans text-[10px] text-slate-muted ml-1">
                    (exclude profile from exports)
                  </span>
                </div>
                <button
                  onClick={() => updateProfile({ anonymousMode: !profile.anonymousMode })}
                  className={cn(
                    "relative w-8 h-4 rounded-full transition-colors flex-shrink-0",
                    profile.anonymousMode ? "bg-burgundy" : "bg-parchment-dark"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform",
                      profile.anonymousMode ? "translate-x-4" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>
            </div>
          )}

          {activeTab === "code" && (
            <div className="space-y-4">
              <div>
                <h3 className="font-display text-caption text-ink mb-1">Default Programming Language</h3>
                <p className="font-sans text-[10px] text-slate-muted mb-3">
                  Set your preferred programming language. This will be used as context for AI responses and can be overridden in each session.
                </p>

                <select
                  value={settings.defaultLanguage}
                  onChange={(e) => setDefaultLanguage(e.target.value as ProgrammingLanguageId)}
                  className="w-full px-3 py-2 font-sans text-caption text-foreground bg-card border border-parchment-dark rounded-sm focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy transition-colors"
                >
                  {PROGRAMMING_LANGUAGES.map((lang) => (
                    <option key={lang.id} value={lang.id}>
                      {lang.name} {lang.description !== lang.name && `- ${lang.description}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-parchment">
                <p className="font-sans text-[10px] text-slate-muted italic">
                  More code preferences (syntax highlighting theme, tab size) coming soon.
                </p>
              </div>
            </div>
          )}

          {activeTab === "ai" && (
            <div className="space-y-5">
              <AISetupGuide />
              <AIProviderSettings />
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="space-y-4">
              <div>
                <h3 className="font-display text-caption text-ink mb-1">Fonts</h3>
                <p className="font-sans text-[10px] text-slate-muted mb-3">
                  Font family and default sizes. Sizes can be adjusted per-mode using the controls in each view.
                </p>

                {/* Code Font Family */}
                <div className="flex items-center justify-between py-2 border-b border-parchment">
                  <div>
                    <label className="block font-sans text-caption font-medium text-ink">
                      Code Font
                    </label>
                    <p className="font-sans text-[10px] text-slate-muted">
                      Monospace font for code and annotations
                    </p>
                  </div>
                  <select
                    value={settings.codeFont}
                    onChange={(e) => setCodeFont(e.target.value as CodeFontId)}
                    className="px-3 py-1.5 font-sans text-caption text-foreground bg-card border border-parchment-dark rounded-sm focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy transition-colors min-w-[140px]"
                    style={{ fontFamily: CODE_FONT_OPTIONS.find(f => f.id === settings.codeFont)?.family }}
                  >
                    {CODE_FONT_OPTIONS.map((font) => (
                      <option key={font.id} value={font.id}>
                        {font.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Code Font Size */}
                <div className="flex items-center justify-between py-2 border-b border-parchment">
                  <div>
                    <label className="block font-sans text-caption font-medium text-ink">
                      Code Font Size
                    </label>
                    <p className="font-sans text-[10px] text-slate-muted">
                      Default size for code editor
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setGlobalCodeFontSize(settings.codeFontSize - 1)}
                      disabled={settings.codeFontSize <= FONT_SIZE_MIN}
                      className={cn(
                        "p-1 rounded-sm border border-parchment-dark transition-colors",
                        settings.codeFontSize <= FONT_SIZE_MIN
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:border-burgundy hover:text-burgundy"
                      )}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-7 text-center font-mono text-caption">
                      {settings.codeFontSize}
                    </span>
                    <button
                      onClick={() => setGlobalCodeFontSize(settings.codeFontSize + 1)}
                      disabled={settings.codeFontSize >= FONT_SIZE_MAX}
                      className={cn(
                        "p-1 rounded-sm border border-parchment-dark transition-colors",
                        settings.codeFontSize >= FONT_SIZE_MAX
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:border-burgundy hover:text-burgundy"
                      )}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Chat Font Size */}
                <div className="flex items-center justify-between py-2 border-b border-parchment">
                  <div>
                    <label className="block font-sans text-caption font-medium text-ink">
                      Chat Font Size
                    </label>
                    <p className="font-sans text-[10px] text-slate-muted">
                      Default size for conversation text
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setGlobalChatFontSize(settings.chatFontSize - 1)}
                      disabled={settings.chatFontSize <= FONT_SIZE_MIN}
                      className={cn(
                        "p-1 rounded-sm border border-parchment-dark transition-colors",
                        settings.chatFontSize <= FONT_SIZE_MIN
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:border-burgundy hover:text-burgundy"
                      )}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-7 text-center font-mono text-caption">
                      {settings.chatFontSize}
                    </span>
                    <button
                      onClick={() => setGlobalChatFontSize(settings.chatFontSize + 1)}
                      disabled={settings.chatFontSize >= FONT_SIZE_MAX}
                      className={cn(
                        "p-1 rounded-sm border border-parchment-dark transition-colors",
                        settings.chatFontSize >= FONT_SIZE_MAX
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:border-burgundy hover:text-burgundy"
                      )}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* UI Font Size */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="block font-sans text-caption font-medium text-ink">
                      UI Font Size
                    </label>
                    <p className="font-sans text-[10px] text-slate-muted">
                      Size for modals, settings, and windows
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUiFontSize(settings.uiFontSize - 1)}
                      disabled={settings.uiFontSize <= UI_FONT_SIZE_MIN}
                      className={cn(
                        "p-1 rounded-sm border border-parchment-dark transition-colors",
                        settings.uiFontSize <= UI_FONT_SIZE_MIN
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:border-burgundy hover:text-burgundy"
                      )}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-7 text-center font-mono text-caption">
                      {settings.uiFontSize}
                    </span>
                    <button
                      onClick={() => setUiFontSize(settings.uiFontSize + 1)}
                      disabled={settings.uiFontSize >= UI_FONT_SIZE_MAX}
                      className={cn(
                        "p-1 rounded-sm border border-parchment-dark transition-colors",
                        settings.uiFontSize >= UI_FONT_SIZE_MAX
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:border-burgundy hover:text-burgundy"
                      )}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Annotation Display */}
              <div className="pt-3 border-t border-parchment">
                <h3 className="font-display text-caption text-ink mb-1">Annotation Display</h3>
                <p className="font-sans text-[10px] text-slate-muted mb-3">
                  Adjust how annotations appear below code lines.
                </p>

                {/* Annotation Font Size */}
                <div className="flex items-center justify-between py-2 border-b border-parchment">
                  <div>
                    <label className="block font-sans text-caption font-medium text-ink">
                      Font Size
                    </label>
                    <p className="font-sans text-[10px] text-slate-muted">
                      Size for annotation text
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAnnotationFontSize(settings.annotationFontSize - 1)}
                      disabled={settings.annotationFontSize <= ANNOTATION_FONT_SIZE_MIN}
                      className={cn(
                        "p-1 rounded-sm border border-parchment-dark transition-colors",
                        settings.annotationFontSize <= ANNOTATION_FONT_SIZE_MIN
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:border-burgundy hover:text-burgundy"
                      )}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-7 text-center font-mono text-caption">
                      {settings.annotationFontSize}
                    </span>
                    <button
                      onClick={() => setAnnotationFontSize(settings.annotationFontSize + 1)}
                      disabled={settings.annotationFontSize >= ANNOTATION_FONT_SIZE_MAX}
                      className={cn(
                        "p-1 rounded-sm border border-parchment-dark transition-colors",
                        settings.annotationFontSize >= ANNOTATION_FONT_SIZE_MAX
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:border-burgundy hover:text-burgundy"
                      )}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Annotation Indent */}
                <div className="flex items-center justify-between py-2 border-b border-parchment">
                  <div>
                    <label className="block font-sans text-caption font-medium text-ink">
                      Left Indent
                    </label>
                    <p className="font-sans text-[10px] text-slate-muted">
                      Offset from code for readability
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAnnotationIndent(settings.annotationIndent - 8)}
                      disabled={settings.annotationIndent <= ANNOTATION_INDENT_MIN}
                      className={cn(
                        "p-1 rounded-sm border border-parchment-dark transition-colors",
                        settings.annotationIndent <= ANNOTATION_INDENT_MIN
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:border-burgundy hover:text-burgundy"
                      )}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-7 text-center font-mono text-caption">
                      {settings.annotationIndent}
                    </span>
                    <button
                      onClick={() => setAnnotationIndent(settings.annotationIndent + 8)}
                      disabled={settings.annotationIndent >= ANNOTATION_INDENT_MAX}
                      className={cn(
                        "p-1 rounded-sm border border-parchment-dark transition-colors",
                        settings.annotationIndent >= ANNOTATION_INDENT_MAX
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:border-burgundy hover:text-burgundy"
                      )}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>

              </div>

              {/* Files Pane */}
              <div className="pt-3 border-t border-parchment">
                <h3 className="font-display text-caption text-ink mb-1">Files Pane</h3>
                <p className="font-sans text-[10px] text-slate-muted mb-3">
                  Adjust how the code files list appears.
                </p>

                {/* Files Pane Font Size */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="block font-sans text-caption font-medium text-ink">
                      Font Size
                    </label>
                    <p className="font-sans text-[10px] text-slate-muted">
                      Size for file names in sidebar
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setFilesPaneFontSize(settings.filesPaneFontSize - 1)}
                      disabled={settings.filesPaneFontSize <= FILES_PANE_FONT_SIZE_MIN}
                      className={cn(
                        "p-1 rounded-sm border border-parchment-dark transition-colors",
                        settings.filesPaneFontSize <= FILES_PANE_FONT_SIZE_MIN
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:border-burgundy hover:text-burgundy"
                      )}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-7 text-center font-mono text-caption">
                      {settings.filesPaneFontSize}
                    </span>
                    <button
                      onClick={() => setFilesPaneFontSize(settings.filesPaneFontSize + 1)}
                      disabled={settings.filesPaneFontSize >= FILES_PANE_FONT_SIZE_MAX}
                      className={cn(
                        "p-1 rounded-sm border border-parchment-dark transition-colors",
                        settings.filesPaneFontSize >= FILES_PANE_FONT_SIZE_MAX
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:border-burgundy hover:text-burgundy"
                      )}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Mode (Light/Dark/System) */}
              <div className="pt-3 border-t border-parchment">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-caption text-ink">Mode</h3>
                    <p className="font-sans text-[10px] text-slate-muted">
                      Light, dark, or match your system
                    </p>
                  </div>
                  <select
                    value={settings.theme}
                    onChange={(e) => setTheme(e.target.value as ThemeMode)}
                    className="px-3 py-1.5 font-sans text-caption text-foreground bg-card border border-parchment-dark rounded-sm focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy transition-colors"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System</option>
                  </select>
                </div>
              </div>

              {/* Theme (Accent Colour) */}
              <div className={cn(
                "pt-3 border-t border-parchment",
                skinsEnabled && activeSkin && "opacity-50"
              )}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-caption text-ink">Theme</h3>
                    <p className="font-sans text-[10px] text-slate-muted">
                      {skinsEnabled && activeSkin
                        ? "Disabled while skin is active"
                        : "Accent colour for buttons and links"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: `hsl(${
                          effectiveTheme === "dark"
                            ? ACCENT_COLOURS.find((c) => c.id === settings.accentColour)?.hsl.dark
                            : ACCENT_COLOURS.find((c) => c.id === settings.accentColour)?.hsl.light
                        })`
                      }}
                    />
                    <select
                      value={settings.accentColour}
                      onChange={(e) => setAccentColour(e.target.value as AccentColourId)}
                      disabled={skinsEnabled && !!activeSkin}
                      className={cn(
                        "px-3 py-1.5 font-sans text-caption text-foreground bg-card border border-parchment-dark rounded-sm focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy transition-colors",
                        skinsEnabled && activeSkin && "cursor-not-allowed"
                      )}
                    >
                      {ACCENT_COLOURS.map(({ id, name }) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Custom Skins */}
              <div className="pt-3 border-t border-parchment">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-display text-caption text-ink">Custom Skins</h3>
                  </div>
                  <button
                    onClick={() => setSkinsEnabled(!skinsEnabled)}
                    data-skin-protected="true"
                    data-toggle-state={skinsEnabled ? "on" : "off"}
                    className="skin-toggle-button relative w-8 h-4 rounded-full transition-colors flex-shrink-0 appearance-none border-none p-0 cursor-pointer"
                  >
                    <span
                      data-skin-protected="true"
                      data-toggle-state={skinsEnabled ? "on" : "off"}
                      className="skin-toggle-thumb absolute top-0.5 w-3 h-3 rounded-full"
                    />
                  </button>
                </div>

                {skinsEnabled && (
                  <div className="space-y-2">
                    {/* Skin Selection */}
                    <div className="flex items-center justify-between">
                      <label className="font-sans text-caption text-ink">
                        Active Skin
                      </label>
                      <select
                        value={activeSkinId || ""}
                        onChange={(e) => setActiveSkinId(e.target.value || null)}
                        disabled={isLoadingManifest}
                        className="px-3 py-1.5 font-sans text-caption text-foreground bg-card border border-parchment-dark rounded-sm focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy transition-colors min-w-[140px]"
                      >
                        <option value="">None</option>
                        {availableSkins.map((skin) => (
                          <option key={skin.id} value={skin.id}>
                            {skin.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Loading indicator */}
                    {(isLoadingManifest || isLoadingSkin) && (
                      <p className="font-sans text-[10px] text-slate-muted italic">
                        Loading...
                      </p>
                    )}

                    {/* Skin info when active */}
                    {activeSkin && (
                      <div className="bg-cream rounded-sm p-2 space-y-1">
                        <p className="font-sans text-[10px] text-ink">
                          <span className="font-medium">{activeSkin.name}</span>
                          {activeSkin.config.author && (
                            <span className="text-slate-muted"> by {activeSkin.config.author}</span>
                          )}
                        </p>
                        {activeSkin.config.description && (
                          <p className="font-sans text-[10px] text-slate-muted italic">
                            {activeSkin.config.description}
                          </p>
                        )}
                        {skinForcedMode && (
                          <p className="font-sans text-[10px] text-burgundy">
                            This skin forces {skinForcedMode} mode
                          </p>
                        )}
                      </div>
                    )}

                    {/* No skins available */}
                    {!isLoadingManifest && availableSkins.length === 0 && (
                      <p className="font-sans text-[10px] text-slate-muted italic">
                        No skins found. Add skin folders to <code className="font-mono text-[9px] bg-cream px-1 rounded">public/skins/</code> and list them in Skins.md
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "cloud" && (
            <div className="space-y-5">
              {/* Intro: what Cloud is, why it's optional, what it costs
                  to set up, and how it relates to Local. */}
              <div className="space-y-2 pb-3 border-b border-parchment">
                <h3 className="font-display text-base text-ink">Cloud Collaboration</h3>
                <p className="font-sans text-caption text-slate leading-relaxed">
                  CCS-WB has two collaboration tiers, <strong>Local</strong> and{" "}
                  <strong>Cloud</strong>. Most users never need this tab — Local covers
                  annotation, threaded comments on annotations, <code className="font-mono text-[11px] bg-cream px-1 rounded-sm">.ccs</code>{" "}
                  save/load, and merging collaborators&apos; <code className="font-mono text-[11px] bg-cream px-1 rounded-sm">.ccs</code>{" "}
                  files — all fully offline, with no account and no backend.
                </p>
                <p className="font-sans text-caption text-slate leading-relaxed">
                  This tab is for <strong>Cloud</strong>: real-time multi-user sync
                  across the network — shared cloud projects, OAuth sign-in, members,
                  the public library. It is powered by Supabase, which you{" "}
                  <strong>bring your own</strong>: CCS-WB does not ship with a hosted
                  backend. Set up is non-trivial and worth doing only if your workflow
                  genuinely needs live multi-user editing in the same project.
                </p>
              </div>

              {/* Setup overview — collapsed by default to avoid wall-of-text. */}
              <details className="pb-3 border-b border-parchment">
                <summary className="cursor-pointer font-sans text-caption font-medium text-ink hover:text-burgundy">
                  What setting this up actually involves
                </summary>
                <div className="mt-2 space-y-2 font-sans text-[11px] text-slate leading-relaxed">
                  <p>
                    Plain Supabase is a hosted Postgres database with an auth service,
                    row-level security (RLS) policies, and a realtime channel. To use
                    Cloud you need to:
                  </p>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>
                      Create a Supabase project (free tier is enough for small
                      groups — see{" "}
                      <a
                        href="https://supabase.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-burgundy hover:underline inline-flex items-center gap-0.5"
                      >
                        supabase.com <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                      ).
                    </li>
                    <li>
                      Run the SQL schema + RLS policies (~700 lines, in
                      <code className="font-mono text-[10px] bg-cream px-1 rounded-sm mx-0.5">docs/sql/</code>)
                      from the SQL Editor in your Supabase dashboard.
                    </li>
                    <li>
                      Configure OAuth providers (Google / GitHub / Apple) in
                      Supabase Authentication settings if you want social sign-in.
                    </li>
                    <li>
                      Paste this project&apos;s URL + anon key into the form below,
                      hit <em>Save &amp; reload</em>.
                    </li>
                  </ol>
                  <p>
                    Full step-by-step is in{" "}
                    <code className="font-mono text-[10px] bg-cream px-1 rounded-sm">
                      docs/SUPABASE_SETUP.md
                    </code>
                    .
                  </p>
                  <p>
                    <strong className="text-ink">Free-tier caveat:</strong> Supabase
                    auto-pauses idle projects, so the first request of a live session
                    after inactivity can stall briefly while the database wakes. Fine
                    for small groups, plan a warm-up before a workshop.
                  </p>
                  <p>
                    <strong className="text-ink">Privacy:</strong> annotations, code,
                    and replies sync via your Supabase. The CCS-WB deployment never
                    sees your data; the keys here are stored in your browser&apos;s
                    localStorage only.
                  </p>
                </div>
              </details>

              {/* Cloud Backend (Supabase): user-supplied URL + anon key. */}
              <div className="pb-3 border-b border-parchment">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <label className="block font-sans text-caption font-medium text-ink">
                      Cloud Backend (Supabase)
                    </label>
                    <p className="font-sans text-[10px] text-slate-muted mt-0.5">
                      {resolvedConfig
                        ? resolvedConfig.source === "runtime"
                          ? "Using a user-supplied backend (set below)."
                          : "Using the deployment's built-in backend (env vars)."
                        : "Not configured. Local works fully without it; Cloud needs a backend."}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowBackendForm(s => !s)}
                    className="shrink-0 px-2 py-1 text-[10px] bg-cream text-ink border border-parchment-dark rounded-sm hover:border-burgundy transition-colors"
                  >
                    {showBackendForm ? "Hide" : initialRuntime ? "Edit" : "Add"}
                  </button>
                </div>
                {showBackendForm && (
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="block font-sans text-[10px] uppercase tracking-widest text-slate-muted mb-1">
                        Project URL
                      </label>
                      <input
                        type="text"
                        value={backendUrl}
                        onChange={(e) => setBackendUrl(e.target.value)}
                        placeholder="https://abcdefghij.supabase.co"
                        className="w-full px-2.5 py-1.5 bg-card border border-parchment-dark rounded-sm font-mono text-[10px] text-ink placeholder:text-slate-muted focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy"
                      />
                    </div>
                    <div>
                      <label className="block font-sans text-[10px] uppercase tracking-widest text-slate-muted mb-1">
                        Anon (public) key
                      </label>
                      <input
                        type="password"
                        value={backendKey}
                        onChange={(e) => setBackendKey(e.target.value)}
                        placeholder="eyJhbGciOi…"
                        className="w-full px-2.5 py-1.5 bg-card border border-parchment-dark rounded-sm font-mono text-[10px] text-ink placeholder:text-slate-muted focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy"
                      />
                      <p className="mt-1 font-sans text-[10px] text-slate-muted">
                        Stored in your browser only. Use your project&apos;s{" "}
                        <em>anon / public</em> key (Project Settings → API), not the
                        service-role key.
                      </p>
                    </div>
                    {backendError && (
                      <p className="font-sans text-[10px] text-error">{backendError}</p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleSaveBackend}
                        disabled={backendSaving}
                        className="px-2.5 py-1.5 text-[11px] bg-burgundy text-white rounded-sm hover:bg-burgundy/90 transition-colors disabled:opacity-50"
                      >
                        {backendSaving ? "Saving…" : "Save & reload"}
                      </button>
                      {initialRuntime && (
                        <button
                          onClick={handleClearBackend}
                          className="px-2.5 py-1.5 text-[11px] bg-card text-ink border border-parchment-dark rounded-sm hover:border-error transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Cloud collaboration master switch. */}
              {supabaseConfigured && (
                <div className="flex items-center justify-between pb-3 border-b border-parchment">
                  <div className="flex-1 pr-3">
                    <label className="block font-sans text-caption font-medium text-ink">
                      Enable Cloud Collaboration
                    </label>
                    <p className="font-sans text-[10px] text-slate-muted mt-0.5">
                      Master switch for sign-in, shared projects, members, the
                      public library, and real-time sync. Turn off for a clean
                      local-only workbench — no data is sent to or fetched from
                      the cloud. Local is unaffected.
                    </p>
                  </div>
                  <button
                    onClick={() => setCollaborationEnabled(!appSettings.collaborationEnabled)}
                    className={cn(
                      "w-10 h-5 rounded-full transition-colors relative flex-shrink-0",
                      appSettings.collaborationEnabled ? "bg-burgundy" : "bg-parchment"
                    )}
                    aria-pressed={appSettings.collaborationEnabled}
                    aria-label="Toggle cloud collaboration"
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                        appSettings.collaborationEnabled ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              )}

              {/* Sign-in / signed-in state. */}
              {isSupabaseEnabled && (
                <div className="pb-3">
                  {isAuthenticated ? (
                    <div className="flex items-center gap-3">
                      {authProfile?.avatar_url ? (
                        <img src={authProfile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-burgundy/20 flex items-center justify-center">
                          <span className="font-sans text-caption font-medium text-burgundy">
                            {(authProfile?.display_name || user?.email || "U")[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-sans text-caption text-ink truncate">
                          {authProfile?.display_name || user?.email}
                        </p>
                        <p className="font-sans text-[10px] text-slate-muted truncate">
                          {user?.email}
                        </p>
                      </div>
                      <button
                        onClick={handleSignOut}
                        disabled={collabLoading !== null}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 font-sans text-[10px] text-slate-muted hover:text-ink transition-colors",
                          "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                      >
                        {collabLoading === "signout" ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                        Sign out
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="font-sans text-[10px] text-slate-muted">
                        Sign in to collaborate on shared projects
                      </p>
                      {collabError && <p className="font-sans text-[10px] text-error">{collabError}</p>}
                      {magicLinkSent && (
                        <p className="font-sans text-[10px] text-success">
                          Check your email for a sign-in link.
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleProviderSignIn("google")}
                          disabled={collabLoading !== null}
                          className={cn(
                            "flex items-center justify-center gap-1 px-2 py-1.5 bg-white border border-parchment-dark rounded-sm font-sans text-[10px] text-ink hover:bg-cream transition-colors",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                        >
                          {collabLoading === "google" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => handleProviderSignIn("github")}
                          disabled={collabLoading !== null}
                          className={cn(
                            "flex items-center justify-center gap-1 px-2 py-1.5 bg-ink border border-ink rounded-sm font-sans text-[10px] text-ivory hover:bg-ink/90 transition-colors",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                        >
                          {collabLoading === "github" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                            </svg>
                          )}
                        </button>
                        <form onSubmit={handleMagicLink} className="flex gap-1 flex-1">
                          <div className="relative flex-1">
                            <Mail className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-muted" />
                            <input
                              type="email"
                              value={collabEmail}
                              onChange={(e) => setCollabEmail(e.target.value)}
                              placeholder="Email"
                              disabled={collabLoading !== null}
                              className={cn(
                                "w-full pl-7 pr-2 py-1.5 bg-card border border-parchment-dark rounded-sm font-sans text-[10px] text-ink placeholder:text-slate-muted",
                                "focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy",
                                "disabled:opacity-50 disabled:cursor-not-allowed"
                              )}
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={!collabEmail.trim() || collabLoading !== null}
                            className={cn(
                              "px-2 py-1.5 bg-burgundy border border-burgundy rounded-sm font-sans text-[10px] text-ivory hover:bg-burgundy-dark transition-colors",
                              "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                          >
                            {collabLoading === "email" ? <Loader2 className="h-3 w-3 animate-spin" /> : "→"}
                          </button>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Friendly null state when no backend is configured */}
              {!supabaseConfigured && (
                <div className="pb-3 text-center">
                  <p className="font-sans text-[10px] text-slate-muted italic">
                    No backend configured yet. Add one above to enable sign-in
                    and shared projects.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "about" && (
            <div className="space-y-4">
              <div>
                <div className="flex items-start gap-3 mb-2">
                  <img
                    src="/branding/ch/tools/ccs-wb.svg"
                    alt=""
                    className="w-10 h-10 flex-shrink-0 mt-0.5"
                  />
                  <div>
                    <h3 className="font-display text-sm text-ink mb-0.5">
                      Critical Code Studies Workbench
                    </h3>
                    <p className="font-sans text-caption text-slate">
                      A web application for close reading and hermeneutic analysis of software as cultural artefact.
                    </p>
                  </div>
                </div>
                <div className="bg-cream rounded-sm p-3 space-y-1.5">
                  <div className="flex justify-between font-sans text-caption">
                    <span className="text-slate-muted">Version</span>
                    <span className="text-ink font-mono">{appVersion}</span>
                  </div>
                  <div className="flex justify-between font-sans text-caption">
                    <span className="text-slate-muted">Methodology</span>
                    <span className="text-ink">CCS v2.7</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-parchment pt-4">
                <div className="flex items-start gap-3 mb-2">
                  <img
                    src="/branding/ch/logo-mark.svg"
                    alt=""
                    className="w-8 h-8 flex-shrink-0 mt-0.5"
                  />
                  <div>
                    <h4 className="font-display text-caption text-ink mb-0.5">
                      Part of Computational Hermeneutics
                    </h4>
                    <p className="font-sans text-[11px] text-slate-muted leading-snug">
                      Research instruments for computational close reading. CCS-WB is the close-reading register; <a href="https://github.com/Computational-Hermeneutics/Source-Variorum" target="_blank" rel="noopener noreferrer" className="text-burgundy hover:text-burgundy-dark">Source Variorum</a> is the collation register.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-display text-caption text-ink mb-1.5">Acknowledgments</h4>
                <ul className="font-sans text-[10px] text-slate-muted space-y-0.5">
                  <li>Critical code studies methodology inspired by Mark Marino, David M. Berry, and the CCS community</li>
                  <li>Built with Next.js and Tailwind CSS</li>
                  <li>Developed with Claude Code (Anthropic)</li>
                  <li>Co-created at CCSWG 2026</li>
                </ul>
              </div>

              <div>
                <h4 className="font-display text-caption text-ink mb-1.5">Links</h4>
                <div className="space-y-1.5">
                  <a
                    href="https://github.com/Computational-Hermeneutics/CCS-WB"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block font-sans text-caption text-burgundy hover:text-burgundy-dark transition-colors"
                  >
                    GitHub Repository →
                  </a>
                  <a
                    href="https://computational-hermeneutics.github.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block font-sans text-caption text-burgundy hover:text-burgundy-dark transition-colors"
                  >
                    Computational Hermeneutics →
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-parchment">
          <button
            onClick={onClose}
            className="w-full px-3 py-2 font-sans text-caption text-slate hover:text-ink hover:bg-cream rounded-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
