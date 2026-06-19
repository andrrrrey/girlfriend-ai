import { AuthProvider } from "../context/auth";
import { GenerationProvider } from "../context/generation";
import { LanguageProvider } from "../context/language";
import LayoutShell from "./components/LayoutShell";
import ServiceWorkerInit from "./components/ServiceWorkerInit";
import "./globals.css";

export const metadata = {
  title: "virtflirt.ai",
};

export default function RootLayout({ children }: { children: import("react").ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerInit />
        <AuthProvider>
          <LanguageProvider>
            <GenerationProvider>
              <LayoutShell>{children}</LayoutShell>
            </GenerationProvider>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
