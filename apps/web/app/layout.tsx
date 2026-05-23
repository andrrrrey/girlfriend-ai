import { AuthProvider } from "../context/auth";
import { GenerationProvider } from "../context/generation";
import LayoutShell from "./components/LayoutShell";
import "./globals.css";

export const metadata = {
  title: "lovecast.AI",
};

export default function RootLayout({ children }: { children: import("react").ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AuthProvider>
          <GenerationProvider>
            <LayoutShell>{children}</LayoutShell>
          </GenerationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
