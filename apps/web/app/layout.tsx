import { AuthProvider } from "../context/auth";

export const metadata = {
  title: "Leonardo AI - Hover Interaction",
};

export default function RootLayout({ children }: { children: import("react").ReactNode }) {
  return (
    <html lang="ru">
      <body style={{ margin: 0 }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
