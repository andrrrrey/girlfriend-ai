/**
 * @file telegram-api.ts
 * @description Тонкий клиент Telegram Bot API на fetch (без сторонних библиотек).
 *
 * Только нужные методы. Ошибки Bot API (ok=false) превращаются в
 * TelegramApiError с кодом и retry_after — по ним доставка решает, повторять
 * (429, 5xx) или нет (403 — пользователь заблокировал бота, 400 — плохой запрос).
 */

const API_BASE = "https://api.telegram.org";
const REQUEST_TIMEOUT_MS = 60_000;
/** Обновления, которые получает бот (pre_checkout_query — для оплаты Stars). */
const ALLOWED_UPDATES = ["message", "callback_query", "pre_checkout_query"];

/** Ошибка вызова Bot API. */
export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    /** error_code Bot API (или HTTP-статус) */
    readonly code: number,
    readonly description: string,
    /** Через сколько секунд можно повторить (при 429) */
    readonly retryAfter?: number,
  ) {
    super(`Telegram ${method} ${code}: ${description}`);
    this.name = "TelegramApiError";
  }

  /** Стоит ли повторить запрос позже. */
  get retryable(): boolean {
    return this.code === 429 || this.code >= 500;
  }
}

export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  language_code?: string;
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  voice?: { file_id: string; duration: number; mime_type?: string };
  audio?: { file_id: string; duration: number; mime_type?: string; file_name?: string };
  /** Оплата прошла (Stars). */
  successful_payment?: TgSuccessfulPayment;
  /** Платёж возвращён (Stars). */
  refunded_payment?: TgRefundedPayment;
}

/** Успешный платёж (Bot API SuccessfulPayment). */
export interface TgSuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id?: string;
  /** Unix time окончания оплаченного периода подписки. */
  subscription_expiration_date?: number;
  is_recurring?: boolean;
  is_first_recurring?: boolean;
}

/** Возврат платежа (Bot API RefundedPayment). */
export interface TgRefundedPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
}

/** Запрос подтверждения перед списанием (Bot API PreCheckoutQuery). */
export interface TgPreCheckoutQuery {
  id: string;
  from: TgUser;
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

/** Транзакция Stars бота (Bot API StarTransaction). */
export interface TgStarTransaction {
  /** Для входящего платежа совпадает с telegram_payment_charge_id, для возврата — с id исходного платежа. */
  id: string;
  amount: number;
  date: number;
  source?: { type: string; user?: TgUser; invoice_payload?: string; subscription_period?: number };
  receiver?: { type: string; user?: TgUser; invoice_payload?: string };
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
  pre_checkout_query?: TgPreCheckoutQuery;
}

export interface InlineKeyboard {
  inline_keyboard: { text: string; callback_data?: string; url?: string }[][];
}

/** Файл для отправки: байты (multipart) или file_id / URL, уже известные Telegram. */
export type TgInputFile = { bytes: Buffer; filename: string; contentType: string } | string;

export class TelegramApi {
  constructor(private readonly token: string) {}

  /** Вызов метода Bot API с JSON-телом. */
  async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${API_BASE}/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return this.parse<T>(method, res);
  }

  getMe() {
    return this.call<TgUser>("getMe");
  }

