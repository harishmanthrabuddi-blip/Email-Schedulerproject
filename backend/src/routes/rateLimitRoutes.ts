import { Router, Request, Response } from 'express';
import { getRateLimitStatus } from '../services/rateLimiter';

const router = Router();

// GET /api/rate-limit/status
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = await getRateLimitStatus();
    res.status(200).json(status);
  } catch (error) {
    console.error('Error fetching rate limit status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
