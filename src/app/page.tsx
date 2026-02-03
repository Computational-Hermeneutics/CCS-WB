"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { useAISettings } from "@/context/AISettingsContext";
import { CCS_EXPERIENCE_LEVELS, EXPERIENCE_LEVEL_LABELS, EXPERIENCE_LEVEL_DESCRIPTIONS, type EntryMode, type ExperienceLevel } from "@/types";
import { cn } from "@/lib/utils";
import { Code, Archive, BookOpen, Sparkles, ChevronDown, FolderOpen, Settings, HelpCircle, X, ExternalLink, Info } from "lucide-react";
import { UserMenu } from "@/components/auth/UserMenu";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { AISettingsPanel } from "@/components/settings/AISettingsPanel";
import { PROVIDER_CONFIGS } from "@/lib/ai/config";
import { APP_VERSION, APP_CREATOR } from "@/lib/config";

interface EntryModeCard {
  mode: EntryMode;
  title: string;
  description: string;
  icon: typeof Code;
}

const entryModes: EntryModeCard[] = [
  {
    mode: "critique",
    title: "I have code to critique",
    description:
      "You have specific code you want to analyse. Let's do a close reading together.",
    icon: Code,
  },
  {
    mode: "interpret",
    title: "I want to interpret code",
    description:
      "You're curious about hermeneutic approaches to code. Let's explore frameworks together.",
    icon: BookOpen,
  },
  {
    mode: "create",
    title: "I want to create code",
    description:
      "Explore algorithms by building them. Create simple versions of ELIZA, poetry generators, and more.",
    icon: Sparkles,
  },
];

