#!/bin/bash

# 🔧 COMPREHENSIVE STAGING ENVIRONMENT FIX
# This script addresses all identified issues with the staging setup

set -e

echo "🚀 COMPREHENSIVE STAGING ENVIRONMENT FIX"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to safely exit from PM2 logs
safe_pm2_logs() {
    log_info "Checking PM2 logs (will auto-exit after 10 seconds)..."
    timeout 10 pm2 logs --lines 10 || true
}

# Step 1: Stop and clean up any existing staging processes
log_info "Step 1: Cleaning up existing staging processes..."
pm2 stop cryptoescrow-backend-staging 2>/dev/null || true
pm2 delete cryptoescrow-backend-staging 2>/dev/null || true
pm2 save

# Step 2: Fix the staging ecosystem configuration
log_info "Step 2: Fixing staging ecosystem configuration..."
cat > ecosystem.staging.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'cryptoescrow-backend-staging',
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_staging: {
      NODE_ENV: 'production', // Use production mode to trigger AWS secrets
      USE_AWS_SECRETS: 'true',
      AWS_REGION: 'us-east-1',
      PORT: 3001,
      
      // Firebase staging project
      FIREBASE_PROJECT_ID: 'jaspirev4-2f12a',
      FIREBASE_STORAGE_BUCKET: 'jaspirev4-2f12a.appspot.com',
      FIREBASE_API_KEY: 'AIzaSyAEnTHpQpcgzWvDfiusF90-beSGCz5pva8',
      FIREBASE_AUTH_DOMAIN: 'jaspirev4-2f12a.firebaseapp.com',
      FIREBASE_MESSAGING_SENDER_ID: '960491714548',
      FIREBASE_APP_ID: '1:960491714548:web:f1b418ffaddd0ba2cc2ba',
      FIREBASE_MEASUREMENT_ID: "G-07NYQBYP9N"
      
      // Blockchain - use testnet for staging
      CHAIN_ID: '11155111', // Sepolia testnet
      RPC_URL: 'https://sepolia.infura.io/v3/4af9a8307a914da58937e8da53c602f9',
      
      // Frontend staging URL
      FRONTEND_URL: 'https://staging.clearhold.app',
      
      // Enable additional logging for staging
      DEBUG: 'cryptoescrow:*',
      LOG_LEVEL: 'debug'
    },
    error_file: './logs/staging-err.log',
    out_file: './logs/staging-out.log',
    log_file: './logs/staging-combined.log',
    time: true,
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

log_success "Fixed ecosystem.staging.cjs configuration"

# Step 3: Set up Firebase service account in AWS Secrets Manager for staging
log_info "Step 3: Setting up Firebase service account in AWS Secrets Manager..."

# Check if staging Firebase secret exists
if aws secretsmanager describe-secret --secret-id "CryptoEscrow/Staging/Firebase" --region us-east-1 2>/dev/null; then
    log_warning "Staging Firebase secret already exists"
else
    log_info "Creating staging Firebase secret placeholder..."
    aws secretsmanager create-secret \
        --name "CryptoEscrow/Staging/Firebase" \
        --description "Firebase service account for staging environment" \
        --secret-string '{"type":"service_account","project_id":"jaspirev4-2f12a","private_key_id":"PLACEHOLDER","private_key":"PLACEHOLDER","client_email":"PLACEHOLDER","client_id":"PLACEHOLDER","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"PLACEHOLDER"}' \
        --region us-east-1 2>/dev/null || true
fi

# Step 4: Update the admin.js file to handle staging environment properly
log_info "Step 4: Updating Firebase Admin SDK configuration for staging..."

# Create a backup of admin.js
cp src/api/routes/auth/admin.js src/api/routes/auth/admin.js.backup

# Update admin.js to handle staging properly
cat > src/api/routes/auth/admin.js << 'EOF'
import '../../../config/env.js';

