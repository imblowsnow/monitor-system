import { Request, Response } from 'express';
import { ScheduledTask } from '../db/models.js';

export async function getTasks(_req: Request, res: Response) {
  const tasks = await ScheduledTask.findAll({ order: [['createdAt', 'DESC']] });
  res.json(tasks);
}

export async function createTask(req: Request, res: Response) {
  const task = await ScheduledTask.create(req.body);
  res.status(201).json(task);
}

export async function updateTask(req: Request, res: Response) {
  const task = await ScheduledTask.findByPk(req.params.id as string);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  await task.update(req.body);
  res.json(task);
}

export async function deleteTask(req: Request, res: Response) {
  await ScheduledTask.destroy({ where: { id: req.params.id as string } });
  res.json({ success: true });
}
