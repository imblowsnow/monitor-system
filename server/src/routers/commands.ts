import { Router } from 'express';
import { runCommand, getCommandLogs } from '../controllers/commands.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/:id/command', authMiddleware, runCommand);
router.get('/:id/commands', authMiddleware, getCommandLogs);

export default router;
