import pool from '../config/database';
import { Sender } from '../types/sender';

function mapRowToSender(row: any): Sender {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    email: row.email,
    name: row.name || null,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
  };
}

export async function getSendersByUserId(userId: number): Promise<Sender[]> {
  const query = `
    SELECT * FROM senders 
    WHERE user_id = $1 
    ORDER BY id ASC
  `;
  const result = await pool.query(query, [userId]);
  return result.rows.map(mapRowToSender);
}

export async function getSenderById(userId: number, senderId: number): Promise<Sender | null> {
  const query = `
    SELECT * FROM senders 
    WHERE id = $1 AND user_id = $2
  `;
  const result = await pool.query(query, [senderId, userId]);
  if (result.rows.length === 0) {
    return null;
  }
  return mapRowToSender(result.rows[0]);
}

export async function getSenderByIdUnchecked(senderId: number): Promise<Sender | null> {
  const query = `SELECT * FROM senders WHERE id = $1`;
  const result = await pool.query(query, [senderId]);
  if (result.rows.length === 0) {
    return null;
  }
  return mapRowToSender(result.rows[0]);
}

export async function getSenderByEmailAndUserId(userId: number, email: string): Promise<Sender | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const query = `
    SELECT * FROM senders 
    WHERE user_id = $1 AND LOWER(email) = $2
  `;
  const result = await pool.query(query, [userId, normalizedEmail]);
  if (result.rows.length === 0) {
    return null;
  }
  return mapRowToSender(result.rows[0]);
}

export async function createSender(userId: number, email: string, name?: string | null): Promise<Sender> {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name && name.trim().length > 0 ? name.trim() : null;

  const query = `
    INSERT INTO senders (user_id, email, name) 
    VALUES ($1, $2, $3)
    RETURNING *
  `;
  const result = await pool.query(query, [userId, normalizedEmail, trimmedName]);
  if (result.rows.length === 0) {
    throw new Error('Failed to create sender');
  }
  return mapRowToSender(result.rows[0]);
}

export async function updateSender(
  userId: number,
  senderId: number,
  email: string,
  name?: string | null
): Promise<Sender | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name && name.trim().length > 0 ? name.trim() : null;

  const query = `
    UPDATE senders 
    SET email = $1, name = $2 
    WHERE id = $3 AND user_id = $4
    RETURNING *
  `;
  const result = await pool.query(query, [normalizedEmail, trimmedName, senderId, userId]);
  if (result.rows.length === 0) {
    return null;
  }
  return mapRowToSender(result.rows[0]);
}

export async function deleteSender(userId: number, senderId: number): Promise<boolean> {
  const query = `
    DELETE FROM senders 
    WHERE id = $1 AND user_id = $2
  `;
  const result = await pool.query(query, [senderId, userId]);
  return (result.rowCount ?? 0) > 0;
}
