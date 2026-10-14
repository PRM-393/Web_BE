/* eslint-disable no-console */
// Sinh file schema.sql cho PostgreSQL va MySQL truc tiep tu entity TypeORM, de file SQL luon khop voi ma nguon.
// Khong can ket noi CSDL: TypeORM ghi cau lenh vao bo nho (enableSqlMemory) thay vi chay.
//   npm run db:schema            -> sinh ca hai file
//   npx ts-node database/generate-schema.ts mysql
// Chay lai lenh nay moi khi sua entity, roi commit file .sql moi.
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const dialect = process.argv[2];

if (!dialect) {
  // Moi he chay trong mot tien trinh rieng vi kieu cot doc DB_TYPE luc nap entity (src/config/db-types.ts)
  for (const d of ['postgres', 'mysql']) {
    execFileSync(process.execPath, [...process.execArgv, __filename, d], { stdio: 'inherit' });
  }
  process.exit(0);
}

process.env.DB_TYPE = dialect;

async function main() {
  const { DataSource, Table, TableForeignKey } = await import('typeorm');
  const entities = await import('../src/entities');

  const ds = new DataSource({
    type: dialect as 'postgres' | 'mysql',
    entities: Object.values(entities).filter((e) => typeof e === 'function'),
    database: 'voucher_platform',
    ...(dialect === 'postgres' ? { uuidExtension: 'pgcrypto' as const } : { charset: 'utf8mb4' }),
  });
  // Dung metadata ma khong mo ket noi
  await (ds as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();

  const runner = ds.createQueryRunner();
  // Khong co ket noi: cau hoi schema hien tai tra ve "public", moi cau kiem tra "da ton tai chua" tra ve rong
  runner.query = (async (sql: string) =>
    /current_schema|current_database/i.test(sql)
      ? [{ current_schema: 'public', current_database: 'voucher_platform' }]
      : []) as unknown as typeof runner.query;
  runner.enableSqlMemory();

  const metadatas = [...ds.entityMetadatas].sort((a, b) => a.tableName.localeCompare(b.tableName));
  for (const meta of metadatas) {
    await runner.createTable(Table.create(meta, ds.driver), false, false, true);
  }
  // Khoa ngoai tao sau cung de khong phu thuoc thu tu bang
  for (const meta of metadatas) {
    const table = Table.create(meta, ds.driver);
    for (const fk of meta.foreignKeys) {
      await runner.createForeignKey(table, TableForeignKey.create(fk, ds.driver));
    }
  }

  const statements = runner.getMemorySql().upQueries.map((q) => `${q.query};`);
  const header =
    dialect === 'postgres'
      ? [
          '-- PostgreSQL 13+ : psql -U postgres -d voucher_platform -f database/postgres/schema.sql',
          '-- gen_random_uuid() co san tu PostgreSQL 13 (dong duoi chi can cho ban cu hon)',
          'CREATE EXTENSION IF NOT EXISTS "pgcrypto";',
        ]
      : [
          '-- MySQL 8.0+ : mysql -u root -p voucher_platform < database/mysql/schema.sql',
          '-- Tao CSDL truoc: CREATE DATABASE voucher_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
          'SET NAMES utf8mb4;',
          "SET time_zone = '+00:00';",
        ];

  const out = [
    '-- TU DONG SINH tu entity TypeORM (database/generate-schema.ts). Khong sua tay; sua entity roi chay npm run db:schema.',
    ...header,
    '',
    ...statements,
    '',
  ].join('\n');

  const dir = path.join(__dirname, dialect);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'schema.sql'), out);
  console.log(`${dialect}: ${metadatas.length} bang, ${statements.length} cau lenh -> database/${dialect}/schema.sql`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
