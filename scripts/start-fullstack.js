#!/usr/bin/env node

import { spawn } from 'child_process';
import chalk from 'chalk';

console.log(chalk.blue.bold('\n🚀 Starting ClearHold Full-Stack Development Environment\n'));

console.log(chalk.yellow('📦 Services to be started:'));
console.log(chalk.gray('  • Firebase Emulators (Auth, Firestore, Storage)'));
console.log(chalk.gray('  • Hardhat Local Blockchain'));
console.log(chalk.gray('  • Backend API Server\n'));

console.log(chalk.cyan('⏳ This may take a few moments...\n'));

// Set environment variables for development
process.env.NODE_ENV = 'development';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';

// Run the fullstack command
const fullstack = spawn('npm', ['run', 'dev:fullstack'], {
  stdio: 'inherit',
  shell: true
});

fullstack.on('close', (code) => {
  if (code !== 0) {
    console.error(chalk.red(`\n❌ Full-stack environment exited with code ${code}`));
  } else {
    console.log(chalk.green('\n✅ Full-stack environment stopped successfully'));
  }
  process.exit(code);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n🛑 Shutting down all services...'));
  fullstack.kill('SIGINT');
});

// Show helpful information after a delay
setTimeout(() => {
  console.log(chalk.green.bold('\n✨ Full-Stack Environment Ready!\n'));
  console.log(chalk.white('🌐 Service URLs:'));
  console.log(chalk.gray('  • Backend API:        ') + chalk.cyan('http://localhost:3000'));
  console.log(chalk.gray('  • Firebase Auth:      ') + chalk.cyan('http://localhost:9099'));
  console.log(chalk.gray('  • Firestore:         ') + chalk.cyan('http://localhost:5004'));
  console.log(chalk.gray('  • Firebase Storage:   ') + chalk.cyan('http://localhost:9199'));
  console.log(chalk.gray('  • Hardhat RPC:        ') + chalk.cyan('http://localhost:8545'));
  console.log(chalk.gray('  • Frontend (if running): ') + chalk.cyan('http://localhost:5173\n'));
  
  console.log(chalk.yellow('📝 Tips:'));
  console.log(chalk.gray('  • Frontend should be started separately in its own terminal'));
  console.log(chalk.gray('  • All services are configured for local development'));
  console.log(chalk.gray('  • Press Ctrl+C to stop all services\n'));
}, 5000);