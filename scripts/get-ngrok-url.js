#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ngrokUrlPath = path.join(__dirname, '..', '.ngrok-url');

if (fs.existsSync(ngrokUrlPath)) {
  const url = fs.readFileSync(ngrokUrlPath, 'utf8').trim();
  console.log(chalk.green.bold('\n🌐 Current Ngrok URL:'));
  console.log(chalk.cyan.bold(url));
  
  console.log(chalk.yellow('\n📋 Vercel Environment Variable:'));
  console.log(chalk.gray(`NEXT_PUBLIC_API_URL=${url}`));
  
  console.log(chalk.yellow('\n🔧 Update with Vercel CLI:'));
  console.log(chalk.gray(`vercel env add NEXT_PUBLIC_API_URL "${url}"\n`));
} else {
  console.log(chalk.red('\n❌ No ngrok URL found.'));
  console.log(chalk.yellow('Run `npm run fullstack:ngrok` to start the services with ngrok.\n'));
}