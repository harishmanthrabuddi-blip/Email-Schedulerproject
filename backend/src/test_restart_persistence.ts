import mysql from 'mysql2/promise';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { reconcileScheduledEmails } from './services/emailRecoveryService';
import { emailWorker } from './workers/emailWorker';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

const redisOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
};

async function runRestartPersistenceTests() {
  console.log('=== STARTING RESTART PERSISTENCE & RECOVERY AUTOMATED TEST SUITE ===\n');

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'MySQL@123',
    database: process.env.DB_NAME || 'email_scheduler',
  });

  const redis = new Redis(redisOptions);
  const queue = new Queue('email-scheduler', { connection: redisOptions });

  // Clean up previous test entries from MySQL & Redis rate limiters to ensure clean test runs
  await pool.query("DELETE FROM emails WHERE status = 'scheduled' OR recipient LIKE '%example.com'");
  const rateLimitKeys = await redis.keys('email-rate-limit:*');
  if (rateLimitKeys.length > 0) {
    await redis.del(...rateLimitKeys);
  }

  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      testsFailed++;
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Future scheduled email survives backend restart when BullMQ job exists
    // ------------------------------------------------------------------------
    console.log('[TEST 1] Testing future scheduled email reconciliation with existing BullMQ job...');
    const test1Idempotency = `test-recovery-1-${Date.now()}`;
    const futureTime1 = new Date(Date.now() + 15000); // 15s in future

    const [insert1]: any = await pool.query(
      `INSERT INTO emails (user_id, recipient, subject, body, scheduled_at, idempotency_key, status)
       VALUES (1, 'test1@example.com', 'Test Recovery 1', 'Body 1', ?, ?, 'scheduled')`,
      [futureTime1, test1Idempotency]
    );
    const email1Id = insert1.insertId;
    const job1Id = `email-${email1Id}`;

    const delay1 = Math.max(0, futureTime1.getTime() - Date.now());
    await queue.add('send-email', { emailId: email1Id, recipient: 'test1@example.com' }, { delay: delay1, jobId: job1Id });
    await pool.query('UPDATE emails SET queue_job_id = ? WHERE id = ?', [job1Id, email1Id]);

    // Check DB status and Redis job
    const [rows1]: any = await pool.query('SELECT status, queue_job_id FROM emails WHERE id = ?', [email1Id]);
    assert(rows1[0].status === 'scheduled', 'DB email #1 status is scheduled');
    assert(rows1[0].queue_job_id === job1Id, 'DB email #1 queue_job_id is set');

    const job1 = await queue.getJob(job1Id);
    assert(job1 !== null && job1 !== undefined, 'BullMQ job #1 exists in Redis before restart');

    // Simulate backend restart by running recovery reconciliation
    await reconcileScheduledEmails();

    const job1After = await queue.getJob(job1Id);
    assert(job1After !== null, 'BullMQ job #1 still exists after recovery reconciliation');

    console.log('  Waiting 22 seconds for worker processing & Ethereal SMTP completion...');
    await new Promise((res) => setTimeout(res, 22000));

    const [afterRows1]: any = await pool.query('SELECT status, sent_at FROM emails WHERE id = ?', [email1Id]);
    assert(afterRows1[0].status === 'sent', 'Email #1 status changed from scheduled -> sent after worker execution');
    assert(afterRows1[0].sent_at !== null, 'Email #1 sent_at timestamp is set in MySQL');
    console.log('[TEST 1] PASSED\n');

    // ------------------------------------------------------------------------
    // TEST 2: Future scheduled email recovers when BullMQ job is missing from Redis
    // ------------------------------------------------------------------------
    console.log('[TEST 2] Testing recovery of scheduled email whose BullMQ job was missing/deleted from Redis...');
    const test2Idempotency = `test-recovery-2-${Date.now()}`;
    const futureTime2 = new Date(Date.now() + 15000); // 15s in future

    const [insert2]: any = await pool.query(
      `INSERT INTO emails (user_id, recipient, subject, body, scheduled_at, idempotency_key, status)
       VALUES (1, 'test2@example.com', 'Test Recovery 2', 'Body 2', ?, ?, 'scheduled')`,
      [futureTime2, test2Idempotency]
    );
    const email2Id = insert2.insertId;
    const job2Id = `email-${email2Id}`;

    const missingJobBefore = await queue.getJob(job2Id);
    if (missingJobBefore) {
      await missingJobBefore.remove();
    }
    const checkMissing = await queue.getJob(job2Id);
    assert(checkMissing === null || checkMissing === undefined, 'Job #2 is missing from Redis before recovery');

    // Run recovery
    await reconcileScheduledEmails();

    const job2Recovered = await queue.getJob(job2Id);
    assert(job2Recovered !== null, 'Job #2 was recreated in Redis by recovery mechanism');
    assert(job2Recovered?.id === job2Id, 'Job #2 has deterministic ID matching email ID');

    console.log('  Waiting 22 seconds for recovered job execution & Ethereal SMTP...');
    await new Promise((res) => setTimeout(res, 22000));

    const [afterRows2]: any = await pool.query('SELECT status, sent_at FROM emails WHERE id = ?', [email2Id]);
    assert(afterRows2[0].status === 'sent', 'Email #2 status changed to sent after recovery & worker execution');
    console.log('[TEST 2] PASSED\n');

    // ------------------------------------------------------------------------
    // TEST 3: Email whose scheduled_at time passed while offline is immediately recovered
    // ------------------------------------------------------------------------
    console.log('[TEST 3] Testing recovery of email whose scheduled_at time passed while backend was offline...');
    const test3Idempotency = `test-recovery-3-${Date.now()}`;
    const pastTime = new Date(Date.now() - 60000); // 1 minute in past

    const [insert3]: any = await pool.query(
      `INSERT INTO emails (user_id, recipient, subject, body, scheduled_at, idempotency_key, status)
       VALUES (1, 'test3@example.com', 'Test Recovery 3 (Passed Time)', 'Body 3', ?, ?, 'scheduled')`,
      [pastTime, test3Idempotency]
    );
    const email3Id = insert3.insertId;
    const job3Id = `email-${email3Id}`;

    // Run recovery
    await reconcileScheduledEmails();

    const job3 = await queue.getJob(job3Id);
    assert(job3 !== null, 'Job #3 was enqueued immediately for passed scheduled_at time');

    console.log('  Waiting 8 seconds for immediate worker processing...');
    await new Promise((res) => setTimeout(res, 8000));

    const [afterRows3]: any = await pool.query('SELECT status FROM emails WHERE id = ?', [email3Id]);
    assert(afterRows3[0].status === 'sent', 'Passed scheduled email #3 processed immediately and status set to sent');
    console.log('[TEST 3] PASSED\n');

    // ------------------------------------------------------------------------
    // TEST 4: Multiple recovery runs are strictly idempotent and create zero duplicate jobs
    // ------------------------------------------------------------------------
    console.log('[TEST 4] Testing idempotency of recovery mechanism under multiple consecutive runs...');
    const test4Idempotency = `test-recovery-4-${Date.now()}`;
    const futureTime4 = new Date(Date.now() + 25000); // 25s in future

    const [insert4]: any = await pool.query(
      `INSERT INTO emails (user_id, recipient, subject, body, scheduled_at, idempotency_key, status)
       VALUES (1, 'test4@example.com', 'Test Recovery 4 (Idempotency)', 'Body 4', ?, ?, 'scheduled')`,
      [futureTime4, test4Idempotency]
    );
    const email4Id = insert4.insertId;
    const job4Id = `email-${email4Id}`;

    // Run recovery 3 times consecutively
    await reconcileScheduledEmails();
    await reconcileScheduledEmails();
    await reconcileScheduledEmails();

    const job4Count = await queue.getJob(job4Id);
    assert(job4Count !== null, 'Job #4 exists after 3 recovery runs');

    console.log('  Waiting 32 seconds to verify email #4 is sent exactly once...');
    await new Promise((res) => setTimeout(res, 32000));

    const [afterRows4]: any = await pool.query('SELECT status, attempts FROM emails WHERE id = ?', [email4Id]);
    assert(afterRows4[0].status === 'sent', 'Email #4 status is sent');
    assert(afterRows4[0].attempts === 1, 'Email #4 attempts count is exactly 1 (zero duplicates)');
    console.log('[TEST 4] PASSED\n');

    // ------------------------------------------------------------------------
    // TEST 5: Verify rate limiting and minimum delay rules apply to recovered jobs
    // ------------------------------------------------------------------------
    console.log('[TEST 5] Testing rate limiting and minimum send delay enforcement on recovered jobs...');
    const test5IdempotencyA = `test-recovery-5A-${Date.now()}`;
    const test5IdempotencyB = `test-recovery-5B-${Date.now()}`;
    const futureTime5 = new Date(Date.now() + 10000);

    const [insert5A]: any = await pool.query(
      `INSERT INTO emails (user_id, recipient, subject, body, scheduled_at, idempotency_key, status)
       VALUES (1, 'test5a@example.com', 'Test Recovery 5A', 'Body 5A', ?, ?, 'scheduled')`,
      [futureTime5, test5IdempotencyA]
    );
    const [insert5B]: any = await pool.query(
      `INSERT INTO emails (user_id, recipient, subject, body, scheduled_at, idempotency_key, status)
       VALUES (1, 'test5b@example.com', 'Test Recovery 5B', 'Body 5B', ?, ?, 'scheduled')`,
      [futureTime5, test5IdempotencyB]
    );

    await reconcileScheduledEmails();

    console.log('  Waiting 22 seconds for worker to process 5A & 5B with minimum delay spacing...');
    await new Promise((res) => setTimeout(res, 22000));

    const [rows5A]: any = await pool.query('SELECT status, sent_at FROM emails WHERE id = ?', [insert5A.insertId]);
    const [rows5B]: any = await pool.query('SELECT status, sent_at FROM emails WHERE id = ?', [insert5B.insertId]);

    assert(rows5A[0].status === 'sent', 'Recovered Email 5A sent');
    assert(rows5B[0].status === 'sent', 'Recovered Email 5B sent');

    const diffMs = Math.abs(new Date(rows5B[0].sent_at).getTime() - new Date(rows5A[0].sent_at).getTime());
    assert(diffMs >= 1500, `Minimum send delay respected between recovered emails (Diff: ${diffMs}ms >= 1500ms)`);
    console.log('[TEST 5] PASSED\n');

    console.log(`🎉 ALL 5 RECOVERY & PERSISTENCE TESTS PASSED SUCCESSFULLY! (${testsPassed} assertions passed)\n`);
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    await emailWorker.close();
    await queue.close();
    await redis.quit();
    await pool.end();
  }
}

runRestartPersistenceTests();
