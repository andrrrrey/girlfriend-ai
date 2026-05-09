"use client";
import { useState, useRef, useEffect } from "react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}

export default function FilterDropdown({ label, value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} style={s.wrapper}>
      <button style={s.btn} onClick={() => setOpen(!open)}>
        <span style={s.label}>{label}:</span>
        <span style={s.value}>{selected?.label || "All"}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#969696" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div style={s.dropdown}>
          {options.map((opt) => (
            <button
              key={opt.value}
              style={opt.value === value ? { ...s.option, ...s.optionActive } : s.option}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrapper: {
    position: "relative",
    display: "inline-block",
  },
  btn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 12px",
    height: 34,
    borderRadius: 8,
    border: "1px solid #313131",
    background: "#1a1a1a",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontFamily: "'Syne', sans-serif",
  },
  label: {
    color: "#969696",
    fontSize: 13,
    fontWeight: 500,
  },
  value: {
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
  },
  dropdown: {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    minWidth: "100%",
    maxHeight: 240,
    overflowY: "auto",
    background: "#1e1e1e",
    border: "1px solid #313131",
    borderRadius: 8,
    zIndex: 50,
    padding: 4,
    display: "flex",
    flexDirection: "column",
  },
  option: {
    padding: "8px 12px",
    color: "#bbb",
    fontSize: 13,
    fontFamily: "'Syne', sans-serif",
    fontWeight: 500,
    background: "none",
    border: "none",
    textAlign: "left",
    cursor: "pointer",
    borderRadius: 6,
    whiteSpace: "nowrap",
  },
  optionActive: {
    color: "#fff",
    background: "rgba(249,91,173,0.15)",
  },
};
