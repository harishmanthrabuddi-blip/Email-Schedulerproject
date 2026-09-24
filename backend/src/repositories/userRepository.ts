import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';

export interface UserRecord {
  id: number;
  google_id: string | null;
  name: string;
  email: string;
  avatar: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  googleId?: string | null;
  name: string;
  email: string;
  avatar?: string | null;
}

export async function findUserById(id: number): Promise<UserRecord | null> {
  const query = `SELECT * FROM users WHERE id = ?`;
  const [rows] = await pool.query<RowDataPacket[]>(query, [id]);
  if (rows.length === 0) {
    return null;
  }
  return rows[0] as UserRecord;
}

export async function findUserByGoogleId(googleId: string): Promise<UserRecord | null> {
  const query = `SELECT * FROM users WHERE google_id = ?`;
  const [rows] = await pool.query<RowDataPacket[]>(query, [googleId]);
  if (rows.length === 0) {
    return null;
  }
  return rows[0] as UserRecord;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const query = `SELECT * FROM users WHERE email = ?`;
  const [rows] = await pool.query<RowDataPacket[]>(query, [email]);
  if (rows.length === 0) {
    return null;
  }
  return rows[0] as UserRecord;
}

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  const query = `
    INSERT INTO users (google_id, name, email, avatar)
    VALUES (?, ?, ?, ?)
  `;
  const values = [
    input.googleId || null,
    input.name,
    input.email,
    input.avatar || null,
  ];

  const [result] = await pool.query<ResultSetHeader>(query, values);
  const createdUser = await findUserById(result.insertId);
  if (!createdUser) {
    throw new Error(`Failed to retrieve created user with ID ${result.insertId}`);
  }
  return createdUser;
}

export async function updateUserGoogleId(
  id: number,
  googleId: string,
  avatar?: string | null
): Promise<UserRecord> {
  const query = `
    UPDATE users 
    SET google_id = ?, avatar = COALESCE(?, avatar)
    WHERE id = ?
  `;
  await pool.query(query, [googleId, avatar || null, id]);
  const updatedUser = await findUserById(id);
  if (!updatedUser) {
    throw new Error(`Failed to retrieve updated user with ID ${id}`);
  }
  return updatedUser;
}
