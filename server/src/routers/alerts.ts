import { Router } from 'express';
import { getRules, createRule, updateRule, deleteRule, getEvents } from '../controllers/alerts.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/rules', authMiddleware, getRules);
router.post('/rules', authMiddleware, createRule);
router.put('/rules/:id', authMiddleware, updateRule);
router.delete('/rules/:id', authMiddleware, deleteRule);
router.get('/events', authMiddleware, getEvents);

export default router;
