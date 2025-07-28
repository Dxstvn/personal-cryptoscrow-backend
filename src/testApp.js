// Test app configuration for integration tests
import express from 'express';
import cors from 'cors';
import transactionRouter from './api/routes/transaction/transactionRoutes.js';
import reputationRouter from './api/routes/reputation/reputationRoutes.js';
import walletRouter from './api/routes/wallet/walletRoutes.js';
import authRouter from './api/routes/auth/loginSignUp.js';

const createTestApp = () => {
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Mount routes with /api prefix as expected by tests
  app.use('/api/auth', authRouter);
  app.use('/api/transaction', transactionRouter);
  app.use('/api/reputation', reputationRouter);
  app.use('/api/wallet', walletRouter);
  
  // Error handler
  app.use((err, req, res, next) => {
    console.error('[TEST APP ERROR]', err);
    res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  });
  
  return app;
};

export default createTestApp;