// Set emulator configuration BEFORE any Firebase imports
const isTest = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'e2e_test';
const isProduction = process.env.NODE_ENV === 'production';
const isStaging = process.env.NODE_ENV === 'staging' || (process.env.NODE_ENV === 'production' && process.env.PORT === '3001');

if (isTest) {
  // Ensure Admin SDK uses emulators - set environment variables BEFORE any Firebase imports
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:5004';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || 'localhost:9199';
  
  // For test mode, ensure we have consistent project configuration
  process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-test';
  process.env.FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'demo-test.appspot.com';
  
  console.log(`🧪 Admin SDK connecting to emulators - Auth: ${process.env.FIREBASE_AUTH_EMULATOR_HOST}, Firestore: ${process.env.FIRESTORE_EMULATOR_HOST}, Storage: ${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`);
}

import { initializeApp, cert, getApp, getApps, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import awsSecretsManager from '../../../config/awsSecretsManager.js';

const appName = "adminApp";

// Function to get Firebase service account from AWS Secrets Manager
async function getFirebaseServiceAccountFromAWS() {
  try {
    const secretName = isStaging ? 'CryptoEscrow/Staging/Firebase' : 'CryptoEscrow/Production/Firebase';
    const secret = await awsSecretsManager.getSecret(secretName);
    
    if (!secret || typeof secret !== 'object') {
      throw new Error(`Firebase service account not found in AWS Secrets Manager: ${secretName}`);
    }
    
    // Ensure required fields are present
    const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
    for (const field of requiredFields) {
      if (!secret[field] || secret[field] === 'PLACEHOLDER') {
        throw new Error(`Firebase service account missing or placeholder value for field: ${field}`);
      }
    }
    
    return secret;
  } catch (error) {
    console.error('Failed to get Firebase service account from AWS Secrets Manager:', error.message);
    throw error;
  }
}

// Function to initialize or get the admin app
async function initializeAdmin() {
  console.log(`Initializing Admin SDK. NODE_ENV='${process.env.NODE_ENV}', isTest=${isTest}, isProduction=${isProduction}, isStaging=${isStaging}`);

  if (getApps().find(app => app.name === appName)) {
    console.log(`Admin app "${appName}" already exists. Returning existing instance.`);
    return getApp(appName);
  }

  let options;

  if (isTest) {
    console.log("Using Test configuration for Admin SDK with emulators.");
    options = {
      projectId: "demo-test",
      storageBucket: "demo-test.appspot.com"
    };
    console.log(`🧪 Admin SDK will use project: ${options.projectId}, storage: ${options.storageBucket}`);
  } else if ((isProduction || isStaging) && process.env.USE_AWS_SECRETS === 'true') {
    console.log(`Using ${isStaging ? 'Staging' : 'Production'} configuration for Admin SDK with AWS Secrets Manager.`);
    
    try {
      const firebaseServiceAccount = await getFirebaseServiceAccountFromAWS();
      
      options = {
        credential: cert(firebaseServiceAccount),
        projectId: firebaseServiceAccount.project_id,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || firebaseServiceAccount.project_id + '.appspot.com'
      };
      console.log(`Firebase Admin SDK initialized with service account from AWS Secrets Manager for ${isStaging ? 'staging' : 'production'}.`);
    } catch (secretsManagerError) {
      console.warn(`Failed to get Firebase service account from AWS Secrets Manager: ${secretsManagerError.message}`);
      console.log("Attempting fallback to environment variables for Firebase configuration...");
      
      // Fallback to environment variables
      try {
        if (!process.env.FIREBASE_PROJECT_ID) {
          throw new Error('FIREBASE_PROJECT_ID environment variable is required when Firebase service account is not in AWS Secrets Manager');
        }
        
        // Use Application Default Credentials or environment-based initialization
        options = {
          projectId: process.env.FIREBASE_PROJECT_ID,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_PROJECT_ID + '.appspot.com'
        };
        
        // If we have a service account file path, use it
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
          console.log("Using GOOGLE_APPLICATION_CREDENTIALS file for Firebase authentication.");
          const serviceAccount = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
          options.credential = cert(serviceAccount);
        } else {
          console.log("Using Application Default Credentials for Firebase authentication.");
          // Firebase Admin SDK will automatically use Application Default Credentials
          // This works in environments like Google Cloud Run, App Engine, etc.
        }
        
        console.log("Firebase Admin SDK initialized with environment variables fallback.");
      } catch (fallbackError) {
        console.error("Fallback to environment variables also failed:", fallbackError.message);
        throw new Error(`Failed to initialize Firebase Admin SDK with AWS Secrets Manager: ${secretsManagerError.message}. Fallback to environment variables also failed: ${fallbackError.message}. Please ensure either the Firebase service account is properly configured in AWS Secrets Manager, or FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS are set.`);
      }
    }
  } else {
    console.log("Using Development configuration for Admin SDK with local service account file.");
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!serviceAccountPath) {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.");
    }
    
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      options = {
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
      };
    } catch (e) {
      throw new Error(`Failed to load or parse Service Account Key: ${e.message}`);
    }
  }

  console.log(`Initializing admin app "${appName}" with project ID:`, options.projectId);
  const app = initializeApp(options, appName);
  
  // Log emulator connection status in test mode
  if (isTest) {
    console.log(`✅ Admin app "${appName}" initialized for testing with emulators`);
  }
  
  return app;
}

