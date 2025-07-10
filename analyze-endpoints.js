// Script to analyze and list all actual endpoints
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routeFiles = [
  'src/api/routes/wallet/walletRoutes.js',
  'src/api/routes/contact/contactRoutes.js',
  'src/api/routes/database/fileUploadDownload.js',
  'src/api/routes/transaction/transactionRoutes.js'
];

const endpoints = {
  wallet: [],
  contact: [],
  files: [],
  transaction: []
};

routeFiles.forEach(file => {
  const fullPath = path.join(__dirname, file);
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach(line => {
      const routeMatch = line.match(/router\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/);
      if (routeMatch) {
        const method = routeMatch[1].toUpperCase();
        const path = routeMatch[2];
        
        if (file.includes('wallet')) {
          endpoints.wallet.push({ method, path });
        } else if (file.includes('contact')) {
          endpoints.contact.push({ method, path });
        } else if (file.includes('file')) {
          endpoints.files.push({ method, path });
        } else if (file.includes('transaction')) {
          endpoints.transaction.push({ method, path });
        }
      }
    });
  } catch (error) {
    console.error(`Error reading ${file}:`, error.message);
  }
});

console.log('📍 ACTUAL ENDPOINTS FOUND:');
console.log('\n💰 Wallet Routes:');
endpoints.wallet.forEach(ep => {
  console.log(`  ${ep.method} /wallet${ep.path}`);
});

console.log('\n👥 Contact Routes:');
endpoints.contact.forEach(ep => {
  console.log(`  ${ep.method} /contact${ep.path}`);
});

console.log('\n📁 File Routes:');
endpoints.files.forEach(ep => {
  console.log(`  ${ep.method} /files${ep.path}`);
});

console.log('\n💸 Transaction Routes:');
endpoints.transaction.forEach(ep => {
  console.log(`  ${ep.method} /transaction${ep.path}`);
});