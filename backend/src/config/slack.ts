import dotenv from 'dotenv';

dotenv.config();

export const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID || '';
export const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET || '';
export const SLACK_REDIRECT_URI =
  process.env.SLACK_REDIRECT_URI || 'http://localhost:5000/api/slack/callback';
export const SLACK_SCOPES =
  process.env.SLACK_SCOPES || 'chat:write,channels:read,groups:read';
