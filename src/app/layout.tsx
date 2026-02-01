import type { Metadata } from "next";
import { Libre_Baskerville, Source_Serif_4, Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/context/SessionContext";
import { AISettingsProvider } from "@/context/AISettingsContext";
import { AppSettingsProvider } from "@/context/AppSettingsContext";
import { SkinsProvider } from "@/context/SkinsContext";
import { AuthProvider } from "@/context/AuthContext";
import { ProjectsProvider } from "@/context/ProjectsContext";
import { LoginModal } from "@/components/auth/LoginModal";
import { ProjectsModal } from "@/components/projects/ProjectsModal";
import { MembersModal } from "@/components/projects/MembersModal";
import { LibraryModal } from "@/components/projects/LibraryModal";
import { AdminModal } from "@/components/projects/AdminModal";
import { ProjectSyncBanner } from "@/components/projects/ProjectSyncBanner";
import { Clippy } from "@/components/easter-eggs/Clippy";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-libre-baskerville",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-source-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Critical Code Studies Workbench",
  description:
    "Annotation and digital methods for the hermeneutic analysis of code. Available as a web app or desktop application.",
  keywords: [
    "critical code studies",
    "code hermeneutics",
    "software analysis",
    "code archaeology",
    "digital humanities",
    "code annotation",
  ],
  openGraph: {
    title: "Critical Code Studies Workbench",
    description:
      "Annotation and digital methods for the hermeneutic analysis of code. Available as a web app or desktop application.",
    type: "website",
    siteName: "CCS Workbench",
  },
  twitter: {
    card: "summary",
    title: "Critical Code Studies Workbench",
    description:
      "Annotation and digital methods for the hermeneutic analysis of code.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${libreBaskerville.variable} ${sourceSerif.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* PWA Configuration */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover" />
        <meta name="theme-color" content="#7D4A3A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CCS Workbench" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />

        {/* Google Fonts for code font options */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=IBM+Plex+Mono:wght@400;500&family=Inconsolata:wght@400;500&family=JetBrains+Mono:wght@400;500&family=Roboto+Mono:wght@400;500&family=Source+Code+Pro:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* Inline script to prevent dark mode flash - runs before React hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('ccs-wb-settings');
                  if (stored) {
                    var parsed = JSON.parse(stored);
                    var theme = parsed.settings && parsed.settings.theme;
                    var isDark = theme === 'dark' ||
                      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                    if (isDark) {
                      document.documentElement.classList.add('dark');
                    }
                  }
                } catch (e) {}
              })();
            `,
          }}
        />

        {/* Disable Vercel Toolbar */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.vercelToolbarEnabled = false;`,
          }}
        />

        {/* Service Worker Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/service-worker.js').then(
                    function(registration) {
                      console.log('[SW] Registration successful:', registration.scope);
                    },
                    function(error) {
                      console.log('[SW] Registration failed:', error);
                    }
                  );
                });
              }
            `,
          }}
        />

        {/* Yellow favicon for alpha/test version - runs immediately */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Check if we're on alpha deployment
                if (window.location.hostname.includes('alpha') ||
                    window.location.hostname.includes('test') ||
                    window.location.hostname.includes('staging')) {

                  // Remove ALL existing favicons (Next.js adds them automatically)
                  var existingIcons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
                  existingIcons.forEach(function(icon) {
                    if (icon && icon.parentNode) {
                      icon.parentNode.removeChild(icon);
                    }
                  });

                  // Create and inject yellow favicon
                  var link = document.createElement('link');
                  link.rel = 'icon';
                  link.type = 'image/svg+xml';
                  link.href = '/icon-yellow.svg';
                  if (document.head) {
                    document.head.appendChild(link);
                  }

                  // Also watch for Next.js trying to re-add the default icon
                  var observer = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                      mutation.addedNodes.forEach(function(node) {
                        if (node.tagName === 'LINK' &&
                            (node.rel === 'icon' || node.rel === 'shortcut icon') &&
                            !node.href.includes('icon-yellow.svg')) {
                          if (node.parentNode) {
                            node.parentNode.removeChild(node);
                          }
                        }
                      });
                    });
                  });
                  if (document.head) {
                    observer.observe(document.head, { childList: true, subtree: true });
                  }
                }
              })();
            `,
          }}
        />
      </head>
      <body className="font-body antialiased bg-ivory text-ink selection:bg-burgundy/20 selection:text-burgundy-900">
        <AppSettingsProvider>
          <SkinsProvider>
            <AISettingsProvider>
              <AuthProvider>
                <SessionProvider>
                  <ProjectsProvider>
                    {children}
                    <ProjectsModal />
                    <MembersModal />
                    <LibraryModal />
                    <AdminModal />
                    <ProjectSyncBanner />
                    <Clippy />
                    <InstallPrompt />
                  </ProjectsProvider>
                </SessionProvider>
                <LoginModal />
              </AuthProvider>
            </AISettingsProvider>
          </SkinsProvider>
        </AppSettingsProvider>
        {/* Skin credit box - hidden by default, skins can show and style this */}
        <div id="skin-credit-box" className="skin-credit-box" aria-hidden="true">
          <div className="skin-credit-header">My Friend Space !!!</div>
          <div className="skin-credit-content">
            <div className="skin-credit-avatar"></div>
            <div className="skin-credit-name">Tom</div>
            <div className="skin-credit-text">You have 1 friends.</div>
            <div className="skin-credit-link">Sign My Guestbook!</div>
          </div>
        </div>
        {/* Skin webring box - for Geocities-style webring */}
        <div id="skin-webring-box" className="skin-webring-box" aria-hidden="true">
          <div className="skin-webring-logo">GEOCITIES.ws</div>
          <div className="skin-webring-tagline">YOUR HOME ON THE WEB</div>
          <div className="skin-webring-content">
            <div className="skin-webring-graphic"></div>
            <div className="skin-webring-nav">
              <span>Home</span> | <span>Hub</span> | <span>List</span> | <span>Skip</span> | <span>Next 5</span>
              <br />&lt;&lt; <span>Prev</span> | <span>Next</span> &gt;&gt;
            </div>
          </div>
          <div className="skin-webring-title">WEBRING</div>
        </div>
      </body>
    </html>
  );
}
