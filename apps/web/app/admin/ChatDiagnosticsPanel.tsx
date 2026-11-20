"use client";

/**
 * Блок «Диагностика чата» в настройках админки: показывает, почему чат
 * персонажей не отвечает, без доступа к логам сервера (боевой стенд).
 * Делает тестовый запрос к модели через AI-сервис — ровно тем путём, что и чат.
 */

import React, { useState } from "react";
import { admin, type ChatDiagnostics, type ChatDiagnosticsProbe } from "../../lib/api";
import { adminStyles } from "./admin-styles";

const mono: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: 11,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  background: "#0a0a0a",
  border: "1px solid #313131",
  borderRadius: 6,
  padding: 10,
  color: "#ddd",
  margin: "6px 0 0",
  maxHeight: 240,
  overflow: "auto",
};

function Probe({ title, p }: { title: string; p: ChatDiagnosticsProbe }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ color: p.ok ? "#4ade80" : "#f87171", fontSize: 12, fontWeight: 600 }}>
        {p.ok ? "✓" : "✗"} {title}: {p.status ?? "нет ответа"} · {p.ms} мс
      </div>
      <pre style={mono}>{p.body || "(пустое тело)"}</pre>
    </div>
  );
}

export function ChatDiagnosticsPanel() {
  const [data, setData] = useState<ChatDiagnostics | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setRunning(true);
    setError("");
    try {
      setData(await admin.runChatDiagnostics());
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setRunning(false);
    }
  };

  const s = data?.settings;
  return (
    <div style={{ ...adminStyles.card, marginBottom: 20 }}>
      <h2 style={adminStyles.title}>Диагностика чата</h2>
      <p style={adminStyles.subtitle}>
        Проверяет настройки чата, доступность AI-сервиса и делает тестовый запрос к модели (тем же путём, что и чат
        персонажей). Ниже — последние ошибки чата у пользователей. Тестовый запрос стоит доли цента.
      </p>
      <button onClick={run} disabled={running} style={adminStyles.button}>
        {running ? "Проверяем… (до минуты)" : "Запустить диагностику"}
      </button>
      {error && <div style={{ ...adminStyles.error, marginTop: 12 }}>Не удалось выполнить диагностику: {error}</div>}

      {data && s && (
        <div style={{ marginTop: 16, color: "#ddd", fontSize: 12 }}>
          <div style={{ marginBottom: 14, lineHeight: 1.7 }}>
            <div>Провайдер: <b>{s.chatProvider}</b></div>
            {s.chatProvider === "openrouter" ? (
              <>
                <div>
                  Модель: <b>{s.openrouterChatModelEffective}</b>
                  {s.openrouterChatModelSaved && s.openrouterChatModelSaved !== s.openrouterChatModelEffective && (
                    <span style={{ color: "#fbbf24" }}> (в настройках «{s.openrouterChatModelSaved}» — нет в списке, взята по умолчанию)</span>
                  )}
                </div>
                <div>
                  Ключ OpenRouter:{" "}
                  {s.openrouterKeySet ? <b style={{ color: "#4ade80" }}>задан</b> : <b style={{ color: "#f87171" }}>НЕ задан</b>}
                </div>
              </>
            ) : (
              <>
                <div>Модель ModelsLab: <b>{s.modelslabChatModel ?? "по умолчанию"}</b></div>
                <div>
                  Ключ ModelsLab:{" "}
                  {s.modelslabKeySet ? <b style={{ color: "#4ade80" }}>задан</b> : <b style={{ color: "#f87171" }}>НЕ задан</b>}
                </div>
              </>
            )}
            <div style={{ color: "#848484" }}>AI-сервис: {data.aiBase} · проверено {new Date(data.checkedAt).toLocaleString()}</div>
          </div>

          <Probe title="AI-сервис /health" p={data.health} />
          <Probe title="Тестовый ответ модели" p={data.testReply} />

          <div style={{ fontSize: 12, fontWeight: 600, margin: "6px 0" }}>
            Последние ошибки чата ({data.recentFailures.length})
          </div>
          {data.recentFailures.length === 0 ? (
            <div style={{ color: "#848484" }}>Нет неудачных чат-заданий.</div>
          ) : (
            <pre style={mono}>
              {data.recentFailures
                .map((f) => `${new Date(f.createdAt).toLocaleString()}  ${f.model ? `[${String(f.model)}] ` : ""}${f.error ?? "(без текста)"}`)
                .join("\n")}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
