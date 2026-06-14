# 数据库结构管理

本项目用 **Sequelize** 作为 ORM,模型定义(`models.ts`)是结构的唯一事实来源。
支持多种数据库类型,启动时按 `DATABASE_URL` 自动建表/同步结构。

## 多数据库支持

`index.ts` 根据 `DATABASE_URL` 的协议头自动推断 Sequelize dialect:

| URL 协议头 | dialect | 驱动依赖 |
| --- | --- | --- |
| `postgres://` / `postgresql://` | postgres | `pg` `pg-hstore` |
| `mysql://` | mysql | `mysql2` |
| `mariadb://` | mariadb | `mysql2` |
| `sqlite:` / `file:` | sqlite | `sqlite3` |

`.env` 配置示例:

```bash
# PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/monitor
# MySQL
DATABASE_URL=mysql://root:root@localhost:3306/monitor
# SQLite(文件路径)
DATABASE_URL=sqlite:./data/monitor.db
```

### 跨库类型说明

为兼容多库,模型放弃了 PostgreSQL 专属类型:

- 原 `ARRAY(TEXT)`(`tags`、`targetGroups`)→ `DataTypes.JSON`,仍存字符串数组。
- 原 `JSONB`(`diskUsage`/`network`/`extra`/`notifyChannels`/`data`)→ `DataTypes.JSON`。

因此 JSON 列内的路径查询(如某采集器是否存在)改为**应用层过滤**,见
`metricsService.getLatestCollectorData`。

## 启动自动迁移

`index.ts` 启动时执行 `sequelize.authenticate()` + `sequelize.sync()`:
表不存在则创建。这是免运维的自动建表方案。

本地若需让已有表追上模型结构变更,可手动跑:

```bash
pnpm --filter server db:sync   # sequelize.sync({ alter: true })
```

## ⚠️ sync({ alter: true }) 的风险

`alter: true` 会自动改表结构,存在风险,**生产环境慎用**:

- **丢数据**:改字段名会被识别为「删旧列 + 加新列」,旧列数据直接丢失;删模型字段会删除对应列。
- **约束破坏**:处理外键、唯一索引时可能反复创建重名索引或报错。
- **不可回滚**:它只是「让库追上代码当前状态」,没有版本记录,线上出问题无法回退。

启动时的 `sync()`(不带 alter)只建缺失的表,不改已存在的表,相对安全。
生产环境的结构变更建议通过受控的手工 SQL / 专门的迁移流程处理。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `models.ts` | 模型定义,结构的唯一事实来源 |
| `index.ts` | Sequelize 实例,按 URL 推断 dialect(多库) |
| `sync.ts` | 本地建表/同步(`db:sync`,带 alter) |
