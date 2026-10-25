"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../context/auth";
import { admin, type PriceItems } from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

/** Плоские поля цен с подписями (модельные цены редактируются JSON-ом ниже). */
const PRICE_FIELDS: { key: Exclude<keyof PriceItems, "image_models" | "video_models">; label: string }[] = [
  { key: "chat_message", label: "Ответ персонажа (сообщение)" },
  { key: "chat_greeting", label: "Первое приветствие" },
  { key: "stt_message", label: "Распознавание голосового" },
  { key: "tts_per_1k_chars", label: "Озвучка, за 1000 символов" },
  { key: "image", label: "Изображение (по умолчанию)" },
  { key: "image_hires_extra", label: "Надбавка за hires fix" },
  { key: "video", label: "Видео (по умолчанию)" },
];

type Reconcile = Awaited<ReturnType<typeof admin.reconcileBilling>>;

/**
 * Админка биллинга: флаги (блокировка при нехватке, стартовый бонус),
 * версионируемая таблица цен в кредитах и сверка кошельков с журналом.
 * Кредиты конкретным пользователям начисляются на странице «Пользователи».
 */
export default function AdminBillingPage() {
  const { user, loading } = useAuth();
  const [prices, setPrices] = useState<PriceItems | null>(null);
  const [modelsJson, setModelsJson] = useState("");
  const [version, setVersion] = useState(0);
  const [enforced, setEnforced] = useState(false);
  const [welcomeBonus, setWelcomeBonus] = useState("");
  const [reconcile, setReconcile] = useState<Reconcile | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await admin.getBillingPrices();
      setPrices(data.active.items);
      setVersion(data.active.version);
      setModelsJson(
        JSON.stringify({ image_models: data.active.items.image_models, video_models: data.active.items.video_models }, null, 2),
      );
      setEnforced(data.enforced);
      setWelcomeBonus(String(data.welcomeBonus));
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (!loading && user?.role === "admin") load();
  }, [loading, user, load]);

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  };

  const saveFlags = async (nextEnforced: boolean) => {
    const bonus = parseInt(welcomeBonus, 10);
    if (!Number.isFinite(bonus) || bonus < 0) {
      setError("Стартовый бонус — неотрицательное целое число");
      return;
    }
    if (nextEnforced && !enforced && !confirm("Включить блокировку? Пользователи без кредитов не смогут писать и генерировать.")) {
      return;
    }
    setError("");
    try {
      await admin.upsertSettings({
        BILLING_ENFORCED: nextEnforced ? "true" : "false",
        WELCOME_BONUS_CREDITS: String(bonus),
      });
      setEnforced(nextEnforced);
      flash("Настройки биллинга сохранены");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const savePrices = async () => {
    if (!prices) return;
    let models: { image_models?: Record<string, number>; video_models?: Record<string, number> };
    try {
      models = JSON.parse(modelsJson || "{}");
    } catch {
      setError("Цены моделей: некорректный JSON");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await admin.setBillingPrices({
        ...prices,
        image_models: models.image_models ?? {},
        video_models: models.video_models ?? {},
      });
      setVersion(saved.version);
      setPrices(saved.items);
      flash(`Цены сохранены (версия ${saved.version})`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const runReconcile = async () => {
    setError("");
    try {
      setReconcile(await admin.reconcileBilling());
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <div style={adminStyles.page}><p style={{ color: "#aaa" }}>Загрузка...</p></div>;
  if (!user || user.role !== "admin") {
    return (
      <div style={adminStyles.page}>
        <div style={adminStyles.card}>
          <h1 style={adminStyles.title}>Доступ запрещён</h1>
          <p style={{ color: "#aaa" }}>Требуются права администратора.</p>
          <Link href="/" style={adminStyles.link}>На главную</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={adminStyles.page}>
      <div style={adminStyles.containerWide}>
        <AdminTabs active="billing" />

        {error && <div style={{ ...adminStyles.card, ...adminStyles.error, marginBottom: 20 }}>{error}</div>}
        {message && <div style={{ ...adminStyles.card, ...adminStyles.success, marginBottom: 20 }}>{message}</div>}

        <div style={{ ...adminStyles.card, marginBottom: 20 }}>
          <h2 style={adminStyles.title}>Режим</h2>
          <p style={adminStyles.subtitle}>
            Пока блокировка выключена, резервы и списания ведутся, но операции не останавливаются —
            баланс может уйти в минус. Включайте после настройки цен и бонуса.
          </p>
          <div style={adminStyles.row}>
            <div style={adminStyles.field}>
              <label style={adminStyles.label}>Стартовый бонус (кредитов при создании кошелька)</label>
              <input
                style={{ ...adminStyles.input, width: 160 }}
                type="number"
                min={0}
                value={welcomeBonus}
                onChange={(e) => setWelcomeBonus(e.target.value)}
              />
            </div>
          </div>
          <div style={adminStyles.btnRow}>
            <button style={adminStyles.btnSecondary} onClick={() => saveFlags(enforced)}>
              Сохранить бонус
            </button>
            <button style={adminStyles.button} onClick={() => saveFlags(!enforced)}>
              {enforced ? "Выключить блокировку" : "Включить блокировку"}
            </button>
            <span style={{ color: enforced ? "#c1f0aa" : "#f0b429", fontSize: 12, alignSelf: "center" }}>
              Сейчас: {enforced ? "блокировка при нехватке кредитов включена" : "блокировка выключена"}
            </span>
          </div>
        </div>

        <div style={{ ...adminStyles.card, marginBottom: 20 }}>
          <h2 style={adminStyles.title}>Цены в кредитах</h2>
          <p style={adminStyles.subtitle}>
            Действует версия {version || "по умолчанию"}. Сохранение создаёт новую версию — прошлые списания
            остаются посчитанными по своей версии.
          </p>
          {prices && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                {PRICE_FIELDS.map((f) => (
                  <div key={f.key} style={adminStyles.field}>
                    <label style={adminStyles.label}>{f.label}</label>
                    <input
                      style={adminStyles.input}
                      type="number"
                      min={0}
                      value={prices[f.key]}
                      onChange={(e) => setPrices({ ...prices, [f.key]: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    />
                  </div>
                ))}
              </div>
              <div style={adminStyles.field}>
                <label style={adminStyles.label}>
                  Цены конкретных моделей (переопределяют цену по умолчанию): {"{ image_models: { \"<id>\": 8 }, video_models: { … } }"}
                </label>
                <textarea
                  style={{ ...adminStyles.input, minHeight: 120, fontFamily: "monospace" }}
                  value={modelsJson}
                  onChange={(e) => setModelsJson(e.target.value)}
                />
              </div>
              <button style={adminStyles.button} onClick={savePrices} disabled={saving}>
                {saving ? "Сохранение..." : "Сохранить новую версию цен"}
              </button>
            </>
          )}
        </div>

        <div style={adminStyles.card}>
          <h2 style={adminStyles.title}>Сверка</h2>
          <p style={adminStyles.subtitle}>
            Проверяет, что баланс и резерв каждого кошелька совпадают с суммой журнала и удержанных резервов.
          </p>
          <button style={adminStyles.btnSecondary} onClick={runReconcile}>Запустить сверку</button>
          {reconcile && (
            <div style={{ marginTop: 12, color: "#ccc", fontSize: 12 }}>
              Проверено кошельков: {reconcile.checked}. Расхождений: {reconcile.mismatches.length}.
              {reconcile.mismatches.map((m) => (
                <div key={m.walletId} style={{ color: "#e36466", marginTop: 4 }}>
                  user {m.ownerUserId}: баланс {m.balance} / журнал {m.ledgerBalance}; резерв {m.reserved} / журнал{" "}
                  {m.ledgerReserved} / удержано {m.heldReserved}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
