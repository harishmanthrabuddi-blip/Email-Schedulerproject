import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { CreateEmailInput, EmailRecord, EmailStatus } from '../types/email';

export async function createEmail(input: CreateEmailInput): Promise<EmailRecord> {
  const query = `
    INSERT INTO emails (user_id, sender_id, recipient, subject, body, scheduled_at, idempotency_key)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const values = [
    input.userId,
    input.senderId || null,
    input.recipient,
    input.subject,
    input.body,
    input.scheduledAt,
    input.idempotencyKey,
  ];

  const [result] = await pool.query<ResultSetHeader>(query, values);
  const emailId = result.insertId;

  const createdEmail = await findEmailById(emailId);
  if (!createdEmail) {
    throw new Error(`Failed to retrieve created email with ID ${emailId}`);
  }
  return createdEmail;
}

export async function findEmailById(id: number): Promise<EmailRecord | null> {
  const query = `SELECT * FROM emails WHERE id = ?`;
  const [rows] = await pool.query<RowDataPacket[]>(query, [id]);
  if (rows.length === 0) {
    return null;
  }
  return rows[0] as EmailRecord;
}

export async function findEmailByIdempotencyKey(key: string): Promise<EmailRecord | null> {
  const query = `SELECT * FROM emails WHERE idempotency_key = ?`;
  const [rows] = await pool.query<RowDataPacket[]>(query, [key]);
  if (rows.length === 0) {
    return null;
  }
  return rows[0] as EmailRecord;
}

export async function updateQueueJobId(id: number, queueJobId: string): Promise<void> {
  const query = `UPDATE emails SET queue_job_id = ? WHERE id = ?`;
  await pool.query(query, [queueJobId, id]);
}

export async function updateEmailStatus(id: number, status: EmailStatus): Promise<void> {
  const query = `UPDATE emails SET status = ? WHERE id = ?`;
  await pool.query(query, [status, id]);
}

export async function markAsProcessing(id: number): Promise<void> {
  const query = `
    UPDATE emails 
    SET status = 'processing', attempts = attempts + 1 
    WHERE id = ?
  `;
  await pool.query(query, [id]);
}

export async function markAsSent(id: number): Promise<void> {
  const query = `
    UPDATE emails 
    SET status = 'sent', sent_at = NOW() 
    WHERE id = ?
  `;
  await pool.query(query, [id]);
}

export async function markAsFailed(id: number): Promise<void> {
  const query = `
    UPDATE emails 
    SET status = 'failed' 
    WHERE id = ?
  `;
  await pool.query(query, [id]);
}

export async function incrementAttempts(id: number): Promise<void> {
  const query = `UPDATE emails SET attempts = attempts + 1 WHERE id = ?`;
  await pool.query(query, [id]);
}

export async function getScheduledEmailsByUserId(userId: number): Promise<EmailRecord[]> {
  const query = `
    SELECT * FROM emails 
    WHERE user_id = ? AND status = 'scheduled' 
    ORDER BY scheduled_at ASC
  `;
  const [rows] = await pool.query<RowDataPacket[]>(query, [userId]);
  return rows as EmailRecord[];
}

export async function getAllPendingScheduledEmails(): Promise<EmailRecord[]> {
  const query = `
    SELECT * FROM emails 
    WHERE status = 'scheduled' 
    ORDER BY scheduled_at ASC
  `;
  const [rows] = await pool.query<RowDataPacket[]>(query);
  return rows as EmailRecord[];
}

export async function resetInterruptedProcessingEmails(): Promise<number> {
  const query = `
    UPDATE emails 
    SET status = 'scheduled' 
    WHERE status = 'processing'
  `;
  const [result] = await pool.query<ResultSetHeader>(query);
  return result.affectedRows;
}

export async function getAllEmailsByUserId(userId: number): Promise<EmailRecord[]> {
  const query = `
    SELECT * FROM emails 
    WHERE user_id = ? 
    ORDER BY id ASC
  `;
  const [rows] = await pool.query<RowDataPacket[]>(query, [userId]);
  return rows as EmailRecord[];
}

export async function deleteEmailById(id: number): Promise<void> {
  const query = `DELETE FROM emails WHERE id = ?`;
  await pool.query(query, [id]);
}


