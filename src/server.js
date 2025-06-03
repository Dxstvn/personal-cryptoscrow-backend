// Load polyfills first
import './config/polyfills.js';
import './config/env.js';
import express from 'express';
import cors from 'cors';
import { 
  generalRateLimit, 
  authRateLimit, 
  securityHeaders, 
  requestSizeLimit, 
  sanitizeInput, 
  secureErrorHandler,
  corsOptions 
} from './api/middleware/securityMiddleware.js';

// Import routers
import loginRouter from './api/routes/auth/loginSignUp.js';
import fileUploadRouter from './api/routes/database/fileUploadDownload.js';
import healthCheckRouter from './api/routes/health/health.js';
import contactRouter from './api/routes/contact/contactRoutes.js';
import transactionRouter from './api/routes/transaction/transactionRoutes.js';
import walletRouter from './api/routes/wallet/walletRoutes.js';

const app = express();

// Security middleware - applied first
app.use(securityHeaders);
app.use(cors(corsOptions));

// Trust proxy if behind reverse proxy (for rate limiting)
app.set('trust proxy', 1);

// Rate limiting
app.use(generalRateLimit);
app.use('/auth', authRateLimit);

// Request parsing with size limits
app.use(requestSizeLimit);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization
app.use(sanitizeInput);

// Health check (no auth required)
app.use('/health', healthCheckRouter);

// API routes with authentication
app.use('/auth', loginRouter);
app.use('/files', fileUploadRouter);
app.use('/contact', contactRouter);
app.use('/transaction', transactionRouter);
app.use('/wallet', walletRouter);

// Default route
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'CryptoEscrow Backend API',
    version: '1.0.0',
    status: 'Running'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Secure error handler (must be last)
app.use(secureErrorHandler);

const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log(`🚀 CryptoEscrow Backend server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

export default app; 