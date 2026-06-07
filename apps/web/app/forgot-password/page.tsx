"use client";

import React, { useState } from "react";
import Link from "next/link";
import { auth } from "../../lib/api";
import { useT } from "../../context/language";
import Logo from "../components/Logo";

export default function ForgotPasswordPage() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const result = await auth.forgotPassword(email);
      setSuccess(result.message);
    } catch (err: any) {
      setError(err.message || t("auth.forgotFailed"));
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

        <h1 style={styles.title}>{t("auth.forgotTitle")}</h1>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.successBox}>{success}</div>}

        {!success && (
          <>
            <p style={styles.description}>
              {t("auth.forgotDesc")}
            </p>

            <label style={styles.label}>{t("auth.email")}</label>
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

            <button
              type="submit"
              disabled={submitting}
              style={{ ...styles.button, opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? t("auth.sending") : t("auth.sendLink")}
            </button>
          </>
        )}

        <p style={styles.footer}>
          <Link href="/login" style={styles.link}>
            {t("auth.backToLogin")}
          </Link>
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
    marginBottom: 16,
    marginTop: 0,
  },
  description: {
    color: "#969696",
    fontSize: 14,
    lineHeight: 1.5,
    marginBottom: 16,
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
