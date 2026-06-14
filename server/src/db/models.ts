import { DataTypes, Model } from 'sequelize';
import { sequelize } from './index.js';

// 多库兼容说明:
// - 原 PG 专属的 ARRAY(TEXT) 与 JSONB 一律改为 DataTypes.JSON(Sequelize 在
//   PG/MySQL/SQLite 上都支持,底层各自落地为 json/longtext/text),换取跨库一致。
// - 数组字段(tags/targetGroups)语义不变,仍存字符串数组,业务侧已有 Array 守卫。

export class Client extends Model {
  declare id: string;
  declare name: string;
  declare hostname: string | null;
  declare ipAddress: string | null;
  declare os: string | null;
  declare arch: string | null;
  declare osPlatform: string | null;
  declare osVersion: string | null;
  declare country: string | null;
  declare countryName: string | null;
  declare groupName: string;
  declare token: string;
  declare agentVersion: string | null;
  declare tags: string[];
  declare sortOrder: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}

Client.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  hostname: DataTypes.STRING(255),
  ipAddress: DataTypes.STRING(45),
  os: DataTypes.STRING(50),
  arch: DataTypes.STRING(20),
  osPlatform: DataTypes.STRING(50),
  osVersion: DataTypes.STRING(50),
  country: DataTypes.STRING(2),
  countryName: DataTypes.STRING(80),
  groupName: {
    type: DataTypes.STRING(50),
    defaultValue: 'default',
  },
  token: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
  },
  agentVersion: DataTypes.STRING(20),
  tags: {
    type: DataTypes.JSON,
    defaultValue: [],
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, { sequelize, tableName: 'clients', underscored: true });

export class Metric extends Model {
  declare id: number;
  declare clientId: string;
  declare collectedAt: Date;
  declare extra: Record<string, unknown> | null;
}

Metric.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  clientId: {
    type: DataTypes.UUID,
  },
  collectedAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  extra: DataTypes.JSON,
}, { sequelize, tableName: 'metrics', underscored: true, timestamps: false, indexes: [{ fields: ['client_id', 'collected_at'] }] });

export class CommandLog extends Model {
  declare id: number;
  declare clientId: string;
  declare command: string;
  declare exitCode: number | null;
  declare stdout: string | null;
  declare stderr: string | null;
  declare executedBy: string | null;
  declare executedAt: Date;
  declare durationMs: number | null;
}

CommandLog.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  clientId: {
    type: DataTypes.UUID,
  },
  command: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  exitCode: DataTypes.INTEGER,
  stdout: DataTypes.TEXT,
  stderr: DataTypes.TEXT,
  executedBy: DataTypes.STRING(100),
  executedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  durationMs: DataTypes.INTEGER,
}, { sequelize, tableName: 'command_logs', underscored: true, timestamps: false });

export class AlertRule extends Model {
  declare id: string;
  declare name: string;
  declare targetGroups: string[] | null;
  declare metric: string;
  declare operator: string;
  declare threshold: number;
  declare durationSeconds: number;
  declare notifyChannelIds: string[] | null;
  declare enabled: boolean;
  declare createdAt: Date;
}

AlertRule.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  targetGroups: {
    type: DataTypes.JSON,
  },
  metric: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  operator: {
    type: DataTypes.STRING(10),
    allowNull: false,
  },
  threshold: {
    type: DataTypes.REAL,
    allowNull: false,
  },
  durationSeconds: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  notifyChannelIds: DataTypes.JSON,
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, { sequelize, tableName: 'alert_rules', underscored: true, updatedAt: false });

export class AlertEvent extends Model {
  declare id: number;
  declare ruleId: string;
  declare clientId: string;
  declare triggeredAt: Date;
  declare resolvedAt: Date | null;
  declare currentValue: number | null;
  declare status: string;
}

AlertEvent.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  ruleId: {
    type: DataTypes.UUID,
  },
  clientId: {
    type: DataTypes.UUID,
  },
  triggeredAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  resolvedAt: DataTypes.DATE,
  currentValue: DataTypes.REAL,
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'firing',
  },
}, { sequelize, tableName: 'alert_events', underscored: true, timestamps: false });

export class StatusLog extends Model {
  declare id: number;
  declare clientId: string;
  declare status: string;
  declare timestamp: Date;
}

StatusLog.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  clientId: {
    type: DataTypes.UUID,
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, { sequelize, tableName: 'status_logs', underscored: true, timestamps: false, indexes: [{ fields: ['client_id', 'timestamp'] }] });

export class ScheduledTask extends Model {
  declare id: string;
  declare name: string;
  declare cronExpression: string;
  declare command: string;
  declare targetGroups: string[] | null;
  declare enabled: boolean;
  declare lastRunAt: Date | null;
  declare createdAt: Date;
}

ScheduledTask.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  cronExpression: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  command: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  targetGroups: {
    type: DataTypes.JSON,
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  lastRunAt: DataTypes.DATE,
}, { sequelize, tableName: 'scheduled_tasks', underscored: true, updatedAt: false });

export class NetNode extends Model {
  declare id: string;
  declare name: string;
  declare target: string;
  declare probe: string;
  declare isp: string | null;
  declare enabled: boolean;
  declare sortOrder: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}

NetNode.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  target: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  probe: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'http',
  },
  isp: DataTypes.STRING(50),
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, { sequelize, tableName: 'net_nodes', underscored: true });

export class ClientConfig extends Model {
  declare id: number;
  declare clientId: string;
  declare data: Record<string, unknown>;
  declare createdAt: Date;
  declare updatedAt: Date;
}

ClientConfig.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  clientId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
  },
  data: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
  },
}, { sequelize, tableName: 'client_config', underscored: true });

export class NotificationChannel extends Model {
  declare id: string;
  declare name: string;
  declare type: string;
  declare config: Record<string, string>;
  declare enabled: boolean;
  declare createdAt: Date;
}

NotificationChannel.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  type: {
    type: DataTypes.STRING(30),
    allowNull: false,
  },
  config: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, { sequelize, tableName: 'notify_channels', underscored: true, updatedAt: false });

// 系统级键值配置：如 IP 归属地查询接口地址、字段解析路径等，可在后台“设置”页修改。
export class SystemConfig extends Model {
  declare key: string;
  declare value: string | null;
  declare updatedAt: Date;
}

SystemConfig.init({
  key: {
    type: DataTypes.STRING(80),
    primaryKey: true,
  },
  value: DataTypes.TEXT,
}, { sequelize, tableName: 'system_config', underscored: true, createdAt: false });

// 模型关联
// AlertEvent 通过 ruleId/clientId 关联告警规则与客户端,供 include 查询使用。
// constraints: false —— 仅建立 Sequelize 层面的关联(让 include 可用),不在数据库创建外键约束。
AlertEvent.belongsTo(AlertRule, { foreignKey: 'ruleId', constraints: false });
AlertRule.hasMany(AlertEvent, { foreignKey: 'ruleId', constraints: false });
AlertEvent.belongsTo(Client, { foreignKey: 'clientId', constraints: false });
Client.hasMany(AlertEvent, { foreignKey: 'clientId', constraints: false });
