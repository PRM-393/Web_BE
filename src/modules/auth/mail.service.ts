import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createTransport } from 'nodemailer';

// Gui email (ma dat lai mat khau, kich hoat tai khoan).
//  - BREVO_API_KEY: gui qua API HTTPS cua Brevo. Dung cach nay tren Render goi mien phi vi Render chan
//    moi ket noi SMTP ra ngoai (cong 25 / 465 / 587) tu 26/09/2025.
//  - Khong co BREVO_API_KEY: gui qua SMTP (SMTP_HOST...), dung cho may ca nhan.
// MAIL_FROM (hoac SMTP_FROM) dang "Ten <email>"; voi Brevo, email nay phai la sender da xac minh.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async send(to: string, subject: string, text: string) {
    const from = process.env.MAIL_FROM || process.env.SMTP_FROM;
    if (!from || (!process.env.BREVO_API_KEY && !process.env.SMTP_HOST)) {
      throw new ServiceUnavailableException('Email chưa được cấu hình. Vui lòng liên hệ quản trị viên.');
    }
    try {
      if (process.env.BREVO_API_KEY) await this.sendBrevo(from, to, subject, text);
      else await this.sendSmtp(from, to, subject, text);
    } catch (e) {
      // Ghi ly do vao log de quan tri tim loi, khong tra ve noi dung thu / phan hoi cua may chu cho nguoi dung.
      this.logger.error(`Gui email that bai: ${e instanceof Error ? e.message : e}`);
      throw new ServiceUnavailableException('Không gửi được email. Vui lòng thử lại sau.');
    }
  }

  private async sendBrevo(from: string, to: string, subject: string, text: string) {
    const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
    const sender = match ? { name: match[1] || undefined, email: match[2] } : { email: from.trim() };
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  private async sendSmtp(from: string, to: string, subject: string, text: string) {
    const transport = createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      connectionTimeout: 10000, socketTimeout: 15000,
      disableFileAccess: true, disableUrlAccess: true,
    });
    try {
      await transport.sendMail({ from, to, subject, text });
    } finally { transport.close(); }
  }
}
