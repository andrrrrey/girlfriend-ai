import { AuthProvider } from "../context/auth";
import { GenerationProvider } from "../context/generation";
import { LanguageProvider } from "../context/language";
import { ContentModeProvider } from "../context/contentMode";
import LayoutShell from "./components/LayoutShell";
import ServiceWorkerInit from "./components/ServiceWorkerInit";
import MediaErrorHandler from "./components/MediaErrorHandler";
import NotificationPermissionInit from "./components/NotificationPermissionInit";
import "./globals.css";

export const metadata = {
  title: "virtflirt.ai",
};

export default function RootLayout({ children }: { children: import("react").ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerInit />
        <MediaErrorHandler />
        <AuthProvider>
          <NotificationPermissionInit />
          <LanguageProvider>
            <ContentModeProvider>
              <GenerationProvider>
                <LayoutShell>{children}</LayoutShell>
              </GenerationProvider>
            </ContentModeProvider>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
