"use client";

import React, { useState } from "react";
import { useAuth } from "../../context/auth";

export default function RegisterPage() {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      await register(email, password);
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.page}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.logoRow}>
          <div style={styles.logoBox} />
          <span style={styles.logoText}>Leonardo.Ai</span>
        </div>

        <h1 style={styles.title}>Регистрация</h1>

        {error && <div style={styles.error}>{error}</div>}

        <label style={styles.label}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={styles.input}
          placeholder="email@example.com"
        />

        <label style={styles.label}>Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={styles.input}
          placeholder="Минимум 6 символов"
        />

        <label style={styles.label}>Подтверждение пароля</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          style={styles.input}
          placeholder="Повторите пароль"
        />

        <button type="submit" disabled={submitting} style={styles.button}>
          {submitting ? "Создание..." : "Создать аккаунт"}
        </button>

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
    background: "#0b0512",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: "#120a1d",
    border: "1px solid #3d2b55",
    borderRadius: 16,
    padding: "40px 35px",
    width: 400,
    maxWidth: "90vw",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 30,
  },
  logoBox: {
    width: 30,
    height: 30,
    background: "linear-gradient(135deg, #a29bfe, #6c5ce7)",
    borderRadius: 6,
  },
  logoText: { color: "#fff", fontSize: 18, fontWeight: "bold" as const },
  title: { color: "#fff", fontSize: 24, marginBottom: 25 },
  label: {
    display: "block",
    color: "#a0a0a0",
    fontSize: 12,
    marginBottom: 8,
    marginTop: 15,
  },
  input: {
    width: "100%",
    background: "rgba(0,0,0,0.2)",
    border: "1px solid #3d2b55",
    borderRadius: 8,
    padding: "12px 15px",
    color: "#fff",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
  },
  button: {
    width: "100%",
    background: "#6c5ce7",
    border: "none",
    color: "#fff",
    padding: 14,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: "bold" as const,
    cursor: "pointer",
    marginTop: 25,
  },
  error: {
    background: "rgba(255,118,117,0.15)",
    border: "1px solid #ff7675",
    borderRadius: 8,
    padding: "10px 14px",
    color: "#ff7675",
    fontSize: 13,
    marginBottom: 10,
  },
  footer: { color: "#a0a0a0", fontSize: 13, marginTop: 20, textAlign: "center" as const },
  link: { color: "#6c5ce7", textDecoration: "none" },
};
