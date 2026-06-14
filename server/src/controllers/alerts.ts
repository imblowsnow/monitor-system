import { Request, Response } from 'express';
import { AlertRule, AlertEvent, Client } from '../db/models.js';

export async function getRules(_req: Request, res: Response) {
  const rules = await AlertRule.findAll({ order: [['createdAt', 'DESC']] });
  res.json(rules);
}

export async function createRule(req: Request, res: Response) {
  const rule = await AlertRule.create(req.body);
  res.status(201).json(rule);
}

export async function updateRule(req: Request, res: Response) {
  const rule = await AlertRule.findByPk(req.params.id as string);
  if (!rule) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  await rule.update(req.body);
  res.json(rule);
}

export async function deleteRule(req: Request, res: Response) {
  await AlertRule.destroy({ where: { id: req.params.id as string } });
  res.json({ success: true });
}

export async function getEvents(req: Request, res: Response) {
  const limit = parseInt(req.query.limit as string) || 100;
  const events = await AlertEvent.findAll({
    order: [['triggeredAt', 'DESC']],
    limit,
    include: [AlertRule, Client],
  });
  res.json(events);
}
