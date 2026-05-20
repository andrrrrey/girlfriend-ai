"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ErrorBoundary]", error);
  }, [error]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "60vh", gap: 16, padding: 24, textAlign: "center",
    }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f95bad" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#fff" }}>Something went wrong</h2>
      <p style={{ fontSize: 14, color: "#969696", margin: 0, maxWidth: 400 }}>
        An error occurred while loading this page.
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: 8, padding: "10px 24px", background: "linear-gradient(90deg, #f95bad, #ff0084)",
          border: "none", borderRadius: 6, color: "#fff", fontSize: 14, fontWeight: 600,
          cursor: "pointer", fontFamily: "'Syne', sans-serif",
        }}
      >
        Try again
      </button>
    </div>
  );
}
