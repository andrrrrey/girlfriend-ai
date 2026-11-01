"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../../../context/auth";
import { useT } from "../../../context/language";
import type { TKey } from "../../../lib/i18n";
import { ApiError, notifyWalletChanged, payments, type PaymentStatus } from "../../../lib/api";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 40;

const FAILED_STATUSES: PaymentStatus[] = ["failed", "expired", "canceled"];
const PROCESSING_STATUSES: PaymentStatus[] = ["created", "pending"];

const CSS = `
.pay-return { max-width: 480px; margin: 48px auto; padding: 24px; box-sizing: border-box; font-family: 'Syne', sans-serif;
  color: #fff; background: #1a1a1a; border: 1px solid #313131; border-radius: 8px; text-align: center; }
.pay-return-title { font-size: 22px; font-weight: 700; margin: 0 0 12px; }
.pay-return-text { font-size: 14px; line-height: 1.5; color: #d0d0d0; margin: 0 0 20px; }
.pay-return-link { color: #f95bad; text-decoration: none; font-size: 14px; }
@media (max-width: 520px) { .pay-return { margin: 16px; } }
`;

/**
 * Страница возврата с оплаты. Статус берётся только с нашего сервера: параметры,
 * которые провайдер добавляет к адресу, может подменить кто угодно.
 */
function PaymentReturn() {
  const { t } = useT();
  const { user, loading, refreshProfile } = useAuth();
  const paymentId = useSearchParams().get("paymentId");
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (!paymentId) {
      setNotFound(true);
      return;
    }
    let cancelled = false;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      polls += 1;
      try {
        const payment = await payments.get(paymentId);
        if (cancelled) return;
        setStatus(payment.status);
        if (!PROCESSING_STATUSES.includes(payment.status)) {
          if (payment.status === "paid") {
            notifyWalletChanged();
            await refreshProfile();
          }
          return;
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }
        // Сбой сети не конец: продолжаем опрашивать.
      }
      if (polls >= MAX_POLLS) {
        setGaveUp(true);
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // refreshProfile меняет user, а перезапускать опрос из-за этого не нужно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, Boolean(user), paymentId]);

  let text: string;
  if (!loading && !user) text = t("pay.returnLogin");
  else if (notFound) text = t("pay.returnNotFound");
  else if (status === "paid") text = t("pay.returnSuccess");
  else if (status && FAILED_STATUSES.includes(status)) text = t("pay.returnFailed");
  else if (status && !PROCESSING_STATUSES.includes(status)) {
    text = t("pay.returnOther", { status: t(`pay.status.${status}` as TKey) });
  } else text = gaveUp ? t("pay.returnStillProcessing") : t("pay.returnProcessing");

  return (
    <div className="pay-return">
      <h1 className="pay-return-title">{t("pay.returnTitle")}</h1>
      <p className="pay-return-text" aria-live="polite">{text}</p>
      <Link className="pay-return-link" href={!loading && !user ? "/login" : "/subscription"}>
        {!loading && !user ? t("pay.loginRequired") : t("pay.backToSubscription")}
      </Link>
    </div>
  );
}

export default function PaymentReturnPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Suspense>
        <PaymentReturn />
      </Suspense>
    </>
  );
}
