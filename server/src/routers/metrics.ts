import { Router } from 'express';
import { getMetrics, getMetricsByRange } from '../controllers/metrics.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/:id/metrics', authMiddleware, getMetrics);
router.get('/:id/metrics/range', authMiddleware, getMetricsByRange);

export default router;
