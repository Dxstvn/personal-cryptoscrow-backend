// test-setup/globalSetup.cjs

// Use CommonJS require syntax
const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

// __filename and __dirname are readily available in CommonJS modules
const PID_FILE = path.resolve(__dirname, '.hardhat_node.pid');
const HARDHAT_RPC_URL = 'http://127.0.0.1:8545/';

// Helper function to dynamically import node-fetch
async function getFetch() {
  const { default: fetch } = await import('node-fetch');
  return fetch;
}

async function waitForHardhatNode(url, retries = 20, delay = 1000) {
  const fetch = await getFetch(); // Get the fetch function
  console.log('\n[globalSetup.cjs] Attempting to connect to Hardhat node (using node-fetch v3+)...');
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.result) {
          console.log('[globalSetup.cjs] Hardhat node is responsive.');
          return true;
        }
      }
    } catch (error) {
      // console.error('[globalSetup.cjs] Connection attempt failed:', error.message);
    }
    if (i < retries - 1) {
      process.stdout.write('[globalSetup.cjs] Waiting for Hardhat node... attempt ' + (i + 2) + '\x0D');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  process.stdout.write('\n');
  throw new Error('[globalSetup.cjs] Hardhat node did not become responsive at ' + url + ' after ' + retries + ' attempts.');
}

// Export the function using module.exports
module.exports = async function globalSetup() {
  console.log('\n[globalSetup.cjs] Starting Hardhat node using CommonJS...');
  
  const contractDir = path.resolve(__dirname, '../src/contract');

  try {
    const pidText = await fs.readFile(PID_FILE, 'utf8');
    const pid = parseInt(pidText, 10);
    if (pid) {
      console.log(`[globalSetup.cjs] Found existing PID file (${PID_FILE}) with PID: ${pid}. Attempting to terminate...`);
      try {
        process.kill(pid, 'SIGTERM');
        console.log(`[globalSetup.cjs] Sent SIGTERM to process ${pid}. Waiting...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {
        // Log if the process doesn't exist, but don't fail the setup
        if (e.code === 'ESRCH') {
          console.warn(`[globalSetup.cjs] Process with PID ${pid} not found. It might have already terminated.`);
        } else {
          console.warn(`[globalSetup.cjs] Could not send SIGTERM to process ${pid}: ${e.message}`);
        }
      }
      try {
        await fs.unlink(PID_FILE);
      } catch (e) { /* ignore if already deleted */ }
    }
  } catch (e) { 
    // PID file doesn't exist or couldn't be read, which is fine.
    if (e.code !== 'ENOENT') {
        console.warn(`[globalSetup.cjs] Error reading PID file: ${e.message}`);
    }
  }

  const hardhatNode = spawn('npx', ['hardhat', 'node', '--hostname', '0.0.0.0'], {
    cwd: contractDir,
    detached: false, // Keep false for easier direct termination
    stdio: 'pipe',   // 'inherit' for debugging stdout/stderr directly
  });

  global.__HARDHAT_NODE__ = hardhatNode; // Store reference for teardown

  // Error handling for spawn itself
  hardhatNode.on('error', (err) => {
    console.error('[globalSetup.cjs] Failed to start Hardhat node process (spawn error):', err);
    // Attempt to clean up PID file if it was written before this error
    fs.unlink(PID_FILE).catch(() => {}); // Best effort cleanup
    throw err; // Propagate error to stop Jest
  });

  // Check if PID exists before writing
  if (hardhatNode.pid) {
    await fs.writeFile(PID_FILE, hardhatNode.pid.toString());
    console.log(`[globalSetup.cjs] Hardhat node started with PID: ${hardhatNode.pid}. PID file created: ${PID_FILE}`);
  } else {
    console.error('[globalSetup.cjs] Hardhat node process started but PID is not available.');
    // Handle this case, perhaps by not proceeding or by throwing an error
    // For now, we'll log and let the readiness check fail if the node isn't actually up.
  }


  hardhatNode.stdout.on('data', (data) => {
    // Minimal logging, can be expanded for debugging
    // console.log('[globalSetup.cjs] Hardhat stdout: ' + data.toString().trim()); 
  });
  hardhatNode.stderr.on('data', (data) => {
    // Log Hardhat errors to the console.
    console.error('[globalSetup.cjs] Hardhat stderr: ' + data.toString().trim());
  });
  
  hardhatNode.on('exit', (code, signal) => {
    // Log unexpected exits. SIGTERM is expected during teardown.
    if (signal !== 'SIGTERM' && signal !== 'SIGINT') { // SIGINT for manual Ctrl+C
      console.warn(`[globalSetup.cjs] Hardhat node process exited unexpectedly with code ${code} and signal ${signal}`);
    }
  });

  try {
    await waitForHardhatNode(HARDHAT_RPC_URL);
    console.log('[globalSetup.cjs] Hardhat node setup complete and responsive.');
  } catch (error) {
    console.error(`[globalSetup.cjs] Failed to confirm Hardhat node readiness: ${error.message}`);
    if (hardhatNode && hardhatNode.pid && !hardhatNode.killed) {
      console.log(`[globalSetup.cjs] Attempting to clean up spawned Hardhat node (PID: ${hardhatNode.pid}) due to readiness failure...`);
      try {
        process.kill(hardhatNode.pid, 'SIGTERM'); 
      } catch (killError) {
        console.error(`[globalSetup.cjs] Failed to kill Hardhat node (PID: ${hardhatNode.pid}) during cleanup: ${killError.message}`);
      }
    }
    throw error; // Re-throw to fail the setup and prevent tests from running
  }
};
