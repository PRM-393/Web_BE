import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

// Gui thong bao day qua Firebase Cloud Messaging HTTP v1 (NFR-MOB-08, tuy chon).
// Can FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (lay tu service account cua du an Firebase).
// Chua cau hinh -> bo qua, thong bao van luu trong CSDL va app hien bang thong bao cuc bo.
export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class PushSender {
  private readonly logger = new Logger(PushSender.name);
  private accessToken: { value: string; expiresAt: number } | null = null;

  get configured(): boolean {
    const { FIREBASE_PROJECT_ID: p, FIREBASE_CLIENT_EMAIL: e, FIREBASE_PRIVATE_KEY: k } = process.env;
    return !!(p && e && k && p !== 'changeme' && k !== 'changeme');
  }

  // Tra ve so thiet bi gui thanh cong; loi mang khong lam hong luong nghiep vu
  async send(tokens: string[], message: PushMessage): Promise<number> {
    if (!this.configured || tokens.length === 0) return 0;
    let sent = 0;
    try {
      const token = await this.getAccessToken();
      const url = `https://fcm.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/messages:send`;
      for (const deviceToken of tokens) {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: deviceToken,
              notification: { title: message.title, body: message.body },
              data: message.data ?? {},
              android: { priority: 'high' },
            },
          }),
        });
        if (res.ok) sent++;
      }
    } catch (e) {
      this.logger.warn(`Gui FCM loi: ${(e as Error).message}`);
    }
    return sent;
  }

  // OAuth2 cho service account: ky JWT RS256 roi doi lay access token (het han 1 gio)
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
      iss: process.env.FIREBASE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`;
    const key = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(key).toString('base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    });
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error('Khong lay duoc access token Firebase');
    this.accessToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
    return json.access_token;
  }
}
