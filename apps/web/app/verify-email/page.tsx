"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Logo from "../components/Logo";

type Status = "loading" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Токен не указан. Проверьте ссылку в письме.");
      return;
    }

    fetch(`/api-proxy/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || "Ошибка верификации");
        }
        return res.json();
      })
      .then((data: { accessToken: string; refreshToken: string }) => {
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);
        setStatus("success");
        setTimeout(() => { window.location.href = "/"; }, 2000);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.message || "Ссылка недействительна или истекла.");
      });
  }, [token]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoRow}>
          <Logo />
        </div>

        {status === "loading" && (
          <>
            <div style={styles.spinner} />
            <p style={styles.text}>Подтверждение email...</p>
          </>
        )}

        {status === "success" && (
          <>
            <div style={styles.iconSuccess}>✓</div>
            <h2 style={styles.title}>Email подтверждён!</h2>
            <p style={styles.text}>Переходим в приложение...</p>
          </>
        )}

        {status === "error" && (
          <>
            <div style={styles.iconError}>✕</div>
            <h2 style={styles.title}>Ошибка верификации</h2>
            <p style={{ ...styles.text, color: "#ff7675" }}>{message}</p>
            <Link href="/register" style={styles.link}>
              Зарегистрироваться заново
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#090909",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: "#1a1a1a",
    border: "1px solid #313131",
    borderRadius: 16,
    padding: "40px 35px",
    width: 420,
    maxWidth: "90vw",
    textAlign: "center" as const,
  },
  logoRow: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 32,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: 700,
    margin: "16px 0 8px",
  },
  text: {
    color: "#969696",
    fontSize: 14,
    margin: "8px 0",
  },
  spinner: {
    width: 48,
    height: 48,
    border: "3px solid #313131",
    borderTop: "3px solid #f95bad",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    margin: "16px auto",
  },
  iconSuccess: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "rgba(249,91,173,0.15)",
    border: "2px solid #f95bad",
    color: "#f95bad",
    fontSize: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto",
  },
  iconError: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "rgba(255,118,117,0.1)",
    border: "2px solid #ff7675",
    color: "#ff7675",
    fontSize: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto",
  },
  link: {
    display: "inline-block",
    marginTop: 20,
    color: "#f95bad",
    textDecoration: "none",
    fontSize: 14,
  },
};
