import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import config from '../config/index.js';

const QUEUE_NAME = 'emailQueue';

let emailQueue = null;
let emailWorker = null;
let isBullMQActive = false;

// Function to send email using Brevo
const sendBrevoEmail = async (jobData) => {
  if (!config.brevo.apiKey) {
    console.log(`[Email Dev Log] To: ${jobData.to} | Subject: ${jobData.subject}`);
    return;
  }

  const payload = {
    sender: {
      name: config.brevo.fromName || 'HomeNest',
      email: config.brevo.senderEmail || 'jasminkorat04@gmail.com',
    },
    to: [
      {
        email: jobData.to,
        name: jobData.name || jobData.to.split('@')[0],
      },
    ],
    subject: jobData.subject,
    htmlContent: jobData.html,
    textContent: jobData.text,
  };

  if (jobData.attachments && Array.isArray(jobData.attachments) && jobData.attachments.length > 0) {
    payload.attachment = jobData.attachments;
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': config.brevo.apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Brevo Error (${response.status}): ${data.message || JSON.stringify(data)}`);
  }

  console.log(`[BullMQ Worker] Email sent via Brevo to <${jobData.to}> (MessageId: ${data.messageId})`);
  return data;
}

// Initialize BullMQ Queue & Worker
try {
  emailQueue = new Queue(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  });

  emailWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      console.log(`[BullMQ Worker] Processing email job #${job.id} for <${job.data.to}>`);
      return await sendBrevoEmail(job.data);
    },
    {
      connection: redisConnection,
      concurrency: 5,
    }
  );

  emailWorker.on('completed', (job) => {
    console.log(`[BullMQ Worker] Job #${job.id} completed successfully.`);
  });

  emailWorker.on('failed', (job, err) => {
    console.error(`[BullMQ Worker] Job #${job?.id} failed:`, err.message);
  });

  emailQueue.on('error', (err) => {
    isBullMQActive = false;
  });

  emailWorker.on('error', (err) => {
    isBullMQActive = false;
  });

  isBullMQActive = true;
} catch {
  isBullMQActive = false;
  console.log('[BullMQ] Redis unavailable for BullMQ worker. Using in-memory async dispatch.');
}

/**
 * Enqueue an email job using BullMQ with resilient fallback
 * @param {object} emailData
 */
export const enqueueEmail = async (emailData) => {
  if (isBullMQActive && emailQueue) {
    try {
      const job = await emailQueue.add('sendEmail', emailData);
      console.log(`[BullMQ Queue] Enqueued job #${job.id} for <${emailData.to}>`);
      return { success: true, job_id: job.id, queue: 'bullmq' };
    } catch {
      // Redis connection failed on add, fall through to async fallback
    }
  }

  // Resilient non-blocking fallback
  setImmediate(async () => {
    try {
      await sendBrevoEmail(emailData);
    } catch (err) {
      console.error('[Email Fallback Error] Delivery failed:', err.message);
    }
  });

  return { success: true, queue: 'in-memory-fallback' };
};

export { emailQueue, emailWorker };
export default enqueueEmail;

