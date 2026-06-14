import { Request, Response } from 'express';
import { Client, CommandLog } from '../db/models.js';
import { executeCommand } from '../services/commandService.js';

export async function runCommand(req: Request, res: Response) {
  const { command, timeout = 30000 } = req.body;
  if (!command) {
    res.status(400).json({ error: 'command is required' });
    return;
  }
  const client = await Client.findByPk(req.params.id as string);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const result = await executeCommand(client.id, client.id, command, timeout, (req as any).user.userId);
  if (!result.sent) {
    res.status(503).json({ error: 'Agent is offline' });
    return;
  }
  res.json({ msgId: result.id, status: 'sent' });
}

export async function getCommandLogs(req: Request, res: Response) {
  const limit = parseInt(req.query.limit as string) || 50;
  const logs = await CommandLog.findAll({
    where: { clientId: req.params.id as string },
    order: [['executedAt', 'DESC']],
    limit,
  });
  res.json(logs);
}
