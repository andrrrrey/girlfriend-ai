"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useAuth } from "../../context/auth";
import Logo from "../components/Logo";
import TurnstileWidget from "../components/TurnstileWidget";

export default function RegisterPage() {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(undefined);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);

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
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    if (password.length < 6) {
      setError("Минимум 6 символов");
      return;
    }

    setSubmitting(true);
    try {
      const result = await register(email, password, turnstileToken);
      if (result && (result as any).message) {
        setSuccess(`Письмо с подтверждением отправлено на ${email}. Проверьте почту.`);
      } else {
        window.location.href = "/";
      }
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = (field: string): React.CSSProperties => ({
    ...styles.input,
    borderColor: focusedField === field ? "#f95bad" : "#313131",
    boxShadow: focusedField === field ? "0 0 0 2px rgba(249,91,173,0.15)" : "none",
  });

  return (
    <div style={styles.page}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.logoRow}>
          <Logo />
        </div>

        <h1 style={styles.title}>Регистрация</h1>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.successBox}>{success}</div>}

        {!success && (
          <>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              required
              style={inputStyle("email")}
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
              style={inputStyle("password")}
              placeholder="Минимум 6 символов"
            />

            <label style={styles.label}>Подтверждение пароля</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onFocus={() => setFocusedField("confirmPassword")}
              onBlur={() => setFocusedField(null)}
              required
              style={inputStyle("confirmPassword")}
              placeholder="Повторите пароль"
            />

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
              {submitting ? "Создание..." : "Создать аккаунт"}
            </button>
          </>
        )}

        <p style={styles.footer}>
          Уже есть аккаунт?{" "}
          <a href="/login" style={styles.link}>
            Войти
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
  successBox: {
    background: "rgba(249,91,173,0.1)",
    border: "1px solid rgba(249,91,173,0.4)",
    borderRadius: 8,
    padding: "14px",
    color: "#f95bad",
    fontSize: 14,
    marginBottom: 10,
    lineHeight: 1.5,
  },
  footer: {
    color: "#969696",
    fontSize: 13,
    marginTop: 20,
    textAlign: "center" as const,
  },
  link: { color: "#f95bad", textDecoration: "none" },
};
