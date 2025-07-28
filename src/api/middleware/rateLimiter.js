// Rate limiting middleware for security protection
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import config from '../../config/index.js';

// Create Redis client for distributed rate limiting
const createRedisClient = () => {
  // Skip Redis in test environment
  if (process.env.NODE_ENV === 'test') {
    return null;
  }
  
  const redisUrl = config.get('REDIS_URL');
  
  if (redisUrl) {
    return new Redis(redisUrl);
  }
  
  // Fallback to in-memory if Redis not configured
  console.warn('[RateLimiter] Redis not configured, using in-memory rate limiting');
  return null;
};

// Progressive delay function for repeated violations
const progressiveDelay = (attemptsMade) => {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, then 60s
  const delays = [1000, 2000, 4000, 8000, 16000, 32000, 60000];
  const index = Math.min(attemptsMade - 1, delays.length - 1);
  return delays[index];
};

// Create rate limiter for dispute operations
export const createDisputeRateLimiter = () => {
  const redisClient = createRedisClient();
  
  const options = {
    windowMs: process.env.NODE_ENV === 'test' ? 1000 : 60 * 60 * 1000, // 1 second in test, 1 hour in prod
    max: process.env.NODE_ENV === 'test' ? 100 : 3, // 100 disputes per second in test, 3 per hour in prod
    message: {
      success: false,
      error: 'Too many dispute requests. Please wait before trying again.',
      retryAfter: null
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
      // Use authenticated user ID if available, otherwise IP
      return req.user?.uid || req.userId || req.ip;
    },
    handler: (req, res, next, options) => {
      const retryAfter = req.rateLimit.resetTime 
        ? new Date(req.rateLimit.resetTime).toISOString()
        : null;
      
      res.status(429).json({
        success: false,
        error: options.message.error,
        retryAfter,
        attemptsRemaining: req.rateLimit.remaining,
        resetTime: retryAfter
      });
    }
  };
  
  // Use Redis store if available for distributed rate limiting
  if (redisClient) {
    options.store = new RedisStore({
      client: redisClient,
      prefix: 'rl:dispute:',
      sendCommand: (...args) => redisClient.call(...args)
    });
  }
  
  return rateLimit(options);
};

// Create general API rate limiter
export const createApiRateLimiter = () => {
  const redisClient = createRedisClient();
  
  const options = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    message: {
      success: false,
      error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip
  };
  
  if (redisClient) {
    options.store = new RedisStore({
      client: redisClient,
      prefix: 'rl:api:',
      sendCommand: (...args) => redisClient.call(...args)
    });
  }
  
  return rateLimit(options);
};

// Create aggressive rate limiter for authentication endpoints
export const createAuthRateLimiter = () => {
  const redisClient = createRedisClient();
  
  const options = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per 15 minutes
    skipSuccessfulRequests: true, // Don't count successful logins
    delayMs: progressiveDelay, // Progressive delay for repeated failures
    message: {
      success: false,
      error: 'Too many failed authentication attempts. Please try again later.'
    }
  };
  
  if (redisClient) {
    options.store = new RedisStore({
      client: redisClient,
      prefix: 'rl:auth:',
      sendCommand: (...args) => redisClient.call(...args)
    });
  }
  
  return rateLimit(options);
};

// Create rate limiter for high-value operations
export const createHighValueRateLimiter = () => {
  const redisClient = createRedisClient();
  
  const options = {
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 10, // 10 high-value operations per day
    message: {
      success: false,
      error: 'Daily limit for high-value operations reached. Please try again tomorrow.'
    },
    skip: (req) => {
      // Skip rate limiting for operations below threshold
      const amount = req.body?.amount || req.body?.dealAmount || 0;
      const threshold = 10000; // $10,000 USD
      return amount < threshold;
    },
    keyGenerator: (req) => {
      return req.user?.uid || req.userId || req.ip;
    }
  };
  
  if (redisClient) {
    options.store = new RedisStore({
      client: redisClient,
      prefix: 'rl:highvalue:',
      sendCommand: (...args) => redisClient.call(...args)
    });
  }
  
  return rateLimit(options);
};

// Monitor rate limit violations
export const monitorRateLimits = (req, res, next) => {
  if (req.rateLimit && req.rateLimit.remaining === 0) {
    // Log rate limit violation for monitoring
    console.warn('[SECURITY] Rate limit exceeded', {
      ip: req.ip,
      userId: req.user?.uid || req.userId,
      endpoint: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
      resetTime: req.rateLimit.resetTime,
      totalHits: req.rateLimit.total
    });
  }
  next();
};

// Export configured rate limiters
export default {
  dispute: createDisputeRateLimiter(),
  api: createApiRateLimiter(),
  auth: createAuthRateLimiter(),
  highValue: createHighValueRateLimiter(),
  monitor: monitorRateLimits
};