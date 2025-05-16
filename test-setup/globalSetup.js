import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch'; // Ensure node-fetch is in your devDependencies
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PID_FILE = path.resolve(__dirname, '.hardhat_node.pid');
const HARDHAT_RPC_URL = 'http://127.0.0.1:8545/';

async function waitForHardhatNode(url, retries = 20, delay = 1000) {
  console.log('\nAttempting to connect to Hardhat node...');
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
          console.log('Hardhat node is responsive and has returned a block number.');
          return true;
        }
      }
    } catch (error) {
      // console.error('Connection attempt failed:', error.message);
    }
    if (i < retries -1) {
      process.stdout.write('Waiting for Hardhat node... attempt ' + (i + 2) + '\x0D');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  process.stdout.write('\n'); // Clear the line
  throw new Error('Hardhat node did not become responsive at ' + url + ' after ' + retries + ' attempts.');
}

export default async function () {
  console.log('\nStarting Hardhat node...');
  
  // Navigate to the contract directory to run hardhat commands
  const contractDir = path.resolve(__dirname, '../src/contract');

  // Check if a PID file exists, indicating a possibly orphaned Hardhat node from a previous run
  try {
    const pid = parseInt(await fs.readFile(PID_FILE, 'utf8'), 10);
    if (pid) {
      console.log('Found existing PID file for Hardhat node (' + PID_FILE + ') with PID: ' + pid + '. Attempting to terminate...');
      try {
        process.kill(pid, 'SIGTERM');
        console.log('Sent SIGTERM to process ' + pid + '. Waiting a moment...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for graceful shutdown
      } catch (e) {
        console.warn('Could not send SIGTERM to process ' + pid + ' (it might not exist): ' + e.message);
      }
      try {
        await fs.unlink(PID_FILE); // Clean up old PID file
      } catch (e) {
        // ignore if already deleted
      }
    }
  } catch (e) {
    // PID file doesn't exist or couldn't be read, which is fine.
  }


  const hardhatNode = spawn('npx', ['hardhat', 'node', '--hostname', '0.0.0.0'], {
    cwd: contractDir, // Run in the context of the contract directory
    detached: false, // True makes it harder to kill reliably across platforms without extra steps for group killing
    stdio: 'pipe', // 'inherit' for debugging, 'pipe' to capture/ignore
  });

  global.__HARDHAT_NODE__ = hardhatNode; // Store reference for teardown

  // Write the PID to a file for the teardown script to use
  // This is a more robust way if global.__HARDHAT_NODE__ isn't accessible in teardown (different processes)
  await fs.writeFile(PID_FILE, hardhatNode.pid.toString());
  console.log('Hardhat node started with PID: ' + hardhatNode.pid + '. PID file created at ' + PID_FILE);

  hardhatNode.stdout.on('data', (data) => {
    // console.log('Hardhat stdout: ' + data.toString().trim()); // Uncomment for debugging
    if (data.toString().includes("Started HTTP and WebSocket JSON-RPC server at")) {
        // This is a good sign, but we'll still poll for actual readiness.
    }
  });

  hardhatNode.stderr.on('data', (data) => {
    console.error('Hardhat stderr: ' + data.toString().trim());
  });

  hardhatNode.on('error', (err) => {
    console.error('Failed to start Hardhat node process:', err);
    throw err; // Propagate error to stop Jest
  });
  
  hardhatNode.on('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') { // SIGTERM is expected on teardown
      console.warn('Hardhat node process exited unexpectedly with code ' + code + ' and signal ' + signal);
    }
  });

  try {
    await waitForHardhatNode(HARDHAT_RPC_URL);
    console.log('Hardhat node setup complete and responsive.');
  } catch (error) {
    console.error('Failed to confirm Hardhat node readiness: ' + error.message);
    // Attempt to kill the spawned process if readiness check fails, to avoid orphaned processes
    if (hardhatNode && hardhatNode.pid) {
      console.log('Attempting to clean up spawned Hardhat node (PID: ' + hardhatNode.pid + ') due to readiness failure...');
      try {
        process.kill(hardhatNode.pid, 'SIGTERM'); // or 'SIGKILL' if SIGTERM is not enough
      } catch (killError) {
        console.error('Failed to kill Hardhat node (PID: ' + hardhatNode.pid + ') during cleanup: ' + killError.message);
      }
    }
    throw error; // Re-throw to fail the setup and prevent tests from running
  }
} 