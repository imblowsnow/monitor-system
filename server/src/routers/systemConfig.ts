import { Router } from 'express';
import { getSystemConfig, updateSystemConfig, runCleanup, runAggregate } from '../controllers/systemConfig.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, getSystemConfig);
router.put('/', authMiddleware, updateSystemConfig);
router.post('/cleanup/run', authMiddleware, runCleanup);
router.post('/cleanup/aggregate', authMiddleware, runAggregate);

export default router;
