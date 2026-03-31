import { AuthProvider } from "../context/auth";
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
          <LayoutShell>{children}</LayoutShell>
        </AuthProvider>
      </body>
    </html>
  );
}
