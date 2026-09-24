import { Router, Request, Response } from 'express';
import { getSendDelayStatus } from '../services/sendDelayLimiter';

const router = Router();

// GET /api/send-delay/status
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = await getSendDelayStatus();
    res.status(200).json(status);
  } catch (error) {
    console.error('Error fetching send delay status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
