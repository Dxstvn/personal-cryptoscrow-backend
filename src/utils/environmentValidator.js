/**
 * Environment Validation for Production Deployment
 * This module ensures the application is running in the correct mode for production
 */

export function validateProductionEnvironment() {
  const nodeEnv = process.env.NODE_ENV;
  
  // Critical: Ensure we're in production mode
  if (nodeEnv !== 'production') {
    console.error('🚨 CRITICAL: Application is NOT in production mode!');
    console.error(`Current NODE_ENV: ${nodeEnv}`);
    console.error('Expected NODE_ENV: production');
    console.error('This could expose test configurations and security vulnerabilities.');
    process.exit(1);
  }
  
  // Validate required production environment variables
  const requiredEnvVars = [
    'USE_AWS_SECRETS',
    'AWS_REGION',
    'FIREBASE_PROJECT_ID'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error('🚨 CRITICAL: Missing required environment variables:');
    missingVars.forEach(varName => {
      console.error(`  - ${varName}`);
    });
    process.exit(1);
  }
  
  // Ensure we're using AWS Secrets Manager (not local files)
  if (process.env.USE_AWS_SECRETS !== 'true') {
    console.error('🚨 CRITICAL: USE_AWS_SECRETS must be "true" in production');
    process.exit(1);
  }
  
  // Validate we're not using test/development Firebase projects
  const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
  const testProjects = ['demo-test', 'test-project', 'development-project'];
  if (testProjects.includes(firebaseProjectId)) {
    console.error(`🚨 CRITICAL: Using test Firebase project in production: ${firebaseProjectId}`);
    process.exit(1);
  }
  
  // Ensure Firebase emulator environment variables are NOT set
  const emulatorVars = [
    'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_AUTH_EMULATOR_HOST', 
    'FIREBASE_STORAGE_EMULATOR_HOST'
  ];
  
  const setEmulatorVars = emulatorVars.filter(varName => process.env[varName]);
  if (setEmulatorVars.length > 0) {
    console.error('🚨 CRITICAL: Firebase emulator variables detected in production:');
    setEmulatorVars.forEach(varName => {
      console.error(`  - ${varName}=${process.env[varName]}`);
    });
    console.error('This would connect to local emulators instead of production Firebase!');
    process.exit(1);
  }
  
  console.log('✅ Environment validation passed - running in production mode');
  console.log(`✅ Firebase Project: ${firebaseProjectId}`);
  console.log(`✅ AWS Region: ${process.env.AWS_REGION}`);
  console.log('✅ Using AWS Secrets Manager for credentials');
}

export function validateStagingEnvironment() {
  const nodeEnv = process.env.NODE_ENV;
  
  if (nodeEnv !== 'staging') {
    console.error('🚨 CRITICAL: Application is NOT in staging mode!');
    console.error(`Current NODE_ENV: ${nodeEnv}`);
    process.exit(1);
  }
  
  console.log('✅ Environment validation passed - running in staging mode');
}