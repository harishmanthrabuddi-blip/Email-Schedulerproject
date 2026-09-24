import pool from './database';

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('Successfully connected to PostgreSQL database.');

    // 0. Trigger function for updated_at timestamps
    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_set_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 1. users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        google_id VARCHAR(255) UNIQUE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        avatar TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_users'
        ) THEN
          CREATE TRIGGER set_timestamp_users
          BEFORE UPDATE ON users
          FOR EACH ROW
          EXECUTE FUNCTION trigger_set_timestamp();
        END IF;
      END $$;
    `);

    // 2. senders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS senders (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_senders_user_email UNIQUE (user_id, email)
      );
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_senders'
        ) THEN
          CREATE TRIGGER set_timestamp_senders
          BEFORE UPDATE ON senders
          FOR EACH ROW
          EXECUTE FUNCTION trigger_set_timestamp();
        END IF;
      END $$;
    `);

    // 3. emails table
    await client.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sender_id BIGINT REFERENCES senders(id) ON DELETE SET NULL,
        recipient VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body TEXT NOT NULL,
        scheduled_at TIMESTAMPTZ NOT NULL,
        sent_at TIMESTAMPTZ,
        status VARCHAR(50) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'processing', 'sent', 'failed')),
        attempts INT NOT NULL DEFAULT 0,
        idempotency_key VARCHAR(255) UNIQUE NOT NULL,
        queue_job_id VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
      CREATE INDEX IF NOT EXISTS idx_emails_sender_id ON emails(sender_id);
      CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
      CREATE INDEX IF NOT EXISTS idx_emails_scheduled_at ON emails(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_emails_sent_at ON emails(sent_at);
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_emails'
        ) THEN
          CREATE TRIGGER set_timestamp_emails
          BEFORE UPDATE ON emails
          FOR EACH ROW
          EXECUTE FUNCTION trigger_set_timestamp();
        END IF;
      END $$;
    `);

    // 4. slack_connections table
    await client.query(`
      CREATE TABLE IF NOT EXISTS slack_connections (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        team_id VARCHAR(255),
        access_token TEXT NOT NULL,
        channel_id VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_slack_user_id UNIQUE (user_id)
      );
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_slack_connections'
        ) THEN
          CREATE TRIGGER set_timestamp_slack_connections
          BEFORE UPDATE ON slack_connections
          FOR EACH ROW
          EXECUTE FUNCTION trigger_set_timestamp();
        END IF;
      END $$;
    `);

    // 5. Seed default dev user (id = 1) for local development / testing
    await client.query(`
      INSERT INTO users (id, google_id, name, email)
      VALUES (1, NULL, 'Development User', 'dev@example.com')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Sync sequence if necessary
    await client.query(`
      SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1));
    `);

    console.log('PostgreSQL database tables initialized successfully (users, senders, emails, slack_connections).');
  } catch (error) {
    console.error('PostgreSQL database initialization failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
