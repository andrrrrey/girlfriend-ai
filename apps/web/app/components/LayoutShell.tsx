"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import TopNav from "./TopNav";
import BottomBarMobile from "./BottomBarMobile";

const NO_SHELL_ROUTES = ["/login", "/register", "/verify-email"];

type ActivePage = "home" | "shorts" | "chat" | "gallery" | "generate" | "create-character" | "my-ai" | "admin" | "profile";

function getActivePage(pathname: string): ActivePage | undefined {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/create")) return "create-character";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/generation")) return "generate";
  if (pathname.startsWith("/gallery")) return "gallery";
  if (pathname.startsWith("/shorts")) return "shorts";
  if (pathname.startsWith("/my-ai")) return "my-ai";
  return undefined;
}

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const noShell = NO_SHELL_ROUTES.some((r) => pathname.startsWith(r));
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (noShell) {
    return <>{children}</>;
  }

  return (
    <div className="layout">
      <div
        className={`mobile-overlay${sidebarOpen ? " visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      <Sidebar
        activePage={getActivePage(pathname)}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="main">
        <TopNav onMenuToggle={() => setSidebarOpen((v) => !v)} />
        {children}
      </div>
      <BottomBarMobile />
    </div>
  );
}
