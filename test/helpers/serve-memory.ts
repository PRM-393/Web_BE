// Chay BE that tren pg-mem de FE / Mobile goi vao khi kiem thu tich hop (khong can PostgreSQL tren may).
//   npx ts-node -T test/helpers/serve-memory.ts [port]
// Email (OTP, kich hoat) khong gui di ma ghi vao file .e2e-mail.json de test doc ma OTP.
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { createTestApp } from './test-app';

const MAIL_FILE = path.join(__dirname, '..', '..', '.e2e-mail.json');

async function main() {
  process.env.PAYMENT_SIMULATOR = 'true';
  const port = Number(process.argv[2] || 3999);
  const t = await createTestApp();
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
