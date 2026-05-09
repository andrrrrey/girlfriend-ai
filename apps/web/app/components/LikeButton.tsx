"use client";
import { useState } from "react";
import { useAuth } from "../../context/auth";
import { useRouter } from "next/navigation";
import { likes } from "../../lib/api";

interface Props {
  targetType: string;
  targetId: string;
  initialLiked?: boolean;
  initialCount?: number;
  size?: "sm" | "md" | "lg";
  showCount?: boolean;
  onToggle?: (liked: boolean, count: number) => void;
}

const SIZES = { sm: 14, md: 18, lg: 22 };

export default function LikeButton({
  targetType,
  targetId,
  initialLiked = false,
  initialCount = 0,
  size = "md",
  showCount = true,
  onToggle,
}: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  const iconSize = SIZES[size];

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      router.push("/login");
      return;
    }
    if (loading) return;

    const newLiked = !liked;
    const newCount = newLiked ? count + 1 : count - 1;
    setLiked(newLiked);
    setCount(newCount);
    setLoading(true);

    try {
      const result = await likes.toggle(targetType, targetId);
      setLiked(result.liked);
      setCount(result.count);
      onToggle?.(result.liked, result.count);
    } catch {
      setLiked(!newLiked);
      setCount(count);
    } finally {
      setLoading(false);
    }
  };

  const formatCount = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <button onClick={handleClick} style={s.btn} title={liked ? "Unlike" : "Like"}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill={liked ? "#f95bad" : "none"}
        stroke={liked ? "#f95bad" : "#fff"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: "fill 0.2s, stroke 0.2s" }}
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {showCount && count > 0 && (
        <span style={s.count}>{formatCount(count)}</span>
      )}
    </button>
  );
}

const s: Record<string, React.CSSProperties> = {
  btn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
  },
  count: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "'Syne', sans-serif",
    fontWeight: 600,
  },
};
