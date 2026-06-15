import { Request, Response } from 'express';
import { ScheduledTask, CommandLog, Client } from '../db/models.js';
import { cronService } from '../services/cronService.js';

export async function getTasks(_req: Request, res: Response) {
  const tasks = await ScheduledTask.findAll({ order: [['createdAt', 'DESC']] });
  res.json(tasks);
}

export async function createTask(req: Request, res: Response) {
  const task = await ScheduledTask.create(req.body);
  if (task.enabled) cronService.schedule(task);
  res.status(201).json(task);
}

export async function updateTask(req: Request, res: Response) {
  const task = await ScheduledTask.findByPk(req.params.id as string);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  await task.update(req.body);
  cronService.reschedule(task);
  res.json(task);
}

export async function deleteTask(req: Request, res: Response) {
  cronService.unschedule(req.params.id as string);
  await ScheduledTask.destroy({ where: { id: req.params.id as string } });
  res.json({ success: true });
}

/** 立即执行一次任务,返回实际下发的在线节点数。 */
export async function runTask(req: Request, res: Response) {
  const task = await ScheduledTask.findByPk(req.params.id as string);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  const sent = await cronService.runNow(task);
  res.json({ success: true, sent });
}

/** 某定时任务的执行记录(由 cron 触发写入 command_logs,按执行时间倒序)。 */
export async function getTaskLogs(req: Request, res: Response) {
  const limit = parseInt(req.query.limit as string) || 100;
  const logs = await CommandLog.findAll({
    where: { taskId: req.params.id as string },
    order: [['executedAt', 'DESC']],
    limit,
  });
  // 附带节点名称,便于前端展示是哪台机器执行的
  const clientIds = [...new Set(logs.map(l => l.clientId))];
  const clients = await Client.findAll({ where: { id: clientIds }, attributes: ['id', 'name'] });
  const nameMap = new Map(clients.map(c => [c.id, c.name]));
  res.json(logs.map(l => ({ ...l.toJSON(), clientName: nameMap.get(l.clientId) || l.clientId })));
}