export default function WelcomePage() {
  const router = useRouter();
  const { session, initSession, importSession } = useSession();
  const { settings: aiSettings, isConfigured: isAIConfigured, connectionStatus } = useAISettings();
  const [selectedLevel, setSelectedLevel] = useState<ExperienceLevel>("practitioner");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showLevelHelp, setShowLevelHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"code" | "appearance" | "ai" | "about">("appearance");
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSkillDoc, setShowSkillDoc] = useState(false);
  const [skillDocContent, setSkillDocContent] = useState<string>("");
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [isAlphaVersion, setIsAlphaVersion] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CCS Skill document version (matches Critical-Code-Studies-Skill.md)
  const CCS_SKILL_VERSION = "2.4";

  // Detect if we're on alpha/test deployment for visual indicator
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      setIsAlphaVersion(
        hostname.includes('alpha') ||
        hostname.includes('test') ||
        hostname.includes('staging')
      );
    }
  }, []);

  // Fetch latest version from API (ensures it updates without server restart)
  useEffect(() => {
    fetch("/api/version")
      .then(res => res.json())
      .then(data => setAppVersion(data.version))
      .catch(() => {}); // Fall back to imported version
  }, []);

  const handleViewSkillDoc = async () => {
    try {
      const response = await fetch("/api/skill-document");
      if (response.ok) {
        const data = await response.json();
        setSkillDocContent(data.content);
        setShowSkillDoc(true);
      }
    } catch (error) {
      console.error("Failed to load skill document:", error);
    }
  };

  // Check if there's an existing session with content
  const hasExistingSession = session.messages.length > 0;

  const handleModeSelect = (mode: EntryMode) => {
    initSession(mode, selectedLevel);
    router.push("/conversation");
  };

  const handleLoadProjectClick = () => {
    fileInputRef.current?.click();
  };

  // Valid modes for the workbench
  const VALID_MODES: EntryMode[] = ["critique", "interpret", "create"];

  const handleLoadProjectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate that it's a valid session file
      if (!data.messages || !Array.isArray(data.messages)) {
        alert("Invalid project file format. Please select a valid .ccs file.");
        return;
      }

      // Detect and validate mode from file
      const fileMode = data.mode as EntryMode;
      if (!fileMode || !VALID_MODES.includes(fileMode)) {
        alert(`Invalid or missing mode in project file. Expected one of: ${VALID_MODES.join(", ")}`);
        return;
      }

      // Import the session (this will restore the mode and all data)
      importSession(data);

      // Navigate to conversation - the mode is already set in the session
      router.push("/conversation");
    } catch {
      alert("Failed to load project. Please check the file format.");
    }

    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <main className="min-h-screen bg-background relative">
      {/* Subtle paper texture overlay */}
      <div className="paper-texture absolute inset-0" />

      {/* Header - minimal */}
      <header className="border-b border-parchment/50 bg-background/95 backdrop-blur-sm sticky top-0 z-10 relative">
        <div className="max-w-5xl mx-auto px-4 py-1">
          <div className="flex items-center justify-between">
            <h1 className={cn(
              "font-display text-sm tracking-tight relative",
              isAlphaVersion
                ? "text-yellow-600 dark:text-yellow-500"
                : "text-ink"
            )} title={isAlphaVersion ? "Alpha Test Version" : undefined}>
              <span className="hidden sm:inline">Critical Code Studies Workbench</span>
              <span className="sm:hidden">CCS Workbench</span>
              <span className="font-sans text-[9px] text-slate/50 ml-2 align-bottom absolute bottom-0 left-full whitespace-nowrap">
                v{appVersion}
              </span>
            </h1>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowAIPanel(true)}
                className={cn(
                  "font-sans text-[10px] px-2 py-0.5 border rounded-sm transition-colors",
                  !aiSettings.aiEnabled
                    ? "text-red-700 bg-red-50 border-red-200 hover:border-red-400 dark:text-red-400 dark:bg-red-950 dark:border-red-800 dark:hover:border-red-600"
                    : connectionStatus === "success"
                      ? "text-green-700 bg-green-50 border-green-200 hover:border-green-400 dark:text-green-400 dark:bg-green-950 dark:border-green-800 dark:hover:border-green-600"
                      : "text-amber-700 bg-amber-50 border-amber-200 hover:border-amber-400 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800 dark:hover:border-amber-600"
                )}
                title={
                  !aiSettings.aiEnabled
                    ? "AI disabled - click to enable"
                    : connectionStatus === "success"
                      ? "AI connected - click to configure"
                      : connectionStatus === "error"
                        ? "Connection failed - click to configure"
                        : "AI not verified - click to test connection"
                }
              >
                {!aiSettings.aiEnabled ? "AI: Off" : connectionStatus === "success" ? "AI: On" : "AI: ??"}
              </button>
              <button
                onClick={() => setShowHelp(true)}
                className="p-2 md:p-1 rounded-sm transition-colors text-slate hover:text-ink hover:bg-cream"
                aria-label="Help"
                title="Help & Getting Started"
              >
                <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 md:p-1 rounded-sm transition-colors text-slate hover:text-ink hover:bg-cream"
                aria-label="Settings"
                title="Settings"
              >
                <Settings className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        initialTab={settingsTab}
      />

      <AISettingsPanel
        isOpen={showAIPanel}
        onClose={() => setShowAIPanel(false)}
      />

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <div className="bg-popover rounded-sm shadow-editorial-lg w-full max-w-2xl mx-4 border border-parchment max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-parchment">
              <h3 className="font-display text-display-md text-ink">Getting Started</h3>
              <button
                onClick={() => setShowHelp(false)}
                className="p-1 text-slate hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="p-5 space-y-6">
              {/* Version and Creator */}
              <div className="font-mono text-[10px] text-slate-muted">
                <p>v{appVersion} · {APP_CREATOR}</p>
                <p>
                  CCS Methodology{" "}
                  <button
                    onClick={handleViewSkillDoc}
                    className="text-burgundy hover:underline cursor-pointer"
                  >
                    v{CCS_SKILL_VERSION}
                  </button>
                </p>
              </div>

              {/* About the Workbench */}
              <section>
                <h4 className="font-display text-sm text-ink mb-2">About the Workbench</h4>
                <p className="font-body text-sm text-slate leading-relaxed">
                  The Critical Code Studies Workbench facilitates close reading and hermeneutic analysis
                  of software as cultural artefact. It supports code critique and
                  interpretive exploration of algorithms, following the methodology developed by
                  CCS theorists and practitioners.
                </p>
              </section>

              {/* AI Provider Setup */}
              <section>
                <h4 className="font-display text-sm text-ink mb-2">Setting Up an AI Provider</h4>
                <p className="font-body text-sm text-slate leading-relaxed mb-3">
                  The Workbench uses AI to facilitate dialogue about code. You can use cloud providers
                  (Anthropic, OpenAI, Google) with an API key, or run a free local AI using Ollama.
                </p>
                <div className="bg-cream border border-parchment rounded-sm p-4">
                  <p className="font-sans text-xs font-medium text-ink mb-2">Quick Setup Options:</p>
                  <ul className="font-body text-sm text-slate space-y-1">
                    <li>• <strong>Cloud AI:</strong> Click the ⚙️ Settings icon, choose a provider, enter your API key</li>
                    <li>• <strong>Local AI:</strong> Install Ollama (free, private, no API key needed)</li>
                  </ul>
                </div>
              </section>

              {/* Ollama Section */}
              <section>
                <h4 className="font-display text-sm text-ink mb-2">Using Ollama (Free Local AI)</h4>
                <p className="font-body text-sm text-slate leading-relaxed mb-3">
                  Ollama runs large language models locally on your computer. Your code and conversations
                  never leave your machine, making it ideal for sensitive or proprietary code analysis.
                </p>

                <div className="space-y-3">
                  <div className="bg-cream border border-parchment rounded-sm p-4">
                    <p className="font-sans text-xs font-medium text-ink mb-2">1. Install Ollama</p>
                    <p className="font-body text-sm text-slate mb-2">
                      Download from the official website:
                    </p>
                    <a
                      href="https://ollama.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-sans text-sm text-burgundy hover:underline"
                    >
                      ollama.ai <ExternalLink className="h-3 w-3" />
                    </a>
                    <p className="font-body text-xs text-slate-muted mt-2">
                      Available for macOS, Windows, and Linux. On macOS, just download and drag to Applications.
                    </p>
                  </div>

                  <div className="bg-cream border border-parchment rounded-sm p-4">
                    <p className="font-sans text-xs font-medium text-ink mb-2">2. Download a Model</p>
                    <p className="font-body text-sm text-slate mb-2">
                      Open Terminal and run:
                    </p>
                    <code className="block bg-ink text-ivory px-3 py-2 rounded-sm font-mono text-xs">
                      ollama pull llama3.2
                    </code>
                    <p className="font-body text-xs text-slate-muted mt-2">
                      Llama 3.2 (3B) works well for code analysis. For better results, try <code className="bg-parchment px-1 rounded">mistral</code> or <code className="bg-parchment px-1 rounded">codellama</code>.
                    </p>
                  </div>

                  <div className="bg-cream border border-parchment rounded-sm p-4">
                    <p className="font-sans text-xs font-medium text-ink mb-2">3. Start Ollama</p>
                    <p className="font-body text-sm text-slate mb-2">
                      Ollama runs automatically on macOS. If needed, start it manually:
                    </p>
                    <code className="block bg-ink text-ivory px-3 py-2 rounded-sm font-mono text-xs">
                      ollama serve
                    </code>
                  </div>

                  <div className="bg-cream border border-parchment rounded-sm p-4">
                    <p className="font-sans text-xs font-medium text-ink mb-2">4. Configure the Workbench</p>
                    <p className="font-body text-sm text-slate">
                      Click the ⚙️ Settings icon, select &quot;Ollama (Local)&quot; as your provider,
                      and choose your model from the dropdown. The Base URL is usually http://localhost:11434
                    </p>
                  </div>
                </div>
              </section>

              {/* How It Works */}
              <section>
                <h4 className="font-display text-sm text-ink mb-2">How the Workbench Works</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-cream border border-parchment rounded-sm p-3">
                    <p className="font-sans text-xs font-medium text-burgundy mb-1">Code Critique</p>
                    <p className="font-body text-xs text-slate">
                      Paste or upload code for close reading. The AI guides you through lexical,
                      syntactic, semantic, and cultural layers of interpretation.
                    </p>
                  </div>
                  <div className="bg-cream border border-parchment rounded-sm p-3">
                    <p className="font-sans text-xs font-medium text-burgundy mb-1">Interpret Code</p>
                    <p className="font-body text-xs text-slate">
                      Develop hermeneutic frameworks for understanding code as text.
                      Navigate intention, generation, and execution.
                    </p>
                  </div>
                  <div className="bg-cream border border-parchment rounded-sm p-3">
                    <p className="font-sans text-xs font-medium text-burgundy mb-1">Create Code</p>
                    <p className="font-body text-xs text-slate">
                      Vibe coding: build simple versions of ELIZA, poetry generators,
                      and other algorithms to understand them from the inside.
                    </p>
                  </div>
                </div>
              </section>

              {/* Privacy Note */}
              <section className="border-t border-parchment pt-4">
                <p className="font-body text-xs text-slate-muted">
                  <strong className="text-slate">Privacy:</strong> All data is processed transiently and never stored on servers.
                  With Ollama, everything stays on your computer. Export sessions to save your work.
                </p>
              </section>

              {/* Easter egg hint */}
              <p className="text-[9px] text-slate-muted/50 italic mt-3 pt-3 border-t border-parchment/50">
                It looks like you&apos;re reading the help.{" "}
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent("toggle-clippy"))}
                  className="underline hover:text-slate-muted cursor-pointer"
                >
                  Would you like help with that?
                </button>
              </p>

              {/* Close Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setShowHelp(false)}
                  className={cn(
                    "px-4 py-2 font-sans text-sm text-ivory bg-burgundy",
                    "border border-burgundy rounded-sm",
                    "hover:bg-burgundy-dark transition-colors"
                  )}
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Skill Document Viewer Modal */}
      {showSkillDoc && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <div className="bg-popover rounded-sm shadow-editorial-lg w-full max-w-4xl mx-4 border border-parchment max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-parchment">
              <h3 className="font-display text-display-md text-ink">CCS Methodology Framework</h3>
              <button
                onClick={() => setShowSkillDoc(false)}
                className="p-1 text-slate hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap font-mono text-xs text-slate leading-relaxed bg-cream p-4 rounded-sm border border-parchment">
                  {skillDocContent || "Loading..."}
                </pre>
              </div>
              <p className="font-body text-xs text-slate-muted mt-4">
                This methodology document is loaded from <code className="bg-parchment px-1 rounded">Critical-Code-Studies-Skill.md</code> in the project root.
                You can edit this file to customise the CCS methodology used by the workbench.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main content - compact */}
      <div className="max-w-5xl mx-auto px-4 py-6 relative">
        {/* Welcome heading - compact */}
        <div className="text-center mb-6">
          <p className="font-sans text-xs uppercase tracking-widest text-burgundy mb-2">
            Critical Code Studies
          </p>
          <h2 className="font-display text-xl text-ink mb-3 leading-tight">
            What brings you here today?
          </h2>
          <p className="font-body text-sm text-slate max-w-xl mx-auto leading-relaxed">
            Code is a cultural artefact that rewards close reading.
          </p>
        </div>

        {/* Experience level selector - compact */}
        <div className="flex justify-center mb-6">
          <div className="relative flex items-center gap-2">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5",
                "bg-card border border-parchment-dark rounded-sm",
                "hover:border-slate-muted transition-all duration-300",
                "font-sans text-xs text-ink",
                "shadow-editorial",
                isDropdownOpen && "ring-1 ring-burgundy border-burgundy"
              )}
            >
              <span className="text-slate-muted">Experience:</span>
              <span className="font-medium">
                {EXPERIENCE_LEVEL_LABELS[selectedLevel]}
              </span>
              <ChevronDown
                className={cn(
                  "h-3 w-3 text-slate-muted transition-transform duration-300",
                  isDropdownOpen && "rotate-180"
                )}
              />
            </button>

            {/* Help icon for experience levels */}
            <button
              onClick={() => setShowLevelHelp(!showLevelHelp)}
              className="p-2 md:p-1 rounded-sm text-slate-muted hover:text-ink hover:bg-cream transition-colors"
              aria-label="What do experience levels do?"
            >
              <Info className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>

            {/* Experience level dropdown */}
            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-popover rounded-sm shadow-editorial-lg border border-parchment py-1 z-20 animate-fade-in">
                {CCS_EXPERIENCE_LEVELS.map((level) => (
                  <button
                    key={level}
                    onClick={() => {
                      setSelectedLevel(level);
                      setIsDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 font-sans text-xs",
                      "hover:bg-cream transition-colors duration-200",
                      selectedLevel === level &&
                        "bg-burgundy/5 text-burgundy font-medium"
                    )}
                  >
                    {EXPERIENCE_LEVEL_LABELS[level]}
                  </button>
                ))}
              </div>
            )}

            {/* Experience level help popup */}
            {showLevelHelp && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-popover rounded-sm shadow-editorial-lg border border-parchment p-4 z-20 animate-fade-in">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-display text-sm text-ink">Choose your experience</h4>
                  <button
                    onClick={() => setShowLevelHelp(false)}
                    className="p-0.5 text-slate hover:text-ink transition-colors"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </div>
                <div className="space-y-3">
                  {CCS_EXPERIENCE_LEVELS.map((level) => (
                    <div key={level}>
                      <p className="font-sans text-xs font-medium text-burgundy">
                        {EXPERIENCE_LEVEL_LABELS[level]}
                      </p>
                      <p className="font-body text-xs text-slate leading-snug">
                        {EXPERIENCE_LEVEL_DESCRIPTIONS[level]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Entry mode cards - responsive grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl mx-auto">
          {entryModes.map((entry, index) => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.mode}
                onClick={() => handleModeSelect(entry.mode)}
                className={cn(
                  "flex flex-col items-center text-center p-6 md:p-4",
                  "bg-card border border-parchment rounded-sm",
                  "shadow-editorial hover:shadow-editorial-md",
                  "hover:border-parchment-dark hover:-translate-y-0.5",
                  "transition-all duration-300 ease-out",
                  "focus:outline-none focus:ring-1 focus:ring-burgundy focus:ring-offset-1 focus:ring-offset-background",
                  "group min-h-[120px]"
                )}
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-sm flex items-center justify-center mb-2",
                    "bg-cream border border-parchment",
                    "text-burgundy",
                    "group-hover:bg-burgundy group-hover:text-ivory group-hover:border-burgundy",
                    "transition-all duration-300"
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h3 className="font-display text-sm text-ink mb-1 leading-tight">
                  {entry.title}
                </h3>
                <p className="font-body text-xs text-slate leading-snug">
                  {entry.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Footer note with session options - compact */}
        <div className="text-center mt-8">
          <div className="h-px w-24 bg-burgundy/20 mx-auto mb-4" />
          <p className="font-body text-xs text-slate-muted mb-3 max-w-md mx-auto">
            Data processed transiently.{" "}
            <span className="font-medium text-slate">Save projects from within sessions.</span>
          </p>

          {/* Load Project button */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={handleLoadProjectClick}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5",
                "font-sans text-xs text-burgundy",
                "border border-burgundy/30 rounded-sm",
                "hover:bg-burgundy/5 hover:border-burgundy/50",
                "transition-all duration-300"
              )}
            >
              <FolderOpen className="h-3 w-3" strokeWidth={1.5} />
              Load Project
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ccs,.json"
            onChange={handleLoadProjectFile}
            className="hidden"
            aria-label="Load project file"
          />

          {hasExistingSession && (
            <p className="font-body text-xs text-slate-muted mt-2">
              Active session ({session.messages.length} messages).{" "}
              <button
                onClick={() => router.push("/conversation")}
                className="text-burgundy hover:underline"
              >
                Continue
              </button>
            </p>
          )}

          <p className="font-body text-xs text-slate-muted/70 mt-6">
            (CC) 2026 Team Critical Code Studies
          </p>
        </div>
      </div>
    </main>
  );
}
