import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { Sender } from '../types/sender';

function mapRowToSender(row: any): Sender {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    name: row.name || null,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
  };
}

export async function getSendersByUserId(userId: number): Promise<Sender[]> {
  const query = `
    SELECT * FROM senders 
    WHERE user_id = ? 
    ORDER BY id ASC
  `;
  const [rows] = await pool.query<RowDataPacket[]>(query, [userId]);
  return rows.map(mapRowToSender);
}

export async function getSenderById(userId: number, senderId: number): Promise<Sender | null> {
  const query = `
    SELECT * FROM senders 
    WHERE id = ? AND user_id = ?
  `;
  const [rows] = await pool.query<RowDataPacket[]>(query, [senderId, userId]);
  if (rows.length === 0) {
    return null;
  }
  return mapRowToSender(rows[0]);
}

export async function getSenderByIdUnchecked(senderId: number): Promise<Sender | null> {
  const query = `SELECT * FROM senders WHERE id = ?`;
  const [rows] = await pool.query<RowDataPacket[]>(query, [senderId]);
  if (rows.length === 0) {
    return null;
  }
  return mapRowToSender(rows[0]);
}

export async function getSenderByEmailAndUserId(userId: number, email: string): Promise<Sender | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const query = `
    SELECT * FROM senders 
    WHERE user_id = ? AND LOWER(email) = ?
  `;
  const [rows] = await pool.query<RowDataPacket[]>(query, [userId, normalizedEmail]);
  if (rows.length === 0) {
    return null;
  }
  return mapRowToSender(rows[0]);
}

export async function createSender(userId: number, email: string, name?: string | null): Promise<Sender> {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name && name.trim().length > 0 ? name.trim() : null;

  const query = `
    INSERT INTO senders (user_id, email, name) 
    VALUES (?, ?, ?)
  `;
  const [result] = await pool.query<ResultSetHeader>(query, [userId, normalizedEmail, trimmedName]);
  const created = await getSenderById(userId, result.insertId);
  if (!created) {
    throw new Error(`Failed to retrieve created sender with ID ${result.insertId}`);
  }
  return created;
}

export async function updateSender(
  userId: number,
  senderId: number,
  email: string,
  name?: string | null
): Promise<Sender | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name && name.trim().length > 0 ? name.trim() : null;

  const existing = await getSenderById(userId, senderId);
  if (!existing) {
    return null;
  }

  const query = `
    UPDATE senders 
    SET email = ?, name = ? 
    WHERE id = ? AND user_id = ?
  `;
  await pool.query(query, [normalizedEmail, trimmedName, senderId, userId]);
  return getSenderById(userId, senderId);
}

export async function deleteSender(userId: number, senderId: number): Promise<boolean> {
  const query = `
    DELETE FROM senders 
    WHERE id = ? AND user_id = ?
  `;
  const [result] = await pool.query<ResultSetHeader>(query, [senderId, userId]);
  return result.affectedRows > 0;
}
