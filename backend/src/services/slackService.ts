import { WebClient } from '@slack/web-api';
import {
  SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET,
  SLACK_REDIRECT_URI,
  SLACK_SCOPES,
} from '../config/slack';

export function getSlackAuthorizationUrl(state: string): string {
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', SLACK_CLIENT_ID);
  url.searchParams.set('scope', SLACK_SCOPES);
  url.searchParams.set('redirect_uri', SLACK_REDIRECT_URI);
  url.searchParams.set('state', state);
  return url.toString();
}

export interface SlackOAuthResult {
  accessToken: string;
  teamId: string | null;
  botUserId: string | null;
}

export async function exchangeSlackCode(code: string): Promise<SlackOAuthResult> {
  const client = new WebClient();
  const result = await client.oauth.v2.access({
    client_id: SLACK_CLIENT_ID,
    client_secret: SLACK_CLIENT_SECRET,
    code,
    redirect_uri: SLACK_REDIRECT_URI,
  });

  if (!result.ok || !result.access_token) {
    throw new Error(`Slack OAuth exchange failed: ${result.error || 'Unknown error'}`);
  }

  return {
    accessToken: result.access_token,
    teamId: result.team?.id || null,
    botUserId: result.bot_user_id || null,
  };
}

export interface SlackChannelItem {
  id: string;
  name: string;
}

export async function fetchSlackChannels(accessToken: string): Promise<SlackChannelItem[]> {
  const client = new WebClient(accessToken);
  let result;
  try {
    result = await client.conversations.list({
      types: 'public_channel,private_channel',
      exclude_archived: true,
      limit: 1000,
    });
  } catch (err: any) {
    if (
      err?.data?.error === 'missing_scope' ||
      err?.message?.includes('missing_scope') ||
      err?.code === 'slack_webapi_platform_error'
    ) {
      result = await client.conversations.list({
        types: 'public_channel',
        exclude_archived: true,
        limit: 1000,
      });
    } else {
      throw err;
    }
  }

  if (!result.ok || !result.channels) {
    throw new Error(`Failed to list Slack channels: ${result.error || 'Unknown error'}`);
  }

  return result.channels
    .filter((ch) => ch.id && ch.name)
    .map((ch) => ({
      id: ch.id as string,
      name: ch.name as string,
    }));
}

export async function sendSlackMessage(
  accessToken: string,
  channelId: string,
  text: string
): Promise<void> {
  const client = new WebClient(accessToken);
  const result = await client.chat.postMessage({
    channel: channelId,
    text,
  });

  if (!result.ok) {
    throw new Error(`Failed to send Slack message: ${result.error || 'Unknown error'}`);
  }
}
