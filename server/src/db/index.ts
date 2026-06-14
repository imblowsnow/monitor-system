import { Sequelize, type Dialect } from 'sequelize';
import { config } from '../config/index.js';

// 根据 url 协议头推断 Sequelize dialect
const DIALECT_MAP: Record<string, Dialect> = {
  postgres: 'postgres',
  postgresql: 'postgres',
  mysql: 'mysql',
  mariadb: 'mariadb',
  mssql: 'mssql',
  sqlserver: 'mssql',
  sqlite: 'sqlite',
  file: 'sqlite',
  db2: 'db2',
  snowflake: 'snowflake',
};

function resolveDialect(url: string): Dialect {
  const scheme = url.split('://')[0]?.split(':')[0]?.toLowerCase() ?? '';
  const dialect = DIALECT_MAP[scheme];
  if (!dialect) {
    throw new Error(`无法从数据库 URL 识别 dialect,未知协议: "${scheme}"`);
  }
  return dialect;
}

const dialect = resolveDialect(config.database.url);
const isSqlite = dialect === 'sqlite';

// sqlite 连接串形如 sqlite:./dev.db 或 file:./dev.db —— Sequelize 用 storage 指定文件路径。
function sqliteStorage(url: string): string {
  const rest = url.split('://')[1] ?? url.split(':')[1] ?? 'data.db';
  return rest || 'data.db';
}

export const sequelize = isSqlite
  ? new Sequelize({
      dialect: 'sqlite',
      // sqlite3 5.x 发布 N-API 预编译二进制(prebuild-install),免本地 node-gyp 编译。
      storage: sqliteStorage(config.database.url),
      logging: false,
    })
  : new Sequelize(config.database.url, {
      dialect,
      logging: false,
      pool: {
        max: 10,
        min: 2,
        acquire: 30000,
        idle: 10000,
      },
    });
