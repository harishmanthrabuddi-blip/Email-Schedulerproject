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

function mapRowToSlackConnection(row: any): SlackConnectionRecord {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    team_id: row.team_id || null,
    access_token: row.access_token,
    channel_id: row.channel_id || null,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

export async function getSlackConnectionByUserId(
  userId: number
): Promise<SlackConnectionRecord | null> {
  const query = `SELECT * FROM slack_connections WHERE user_id = $1`;
  const result = await pool.query(query, [userId]);
  if (result.rows.length === 0) {
    return null;
  }
  return mapRowToSlackConnection(result.rows[0]);
}

export async function upsertSlackConnection(
  input: UpsertSlackConnectionInput
): Promise<SlackConnectionRecord> {
  const query = `
    INSERT INTO slack_connections (user_id, team_id, access_token, channel_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id) DO UPDATE SET
      team_id = EXCLUDED.team_id,
      access_token = EXCLUDED.access_token,
      channel_id = COALESCE(EXCLUDED.channel_id, slack_connections.channel_id)
    RETURNING *
  `;
  const values = [
    input.userId,
    input.teamId || null,
    input.accessToken,
    input.channelId || null,
  ];

  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    throw new Error(`Failed to upsert slack connection for user ${input.userId}`);
  }
  return mapRowToSlackConnection(result.rows[0]);
}

export async function updateSlackChannel(
  userId: number,
  channelId: string
): Promise<SlackConnectionRecord> {
  const query = `
    UPDATE slack_connections 
    SET channel_id = $1 
    WHERE user_id = $2
    RETURNING *
  `;
  const result = await pool.query(query, [channelId, userId]);
  if (result.rows.length === 0) {
    throw new Error(`Slack connection not found for user ${userId}`);
  }
  return mapRowToSlackConnection(result.rows[0]);
}

export async function deleteSlackConnection(userId: number): Promise<void> {
  const query = `DELETE FROM slack_connections WHERE user_id = $1`;
  await pool.query(query, [userId]);
}
