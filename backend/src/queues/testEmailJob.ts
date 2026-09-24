import { emailQueue } from './emailQueue';

async function runTestJob() {
  try {
    console.log('Adding test job to email-scheduler queue...');
    const job = await emailQueue.add('test-email', {
      emailId: 1,
      recipient: 'test@example.com',
    });

    console.log(`Test job successfully added with ID: ${job.id}`);
  } catch (error) {
    console.error('Failed to add test job:', error);
  } finally {
    await emailQueue.close();
    process.exit(0);
  }
}

runTestJob();
