import pool from './database';

export async function initDatabase(): Promise<void> {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('Successfully connected to MySQL database.');

    // 1. users table
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        google_id VARCHAR(255) UNIQUE NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        avatar TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    await connection.query(createUsersTable);

    // 2. senders table
    const createSendersTable = `
      CREATE TABLE IF NOT EXISTS senders (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_senders_user_email (user_id, email),
        CONSTRAINT fk_senders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    await connection.query(createSendersTable);

    // Safe migration check for unique constraint uk_senders_user_email if table existed prior
    const [senderIndexCheck]: any = await connection.query(`
      SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'senders' AND INDEX_NAME = 'uk_senders_user_email'
    `);
    if (senderIndexCheck && senderIndexCheck[0] && senderIndexCheck[0].count === 0) {
      console.log('Adding uk_senders_user_email index to existing senders table...');
      await connection.query('ALTER TABLE senders ADD UNIQUE KEY uk_senders_user_email (user_id, email)');
    }

    // 3. emails table
    const createEmailsTable = `
      CREATE TABLE IF NOT EXISTS emails (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        sender_id BIGINT UNSIGNED NULL,
        recipient VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body TEXT NOT NULL,
        scheduled_at DATETIME NOT NULL,
        sent_at DATETIME NULL,
        status ENUM('scheduled', 'processing', 'sent', 'failed') NOT NULL DEFAULT 'scheduled',
        attempts INT NOT NULL DEFAULT 0,
        idempotency_key VARCHAR(255) UNIQUE NOT NULL,
        queue_job_id VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_emails_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_emails_sender FOREIGN KEY (sender_id) REFERENCES senders(id) ON DELETE SET NULL,
        INDEX idx_emails_user_id (user_id),
        INDEX idx_emails_sender_id (sender_id),
        INDEX idx_emails_status (status),
        INDEX idx_emails_scheduled_at (scheduled_at),
        INDEX idx_emails_sent_at (sent_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    await connection.query(createEmailsTable);

    // Safe migration check for queue_job_id if table existed prior to column definition
    const [columnCheck]: any = await connection.query(`
      SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'emails' AND COLUMN_NAME = 'queue_job_id'
    `);
    if (columnCheck && columnCheck[0] && columnCheck[0].count === 0) {
      console.log('Adding queue_job_id column to existing emails table...');
      await connection.query('ALTER TABLE emails ADD COLUMN queue_job_id VARCHAR(255) NULL');
    }

    // 4. slack_connections table
    const createSlackConnectionsTable = `
      CREATE TABLE IF NOT EXISTS slack_connections (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        team_id VARCHAR(255) NULL,
        access_token TEXT NOT NULL,
        channel_id VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_slack_user_id (user_id),
        CONSTRAINT fk_slack_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    await connection.query(createSlackConnectionsTable);

    // Seed default dev user (id = 1) for local development before OAuth integration
    await connection.query(`
      INSERT IGNORE INTO users (id, google_id, name, email) 
      VALUES (1, NULL, 'Development User', 'dev@example.com')
    `);

    console.log('Database tables initialized successfully (users, senders, emails, slack_connections).');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
