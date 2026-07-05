"use client";

import { useRouter } from "next/navigation";
import { useT } from "../../../context/language";
import LikeButton from "../../components/LikeButton";

/**
 * Интерактивный блок CTA на серверной странице персонажа.
 * Вынесен в клиентский компонент, чтобы основной контент остался серверным (SSR).
 */
export default function CharacterPageActions({ characterId }: { characterId: string }) {
  const router = useRouter();
  const { t } = useT();

  return (
    <div className="seo-actions">
      <button
        className="seo-cta-primary"
        onClick={() => router.push(`/chat?characterId=${characterId}`)}
      >
        {t("characters.startChat")}
      </button>
      <button
        className="seo-cta-secondary"
        onClick={() => router.push(`/generation?characterId=${characterId}`)}
      >
        {t("characters.generateImage")}
      </button>
      <div className="seo-like">
        <LikeButton targetType="character" targetId={characterId} size="lg" />
      </div>
    </div>
  );
}
