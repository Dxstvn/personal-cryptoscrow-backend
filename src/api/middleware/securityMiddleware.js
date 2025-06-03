import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import express from 'express';

// Rate limiting configurations
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests to health endpoint
  skip: (req) => req.path === '/health' && req.method === 'GET'
});

// Stricter rate limiting for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 authentication attempts per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Apply to auth endpoints
  skip: (req) => !req.path.startsWith('/auth/')
});

// File upload rate limiting
export const fileUploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 file uploads per hour
  message: {
    error: 'Too many file uploads, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Security headers configuration
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for Firebase compatibility
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Request size limiting middleware
export const requestSizeLimit = express.json({
  limit: '10mb', // Limit request body size
  verify: (req, res, buf) => {
    // Additional validation can be added here
    if (buf && buf.length > 10 * 1024 * 1024) { // 10MB
      throw new Error('Request body too large');
    }
  }
});

// Input sanitization middleware
export const sanitizeInput = (req, res, next) => {
  // Sanitize common XSS patterns
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      // Remove potentially dangerous characters
      return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+\s*=/gi, '');
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        obj[key] = sanitize(obj[key]);
      }
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  if (req.params) {
    req.params = sanitize(req.params);
  }

  next();
};

// Error handling middleware that doesn't leak sensitive information
export const secureErrorHandler = (err, req, res, next) => {
  // Log the full error internally
  console.error('Application Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Send sanitized error response
  if (process.env.NODE_ENV === 'production') {
    // In production, don't leak internal error details
    res.status(err.status || 500).json({
      error: err.status === 400 ? err.message : 'Internal server error'
    });
  } else {
    // In development, provide more details
    res.status(err.status || 500).json({
      error: err.message,
      stack: err.stack
    });
  }
};

// CORS configuration with security considerations
export const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://44.202.141.56:3000',
      'https://44.202.141.56:3000',
      'http://clearhold.app',
      'https://clearhold.app',
      'http://www.clearhold.app',
      'https://www.clearhold.app',
      'https://clearhold.app:3000',
      'http://clearhold.app:3000',
      process.env.FRONTEND_URL,
      process.env.DOMAIN_URL
    ].filter(Boolean); // Remove any undefined values

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-forwarded-for', 'x-forwarded-proto'],
  maxAge: 86400 // 24 hours
}; 