// Chay BE that tren pg-mem de FE / Mobile goi vao khi kiem thu tich hop (khong can PostgreSQL tren may).
//   npx ts-node -T test/helpers/serve-memory.ts [port]
// Email (OTP, kich hoat) khong gui di ma ghi vao file .e2e-mail.json de test doc ma OTP.
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { json } from 'express';
import { createTestApp } from './test-app';

const MAIL_FILE = path.join(__dirname, '..', '..', '.e2e-mail.json');

async function main() {
  process.env.PAYMENT_SIMULATOR = 'true';
  const port = Number(process.argv[2] || 3999);
  // DEMO_LOGIN=1: dang nhap bang ten ngan (admin / owner / staff / user) + mat khau 123 de demo tren may local.
  // Chi map sang tai khoan seed, khong doi quy tac xac thuc cua BE that.
  const demo = process.env.DEMO_LOGIN === '1';
  const aliases: Record<string, string> = {
    admin: 'admin@voucher.local',
    owner: 'owner@highlands.local',
    staff: 'staff@highlands.local',
    user: 'khach@voucher.local',
  };
  // Boc json() trong ham khac ten: Nest bo qua bo doc JSON toan cuc neu da thay middleware ten 'jsonParser'.
  const parseJson = json();
  const t = await createTestApp(
    demo
      ? (app, emails) =>
          app.use('/api/auth', (req: any, res: any, next: () => void) => parseJson(req, res, next), (req: any, _res: any, next: () => void) => {
            const b = req.body;
            const alias = b && typeof b.email === 'string' ? aliases[b.email.trim().toLowerCase()] : undefined;
            if (alias) {
              b.email = alias;
              if (b.password === '123') b.password = 'Voucher@123';
              // khach dang nhap bang OTP: o che do demo nhap ma bat ky 6 so, BE dung ma OTP that vua gui
              if (req.path === '/otp/verify' && typeof b.otp === 'string') {
                const last = [...emails].reverse().find((m) => m.to === alias);
                const code = last && /\b\d{6}\b/.exec(last.text);
                if (code) b.otp = code[0];
              }
            }
            next();
          })
      : undefined,
  );
  const push = t.emails.push.bind(t.emails);
  t.emails.push = (...mails) => {
    const n = push(...mails);
    fs.writeFileSync(MAIL_FILE, JSON.stringify(t.emails, null, 1));
    return n;
  };
  await t.app.listen(port);

  // Chi co o may chu demo (cong port - 1, chi nghe localhost): doi bien moi truong luc dang chay de demo
  // cac nhanh ngoai le ma khong phai khoi dong lai va mat du lieu, vd:
  //   curl "localhost:3998/env?REFUND_SANDBOX_RESULT=unavailable"
  const allowed = new Set(['REFUND_SANDBOX_RESULT', 'PAYMENT_SIMULATOR']);
  http
    .createServer((req, res) => {
      const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
      for (const [key, value] of params) if (allowed.has(key)) process.env[key] = value;
      res.end(JSON.stringify(Object.fromEntries([...allowed].map((k) => [k, process.env[k] ?? null]))));
    })
    .listen(port - 1, '127.0.0.1');
  console.log(`READY http://localhost:${port}/api`);
}

main();
