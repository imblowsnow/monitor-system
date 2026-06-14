import { Router } from 'express';
import { listChannels, createChannel, updateChannel, deleteChannel } from '../controllers/notifyChannels.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, listChannels);
router.post('/', authMiddleware, createChannel);
router.put('/:id', authMiddleware, updateChannel);
router.delete('/:id', authMiddleware, deleteChannel);

export default router;
