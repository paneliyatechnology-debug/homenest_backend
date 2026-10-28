import Redis from 'ioredis';
import config from './index.js';

/**
 * Standard Redis connection options for BullMQ & ioredis
 */
export const redisConnection = {
  host: config.redis.host || '127.0.0.1',
  port: Number(config.redis.port) || 6379,
  password: config.redis.password || undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy: (times) => {
    if (times > 2) return null; // Do not hang or spam retries if Redis is unavailable
    return 100;
  },
};

class RedisService {
  constructor() {
    this.inMemoryStore = new Map();
    this.inMemoryTimers = new Map();
    this.isRedisConnected = false;

    this.client = new Redis({
      ...redisConnection,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 3) return null; // Don't block if redis is not running
        return Math.min(times * 100, 1000);
      },
    });

    this.init();
  }

  async init() {
    try {
      await this.client.connect();
      this.isRedisConnected = true;
      console.log(`[Redis] Connected successfully to ${this.client.options.host}:${this.client.options.port}`);
    } catch {
      this.isRedisConnected = false;
      console.log(`[Redis] Server not running at ${this.client.options.host}:${this.client.options.port}. Using resilient in-memory fallback.`);
    }

    this.client.on('error', () => {
      this.isRedisConnected = false;
    });

    this.client.on('connect', () => {
      this.isRedisConnected = true;
      console.log('[Redis] Reconnected to Redis server.');
    });
  }

  /**
   * Set key with optional TTL (seconds)
   * @param {string} key
   * @param {string|object} value
   * @param {number} [ttlSeconds]
   */
  async set(key, value, ttlSeconds = null) {
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

    if (this.isRedisConnected) {
      try {
        if (ttlSeconds) {
          return await this.client.set(key, stringValue, 'EX', ttlSeconds);
        }
        return await this.client.set(key, stringValue);
      } catch (err) {
        console.warn('[Redis] Set failed, saving in memory:', err.message);
      }
    }

    // In-memory fallback
    this.inMemoryStore.set(key, stringValue);
    if (this.inMemoryTimers.has(key)) {
      clearTimeout(this.inMemoryTimers.get(key));
    }

    if (ttlSeconds) {
      const timer = setTimeout(() => {
        this.inMemoryStore.delete(key);
        this.inMemoryTimers.delete(key);
      }, ttlSeconds * 1000);
      this.inMemoryTimers.set(key, timer);
    }

    return 'OK';
  }

  /**
   * Get value by key
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async get(key) {
    if (this.isRedisConnected) {
      try {
        return await this.client.get(key);
      } catch (err) {
        console.warn('[Redis] Get failed, reading memory:', err.message);
      }
    }

    return this.inMemoryStore.get(key) || null;
  }

  /**
   * Delete key
   * @param {string} key
   */
  async del(key) {
    if (this.isRedisConnected) {
      try {
        return await this.client.del(key);
      } catch (err) {
        console.warn('[Redis] Del failed:', err.message);
      }
    }

    if (this.inMemoryTimers.has(key)) {
      clearTimeout(this.inMemoryTimers.get(key));
      this.inMemoryTimers.delete(key);
    }
    return this.inMemoryStore.delete(key) ? 1 : 0;
  }
}

export default new RedisService();
