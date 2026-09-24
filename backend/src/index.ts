import express, { Request, Response } from 'express';
import cors from 'cors';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import pool from './config/database';
import { initDatabase } from './config/initDatabase';
import { redisClient } from './config/redis';
import passport from './config/passport';
import emailRoutes from './routes/emailRoutes';
import rateLimitRoutes from './routes/rateLimitRoutes';
import sendDelayRoutes from './routes/sendDelayRoutes';
import authRoutes from './routes/authRoutes';
import slackRoutes from './routes/slackRoutes';
import senderRoutes from './routes/senderRoutes';
import queueRoutes from './routes/queueRoutes';
import { isElasticsearchReachable, initializeEmailIndex } from './services/emailSearchService';


dotenv.config();

const SESSION_SECRET = process.env.SESSION_SECRET || 'email_scheduler_secret_key_prod_default_2026';
if (!process.env.SESSION_SECRET) {
  console.warn('[Warning] SESSION_SECRET not set in environment. Using fallback secret.');
}

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// 1. CORS Configuration (credentials required for session cookies)
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

// 2. JSON Body Parser
app.use(express.json());

// 3. Redis-Backed Express Session Middleware (ioredis compatibility adapter)
const redisStoreClientAdapter = {
  get: (key: string) => redisClient.get(key),
  set: (key: string, val: string, opts?: any) => {
    if (opts && opts.expiration && opts.expiration.type === 'EX') {
      return redisClient.set(key, val, 'EX', opts.expiration.value);
    }
    if (opts && opts.EX) {
      return redisClient.set(key, val, 'EX', opts.EX);
    }
    if (opts && opts.PX) {
      return redisClient.set(key, val, 'PX', opts.PX);
    }
    return redisClient.set(key, val);
  },
  del: (keys: string | string[]) => redisClient.del(Array.isArray(keys) ? keys : [keys]),
  expire: (key: string, ttl: number) => redisClient.expire(key, ttl),
  mGet: (keys: string[]) => redisClient.mget(keys),
};

const redisStore = new RedisStore({
  client: redisStoreClientAdapter as any,
  prefix: 'sess:',
});

app.use(
  session({
    store: redisStore,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'connect.sid',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // set to true in production HTTPS environments
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// 4. Passport Middleware Initialization
app.use(passport.initialize());
app.use(passport.session());

// 5. Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/slack', slackRoutes);
app.use('/api/senders', senderRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/queue', queueRoutes);

app.use('/api/rate-limit', rateLimitRoutes);
app.use('/api/send-delay', sendDelayRoutes);

// Root & Public Health Endpoints
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Email Scheduler API is running smoothly 🚀',
    status: 'online',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      dbHealth: '/health/db',
      redisHealth: '/health/redis',
      auth: '/api/auth',
      emails: '/api/emails',
      queue: '/api/queue',
      senders: '/api/senders',
      slack: '/api/slack',
      rateLimit: '/api/rate-limit',
      sendDelay: '/api/send-delay',
    },
  });
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.get('/health/db', async (req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({
      status: 'ok',
      database: 'connected',
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
    });
  }
});

app.get('/health/redis', async (req: Request, res: Response) => {
  try {
    const pingResult = await redisClient.ping();
    if (pingResult === 'PONG') {
      res.status(200).json({
        status: 'ok',
        redis: 'connected',
      });
    } else {
      res.status(503).json({
        status: 'error',
        redis: 'disconnected',
      });
    }
  } catch (error) {
    console.error('Redis health check failed:', error);
    res.status(503).json({
      status: 'error',
      redis: 'disconnected',
    });
  }
});

app.get('/health/elasticsearch', async (req: Request, res: Response) => {
  try {
    const isConnected = await isElasticsearchReachable();
    if (isConnected) {
      res.status(200).json({
        status: 'ok',
        elasticsearch: 'connected',
      });
    } else {
      res.status(503).json({
        status: 'error',
        elasticsearch: 'disconnected',
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'error',
      elasticsearch: 'disconnected',
    });
  }
});

// 6. Serve frontend build assets if present
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
const altFrontendDistPath = path.resolve(__dirname, '../frontend/dist');
const finalFrontendPath = fs.existsSync(frontendDistPath)
  ? frontendDistPath
  : fs.existsSync(altFrontendDistPath)
  ? altFrontendDistPath
  : null;

if (finalFrontendPath) {
  app.use(express.static(finalFrontendPath));
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(finalFrontendPath, 'index.html'));
  });
}

import { reconcileScheduledEmails } from './services/emailRecoveryService';
import './workers/emailWorker';

async function startServer() {
  try {
    console.log('Testing MySQL connection & initializing database schema...');
    await initDatabase();
  } catch (error: any) {
    console.warn('[Startup Warning] Database initialization not yet connected:', error?.message || error);
    console.warn('[Startup Warning] Please configure DB_HOST, DB_USER, DB_PASSWORD in your environment variables.');
  }

  // Attempt Elasticsearch index initialization (gracefully handled if ES is down)
  try {
    await initializeEmailIndex();
  } catch (esError) {
    // Graceful fallback
  }

  // Run scheduled email recovery/reconciliation if DB & Redis are reachable
  try {
    await reconcileScheduledEmails();
  } catch (recError: any) {
    console.warn('[Startup Warning] Scheduled email reconciliation skipped:', recError?.message || recError);
  }

  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

startServer();
