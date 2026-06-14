import { Router } from 'express';
import { getClients, getClient, createClient, updateClient, deleteClient, getGroups, getPublicStatus, getPublicClientStatus, getUptimeTimeline, reorderClients } from '../controllers/clients.js';
import { getConfig, updateConfig, getCollectorData } from '../controllers/clientConfig.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, getClients);
router.put('/reorder', authMiddleware, reorderClients);
router.get('/:id', authMiddleware, getClient);
router.get('/:id/uptime', authMiddleware, getUptimeTimeline);
router.get('/:id/config', authMiddleware, getConfig);
router.put('/:id/config', authMiddleware, updateConfig);
router.get('/:id/collectors/:collector', authMiddleware, getCollectorData);
router.post('/', authMiddleware, createClient);
router.put('/:id', authMiddleware, updateClient);
router.delete('/:id', authMiddleware, deleteClient);

export default router;

export const groupsRouter = Router();
groupsRouter.get('/', authMiddleware, getGroups);

export const publicRouter = Router();
publicRouter.get('/status', getPublicStatus);
publicRouter.get('/status/:id', getPublicClientStatus);
