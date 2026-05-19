"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type {
  AppSettings,
  AppSettingsStorage,
  AppMode,
  FontSizeSettings,
  ProgrammingLanguageId,
  ThemeMode,
  AccentColourId,
  UserProfile,
  CodeFontId,
} from "@/types/app-settings";
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_USER_PROFILE,
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
  ACCENT_COLOURS,
  CODE_FONT_OPTIONS,
} from "@/types/app-settings";

const STORAGE_KEY = "ccs-wb-app-settings";
const PROFILE_STORAGE_KEY = "ccs-wb-user-profile";
const STORAGE_VERSION = "1.0";

interface AppSettingsContextValue {
  settings: AppSettings;
  isLoaded: boolean;

  // Get effective font sizes for a mode (considers overrides)
  getFontSizes: (mode: AppMode) => FontSizeSettings;

  // Update global defaults (clears all mode overrides)
  setGlobalCodeFontSize: (size: number) => void;
  setGlobalChatFontSize: (size: number) => void;

  // Update mode-specific override
  setModeCodeFontSize: (mode: AppMode, size: number) => void;
  setModeChatFontSize: (mode: AppMode, size: number) => void;

  // Reset mode to use global defaults
  resetModeToGlobal: (mode: AppMode) => void;

  // Set default programming language
  setDefaultLanguage: (language: ProgrammingLanguageId) => void;

  // Set UI font size for modals and windows
  setUiFontSize: (size: number) => void;

  // Set annotation display settings
  setAnnotationFontSize: (size: number) => void;
  setAnnotationIndent: (indent: number) => void;

  // Set files pane font size
  setFilesPaneFontSize: (size: number) => void;

  // Set code font
  setCodeFont: (font: CodeFontId) => void;

  // Set theme
  setTheme: (theme: ThemeMode) => void;

  // Get effective theme (resolves "system" to actual theme)
  effectiveTheme: "light" | "dark";

  // Set accent colour
  setAccentColour: (colour: AccentColourId) => void;

  // Toggle cloud collaboration master switch
  setCollaborationEnabled: (enabled: boolean) => void;

  // Clear all settings
  clearSettings: () => void;

  // User profile
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
  clearProfile: () => void;
  getDisplayName: () => string; // Returns initials or name, or empty string
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_USER_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");

