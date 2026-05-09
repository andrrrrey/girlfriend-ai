"use client";
import { useAuth } from "../../context/auth";
import { useRouter } from "next/navigation";

interface Props {
  title?: string;
  subtitle?: string;
}

export default function AuthRequiredOverlay({
  title = "Sign in to continue",
  subtitle = "Create an account or sign in to access this content",
}: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();

  if (loading || user) return null;

  return (
    <div style={s.overlay}>
      <div style={s.card}>
        <div style={s.icon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f95bad" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>
        <h2 style={s.title}>{title}</h2>
        <p style={s.subtitle}>{subtitle}</p>
        <div style={s.buttons}>
          <button style={s.primaryBtn} onClick={() => router.push("/login")}>
            Sign In
          </button>
          <button style={s.secondaryBtn} onClick={() => router.push("/register")}>
            Create Account
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    inset: 0,
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.6)",
    backdropFilter: "blur(8px)",
  },
  card: {
    background: "#1a1a1a",
    borderRadius: 16,
    padding: "40px 32px",
    textAlign: "center",
    maxWidth: 380,
    width: "90%",
    border: "1px solid #313131",
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: 700,
    fontFamily: "'Syne', sans-serif",
    margin: "0 0 8px",
  },
  subtitle: {
    color: "#969696",
    fontSize: 14,
    fontFamily: "'Syne', sans-serif",
    margin: "0 0 24px",
    lineHeight: 1.5,
  },
  buttons: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  primaryBtn: {
    width: "100%",
    padding: "12px 0",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, #f95bad, #e0004e)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    fontFamily: "'Syne', sans-serif",
    cursor: "pointer",
  },
  secondaryBtn: {
    width: "100%",
    padding: "12px 0",
    borderRadius: 10,
    border: "1px solid #313131",
    background: "transparent",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "'Syne', sans-serif",
    cursor: "pointer",
  },
};
