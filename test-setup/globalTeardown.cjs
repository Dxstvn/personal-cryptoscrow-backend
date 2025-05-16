// test-setup/globalTeardown.cjs

// Use CommonJS require syntax
const fs = require('fs/promises');
const path = require('path');

// __filename and __dirname are readily available in CommonJS modules
const PID_FILE = path.resolve(__dirname, '.hardhat_node.pid');

// Export the function using module.exports
module.exports = async function globalTeardown() {
  console.log('\n[globalTeardown.cjs] Shutting down Hardhat node using CommonJS...');
  let pid;
  try {
    const pidText = await fs.readFile(PID_FILE, 'utf8');
    pid = parseInt(pidText, 10);
  } catch (e) {
    console.warn(`[globalTeardown.cjs] Could not read PID file (${PID_FILE}).`);
    if (global.__HARDHAT_NODE__ && global.__HARDHAT_NODE__.pid) {
        console.log(`[globalTeardown.cjs] (Fallback) Using global reference PID: ${global.__HARDHAT_NODE__.pid}`);
        pid = global.__HARDHAT_NODE__.pid;
    } else {
        console.log('[globalTeardown.cjs] No PID found. Hardhat node might have already shut down or failed to start.');
        return;
    }
  }

  if (pid) {
    try {
      console.log(`[globalTeardown.cjs] Terminating Hardhat node with PID: ${pid}.`);
      process.kill(pid, 'SIGTERM');
      console.log(`[globalTeardown.cjs] Sent SIGTERM to process ${pid}. Waiting...`);
      await new Promise(resolve => setTimeout(resolve, 2000)); 
    } catch (e) {
      console.warn(`[globalTeardown.cjs] Failed to send SIGTERM to Hardhat node (PID: ${pid}): ${e.message}`);
    }
  }

  try {
    await fs.unlink(PID_FILE);
    console.log(`[globalTeardown.cjs] PID file (${PID_FILE}) deleted.`);
  } catch (e) {
    // console.warn(`[globalTeardown.cjs] Could not delete PID file: ${e.message}`);
  }
  
  console.log('[globalTeardown.cjs] Hardhat node teardown complete.');
};