  // Detect system theme preference
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemTheme(mediaQuery.matches ? "dark" : "light");

    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Load settings and profile from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: AppSettingsStorage = JSON.parse(stored);
        if (parsed.version === STORAGE_VERSION && parsed.settings) {
          // Migrate old settings that don't have newer fields
          const migratedSettings: AppSettings = {
            ...parsed.settings,
            defaultLanguage: parsed.settings.defaultLanguage ?? "",
            uiFontSize: parsed.settings.uiFontSize ?? DEFAULT_APP_SETTINGS.uiFontSize,
            theme: parsed.settings.theme ?? DEFAULT_APP_SETTINGS.theme,
            accentColour: parsed.settings.accentColour ?? DEFAULT_APP_SETTINGS.accentColour,
            annotationFontSize: parsed.settings.annotationFontSize ?? DEFAULT_APP_SETTINGS.annotationFontSize,
            annotationIndent: parsed.settings.annotationIndent ?? DEFAULT_APP_SETTINGS.annotationIndent,
            filesPaneFontSize: parsed.settings.filesPaneFontSize ?? DEFAULT_APP_SETTINGS.filesPaneFontSize,
            codeFont: parsed.settings.codeFont ?? DEFAULT_APP_SETTINGS.codeFont,
            collaborationEnabled:
              parsed.settings.collaborationEnabled ?? DEFAULT_APP_SETTINGS.collaborationEnabled,
          };
          setSettings(migratedSettings);
        }
      }
    } catch (e) {
      console.error("Failed to load app settings:", e);
    }

    // Load user profile
    try {
      const storedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (storedProfile) {
        const parsed = JSON.parse(storedProfile);
        // Migrate old preferredName to initials if needed
        const migratedProfile = {
          ...DEFAULT_USER_PROFILE,
          ...parsed,
          // If old preferredName exists and no initials, migrate it
          initials: parsed.initials || parsed.preferredName || "",
        };
        // Remove old preferredName field if present
        if ('preferredName' in migratedProfile) {
          delete (migratedProfile as Record<string, unknown>).preferredName;
        }
        setProfile(migratedProfile);
      }
    } catch (e) {
      console.error("Failed to load user profile:", e);
    }

    setIsLoaded(true);
  }, []);

  // Save settings to localStorage on change
  useEffect(() => {
    if (isLoaded) {
      try {
        const storage: AppSettingsStorage = {
          version: STORAGE_VERSION,
          settings,
          lastUpdated: new Date().toISOString(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
      } catch (e) {
        console.error("Failed to save app settings:", e);
      }
    }
  }, [settings, isLoaded]);

  // Save profile to localStorage on change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
      } catch (e) {
        console.error("Failed to save user profile:", e);
      }
    }
  }, [profile, isLoaded]);

  // Get effective font sizes for a mode
  const getFontSizes = useCallback(
    (mode: AppMode): FontSizeSettings => {
      const modeOverride = settings.modeOverrides[mode];
      return {
        codeFontSize: modeOverride?.codeFontSize ?? settings.codeFontSize,
        chatFontSize: modeOverride?.chatFontSize ?? settings.chatFontSize,
      };
    },
    [settings]
  );

  // Clamp font size to valid range
  const clampFontSize = (size: number): number => {
    return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size));
  };

  // Update global code font size (clears all mode overrides for code font)
  const setGlobalCodeFontSize = useCallback((size: number) => {
    const clamped = clampFontSize(size);
    setSettings((prev) => {
      // Clear code font overrides from all modes
      const newOverrides = { ...prev.modeOverrides };
      Object.keys(newOverrides).forEach((mode) => {
        const modeKey = mode as AppMode;
        if (newOverrides[modeKey]) {
          const { codeFontSize: _, ...rest } = newOverrides[modeKey]!;
          if (Object.keys(rest).length === 0) {
            delete newOverrides[modeKey];
          } else {
            newOverrides[modeKey] = rest;
          }
        }
      });
      return {
        ...prev,
        codeFontSize: clamped,
        modeOverrides: newOverrides,
      };
    });
  }, []);

  // Update global chat font size (clears all mode overrides for chat font)
  const setGlobalChatFontSize = useCallback((size: number) => {
    const clamped = clampFontSize(size);
    setSettings((prev) => {
      // Clear chat font overrides from all modes
      const newOverrides = { ...prev.modeOverrides };
      Object.keys(newOverrides).forEach((mode) => {
        const modeKey = mode as AppMode;
        if (newOverrides[modeKey]) {
          const { chatFontSize: _, ...rest } = newOverrides[modeKey]!;
          if (Object.keys(rest).length === 0) {
            delete newOverrides[modeKey];
          } else {
            newOverrides[modeKey] = rest;
          }
        }
      });
      return {
        ...prev,
        chatFontSize: clamped,
        modeOverrides: newOverrides,
      };
    });
  }, []);

  // Update mode-specific code font size
  const setModeCodeFontSize = useCallback((mode: AppMode, size: number) => {
    const clamped = clampFontSize(size);
    setSettings((prev) => ({
      ...prev,
      modeOverrides: {
        ...prev.modeOverrides,
        [mode]: {
          ...prev.modeOverrides[mode],
          codeFontSize: clamped,
        },
      },
    }));
  }, []);

  // Update mode-specific chat font size
  const setModeChatFontSize = useCallback((mode: AppMode, size: number) => {
    const clamped = clampFontSize(size);
    setSettings((prev) => ({
      ...prev,
      modeOverrides: {
        ...prev.modeOverrides,
        [mode]: {
          ...prev.modeOverrides[mode],
          chatFontSize: clamped,
        },
      },
    }));
  }, []);

  // Reset a mode to use global defaults
  const resetModeToGlobal = useCallback((mode: AppMode) => {
    setSettings((prev) => {
      const newOverrides = { ...prev.modeOverrides };
      delete newOverrides[mode];
      return {
        ...prev,
        modeOverrides: newOverrides,
      };
    });
  }, []);

  // Set default programming language
  const setDefaultLanguage = useCallback((language: ProgrammingLanguageId) => {
    setSettings((prev) => ({
      ...prev,
      defaultLanguage: language,
    }));
  }, []);

  // Set UI font size for modals and windows
  const setUiFontSize = useCallback((size: number) => {
    const clamped = Math.max(UI_FONT_SIZE_MIN, Math.min(UI_FONT_SIZE_MAX, size));
    setSettings((prev) => ({
      ...prev,
      uiFontSize: clamped,
    }));
  }, []);

  // Set annotation font size
  const setAnnotationFontSize = useCallback((size: number) => {
    const clamped = Math.max(ANNOTATION_FONT_SIZE_MIN, Math.min(ANNOTATION_FONT_SIZE_MAX, size));
    setSettings((prev) => ({
      ...prev,
      annotationFontSize: clamped,
    }));
  }, []);

  // Set annotation indent
  const setAnnotationIndent = useCallback((indent: number) => {
    const clamped = Math.max(ANNOTATION_INDENT_MIN, Math.min(ANNOTATION_INDENT_MAX, indent));
    setSettings((prev) => ({
      ...prev,
      annotationIndent: clamped,
    }));
  }, []);

  // Set files pane font size
  const setFilesPaneFontSize = useCallback((size: number) => {
    const clamped = Math.max(FILES_PANE_FONT_SIZE_MIN, Math.min(FILES_PANE_FONT_SIZE_MAX, size));
    setSettings((prev) => ({
      ...prev,
      filesPaneFontSize: clamped,
    }));
  }, []);

  // Set code font
  const setCodeFont = useCallback((font: CodeFontId) => {
    setSettings((prev) => ({
      ...prev,
      codeFont: font,
    }));
  }, []);

  // Set theme
  const setTheme = useCallback((theme: ThemeMode) => {
    setSettings((prev) => ({
      ...prev,
      theme,
    }));
  }, []);

  // Set accent colour
  const setAccentColour = useCallback((colour: AccentColourId) => {
    setSettings((prev) => ({
      ...prev,
      accentColour: colour,
    }));
  }, []);

  // Toggle cloud collaboration master switch
  const setCollaborationEnabled = useCallback((enabled: boolean) => {
    setSettings((prev) => ({
      ...prev,
      collaborationEnabled: enabled,
    }));
  }, []);

  // Calculate effective theme (resolves "system" to actual theme)
  const effectiveTheme: "light" | "dark" =
    settings.theme === "system" ? systemTheme : settings.theme;

  // Apply theme class to document
  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    if (effectiveTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [effectiveTheme]);

  // Apply UI font size as CSS variable
  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    root.style.setProperty("--ui-font-size", `${settings.uiFontSize}px`);
  }, [settings.uiFontSize]);

  // Apply annotation display settings as CSS variables
  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    root.style.setProperty("--annotation-font-size", `${settings.annotationFontSize}px`);
    root.style.setProperty("--annotation-indent", `${settings.annotationIndent}px`);
  }, [settings.annotationFontSize, settings.annotationIndent]);

  // Apply files pane font size as CSS variable
  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    root.style.setProperty("--files-pane-font-size", `${settings.filesPaneFontSize}px`);
  }, [settings.filesPaneFontSize]);

  // Apply code font as CSS variable
  useEffect(() => {
    if (typeof document === "undefined") return;

    const fontOption = CODE_FONT_OPTIONS.find(f => f.id === settings.codeFont);
    if (!fontOption) return;

    const root = document.documentElement;
    root.style.setProperty("--code-font-family", fontOption.family);
  }, [settings.codeFont]);

  // Apply accent colour and themed backgrounds as CSS variables
  useEffect(() => {
    if (typeof document === "undefined") return;

    const colourDef = ACCENT_COLOURS.find(c => c.id === settings.accentColour);
    if (!colourDef) return;

    const root = document.documentElement;
    const isDark = effectiveTheme === "dark";

    // Set accent colour
    root.style.setProperty("--burgundy", isDark ? colourDef.hsl.dark : colourDef.hsl.light);

    // Set themed background colours
    root.style.setProperty("--background", isDark ? colourDef.bg.dark : colourDef.bg.light);
    root.style.setProperty("--ivory", isDark ? colourDef.bg.dark : colourDef.bg.light);
    root.style.setProperty("--cream", isDark ? colourDef.cream.dark : colourDef.cream.light);
    root.style.setProperty("--muted", isDark ? colourDef.cream.dark : colourDef.cream.light);
    root.style.setProperty("--parchment", isDark ? colourDef.parchment.dark : colourDef.parchment.light);

    // Also update primary to match accent
    root.style.setProperty("--primary", isDark ? colourDef.hsl.dark : colourDef.hsl.light);
    root.style.setProperty("--ring", isDark ? colourDef.hsl.dark : colourDef.hsl.light);
  }, [settings.accentColour, effectiveTheme]);

  // Inject override styles when a skin is active (so app settings take priority over skin CSS)
  useEffect(() => {
    if (typeof document === "undefined") return;

    const OVERRIDE_STYLE_ID = "ccs-app-settings-override";
    const root = document.documentElement;
    const skinActive = root.classList.contains("skin-active");

    // Remove existing override styles
    const existingStyle = document.getElementById(OVERRIDE_STYLE_ID);
    if (existingStyle) existingStyle.remove();

    // Only inject overrides when skin is active
    if (!skinActive) return;

    // Get code font family
    const fontOption = CODE_FONT_OPTIONS.find(f => f.id === settings.codeFont);
    const codeFontFamily = fontOption?.family || CODE_FONT_OPTIONS[0].family;

    // Build override CSS with !important to override skin styles
    const overrideCSS = `
      /* App Settings Override - Takes priority over skin styles */
      :root.skin-active {
        --ui-font-size: ${settings.uiFontSize}px !important;
        --annotation-font-size: ${settings.annotationFontSize}px !important;
        --annotation-indent: ${settings.annotationIndent}px !important;
        --files-pane-font-size: ${settings.filesPaneFontSize}px !important;
        --code-font-family: ${codeFontFamily} !important;
      }

      /* Override skin font sizes directly on elements */
      .skin-active .cm-editor,
      .skin-active .cm-content,
      .skin-active pre,
      .skin-active code {
        font-family: ${codeFontFamily} !important;
      }

      /* Annotation display settings */
      .skin-active [class*="annotation"] {
        font-size: var(--annotation-font-size) !important;
      }

      /* Files pane font size */
      .skin-active [class*="files-pane"],
      .skin-active [class*="file-list"] {
        font-size: var(--files-pane-font-size) !important;
      }
    `;

    const styleElement = document.createElement("style");
    styleElement.id = OVERRIDE_STYLE_ID;
    styleElement.textContent = overrideCSS;
    // Append to end of head to ensure it loads after skin styles
    document.head.appendChild(styleElement);

    return () => {
      const style = document.getElementById(OVERRIDE_STYLE_ID);
      if (style) style.remove();
    };
  }, [settings.uiFontSize, settings.annotationFontSize, settings.annotationIndent, settings.filesPaneFontSize, settings.codeFont]);

  // Watch for skin-active class changes and re-apply override
  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "class") {
          // Trigger re-render when skin-active changes
          const skinActive = root.classList.contains("skin-active");
          const OVERRIDE_STYLE_ID = "ccs-app-settings-override";
          const existingStyle = document.getElementById(OVERRIDE_STYLE_ID);

          if (!skinActive && existingStyle) {
            // Skin was disabled, remove override styles
            existingStyle.remove();
          } else if (skinActive && !existingStyle) {
            // Skin was enabled, the other useEffect will add the styles
            // Force a small state update to trigger the effect
            // We'll just re-set a CSS variable to trigger a repaint
            root.style.setProperty("--ui-font-size", `${settings.uiFontSize}px`);
          }
        }
      }
    });

    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, [settings.uiFontSize]);

  // Clear all settings
  const clearSettings = useCallback(() => {
    setSettings(DEFAULT_APP_SETTINGS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Update user profile
  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile((prev) => ({
      ...prev,
      ...updates,
    }));
  }, []);

  // Clear user profile
  const clearProfile = useCallback(() => {
    setProfile(DEFAULT_USER_PROFILE);
    localStorage.removeItem(PROFILE_STORAGE_KEY);
  }, []);

  // Get display name (initials only - no fallback to name)
  // Users must explicitly set initials for annotation attribution
  const getDisplayName = useCallback(() => {
    return profile.initials.trim();
  }, [profile.initials]);

  return (
    <AppSettingsContext.Provider
      value={{
        settings,
        isLoaded,
        getFontSizes,
        setGlobalCodeFontSize,
        setGlobalChatFontSize,
        setModeCodeFontSize,
        setModeChatFontSize,
        resetModeToGlobal,
        setDefaultLanguage,
        setUiFontSize,
        setAnnotationFontSize,
        setAnnotationIndent,
        setFilesPaneFontSize,
        setCodeFont,
        setTheme,
        effectiveTheme,
        setAccentColour,
        setCollaborationEnabled,
        clearSettings,
        profile,
        updateProfile,
        clearProfile,
        getDisplayName,
      }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (!context) {
    throw new Error("useAppSettings must be used within an AppSettingsProvider");
  }
  return context;
}
