import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export function login(req: Request, res: Response) {
  const { username, password } = req.body;
  if (username === config.auth.adminUser && password === config.auth.adminPass) {
    const token = jwt.sign({ userId: username, role: 'admin' }, config.auth.jwtSecret, { expiresIn: '24h' });
    res.json({ token, expiresIn: 86400 });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
}
