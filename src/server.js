// Test mode configuration - must be set before any other imports
if (process.env.NODE_ENV === 'test') {
  console.log('🧪 Setting up TEST MODE configuration...');
  
  // Set test environment variables - USE CONSISTENT VALUES WITH EMULATOR SETUP
  process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-test';
  process.env.FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'demo-test.appspot.com';
  process.env.FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'demo-api-key';
  process.env.FIREBASE_AUTH_DOMAIN = process.env.FIREBASE_AUTH_DOMAIN || 'localhost';
  process.env.FIREBASE_MESSAGING_SENDER_ID = process.env.FIREBASE_MESSAGING_SENDER_ID || '123456789';
  process.env.FIREBASE_APP_ID = process.env.FIREBASE_APP_ID || '1:123456789:web:abcdef';
  process.env.FIREBASE_MEASUREMENT_ID = process.env.FIREBASE_MEASUREMENT_ID || 'test-measurement-id';
  
  // Test blockchain configuration
  process.env.RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
  process.env.SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || 'http://localhost:8545';
  process.env.CHAIN_ID = process.env.CHAIN_ID || '31337';
  process.env.DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  process.env.BACKEND_WALLET_PRIVATE_KEY = process.env.BACKEND_WALLET_PRIVATE_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
  
  // Test security credentials
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-32-chars-long';
  process.env.DATABASE_ENCRYPTION_KEY = process.env.DATABASE_ENCRYPTION_KEY || 'test-db-encryption-key-32-chars';
  
  // Test user accounts
  process.env.TEST_USER_A_EMAIL = process.env.TEST_USER_A_EMAIL || 'testuser.a@example.com';
  process.env.TEST_USER_A_PASSWORD = process.env.TEST_USER_A_PASSWORD || 'testpassword123';
  process.env.TEST_USER_A_PK = process.env.TEST_USER_A_PK || '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
  process.env.TEST_USER_B_EMAIL = process.env.TEST_USER_B_EMAIL || 'testuser.b@example.com';
  process.env.TEST_USER_B_PASSWORD = process.env.TEST_USER_B_PASSWORD || 'testpassword456';
  process.env.TEST_USER_B_PK = process.env.TEST_USER_B_PK || '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';
  
  // Emulator configuration
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:5004';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || 'localhost:9199';
  
  // Test email configuration (mock)
  process.env.SMTP_HOST = process.env.SMTP_HOST || 'smtp.test.com';
  process.env.SMTP_PORT = process.env.SMTP_PORT || '587';
  process.env.SMTP_USER = process.env.SMTP_USER || 'test@example.com';
  process.env.SMTP_PASS = process.env.SMTP_PASS || 'testpassword';
  
  // API Keys for test
  process.env.INFURA_API_KEY = process.env.INFURA_API_KEY || 'test-infura-key';
  process.env.ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || 'test-alchemy-key';
  
  // Disable AWS secrets in test mode
  process.env.USE_AWS_SECRETS = 'false';
  
  // Set allowed emails for test
  process.env.ALLOWED_EMAILS = process.env.ALLOWED_EMAILS || 'testuser.a@example.com,testuser.b@example.com,jasmindustin@gmail.com,andyrowe00@gmail.com';
  
  console.log('✅ TEST MODE configuration complete');
}

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