  setWebhook(url: string, secretToken: string) {
    return this.call<boolean>("setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ALLOWED_UPDATES,
      drop_pending_updates: false,
    });
  }

  /** Состояние webhook глазами Telegram: адрес, очередь, последняя ошибка доставки. */
  getWebhookInfo() {
    return this.call<{
      url: string;
      pending_update_count: number;
      last_error_date?: number;
      last_error_message?: string;
    }>("getWebhookInfo");
  }

  deleteWebhook() {
    return this.call<boolean>("deleteWebhook", { drop_pending_updates: false });
  }

  getUpdates(offset: number | undefined, timeoutSec = 0) {
    return this.call<TgUpdate[]>("getUpdates", {
      ...(offset !== undefined ? { offset } : {}),
      timeout: timeoutSec,
      allowed_updates: ALLOWED_UPDATES,
    });
  }

  setMyCommands(commands: { command: string; description: string }[]) {
    return this.call<boolean>("setMyCommands", { commands });
  }

  sendMessage(chatId: string, text: string, replyMarkup?: InlineKeyboard) {
    return this.call<TgMessage>("sendMessage", {
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  sendChatAction(chatId: string, action: "typing" | "upload_photo" | "upload_video" | "record_voice") {
    return this.call<boolean>("sendChatAction", { chat_id: chatId, action });
  }

  answerCallbackQuery(callbackQueryId: string, text?: string) {
    return this.call<boolean>("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
  }

  editMessageReplyMarkup(chatId: string, messageId: number, replyMarkup?: InlineKeyboard) {
    return this.call<unknown>("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup ?? { inline_keyboard: [] },
    });
  }

  /** Фото: байтами (multipart) или по file_id. */
  sendPhoto(chatId: string, photo: TgInputFile, caption?: string) {
    return this.sendFile<TgMessage & { photo?: { file_id: string }[] }>("sendPhoto", "photo", chatId, photo, caption);
  }

  /** Видео: байтами (multipart) или по file_id. */
  sendVideo(chatId: string, video: TgInputFile, caption?: string) {
    return this.sendFile<TgMessage & { video?: { file_id: string } }>("sendVideo", "video", chatId, video, caption);
  }

  /** Документ (файл): байтами (multipart) или по file_id. */
  sendDocument(chatId: string, document: TgInputFile, caption?: string) {
    return this.sendFile<TgMessage>("sendDocument", "document", chatId, document, caption);
  }

  /**
   * Ссылка на счёт в Stars (currency XTR, provider_token не нужен).
   * subscriptionPeriodSec — подписка с автопродлением (Telegram допускает только 30 дней).
   */
  createInvoiceLink(params: {
    title: string;
    description: string;
    payload: string;
    amount: number;
    label: string;
    subscriptionPeriodSec?: number;
  }) {
    return this.call<string>("createInvoiceLink", {
      title: params.title,
      description: params.description,
      payload: params.payload,
      currency: "XTR",
      prices: [{ label: params.label, amount: params.amount }],
      ...(params.subscriptionPeriodSec ? { subscription_period: params.subscriptionPeriodSec } : {}),
    });
  }

  /** Ответ на pre_checkout_query (обязателен в течение 10 секунд). */
  answerPreCheckoutQuery(queryId: string, ok: boolean, errorMessage?: string) {
    return this.call<boolean>("answerPreCheckoutQuery", {
      pre_checkout_query_id: queryId,
      ok,
      ...(ok ? {} : { error_message: errorMessage ?? "Payment unavailable" }),
    });
  }

  /** Возврат платежа в Stars. */
  refundStarPayment(userId: string, chargeId: string) {
    return this.call<boolean>("refundStarPayment", { user_id: Number(userId), telegram_payment_charge_id: chargeId });
  }

  /** Отмена (или возобновление) автопродления подписки Stars. */
  editUserStarSubscription(userId: string, chargeId: string, isCanceled: boolean) {
    return this.call<boolean>("editUserStarSubscription", {
      user_id: Number(userId),
      telegram_payment_charge_id: chargeId,
      is_canceled: isCanceled,
    });
  }

  /** Транзакции Stars бота (новые первыми не гарантируются — сортировка по дате на стороне Telegram). */
  getStarTransactions(offset = 0, limit = 100) {
    return this.call<{ transactions: TgStarTransaction[] }>("getStarTransactions", { offset, limit });
  }

  /** Путь к файлу на серверах Telegram (для скачивания голосовых). */
  getFile(fileId: string) {
    return this.call<{ file_id: string; file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  }

  /** Скачивает файл по file_path из getFile. */
  async downloadFile(filePath: string): Promise<Buffer> {
    const res = await fetch(`${API_BASE}/file/bot${this.token}/${filePath}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new TelegramApiError("downloadFile", res.status, res.statusText);
    return Buffer.from(await res.arrayBuffer());
  }

  private async sendFile<T>(
    method: string,
    field: string,
    chatId: string,
    file: TgInputFile,
    caption?: string,
  ): Promise<T> {
    if (typeof file === "string") {
      return this.call<T>(method, { chat_id: chatId, [field]: file, ...(caption ? { caption } : {}) });
    }
    const form = new FormData();
    form.append("chat_id", chatId);
    if (caption) form.append("caption", caption);
    // Копия в Uint8Array: Blob не принимает Buffer, у которого под капотом может быть SharedArrayBuffer.
    form.append(field, new Blob([new Uint8Array(file.bytes)], { type: file.contentType }), file.filename);
    const res = await fetch(`${API_BASE}/bot${this.token}/${method}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2),
    });
    return this.parse<T>(method, res);
  }

  private async parse<T>(method: string, res: Response): Promise<T> {
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: T;
      error_code?: number;
      description?: string;
      parameters?: { retry_after?: number };
    } | null;
    if (!data?.ok) {
      throw new TelegramApiError(
        method,
        data?.error_code ?? res.status,
        data?.description ?? res.statusText,
        data?.parameters?.retry_after,
      );
    }
    return data.result as T;
  }
}
