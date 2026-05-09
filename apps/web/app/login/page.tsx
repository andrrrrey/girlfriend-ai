"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useAuth } from "../../context/auth";
import { auth } from "../../lib/api";
import Logo from "../components/Logo";
import TurnstileWidget from "../components/TurnstileWidget";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(undefined);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d: { turnstileSiteKey: string | null }) => setTurnstileSiteKey(d.turnstileSiteKey))
      .catch(() => {});
  }, []);

  const handleTurnstileVerify = useCallback((token: string) => setTurnstileToken(token), []);
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(undefined), []);

  const canSubmit = !turnstileSiteKey || !!turnstileToken;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password, turnstileToken);
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.page}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.logoRow}>
          <Logo />
        </div>

        <h1 style={styles.title}>Вход</h1>

        {error && (
          <div style={styles.error}>
            {error}
            {error === "Please verify your email first" && !verificationSent && (
              <button
                onClick={async () => {
                  try {
                    await auth.resendVerification(email);
                    setVerificationSent(true);
                  } catch {}
                }}
                style={{
                  display: "block",
                  marginTop: 8,
                  background: "none",
                  border: "none",
                  color: "#f95bad",
                  cursor: "pointer",
                  fontSize: 13,
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Отправить письмо повторно
              </button>
            )}
            {verificationSent && (
              <span style={{ display: "block", marginTop: 8, color: "#c1f0aa", fontSize: 13 }}>
                Письмо отправлено!
              </span>
            )}
          </div>
        )}

        <label style={styles.label}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => setFocusedField("email")}
          onBlur={() => setFocusedField(null)}
          required
          style={{
            ...styles.input,
            borderColor: focusedField === "email" ? "#f95bad" : "#313131",
            boxShadow: focusedField === "email" ? "0 0 0 2px rgba(249,91,173,0.15)" : "none",
          }}
          placeholder="email@example.com"
        />

        <label style={styles.label}>Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={() => setFocusedField("password")}
          onBlur={() => setFocusedField(null)}
          required
          style={{
            ...styles.input,
            borderColor: focusedField === "password" ? "#f95bad" : "#313131",
            boxShadow: focusedField === "password" ? "0 0 0 2px rgba(249,91,173,0.15)" : "none",
          }}
          placeholder="Введите пароль"
        />

        <div style={{ textAlign: "right" as const, marginTop: 8 }}>
          <a href="/forgot-password" style={styles.link}>Забыли пароль?</a>
        </div>

        {turnstileSiteKey && (
          <TurnstileWidget
            siteKey={turnstileSiteKey}
            onVerify={handleTurnstileVerify}
            onExpire={handleTurnstileExpire}
          />
        )}

        <button
          type="submit"
          disabled={submitting || !canSubmit}
          style={{ ...styles.button, opacity: submitting || !canSubmit ? 0.7 : 1 }}
        >
          {submitting ? "Вход..." : "Войти"}
        </button>

        <p style={styles.footer}>
          Нет аккаунта?{" "}
          <a href="/register" style={styles.link}>
            Регистрация
          </a>
        </p>
      </form>
    </div>
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
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 24,
    marginTop: 0,
  },
  label: {
    display: "block",
    color: "#969696",
    fontSize: 12,
    fontWeight: 500,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    width: "100%",
    background: "#111",
    border: "1px solid #313131",
    borderRadius: 8,
    padding: "12px 15px",
    color: "#fff",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  },
  button: {
    width: "100%",
    background: "linear-gradient(135deg, #f95bad, #e0359e)",
    border: "none",
    color: "#fff",
    padding: 14,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 28,
    transition: "opacity 0.15s ease",
  },
  error: {
    background: "rgba(255,118,117,0.1)",
    border: "1px solid rgba(255,118,117,0.4)",
    borderRadius: 8,
    padding: "10px 14px",
    color: "#ff7675",
    fontSize: 13,
    marginBottom: 10,
  },
  footer: {
    color: "#969696",
    fontSize: 13,
    marginTop: 20,
    textAlign: "center" as const,
  },
  link: { color: "#f95bad", textDecoration: "none" },
};
