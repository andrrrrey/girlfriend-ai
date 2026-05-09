import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";
import { loadEnv } from "@repo/config";

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

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    if (!this.resend) {
      this.logger.warn({ email }, "resend_not_configured_skipping_email");
      return;
    }

    const verifyUrl = `${this.webUrl}/verify-email?token=${token}`;

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email,
      subject: "Подтвердите ваш email",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background: #090909; color: #fff; border-radius: 12px;">
          <div style="margin-bottom: 32px;">
            <svg width="120" height="16" viewBox="0 0 172 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M42.6591 6.14062V14.1806H49.1091V15.8456H40.6641V6.14062H42.6591Z" fill="white"/>
            </svg>
          </div>
          <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 16px;">Подтвердите email</h1>
          <p style="color: #969696; font-size: 15px; line-height: 1.6; margin-bottom: 28px;">
            Нажмите кнопку ниже, чтобы подтвердить адрес электронной почты и активировать аккаунт.
          </p>
          <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #f95bad, #e0359e); color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 700;">
            Подтвердить email
          </a>
          <p style="color: #555; font-size: 12px; margin-top: 28px;">
            Ссылка действительна 24 часа. Если вы не регистрировались — просто проигнорируйте это письмо.
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

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    if (!this.resend) {
      this.logger.warn({ email }, "resend_not_configured_skipping_email");
      return;
    }

    const resetUrl = `${this.webUrl}/reset-password?token=${token}`;

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email,
      subject: "Сброс пароля",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background: #090909; color: #fff; border-radius: 12px;">
          <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 16px;">Сброс пароля</h1>
          <p style="color: #969696; font-size: 15px; line-height: 1.6; margin-bottom: 28px;">
            Нажмите кнопку ниже, чтобы сбросить пароль.
          </p>
          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #f95bad, #e0359e); color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 700;">
            Сбросить пароль
          </a>
          <p style="color: #555; font-size: 12px; margin-top: 28px;">
            Ссылка действительна 1 час. Если вы не запрашивали сброс — просто проигнорируйте это письмо.
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
