// Quick Health Endpoint Addition Script
// Run this to add health check endpoint for AWS Load Balancer

const fs = require('fs');
const path = require('path');

// Find the main server file
const possibleFiles = ['server.js', 'app.js', 'index.js', 'src/server.js', 'src/app.js'];
let serverFile = null;

for (const file of possibleFiles) {
  if (fs.existsSync(file)) {
    serverFile = file;
    break;
  }
}

if (!serverFile) {
  console.log('❌ Could not find main server file. Please add manually:');
  console.log(`
// Add this to your main server file:
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  });
});
`);
  process.exit(1);
}

console.log(`📋 Found server file: ${serverFile}`);

// Read the current content
let content = fs.readFileSync(serverFile, 'utf8');

// Check if health endpoint already exists
if (content.includes('/health') || content.includes('health')) {
  console.log('✅ Health endpoint appears to already exist!');
  process.exit(0);
}

// Find where to insert the health endpoint
const healthEndpoint = `
// Health check endpoint for AWS Load Balancer
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  });
});
`;

// Try to find a good insertion point
let insertionPoint = -1;

// Look for app.listen or server.listen
const listenRegex = /(app|server)\.listen\(/;
const listenMatch = content.search(listenRegex);

if (listenMatch !== -1) {
  // Insert before the listen call
  insertionPoint = listenMatch;
} else {
  // Look for other route definitions
  const routeRegex = /app\.(get|post|put|delete|use)\(/;
  const routeMatches = [...content.matchAll(new RegExp(routeRegex.source, 'g'))];
  
  if (routeMatches.length > 0) {
    // Insert after the last route definition
    const lastMatch = routeMatches[routeMatches.length - 1];
    insertionPoint = lastMatch.index + lastMatch[0].length;
    
    // Find the end of that line
    const nextNewline = content.indexOf('\n', insertionPoint);
    if (nextNewline !== -1) {
      insertionPoint = nextNewline + 1;
    }
  }
}

if (insertionPoint === -1) {
  console.log('⚠️ Could not find good insertion point. Adding at the end:');
  content += healthEndpoint;
} else {
  content = content.slice(0, insertionPoint) + healthEndpoint + '\n' + content.slice(insertionPoint);
}

// Backup original file
fs.writeFileSync(`${serverFile}.backup`, fs.readFileSync(serverFile));
console.log(`💾 Backup created: ${serverFile}.backup`);

// Write the updated content
fs.writeFileSync(serverFile, content);
console.log(`✅ Health endpoint added to ${serverFile}`);

console.log(`
🚀 Next steps:
1. Restart your Node.js application
2. Test the health endpoint: curl http://localhost:3000/health
3. If it works, proceed with AWS Load Balancer setup
4. If something breaks, restore from backup: mv ${serverFile}.backup ${serverFile}
`); 