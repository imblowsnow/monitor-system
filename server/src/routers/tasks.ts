import { Router } from 'express';
import { getTasks, createTask, updateTask, deleteTask, getTaskLogs, runTask } from '../controllers/tasks.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, getTasks);
router.post('/', authMiddleware, createTask);
router.get('/:id/logs', authMiddleware, getTaskLogs);
router.post('/:id/run', authMiddleware, runTask);
router.put('/:id', authMiddleware, updateTask);
router.delete('/:id', authMiddleware, deleteTask);

export default router;