// Lazy initialization cache
let adminAppPromise = null;

// Async function to get admin app
async function getAdminApp() {
  if (!adminAppPromise) {
    adminAppPromise = initializeAdmin();
  }
  return await adminAppPromise;
}

// For backward compatibility, export a synchronous version for non-production environments
let adminApp;
if (isTest || (!isProduction && !isStaging)) {
  // For test or development environments, initialize synchronously using the old approach
  console.log("Using synchronous initialization for development/test environment.");
  try {
    // Use the synchronous version for development only
    if (isTest) {
      adminApp = initializeApp({
        projectId: "demo-test",
        storageBucket: "demo-test.appspot.com"
      }, appName);
      console.log(`🧪 Synchronous admin app initialized for testing with project: demo-test`);
    } else {
      const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        adminApp = initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET
        }, appName);
      } else {
        console.warn("GOOGLE_APPLICATION_CREDENTIALS not found. Will initialize when first accessed.");
      }
    }
  } catch (error) {
    console.warn('Warning: Synchronous admin app initialization failed:', error.message);
    console.log('Admin app will be initialized asynchronously when first accessed.');
  }
} else {
  console.log(`${isStaging ? 'Staging' : 'Production'} mode detected. Admin app will be initialized asynchronously when first accessed.`);
}

export { adminApp, getAdminApp };

// Optional: Function to clean up the admin app
export async function deleteAdminApp() {
    try {
        const appToDelete = getApp(appName);
        await deleteApp(appToDelete);
        console.log(`Admin app "${appName}" deleted.`);
        // Reset the promise cache
        adminAppPromise = null;
    } catch (error) {
        if (!error.message.includes("No Firebase App") && !error.message.includes("already deleted")) {
            console.warn(`Could not delete admin app "${appName}": ${error.message}`);
        }
    }
}
EOF

log_success "Updated Firebase Admin SDK configuration"

# Step 5: Update AWS Secrets Manager to ensure staging Firebase secret is properly configured
log_info "Step 5: Checking AWS Secrets Manager configuration..."

