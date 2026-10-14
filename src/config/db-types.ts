import 'dotenv/config';
import { ColumnType } from 'typeorm';

// He quan tri CSDL: postgres (mac dinh) hoac mysql, chon bang bien moi truong DB_TYPE.
// Entity dung cac kieu duoi day thay cho kieu rieng cua tung he de cung mot ma nguon chay duoc ca hai.
// Doc .env ngay khi nap file vi decorator cua entity chay truoc ConfigModule.
export type DbType = 'postgres' | 'mysql';

export const DB_TYPE: DbType = process.env.DB_TYPE === 'mysql' ? 'mysql' : 'postgres';

const isMysql = DB_TYPE === 'mysql';

// Moc thoi gian luu theo UTC (CON-05). MySQL khong co timestamptz nen dung datetime + timezone 'Z' cua driver.
export const DATETIME: ColumnType = isMysql ? 'datetime' : 'timestamptz';

export const DOUBLE: ColumnType = isMysql ? 'double' : 'double precision';

export const JSON_COLUMN: ColumnType = isMysql ? 'json' : 'jsonb';

// Tuy chon cho @CreateDateColumn / @UpdateDateColumn: PostgreSQL dung timestamptz (UTC),
// MySQL giu mac dinh datetime(6) cua TypeORM.
export const timestampOptions = (): { type?: ColumnType } => (isMysql ? {} : { type: 'timestamptz' });
