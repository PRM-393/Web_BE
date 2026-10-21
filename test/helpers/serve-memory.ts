// Chay BE that tren pg-mem de FE / Mobile goi vao khi kiem thu tich hop (khong can PostgreSQL tren may).
//   npx ts-node -T test/helpers/serve-memory.ts [port]
// Email (OTP, kich hoat) khong gui di ma ghi vao file .e2e-mail.json de test doc ma OTP.
import * as fs from 'fs';
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
  console.log(`READY http://localhost:${port}/api`);
}

main();
