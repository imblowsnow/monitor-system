import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

import { app } from './app.js';
import { config } from './config/index.js';
import { sequelize } from './db/index.js';
import './db/models.js';
import { createAgentWss, createDashboardWss } from './ws/gateway.js';
import { clientManager } from './services/clientManager.js';
import { terminalService } from './services/terminalService.js';
import { alertService } from './services/alertService.js';
import { cronService } from './services/cronService.js';
import { cleanupService } from './services/cleanupService.js';
import { aggregateService } from './services/aggregateService.js';
import { seedNetNodes } from './services/clientConfigService.js';

async function main() {
  await sequelize.authenticate();
  console.log('Database connected.');
  // 启动时自动同步表结构(多库通用)。注意:sync({ alter }) 跨库改表有丢数据风险,
  // 仅 alter 表结构差异;生产环境结构变更建议谨慎,详见 db/README.md。
  await sequelize.sync({ alter: true });
  await seedNetNodes();

  const server = http.createServer(app);
  const agentWss = createAgentWss(server);
  const dashboardWss = createDashboardWss(server);

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', 'http://localhost');
    if (url.pathname === '/ws/agent') {
      agentWss.handleUpgrade(request, socket, head, (ws) => {
        agentWss.emit('connection', ws, request);
      });
    } else if (url.pathname === '/ws/dashboard') {
      dashboardWss.handleUpgrade(request, socket, head, (ws) => {
        dashboardWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  clientManager.start();
  terminalService.start();
  alertService.start();
  await cronService.start();
  await cleanupService.start();
  aggregateService.start();

  server.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
    console.log(`Agent WS: ws://localhost:${config.port}/ws/agent`);
    console.log(`Dashboard WS: ws://localhost:${config.port}/ws/dashboard`);
  });

  process.on('SIGTERM', () => {
    clientManager.stop();
    terminalService.stop();
    alertService.stop();
    cronService.stop();
    cleanupService.stop();
    aggregateService.stop();
    server.close();
    sequelize.close();
  });
}

main().catch(console.error);
