/* eslint-disable no-console */
// Tao bang + nap du lieu mau vao PostgreSQL (Neon / Supabase / may ca nhan) bang mot lenh:
//   DATABASE_URL="postgresql://...?...sslmode=require" npm run db:setup
//   npm run db:setup -- --no-seed     # chi tao bang
//   npm run db:setup -- --reset       # XOA toan bo bang roi tao lai (chi dung cho CSDL dev)
// Neu khong co DATABASE_URL thi dung DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD / DB_NAME trong .env.
// CSDL da co bang "users" thi bo qua de khong ghi de du lieu that.
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

const args = new Set(process.argv.slice(2));

function statements(file: string): string[] {
  return fs
    .readFileSync(path.join(__dirname, 'postgres', file), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('--'))
    .join('\n')
    .split(/;\s*\n/)
    .map((s) => s.trim().replace(/;$/, ''))
    .filter(Boolean);
}

async function main() {
  const url = process.env.DATABASE_URL;
  const ssl = process.env.DB_SSL === 'true' || /sslmode=require/.test(url || '');
  const client = new Client(
    url
      ? { connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : undefined }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          user: process.env.DB_USERNAME || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          database: process.env.DB_NAME || 'voucher_platform',
          ssl: ssl ? { rejectUnauthorized: false } : undefined,
        },
  );
  await client.connect();
  console.log('Da ket noi', url ? url.replace(/\/\/[^@]*@/, '//***@') : `${process.env.DB_HOST || 'localhost'}`);

  if (args.has('--reset')) {
    console.log('--reset: xoa schema public va tao lai');
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }

  const exists = await client.query("SELECT to_regclass('public.users') AS t");
  if (exists.rows[0].t) {
    console.log('CSDL da co bang, bo qua. Dung --reset neu muon tao lai (mat du lieu).');
    await client.end();
    return;
  }

  const files = ['schema.sql', ...(args.has('--no-seed') ? [] : ['seed.sql'])];
  await client.query('BEGIN');
  try {
    for (const file of files) {
      const list = statements(file);
      for (const stmt of list) await client.query(stmt);
      console.log(`${file}: ${list.length} cau lenh`);
    }
    await client.query('COMMIT');
    console.log('Xong. Tai khoan mau: admin@voucher.local / owner@highlands.local / staff@highlands.local, mat khau Voucher@123');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('Loi:', e.message);
  process.exit(1);
});
