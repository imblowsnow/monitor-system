import express from 'express';
import cors from 'cors';
import authRouter from './routers/auth.js';
import clientsRouter, { groupsRouter, publicRouter, updatesRouter } from './routers/clients.js';
import metricsRouter from './routers/metrics.js';
import commandsRouter from './routers/commands.js';
import alertsRouter from './routers/alerts.js';
import notifyChannelsRouter from './routers/notifyChannels.js';
import tasksRouter from './routers/tasks.js';
import netNodesRouter from './routers/netNodes.js';
import systemConfigRouter from './routers/systemConfig.js';

export const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/clients', metricsRouter);
app.use('/api/clients', commandsRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/notify-channels', notifyChannelsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/netnodes', netNodesRouter);
app.use('/api/system-config', systemConfigRouter);
app.use('/api/updates', updatesRouter);
app.use('/api/public', publicRouter);
