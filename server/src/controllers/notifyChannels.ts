import { Request, Response } from 'express';
import { NotificationChannel } from '../db/models.js';

export async function listChannels(_req: Request, res: Response) {
  const channels = await NotificationChannel.findAll({ order: [['createdAt', 'DESC']] });
  res.json(channels);
}

export async function createChannel(req: Request, res: Response) {
  const { name, type, config, enabled } = req.body;
  if (!name || !type) {
    res.status(400).json({ error: 'name and type are required' });
    return;
  }
  const channel = await NotificationChannel.create({
    name,
    type,
    config: config || {},
    enabled: enabled !== false,
  });
  res.status(201).json(channel);
}

export async function updateChannel(req: Request, res: Response) {
  const channel = await NotificationChannel.findByPk(req.params.id as string);
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }
  await channel.update(req.body);
  res.json(channel);
}

export async function deleteChannel(req: Request, res: Response) {
  await NotificationChannel.destroy({ where: { id: req.params.id as string } });
  res.json({ success: true });
}
