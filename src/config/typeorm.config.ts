import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DB_TYPE } from './db-types';

// Hai cach khai bao ket noi:
//  1. DATABASE_URL (Neon / Supabase / Render): postgresql://user:pass@host/db?sslmode=require
//  2. Tung bien DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME (may ca nhan)
// DB_TYPE=postgres (mac dinh, cong 5432) hoac DB_TYPE=mysql (cong 3306).
// DB_SSL=true (hoac sslmode=require trong URL) de bat SSL - bat buoc voi CSDL tren cloud.
export default registerAs('database', (): TypeOrmModuleOptions => {
  const url = process.env.DATABASE_URL || undefined;
  const ssl = process.env.DB_SSL === 'true' || /sslmode=require/.test(url || '');
  const common = {
    url,
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'voucher_platform',
    autoLoadEntities: true,
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  };

  if (DB_TYPE === 'mysql') {
    return {
      ...common,
      type: 'mysql',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      charset: 'utf8mb4',
      // Doc / ghi datetime theo UTC (CON-05)
      timezone: 'Z',
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
    };
  }

  return {
    ...common,
    type: 'postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  };
});
