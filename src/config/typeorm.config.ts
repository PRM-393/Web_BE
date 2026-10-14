import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DB_TYPE } from './db-types';

// DB_TYPE=postgres (mac dinh, cong 5432) hoac DB_TYPE=mysql (cong 3306)
export default registerAs('database', (): TypeOrmModuleOptions => {
  const common = {
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
    };
  }

  return {
    ...common,
    type: 'postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  };
});
