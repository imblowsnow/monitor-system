import { sequelize } from './index.js';
import './models.js';

/**
 * 仅用于本地开发快速建表 / 同步表结构。
 * sync({ alter: true }) 会自动改表结构,跨库时可能丢数据且不可回滚,生产慎用。
 */
async function sync() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');
    await sequelize.sync({ alter: true });
    console.log('All models synchronized.');
    process.exit(0);
  } catch (error) {
    console.error('Database sync failed:', error);
    process.exit(1);
  }
}

sync();
