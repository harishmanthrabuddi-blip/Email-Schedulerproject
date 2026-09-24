import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { SLACK_CLIENT_ID, SLACK_CLIENT_SECRET } from '../config/slack';
import { FRONTEND_URL } from '../config/passport';
import * as slackRepository from '../repositories/slackRepository';
import {
  getSlackAuthorizationUrl,
  exchangeSlackCode,
  fetchSlackChannels,
} from '../services/slackService';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

// GET /api/slack/connect -> Initiate Slack OAuth flow
router.get('/connect', requireAuth, (req: Request, res: Response): void => {
  if (
    !SLACK_CLIENT_ID ||
    SLACK_CLIENT_ID === 'your_slack_client_id_here' ||
    !SLACK_CLIENT_SECRET ||
    SLACK_CLIENT_SECRET === 'your_slack_client_secret_here'
  ) {
    res.status(400).json({ error: 'Slack OAuth is not configured in backend/.env' });
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');
  if (req.session) {
    (req.session as any).slackAuthState = state;
  }

  const authUrl = getSlackAuthorizationUrl(state);
  res.redirect(authUrl);
});

// GET /api/slack/callback -> Handle Slack OAuth redirect callback
router.get('/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    const error = req.query.error as string | undefined;

    if (error) {
      console.error('Slack OAuth callback returned error:', error);
      res.redirect(`${FRONTEND_URL}/?slack_error=${encodeURIComponent(error)}`);
      return;
    }

    if (!code) {
      res.status(400).json({ error: 'Authorization code is missing from Slack callback' });
      return;
    }

    // CSRF State Validation
    const expectedState = req.session ? (req.session as any).slackAuthState : null;
    if (req.session) {
      delete (req.session as any).slackAuthState;
    }

    if (!state || !expectedState || state !== expectedState) {
      console.error('Slack OAuth callback state mismatch! Target CSRF protection triggered.');
      res.status(400).json({ error: 'Invalid OAuth state parameter' });
      return;
    }

    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userId = (req.user as any).id;

    // Exchange authorization code for access token
    const tokenResult = await exchangeSlackCode(code);

    // Save Slack connection in PostgreSQL
    await slackRepository.upsertSlackConnection({
      userId,
      teamId: tokenResult.teamId,
      accessToken: tokenResult.accessToken,
    });

    console.log(`Slack connection established for User #${userId} (Team: ${tokenResult.teamId})`);
    res.redirect(`${FRONTEND_URL}/`);
  } catch (err: any) {
    console.error('Error in GET /api/slack/callback:', err);
    res.redirect(`${FRONTEND_URL}/?slack_error=${encodeURIComponent(err.message || 'Slack connect failed')}`);
  }
});

// GET /api/slack/status -> Fetch Slack connection status for authenticated user
router.get('/status', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const connection = await slackRepository.getSlackConnectionByUserId(userId);

    if (!connection) {
      res.status(200).json({ connected: false });
      return;
    }

    let channelName: string | null = null;
    if (connection.access_token && connection.channel_id) {
      try {
        const channels = await fetchSlackChannels(connection.access_token);
        const match = channels.find((ch) => ch.id === connection.channel_id);
        if (match) {
          channelName = match.name;
        }
      } catch (err) {
        // Safe fallback if channel list lookup fails
      }
    }

    res.status(200).json({
      connected: true,
      teamId: connection.team_id,
      channelId: connection.channel_id,
      channelName,
    });
  } catch (error) {
    console.error('Error in GET /api/slack/status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/slack/channels -> List accessible Slack channels for channel selection
router.get('/channels', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const connection = await slackRepository.getSlackConnectionByUserId(userId);

    if (!connection || !connection.access_token) {
      res.status(400).json({ error: 'Slack is not connected for this account' });
      return;
    }

    const channels = await fetchSlackChannels(connection.access_token);
    res.status(200).json({ channels });
  } catch (error: any) {
    console.error('Error in GET /api/slack/channels:', error);
    res.status(500).json({ error: error.message || 'Failed to list Slack channels' });
  }
});

// POST /api/slack/channel -> Associate channel ID with user Slack connection
router.post('/channel', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    const { channelId } = req.body;

    if (!channelId || typeof channelId !== 'string' || channelId.trim() === '') {
      res.status(400).json({ error: 'channelId is required and must be a non-empty string' });
      return;
    }

    const connection = await slackRepository.getSlackConnectionByUserId(userId);
    if (!connection) {
      res.status(400).json({ error: 'Slack is not connected for this account' });
      return;
    }

    const trimmedInput = channelId.trim();
    let targetChannelId = trimmedInput;

    if (connection.access_token) {
      try {
        const channels = await fetchSlackChannels(connection.access_token);
        const match = channels.find(
          (c) =>
            c.id === trimmedInput ||
            c.name === trimmedInput ||
            c.name === trimmedInput.replace(/^#/, '')
        );

        if (match) {
          targetChannelId = match.id;
        } else {
          const isEmailAlertsReq =
            trimmedInput === 'email-alerts' || trimmedInput === '#email-alerts';
          if (isEmailAlertsReq) {
            res.status(400).json({
              error:
                'Channel #email-alerts is not accessible to the Slack app. Please add the app to the #email-alerts channel in your Slack workspace.',
            });
            return;
          }
        }
      } catch (err: any) {
        // Fallthrough if channel verification check faces API issue
      }
    }

    await slackRepository.updateSlackChannel(userId, targetChannelId);
    res.status(200).json({ message: 'Slack channel updated successfully', channelId: targetChannelId });
  } catch (error) {
    console.error('Error in POST /api/slack/channel:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/slack/disconnect -> Remove Slack connection for authenticated user
router.post('/disconnect', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any).id;
    await slackRepository.deleteSlackConnection(userId);
    res.status(200).json({ message: 'Slack disconnected' });
  } catch (error) {
    console.error('Error in POST /api/slack/disconnect:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
