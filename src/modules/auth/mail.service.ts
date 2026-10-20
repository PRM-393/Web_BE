import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createTransport } from 'nodemailer';

@Injectable()
export class MailService {
  async send(to: string, subject: string, text: string) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
      throw new ServiceUnavailableException('Email chưa được cấu hình. Vui lòng liên hệ quản trị viên.');
    }
    const transport = createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      connectionTimeout: 10000, socketTimeout: 15000,
      disableFileAccess: true, disableUrlAccess: true,
    });
    try {
      await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
    } catch {
      // Do not expose SMTP replies or message contents.
      throw new ServiceUnavailableException('Không gửi được email. Vui lòng thử lại sau.');
    } finally { transport.close(); }
  }
}
