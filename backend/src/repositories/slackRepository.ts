import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';

export interface SlackConnectionRecord {
  id: number;
  user_id: number;
  team_id: string | null;
  access_token: string;
  channel_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UpsertSlackConnectionInput {
  userId: number;
  teamId?: string | null;
  accessToken: string;
  channelId?: string | null;
}

export async function getSlackConnectionByUserId(
  userId: number
): Promise<SlackConnectionRecord | null> {
  const query = `SELECT * FROM slack_connections WHERE user_id = ?`;
  const [rows] = await pool.query<RowDataPacket[]>(query, [userId]);
  if (rows.length === 0) {
    return null;
  }
  return rows[0] as SlackConnectionRecord;
}

export async function upsertSlackConnection(
  input: UpsertSlackConnectionInput
): Promise<SlackConnectionRecord> {
  const query = `
    INSERT INTO slack_connections (user_id, team_id, access_token, channel_id)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      team_id = VALUES(team_id),
      access_token = VALUES(access_token),
      channel_id = COALESCE(VALUES(channel_id), channel_id)
  `;
  const values = [
    input.userId,
    input.teamId || null,
    input.accessToken,
    input.channelId || null,
  ];

  await pool.query<ResultSetHeader>(query, values);

  const connection = await getSlackConnectionByUserId(input.userId);
  if (!connection) {
    throw new Error(`Failed to retrieve slack connection for user ${input.userId}`);
  }
  return connection;
}

export async function updateSlackChannel(
  userId: number,
  channelId: string
): Promise<SlackConnectionRecord> {
  const query = `UPDATE slack_connections SET channel_id = ? WHERE user_id = ?`;
  await pool.query(query, [channelId, userId]);

  const connection = await getSlackConnectionByUserId(userId);
  if (!connection) {
    throw new Error(`Slack connection not found for user ${userId}`);
  }
  return connection;
}

export async function deleteSlackConnection(userId: number): Promise<void> {
  const query = `DELETE FROM slack_connections WHERE user_id = ?`;
  await pool.query(query, [userId]);
}
