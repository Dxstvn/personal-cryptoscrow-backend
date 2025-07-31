// src/api/routes/kyc/kycIndex.js

import express from 'express';
import kycRoutes from './kycRoutes.js';

const router = express.Router();

// Mount KYC routes
router.use('/', kycRoutes);

export default router;