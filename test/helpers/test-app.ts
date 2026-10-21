// Dung app NestJS tren PostgreSQL gia lap (pg-mem) cho test e2e: nap database/postgres/schema.sql + seed.sql
// roi goi API qua HTTP nhu client that. Dung chung cho moi file *.e2e-spec.ts.
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import * as entities from '../../src/entities';

export const PASSWORD = 'Voucher@123';

// id co dinh trong database/generate-seed.ts
export const ID = {
  brand: '33333333-0000-4000-8000-000000000001',
  store1: '44444444-0000-4000-8000-000000000001',
  customer: '22222222-0000-4000-8000-000000000004',
  voucher: '99999999-0000-4000-8000-000000000001',
  campPublished: '66666666-0000-4000-8000-000000000001',
};

function sqlStatements(file: string) {
  return fs
    .readFileSync(path.join(__dirname, '..', '..', 'database', 'postgres', file), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('--') && !/^CREATE EXTENSION/i.test(l))
    .join('\n')
    .split(/;\s*\n/)
    .map((s) => s.trim().replace(/;$/, ''))
    .filter(Boolean);
}

async function createDataSource(): Promise<DataSource> {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, implementation: () => crypto.randomUUID(), impure: true });
  db.public.registerFunction({ name: 'version', returns: DataType.text, implementation: () => 'PostgreSQL 16' });
  db.public.registerFunction({ name: 'current_database', returns: DataType.text, implementation: () => 'voucher_platform' });
  // Nap dung file SQL giao cho nhom: neu entity va schema.sql lech nhau, cac truy van se loi
  for (const stmt of [...sqlStatements('schema.sql'), ...sqlStatements('seed.sql')]) db.public.none(stmt);

  const ds: DataSource = await db.adapters.createTypeormDataSource({
    type: 'postgres',
    entities: Object.values(entities).filter((e) => typeof e === 'function'),
  });
  return ds.initialize();
}

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  dataSource: DataSource;
  login(email: string): Promise<string>;
  // Khach dang nhap bang OTP qua email; trong test ky thang access token cung dinh dang voi AuthService
  customerToken(userId: string, email: string): string;
}

export async function createTestApp(): Promise<TestApp> {
  const dataSource = await createDataSource();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getDataSourceToken())
    .useValue(dataSource)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  const http = request(app.getHttpServer());
  return {
    app,
    http,
    dataSource,
    async login(email: string) {
      const res = await http.post('/api/auth/login').send({ email, password: PASSWORD }).expect(201);
      return res.body.data.accessToken as string;
    },
    customerToken(userId: string, email: string) {
      return app.get(JwtService).sign(
        { sub: userId, email, role: 'CUSTOMER' },
        { secret: process.env.JWT_ACCESS_SECRET || 'change_me_access_secret', expiresIn: '15m' },
      );
    },
  };
}
