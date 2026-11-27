import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";
import { loadEnv } from "@repo/config";

/** Языки писем — те же, что у интерфейса. Неизвестный язык → английский. */
type MailLang = "en" | "ru" | "de" | "fr";

const MAIL_TEXT: Record<MailLang, {
  verifySubject: string; verifyTitle: string; verifyBody: string; verifyButton: string; verifyFooter: string;
  resetSubject: string; resetBody: string; resetButton: string; resetFooter: string;
}> = {
  ru: {
    verifySubject: "Подтвердите ваш email",
    verifyTitle: "Подтвердите email",
    verifyBody: "Нажмите кнопку ниже, чтобы подтвердить адрес электронной почты и активировать аккаунт.",
    verifyButton: "Подтвердить email",
    verifyFooter: "Ссылка действительна 24 часа. Если вы не регистрировались — просто проигнорируйте это письмо.",
    resetSubject: "Сброс пароля",
    resetBody: "Нажмите кнопку ниже, чтобы сбросить пароль.",
    resetButton: "Сбросить пароль",
    resetFooter: "Ссылка действительна 1 час. Если вы не запрашивали сброс — просто проигнорируйте это письмо.",
  },
  en: {
    verifySubject: "Confirm your email",
    verifyTitle: "Confirm your email",
    verifyBody: "Click the button below to confirm your email address and activate your account.",
    verifyButton: "Confirm email",
    verifyFooter: "The link is valid for 24 hours. If you didn't sign up, just ignore this email.",
    resetSubject: "Password reset",
    resetBody: "Click the button below to reset your password.",
    resetButton: "Reset password",
    resetFooter: "The link is valid for 1 hour. If you didn't request a reset, just ignore this email.",
  },
  de: {
    verifySubject: "Bestätige deine E-Mail-Adresse",
    verifyTitle: "E-Mail bestätigen",
    verifyBody: "Klicke auf den Button unten, um deine E-Mail-Adresse zu bestätigen und dein Konto zu aktivieren.",
    verifyButton: "E-Mail bestätigen",
    verifyFooter: "Der Link ist 24 Stunden gültig. Wenn du dich nicht registriert hast, ignoriere diese E-Mail einfach.",
    resetSubject: "Passwort zurücksetzen",
    resetBody: "Klicke auf den Button unten, um dein Passwort zurückzusetzen.",
    resetButton: "Passwort zurücksetzen",
    resetFooter: "Der Link ist 1 Stunde gültig. Wenn du das nicht angefordert hast, ignoriere diese E-Mail einfach.",
  },
  fr: {
    verifySubject: "Confirme ton adresse e-mail",
    verifyTitle: "Confirme ton e-mail",
    verifyBody: "Clique sur le bouton ci-dessous pour confirmer ton adresse e-mail et activer ton compte.",
    verifyButton: "Confirmer l'e-mail",
    verifyFooter: "Le lien est valable 24 heures. Si tu ne t'es pas inscrit, ignore simplement cet e-mail.",
    resetSubject: "Réinitialisation du mot de passe",
    resetBody: "Clique sur le bouton ci-dessous pour réinitialiser ton mot de passe.",
    resetButton: "Réinitialiser le mot de passe",
    resetFooter: "Le lien est valable 1 heure. Si tu n'as pas demandé de réinitialisation, ignore simplement cet e-mail.",
  },
};

function mailText(lang?: string | null) {
  return MAIL_TEXT[(lang && lang in MAIL_TEXT ? lang : "en") as MailLang];
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly webUrl: string;

  constructor() {
    const env = loadEnv();
    this.from = env.RESEND_FROM ?? "noreply@example.com";
    this.webUrl = env.WEB_URL ?? "http://localhost:3000";
    this.resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
  }

  async sendVerificationEmail(email: string, token: string, lang?: string | null): Promise<void> {
    const tx = mailText(lang);
    if (!this.resend) {
      this.logger.warn({ email }, "resend_not_configured_skipping_email");
      return;
    }

    const verifyUrl = `${this.webUrl}/verify-email?token=${token}`;

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email,
      subject: tx.verifySubject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background: #090909; color: #fff; border-radius: 12px;">
          <div style="margin-bottom: 32px;">
            <svg width="120" height="16" viewBox="0 0 172 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M42.6591 6.14062V14.1806H49.1091V15.8456H40.6641V6.14062H42.6591Z" fill="white"/>
            </svg>
          </div>
          <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 16px;">${tx.verifyTitle}</h1>
          <p style="color: #969696; font-size: 15px; line-height: 1.6; margin-bottom: 28px;">
            ${tx.verifyBody}
          </p>
          <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #f95bad, #e0359e); color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 700;">
            ${tx.verifyButton}
          </a>
          <p style="color: #555; font-size: 12px; margin-top: 28px;">
            ${tx.verifyFooter}
          </p>
        </div>
      `,
    });

    if (error) {
      this.logger.error({ email, error }, "resend_send_failed");
      throw new Error("Failed to send verification email");
    }

    this.logger.log(`verification_email_sent email=${email}`);
  }

  async sendPasswordResetEmail(email: string, token: string, lang?: string | null): Promise<void> {
    const tx = mailText(lang);
    if (!this.resend) {
      this.logger.warn({ email }, "resend_not_configured_skipping_email");
      return;
    }

    const resetUrl = `${this.webUrl}/reset-password?token=${token}`;

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email,
      subject: tx.resetSubject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background: #090909; color: #fff; border-radius: 12px;">
          <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 16px;">${tx.resetSubject}</h1>
          <p style="color: #969696; font-size: 15px; line-height: 1.6; margin-bottom: 28px;">
            ${tx.resetBody}
          </p>
          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #f95bad, #e0359e); color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 700;">
            ${tx.resetButton}
          </a>
          <p style="color: #555; font-size: 12px; margin-top: 28px;">
            ${tx.resetFooter}
          </p>
        </div>
      `,
    });

    if (error) {
      this.logger.error({ email, error }, "resend_password_reset_failed");
      throw new Error("Failed to send password reset email");
    }

    this.logger.log(`password_reset_email_sent email=${email}`);
  }
}
