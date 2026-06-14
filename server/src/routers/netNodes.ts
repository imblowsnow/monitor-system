import { Router } from 'express';
import { listNetNodes, createNetNode, updateNetNode, deleteNetNode } from '../controllers/netNodes.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, listNetNodes);
router.post('/', authMiddleware, createNetNode);
router.put('/:id', authMiddleware, updateNetNode);
router.delete('/:id', authMiddleware, deleteNetNode);

export default router;
