
// Enhanced Health Check with Detailed System Status
import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { ethers } from 'ethers';

const router = express.Router();

// Detailed health check with timing metrics
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks: {}
  };

  try {
    // Database connectivity check
    const dbStart = Date.now();
    try {
      const db = getFirestore();
      await db.collection('health').limit(1).get();
      health.checks.database = {
        status: 'OK',
        responseTime: Date.now() - dbStart
      };
    } catch (error) {
      health.checks.database = {
        status: 'ERROR',
        error: error.message,
        responseTime: Date.now() - dbStart
      };
      health.status = 'DEGRADED';
    }

    // Blockchain connectivity check
    const bcStart = Date.now();
    try {
      const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
      await provider.getBlockNumber();
      health.checks.blockchain = {
        status: 'OK',
        responseTime: Date.now() - bcStart,
        chainId: process.env.CHAIN_ID
      };
    } catch (error) {
      health.checks.blockchain = {
        status: 'ERROR',
        error: error.message,
        responseTime: Date.now() - bcStart
      };
      health.status = 'DEGRADED';
    }

    // Auth service check
    const authStart = Date.now();
    try {
      const auth = getAuth();
      // Just check if auth is initialized
      health.checks.auth = {
        status: 'OK',
        responseTime: Date.now() - authStart
      };
    } catch (error) {
      health.checks.auth = {
        status: 'ERROR',
        error: error.message,
        responseTime: Date.now() - authStart
      };
      health.status = 'DEGRADED';
    }

    health.totalResponseTime = Date.now() - startTime;

    // Return appropriate status code
    const statusCode = health.status === 'OK' ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Readiness check (for Kubernetes/container orchestration)
router.get('/ready', async (req, res) => {
  // Quick check without external dependencies
  res.json({
    status: 'READY',
    timestamp: new Date().toISOString(),
    pid: process.pid
  });
});

// Liveness check (for Kubernetes/container orchestration)
router.get('/live', (req, res) => {
  res.json({
    status: 'ALIVE',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;