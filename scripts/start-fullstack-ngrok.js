#!/usr/bin/env node

import { spawn } from 'child_process';
import chalk from 'chalk';
import ngrok from 'ngrok';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log(chalk.blue.bold('\n🚀 Starting ClearHold Full-Stack Development with Ngrok\n'));

console.log(chalk.yellow('📦 Services to be started:'));
console.log(chalk.gray('  • Firebase Emulators (Auth, Firestore, Storage)'));
console.log(chalk.gray('  • Hardhat Local Blockchain'));
console.log(chalk.gray('  • Backend API Server'));
console.log(chalk.gray('  • Ngrok Tunnel for Vercel Integration\n'));

console.log(chalk.cyan('⏳ This may take a few moments...\n'));

// Set environment variables for development
process.env.NODE_ENV = 'development';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';

let ngrokUrl = null;
let fullstackProcess = null;

// Function to start ngrok after backend is ready
async function startNgrok() {
  try {
    console.log(chalk.yellow('\n🌐 Starting Ngrok tunnel...'));
    
    // Connect to ngrok
    ngrokUrl = await ngrok.connect({
      addr: 3000,
      region: 'us', // Change if needed: us, eu, ap, au
    });
    
    console.log(chalk.green.bold('\n✨ Ngrok Tunnel Established!\n'));
    console.log(chalk.white.bgGreen.bold(' NGROK URL: ') + ' ' + chalk.cyan.bold(ngrokUrl) + '\n');
    
    // Save ngrok URL to a file for easy access
    const ngrokInfoPath = path.join(__dirname, '..', '.ngrok-url');
    fs.writeFileSync(ngrokInfoPath, ngrokUrl);
    
    console.log(chalk.yellow('📋 Vercel Environment Variable Setup:'));
    console.log(chalk.gray('  Add this to your Vercel project environment variables:\n'));
    console.log(chalk.white('  Variable Name:  ') + chalk.green('NEXT_PUBLIC_API_URL'));
    console.log(chalk.white('  Variable Value: ') + chalk.green(ngrokUrl) + '\n');
    
    console.log(chalk.yellow('🔧 Or use Vercel CLI:'));
    console.log(chalk.gray(`  vercel env add NEXT_PUBLIC_API_URL "${ngrokUrl}"\n`));
    
    console.log(chalk.magenta.bold('⚠️  Important Notes:'));
    console.log(chalk.gray('  • This URL changes each time you restart'));
    console.log(chalk.gray('  • Update Vercel env vars when URL changes'));
    console.log(chalk.gray('  • The URL is saved to .ngrok-url file'));
    console.log(chalk.gray('  • Free ngrok has request limits\n'));
    
    // Show all service URLs
    showServiceUrls();
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to start Ngrok:'), error.message);
    console.log(chalk.yellow('\n💡 Tip: Make sure you have ngrok configured properly'));
    console.log(chalk.gray('  You may need to sign up at https://ngrok.com and authenticate\n'));
  }
}

function showServiceUrls() {
  console.log(chalk.green.bold('\n✨ All Services Ready!\n'));
  console.log(chalk.white('🌐 Service URLs:'));
  console.log(chalk.gray('  • Backend API (Local):   ') + chalk.cyan('http://localhost:3000'));
  console.log(chalk.gray('  • Backend API (Ngrok):   ') + chalk.cyan.bold(ngrokUrl || 'Starting...'));
  console.log(chalk.gray('  • Firebase Auth:         ') + chalk.cyan('http://localhost:9099'));
  console.log(chalk.gray('  • Firestore:            ') + chalk.cyan('http://localhost:5004'));
  console.log(chalk.gray('  • Firebase Storage:      ') + chalk.cyan('http://localhost:9199'));
  console.log(chalk.gray('  • Hardhat RPC:           ') + chalk.cyan('http://localhost:8545'));
  console.log(chalk.gray('  • Vercel Frontend:       ') + chalk.cyan('https://your-app.vercel.app\n'));
  
  console.log(chalk.yellow('📝 Next Steps:'));
  console.log(chalk.gray('  1. Copy the ngrok URL above'));
  console.log(chalk.gray('  2. Update your Vercel environment variables'));
  console.log(chalk.gray('  3. Redeploy or refresh your Vercel app'));
  console.log(chalk.gray('  4. Your Vercel frontend can now access local backend!'));
  console.log(chalk.gray('  5. Press Ctrl+C to stop all services\n'));
}

// Run the fullstack command
fullstackProcess = spawn('npm', ['run', 'dev:fullstack'], {
  stdio: 'inherit',
  shell: true
});

// Wait a bit for services to start, then start ngrok
setTimeout(() => {
  startNgrok();
}, 8000); // Wait 8 seconds for backend to be ready

fullstackProcess.on('close', async (code) => {
  console.log(chalk.yellow('\n🛑 Shutting down ngrok tunnel...'));
  await ngrok.kill();
  
  // Clean up ngrok URL file
  const ngrokInfoPath = path.join(__dirname, '..', '.ngrok-url');
  if (fs.existsSync(ngrokInfoPath)) {
    fs.unlinkSync(ngrokInfoPath);
  }
  
  if (code !== 0) {
    console.error(chalk.red(`\n❌ Full-stack environment exited with code ${code}`));
  } else {
    console.log(chalk.green('\n✅ Full-stack environment stopped successfully'));
  }
  process.exit(code);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\n🛑 Shutting down all services...'));
  
  // Kill ngrok first
  if (ngrokUrl) {
    console.log(chalk.yellow('Closing ngrok tunnel...'));
    await ngrok.kill();
  }
  
  // Then kill other processes
  if (fullstackProcess) {
    fullstackProcess.kill('SIGINT');
  }
});