import { Router, Request, Response } from 'express';
import * as emailRepository from '../repositories/emailRepository';
import * as senderRepository from '../repositories/senderRepository';
import { emailQueue } from '../queues/emailQueue';
import * as emailSearchService from '../services/emailSearchService';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

// Protect all email endpoints with server-side authentication
router.use(requireAuth);

// POST /api/emails/schedule
router.post('/schedule', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const { recipient, subject, body, scheduledAt, idempotencyKey, senderId: rawSenderId } = req.body;

    // 1. Validation
    if (!recipient || typeof recipient !== 'string' || recipient.trim() === '') {
      res.status(400).json({ error: 'recipient is required and must be a valid string' });
      return;
    }
    if (!subject || typeof subject !== 'string' || subject.trim() === '') {
      res.status(400).json({ error: 'subject is required and must be a valid string' });
      return;
    }
    if (!body || typeof body !== 'string' || body.trim() === '') {
      res.status(400).json({ error: 'body is required and must be a valid string' });
      return;
    }
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
      res.status(400).json({ error: 'idempotencyKey is required and must be a valid string' });
      return;
    }

    if (!scheduledAt) {
      res.status(400).json({ error: 'scheduledAt date is required' });
      return;
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      res.status(400).json({ error: 'scheduledAt must be a valid ISO date string' });
      return;
    }

    const now = Date.now();
    if (scheduledDate.getTime() <= now) {
      res.status(400).json({ error: 'scheduledAt must be in the future' });
      return;
    }

    // Sender validation & resolution
    const userSenders = await senderRepository.getSendersByUserId(userId);
    let resolvedSenderId: number | null = null;

    if (rawSenderId !== undefined && rawSenderId !== null && rawSenderId !== '') {
      const parsedSenderId = parseInt(String(rawSenderId), 10);
      if (isNaN(parsedSenderId)) {
        res.status(400).json({ error: 'Invalid senderId provided' });
        return;
      }

      const sender = await senderRepository.getSenderById(userId, parsedSenderId);
      if (!sender) {
        // Return 404 to avoid leaking existence of another user's sender
        res.status(404).json({ error: 'Sender not found' });
        return;
      }
      resolvedSenderId = sender.id;
    } else {
      if (userSenders.length > 1) {
        res.status(400).json({ error: 'Please select a sender.' });
        return;
      } else if (userSenders.length === 1) {
        resolvedSenderId = userSenders[0].id;
      } else {
        resolvedSenderId = null;
      }
    }

    // 2. Check Idempotency
    const existingEmail = await emailRepository.findEmailByIdempotencyKey(idempotencyKey);
    if (existingEmail) {
      // User isolation check on idempotency match
      if (existingEmail.user_id !== userId) {
        res.status(400).json({ error: 'idempotencyKey is already used by another account' });
        return;
      }

      res.status(200).json({
        message: 'Email already scheduled',
        emailId: existingEmail.id,
        queueJobId: existingEmail.queue_job_id,
        email: {
          id: existingEmail.id,
          senderId: existingEmail.sender_id,
          recipient: existingEmail.recipient,
          subject: existingEmail.subject,
          scheduledAt: existingEmail.scheduled_at,
          status: existingEmail.status,
          queueJobId: existingEmail.queue_job_id,
        },
      });
      return;
    }

    // 3. Insert email record into database with authenticated user ID & resolved sender ID
    const emailRecord = await emailRepository.createEmail({
      userId,
      senderId: resolvedSenderId,
      recipient: recipient.trim(),
      subject: subject.trim(),
      body: body.trim(),
      scheduledAt: scheduledDate,
      idempotencyKey: idempotencyKey.trim(),
    });

    // 4. Index in Elasticsearch
    await emailSearchService.indexEmail(emailRecord);

    // 5. Calculate delay and add BullMQ delayed job
    const delay = scheduledDate.getTime() - Date.now();
    const jobId = `email-${emailRecord.id}`;

    try {
      await emailQueue.add(
        'send-email',
        {
          emailId: emailRecord.id,
          recipient: emailRecord.recipient,
        },
        {
          delay,
          jobId,
        }
      );

      // 6. Update queue_job_id in DB
      await emailRepository.updateQueueJobId(emailRecord.id, jobId);

      res.status(201).json({
        message: 'Email scheduled successfully',
        email: {
          id: emailRecord.id,
          recipient: emailRecord.recipient,
          subject: emailRecord.subject,
          scheduledAt: emailRecord.scheduled_at,
          status: 'scheduled',
          queueJobId: jobId,
        },
      });
    } catch (queueError) {
      console.error('Failed to enqueue BullMQ job, marking email as failed:', queueError);
      await emailRepository.markAsFailed(emailRecord.id);
      await emailSearchService.updateEmailStatusInIndex(emailRecord.id, 'failed');
      res.status(500).json({ error: 'Failed to schedule email job in queue' });
    }
  } catch (error) {
    console.error('Error in POST /api/emails/schedule:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/emails/scheduled
router.get('/scheduled', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const scheduledEmails = await emailRepository.getScheduledEmailsByUserId(userId);

    const formattedEmails = scheduledEmails.map((email) => ({
      id: email.id,
      senderId: email.sender_id,
      recipient: email.recipient,
      subject: email.subject,
      scheduledAt: email.scheduled_at,
      status: email.status,
      queueJobId: email.queue_job_id,
    }));

    res.status(200).json({ emails: formattedEmails });
  } catch (error) {
    console.error('Error in GET /api/emails/scheduled:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/emails/search
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const q = req.query.q as string | undefined;
    const status = req.query.status as string | undefined;
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;

    const result = await emailSearchService.searchEmails({
      userId,
      q,
      status,
      page: isNaN(page) ? 1 : page,
      limit: isNaN(limit) ? 20 : limit,
    });

    res.status(200).json({
      reachable: result.reachable,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      data: result.data,
    });
  } catch (error) {
    console.error('Error in GET /api/emails/search:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/emails/search/reindex
router.post('/search/reindex', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const result = await emailSearchService.reindexAllUserEmails(userId);

    if (!result.reachable) {
      res.status(503).json({ error: 'Elasticsearch search service is unavailable' });
      return;
    }

    res.status(200).json({
      message: 'Reindexing completed successfully',
      indexedCount: result.indexedCount,
    });
  } catch (error) {
    console.error('Error in POST /api/emails/search/reindex:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/emails/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const rawId = req.params.id;
    const idStr = Array.isArray(rawId) ? rawId[0] : String(rawId);
    const id = parseInt(idStr, 10);

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid email ID' });
      return;
    }

    const email = await emailRepository.findEmailById(id);
    if (!email || email.user_id !== userId) {
      res.status(404).json({ error: 'Email not found' });
      return;
    }

    res.status(200).json({ email });
  } catch (error) {
    console.error(`Error in GET /api/emails/:id:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