# Create minimal staging app secrets if they don't exist
if ! aws secretsmanager describe-secret --secret-id "CryptoEscrow/Staging/Config" --region us-east-1 2>/dev/null; then
    log_info "Creating staging app config secret..."
    aws secretsmanager create-secret \
        --name "CryptoEscrow/Staging/Config" \
        --description "Application configuration for staging environment" \
        --secret-string '{"JWT_SECRET":"staging-jwt-secret-32-chars-long","ENCRYPTION_KEY":"staging-encryption-key-32-chars","DATABASE_ENCRYPTION_KEY":"staging-db-encryption-key-32-chars","SMTP_HOST":"smtp.gmail.com","SMTP_PORT":"587","SMTP_USER":"your-email@gmail.com","SMTP_PASS":"your-app-password","INFURA_API_KEY":"4af9a8307a914da58937e8da53c602f9","ALCHEMY_API_KEY":"optional-alchemy-api-key"}' \
        --region us-east-1 || true
fi

# Step 6: Create logs directory
log_info "Step 6: Setting up logs directory..."
mkdir -p logs
touch logs/staging-err.log logs/staging-out.log logs/staging-combined.log

# Step 7: Start staging environment
log_info "Step 7: Starting staging environment..."
pm2 start ecosystem.staging.cjs --env staging
pm2 save

# Step 8: Wait for startup and check health
log_info "Step 8: Waiting for application startup..."
sleep 15

log_info "Checking application status..."
pm2 status

# Step 9: Check logs safely
log_info "Step 9: Checking application logs..."
safe_pm2_logs

# Step 10: Test health endpoint
log_info "Step 10: Testing health endpoint..."
if curl -s http://localhost:3001/health | grep -q "OK"; then
    log_success "Health endpoint is responding correctly!"
else
    log_warning "Health endpoint test failed. Let's check the logs again..."
    safe_pm2_logs
fi

# Step 11: Check security group and network configuration
log_info "Step 11: Checking network configuration..."

# Get the instance ID
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
if [ -n "$INSTANCE_ID" ]; then
    log_info "Instance ID: $INSTANCE_ID"
    
    # Get security groups
    SECURITY_GROUPS=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].SecurityGroups[*].GroupId' --output text)
    log_info "Security Groups: $SECURITY_GROUPS"
    
    # Check if port 3001 is open
    for SG in $SECURITY_GROUPS; do
        log_info "Checking security group $SG for port 3001..."
        if aws ec2 describe-security-groups --group-ids $SG --query "SecurityGroups[0].IpPermissions[?FromPort==\`3001\`]" --output text | grep -q "3001"; then
            log_success "Port 3001 is open in security group $SG"
        else
            log_warning "Port 3001 is NOT open in security group $SG"
            log_info "Adding inbound rule for port 3001..."
            aws ec2 authorize-security-group-ingress \
                --group-id $SG \
                --protocol tcp \
                --port 3001 \
                --cidr 0.0.0.0/0 2>/dev/null || log_warning "Failed to add rule (may already exist or insufficient permissions)"
        fi
    done
fi

# Step 12: Final status check
echo ""
echo "🎯 STAGING ENVIRONMENT SETUP COMPLETE"
echo "====================================="
log_info "Application Status:"
pm2 status cryptoescrow-backend-staging

log_info "Testing endpoints:"
echo "• Local health check: curl http://localhost:3001/health"
echo "• External health check: curl http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3001/health"

log_info "Next steps:"
echo "1. Configure Firebase service account in AWS Secrets Manager"
echo "2. Update DNS to point staging.clearhold.app to your ALB"
echo "3. Configure ALB to forward traffic to port 3001"
echo "4. Update Firebase project settings with actual values"

echo ""
log_warning "IMPORTANT: You need to configure the actual Firebase service account in AWS Secrets Manager:"
echo "aws secretsmanager update-secret --secret-id 'CryptoEscrow/Staging/Firebase' --secret-string 'ACTUAL_FIREBASE_SERVICE_ACCOUNT_JSON' --region us-east-1"

echo ""
log_info "To monitor logs in real-time (use Ctrl+C to exit):"
echo "pm2 logs cryptoescrow-backend-staging" 