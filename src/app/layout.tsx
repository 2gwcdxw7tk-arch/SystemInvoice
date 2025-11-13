import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

import { ToastProvider } from "@/components/ui/toast-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ServiceWorkerProvider } from "@/components/providers/service-worker-provider";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";
import { SESSION_COOKIE_NAME, parseSessionCookie, type SessionPayload } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: siteConfig.name,
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): Promise<React.JSX.Element> {
  let session: SessionPayload | null = null;
  try {
    const cookieStore = await cookies();
    const rawSession = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    session = await parseSessionCookie(rawSession);
  } catch (error) {
    console.error("No se pudo recuperar la sesión inicial", error);
    session = null;
  }

  return (
    <html lang="es" suppressHydrationWarning>
      <body className={cn("min-h-screen bg-background font-sans antialiased")}>
        <ThemeProvider>
          <ServiceWorkerProvider>
            <ToastProvider>
              <AppShell session={session}>{children}</AppShell>
            </ToastProvider>
          </ServiceWorkerProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
