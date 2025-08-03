import fs from 'fs/promises';
import path from 'path';

const convertFile = async (filePath) => {
  let content = await fs.readFile(filePath, 'utf-8');
  
  // Replace Jest imports with Vitest
  content = content.replace(
    /import { jest } from '@jest\/globals';/g,
    "import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';"
  );
  
  // Replace jest.mock with vi.mock
  content = content.replace(/jest\.mock/g, 'vi.mock');
  
  // Replace jest.fn with vi.fn
  content = content.replace(/jest\.fn/g, 'vi.fn');
  
  // Replace jest.clearAllMocks with vi.clearAllMocks
  content = content.replace(/jest\.clearAllMocks/g, 'vi.clearAllMocks');
  
  // Replace jest.requireActual with vi.importActual
  content = content.replace(/jest\.requireActual/g, 'vi.importActual');
  
  // Replace require() calls with dynamic imports
  content = content.replace(
    /const (\w+) = require\('([^']+)'\);/g,
    "const $1 = await import('$2');"
  );
  
  // Fix ...jest.requireActual pattern
  content = content.replace(
    /\.\.\.jest\.requireActual\('([^']+)'\)/g,
    "...(await vi.importActual('$1'))"
  );
  
  // Replace mockReturnThis pattern
  content = content.replace(
    /\.mockReturnThis\(\)/g,
    '.mockReturnThis()'
  );
  
  await fs.writeFile(filePath, content);
  console.log(`Converted: ${filePath}`);
};

const testFiles = [
  '/Users/dustinjasmin/personal-cryptoscrow-backend/src/services/kyc/__tests__/faceVerificationService.test.js',
  '/Users/dustinjasmin/personal-cryptoscrow-backend/src/services/kyc/__tests__/amlScreeningService.test.js',
  '/Users/dustinjasmin/personal-cryptoscrow-backend/src/services/kyc/__tests__/riskAssessmentEngine.test.js',
  '/Users/dustinjasmin/personal-cryptoscrow-backend/src/services/kyc/__tests__/notificationService.test.js',
  '/Users/dustinjasmin/personal-cryptoscrow-backend/src/services/kyc/__tests__/complianceReportingService.test.js',
  '/Users/dustinjasmin/personal-cryptoscrow-backend/src/api/routes/kyc/__tests__/kycRoutes.test.js'
];

const convertAll = async () => {
  for (const file of testFiles) {
    try {
      await convertFile(file);
    } catch (error) {
      console.error(`Error converting ${file}:`, error.message);
    }
  }
};

convertAll();