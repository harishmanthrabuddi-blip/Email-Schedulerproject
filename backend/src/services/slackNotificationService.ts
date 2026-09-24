import { redisClient } from '../config/redis';
import * as slackRepository from '../repositories/slackRepository';
import { sendSlackMessage } from './slackService';

export async function notifyRateLimitReached(
  userId: number,
  hourlyLimit: number
): Promise<void> {
  try {
    // 1. Calculate current UTC hour string (e.g., '2026-09-23T17')
    const now = new Date();
    const utcHour = now.toISOString().substring(0, 13);
    const dedupKey = `slack-rate-limit-notified:${userId}:${utcHour}`;

    // 2. Redis atomic deduplication: SET NX with 1 hour (3600s) TTL
    // Only the FIRST rate limit event for this user + UTC hour acquires the lock
    const acquired = await redisClient.set(dedupKey, '1', 'EX', 3600, 'NX');
    if (acquired !== 'OK') {
      // Notification already sent for this user during the current UTC hour
      return;
    }

    // 3. Fetch user's Slack connection from MySQL
    const connection = await slackRepository.getSlackConnectionByUserId(userId);
    if (!connection || !connection.access_token || !connection.channel_id) {
      console.log(
        `Slack notification skipped for User #${userId}: Slack is not connected or no channel selected.`
      );
      return;
    }

    // 4. Construct rate limit notification message
    const message = `⚠️ Email sending rate limit reached. ${hourlyLimit} emails/hour are allowed. Remaining scheduled emails will continue in the next available hour.`;

    // 5. Send Slack message
    await sendSlackMessage(connection.access_token, connection.channel_id, message);
    console.log(`Slack rate limit notification sent to User #${userId} (Channel: ${connection.channel_id})`);
  } catch (error: any) {
    // Fail safe: Slack notification errors must NEVER crash the worker or fail emails
    console.error(`Slack rate limit notification failed for User #${userId}:`, error?.message || error);
  }
}
