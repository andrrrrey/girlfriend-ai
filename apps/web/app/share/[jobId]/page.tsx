"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPublicGalleryItem, resizedMediaUrl } from "../../../lib/api";
import type { GalleryItem } from "../../../lib/api";
import { useT } from "../../../context/language";

export default function SharePage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useT();
  const jobId = Array.isArray(params?.jobId) ? params.jobId[0] : (params?.jobId as string | undefined);

  const [item, setItem] = useState<GalleryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    setNotFound(false);
    getPublicGalleryItem(jobId)
      .then((data) => setItem(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [jobId]);

  const url = item?.output?.url ?? null;
  const isVideo = item?.type === "video";
  const prompt = item?.input?.prompt || "";
  const creator = item?.user;

  return (
    <div style={s.page}>
      {loading ? (
        <div style={s.skeleton} />
      ) : notFound || !item || !url ? (
        <div style={s.empty}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#969696" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>{t("share.notFound")}</span>
          <button style={s.cta} onClick={() => router.push("/gallery")}>{t("nav.gallery")}</button>
        </div>
      ) : (
        <div style={s.card}>
          <div style={s.mediaWrap}>
            {isVideo ? (
              <video style={s.media} src={url} controls autoPlay loop playsInline />
            ) : (
              <img style={s.media} src={resizedMediaUrl(url, { w: 1080 }) ?? url} alt={prompt || "Shared media"} decoding="async" />
            )}
          </div>

          {prompt && <p style={s.prompt}>{prompt}</p>}

          <div style={s.footer}>
            {creator && (
              <div style={s.creator}>
                {creator.avatarUrl ? (
                  <img style={s.avatar} src={resizedMediaUrl(creator.avatarUrl, { w: 96 }) ?? creator.avatarUrl} alt="" />
                ) : (
                  <div style={{ ...s.avatar, background: "#2d1b3d" }} />
                )}
                <span style={s.creatorName}>{creator.nickname || "Anonymous"}</span>
              </div>
            )}
            <button style={s.cta} onClick={() => router.push("/gallery")}>{t("nav.gallery")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "calc(100vh - 46px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  skeleton: { width: "min(520px, 92vw)", aspectRatio: "22 / 30", borderRadius: 12, background: "#1e1e1e" },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16, color: "#969696", fontSize: 14 },
  card: { display: "flex", flexDirection: "column", gap: 16, width: "min(560px, 96vw)", alignItems: "center" },
  mediaWrap: { width: "100%", display: "flex", justifyContent: "center" },
  media: { maxWidth: "100%", maxHeight: "72vh", borderRadius: 12, objectFit: "contain", border: "1px solid #313131" },
  prompt: { color: "#cfd3e6", fontSize: 14, lineHeight: 1.5, textAlign: "center", margin: 0, width: "100%" },
  footer: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, width: "100%", flexWrap: "wrap" },
  creator: { display: "flex", alignItems: "center", gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: "50%", objectFit: "cover" },
  creatorName: { color: "#fff", fontSize: 14, fontWeight: 600 },
  cta: { padding: "12px 28px", borderRadius: 999, border: "none", background: "linear-gradient(90deg, #f95bad, #ff0084)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
