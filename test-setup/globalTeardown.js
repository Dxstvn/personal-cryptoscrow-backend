import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PID_FILE = path.resolve(__dirname, '.hardhat_node.pid');

export default async function () {
  console.log('\nShutting down Hardhat node...');
  let pid;
  try {
    pid = parseInt(await fs.readFile(PID_FILE, 'utf8'), 10);
  } catch (e) {
    console.warn('Could not read PID file (' + PID_FILE + '). Hardhat node might not have started correctly or PID file was already cleaned up.');
    // Attempt to find and kill if global reference exists (less reliable across separate setup/teardown processes)
    if (global.__HARDHAT_NODE__ && global.__HARDHAT_NODE__.pid) {
        console.log('(Fallback) Attempting to use global reference PID: ' + global.__HARDHAT_NODE__.pid);
        pid = global.__HARDHAT_NODE__.pid;
    } else {
        console.log('No PID found, Hardhat node might have already shut down or failed to start.');
        return;
    }
  }

  if (pid) {
    try {
      console.log('Attempting to terminate Hardhat node with PID: ' + pid + '. Waiting for it to exit...');
      process.kill(pid, 'SIGTERM'); // Send SIGTERM for graceful shutdown
      console.log('Sent SIGTERM to process ' + pid + '. Waiting for it to exit...');
      // Add a short delay to allow the process to terminate
      await new Promise(resolve => setTimeout(resolve, 2000)); 
    } catch (e) {
      console.warn('Failed to send SIGTERM to Hardhat node (PID: ' + pid + '). It might have already stopped. Error: ' + e.message);
      // If SIGTERM fails, you could try SIGKILL, but it's less graceful:
      // try { process.kill(pid, 'SIGKILL'); } catch (e2) { console.error('Failed to send SIGKILL: ' + e2.message); }
    }
  }

  try {
    await fs.unlink(PID_FILE); // Clean up the PID file
    console.log('PID file (' + PID_FILE + ') deleted.');
  } catch (e) {
    // console.warn('Could not delete PID file (' + PID_FILE + '), it might have already been removed: ' + e.message);
  }
  
  console.log('Hardhat node teardown complete.');
}