import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import {
  getGlobalQueueStats,
  getUserJobStats,
  getUserJobs,
  getUserJobDetails,
  getQueueHealth,
} from '../services/queueMonitoringService';
import { registerSseClient, unregisterSseClient } from '../services/queueEventService';

const router = Router();

// Protect all queue monitoring endpoints with server-side authentication
router.use(requireAuth);

// GET /api/queue/stats - Return queue health counts & user job statistics
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const globalStats = await getGlobalQueueStats();
    const myCounts = await getUserJobStats(userId);

    res.status(200).json({
      queueName: globalStats.queueName,
      globalCounts: globalStats.counts,
      myCounts,
    });
  } catch (error) {
    console.error('Error in GET /api/queue/stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/queue/jobs - Return paginated user-scoped jobs filtered by status
router.get('/jobs', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const status = req.query.status as string | undefined;
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;

    const result = await getUserJobs(
      userId,
      status || 'delayed',
      isNaN(page) ? 1 : page,
      isNaN(limit) ? 20 : limit
    );

    res.status(200).json(result);
  } catch (error) {
    console.error('Error in GET /api/queue/jobs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/queue/health - Return infrastructure health overview
router.get('/health', async (req: Request, res: Response): Promise<void> => {
  try {
    const health = await getQueueHealth();
    res.status(200).json(health);
  } catch (error) {
    console.error('Error in GET /api/queue/health:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/queue/jobs/:jobId - Return safe single job details if owned by user
router.get('/jobs/:jobId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const rawId = req.params.jobId;
    const jobId = Array.isArray(rawId) ? rawId[0] : String(rawId);

    const jobDetails = await getUserJobDetails(userId, jobId);
    if (!jobDetails) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.status(200).json(jobDetails);
  } catch (error) {
    console.error(`Error in GET /api/queue/jobs/:jobId:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/queue/events - Authenticated SSE endpoint for live queue updates
router.get('/events', (req: Request, res: Response): void => {
  // Set SSE response headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send connection handshake
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', timestamp: Date.now() })}\n\n`);

  registerSseClient(res);

  // Clean up on client disconnect
  req.on('close', () => {
    unregisterSseClient(res);
  });
});

export default router;
