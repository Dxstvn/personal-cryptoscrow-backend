// src/api/routes/kyc/index.js

import express from 'express';
import kycRoutes from './kycRoutes.js';
import openSanctionsRoutes from './openSanctionsRoutes.js';
import openSanctionsMonitoringRoutes from './openSanctionsMonitoringRoutes.js';

const router = express.Router();

// Mount KYC routes
router.use('/', kycRoutes);

// Mount OpenSanctions routes
router.use('/opensanctions', openSanctionsRoutes);

// Mount OpenSanctions monitoring routes
router.use('/opensanctions/monitoring', openSanctionsMonitoringRoutes);

export default router;