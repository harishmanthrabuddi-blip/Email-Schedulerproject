import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import * as senderRepository from '../repositories/senderRepository';

const router = Router();

// Protect all sender endpoints with server-side authentication
router.use(requireAuth);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/senders - Return current user's senders
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const senders = await senderRepository.getSendersByUserId(userId);
    res.status(200).json(senders);
  } catch (error) {
    console.error('Error in GET /api/senders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/senders - Create new sender for authenticated user
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const { email, name } = req.body;

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({ error: 'Valid email address is required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check duplicate sender for same user
    const existing = await senderRepository.getSenderByEmailAndUserId(userId, normalizedEmail);
    if (existing) {
      res.status(400).json({ error: 'Sender with this email already exists for your account' });
      return;
    }

    const created = await senderRepository.createSender(userId, normalizedEmail, name);
    res.status(201).json(created);
  } catch (error: any) {
    console.error('Error in POST /api/senders:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Sender with this email already exists for your account' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

function parseIdParam(param: string | string[]): number {
  const idStr = Array.isArray(param) ? param[0] : String(param);
  return parseInt(idStr, 10);
}

// GET /api/senders/:id - Get single sender if owned by user
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const senderId = parseIdParam(req.params.id);

    if (isNaN(senderId)) {
      res.status(400).json({ error: 'Invalid sender ID' });
      return;
    }

    const sender = await senderRepository.getSenderById(userId, senderId);
    if (!sender) {
      // 404 to avoid leaking existence of senders owned by other accounts
      res.status(404).json({ error: 'Sender not found' });
      return;
    }

    res.status(200).json(sender);
  } catch (error) {
    console.error('Error in GET /api/senders/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/senders/:id - Update existing sender owned by user
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const senderId = parseIdParam(req.params.id);
    const { email, name } = req.body;

    if (isNaN(senderId)) {
      res.status(400).json({ error: 'Invalid sender ID' });
      return;
    }

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({ error: 'Valid email address is required' });
      return;
    }

    const existingSender = await senderRepository.getSenderById(userId, senderId);
    if (!existingSender) {
      res.status(404).json({ error: 'Sender not found' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check duplicate if changing email to another existing sender email of the user
    const duplicateCheck = await senderRepository.getSenderByEmailAndUserId(userId, normalizedEmail);
    if (duplicateCheck && duplicateCheck.id !== senderId) {
      res.status(400).json({ error: 'Another sender with this email already exists for your account' });
      return;
    }

    const updated = await senderRepository.updateSender(userId, senderId, normalizedEmail, name);
    res.status(200).json(updated);
  } catch (error: any) {
    console.error('Error in PUT /api/senders/:id:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Another sender with this email already exists for your account' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/senders/:id - Delete sender owned by user
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const senderId = parseIdParam(req.params.id);

    if (isNaN(senderId)) {
      res.status(400).json({ error: 'Invalid sender ID' });
      return;
    }

    const deleted = await senderRepository.deleteSender(userId, senderId);
    if (!deleted) {
      res.status(404).json({ error: 'Sender not found' });
      return;
    }

    res.status(200).json({ message: 'Sender deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/senders/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
