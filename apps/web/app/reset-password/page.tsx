"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { auth } from "../../lib/api";
import Logo from "../components/Logo";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  if (!token) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logoRow}><Logo /></div>
          <div style={styles.iconError}>✕</div>
          <h2 style={styles.titleCenter}>Ошибка</h2>
          <p style={{ ...styles.text, color: "#ff7675" }}>Токен не указан. Проверьте ссылку в письме.</p>
          <a href="/forgot-password" style={styles.linkBlock}>Запросить новую ссылку</a>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logoRow}><Logo /></div>
          <div style={styles.iconSuccess}>✓</div>
          <h2 style={styles.titleCenter}>Пароль изменён!</h2>
          <p style={styles.text}>Переходим на страницу входа...</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

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
      await auth.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => { window.location.href = "/login"; }, 2000);
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
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
        <div style={styles.logoRow}><Logo /></div>

        <h1 style={styles.title}>Новый пароль</h1>

        {error && <div style={styles.error}>{error}</div>}

        <label style={styles.label}>Новый пароль</label>
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
          onFocus={() => setFocusedField("confirm")}
          onBlur={() => setFocusedField(null)}
          required
          style={inputStyle("confirm")}
          placeholder="Повторите пароль"
        />

        <button
          type="submit"
          disabled={submitting}
          style={{ ...styles.button, opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? "Сохранение..." : "Сохранить пароль"}
        </button>

        <p style={styles.footer}>
          <a href="/login" style={styles.link}>Вернуться ко входу</a>
        </p>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
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
  titleCenter: {
    color: "#fff",
    fontSize: 22,
    fontWeight: 700,
    margin: "16px 0 8px",
    textAlign: "center" as const,
  },
  text: {
    color: "#969696",
    fontSize: 14,
    margin: "8px 0",
    textAlign: "center" as const,
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
  linkBlock: {
    display: "block",
    marginTop: 20,
    color: "#f95bad",
    textDecoration: "none",
    fontSize: 14,
    textAlign: "center" as const,
  },
  footer: {
    color: "#969696",
    fontSize: 13,
    marginTop: 20,
    textAlign: "center" as const,
  },
  link: { color: "#f95bad", textDecoration: "none" },
};
