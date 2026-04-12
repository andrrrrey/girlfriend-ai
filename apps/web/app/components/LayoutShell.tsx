"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import TopNav from "./TopNav";

const NO_SHELL_ROUTES = ["/login", "/register"];

type ActivePage = "home" | "shorts" | "chat" | "gallery" | "generate" | "create-character" | "my-ai" | "admin";

function getActivePage(pathname: string): ActivePage | undefined {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/create")) return "create-character";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/profile")) return "admin";
  if (pathname.startsWith("/generation")) return "generate";
  return undefined;
}

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const noShell = NO_SHELL_ROUTES.some((r) => pathname.startsWith(r));

  if (noShell) {
    return <>{children}</>;
  }

  return (
    <div className="layout">
      <Sidebar activePage={getActivePage(pathname)} />
      <div className="main">
        <TopNav />
        {children}
      </div>
    </div>
  );
}
