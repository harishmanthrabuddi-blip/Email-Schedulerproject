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
  const query = `SELECT * FROM users WHERE id = $1`;
  const result = await pool.query(query, [id]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0] as UserRecord;
}

export async function findUserByGoogleId(googleId: string): Promise<UserRecord | null> {
  const query = `SELECT * FROM users WHERE google_id = $1`;
  const result = await pool.query(query, [googleId]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0] as UserRecord;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const query = `SELECT * FROM users WHERE email = $1`;
  const result = await pool.query(query, [email]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0] as UserRecord;
}

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  const query = `
    INSERT INTO users (google_id, name, email, avatar)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const values = [
    input.googleId || null,
    input.name,
    input.email,
    input.avatar || null,
  ];

  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    throw new Error('Failed to create user');
  }
  return result.rows[0] as UserRecord;
}

export async function updateUserGoogleId(
  id: number,
  googleId: string,
  avatar?: string | null
): Promise<UserRecord> {
  const query = `
    UPDATE users 
    SET google_id = $1, avatar = COALESCE($2, avatar)
    WHERE id = $3
    RETURNING *
  `;
  const result = await pool.query(query, [googleId, avatar || null, id]);
  if (result.rows.length === 0) {
    throw new Error(`Failed to retrieve updated user with ID ${id}`);
  }
  return result.rows[0] as UserRecord;
}
