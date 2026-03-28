import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Starting OutreachAI Services...");

const startProcess = (name, script) => {
  const p = spawn('node', [script], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  p.on('close', (code) => {
    console.log(`[${name}] process exited with code ${code}`);
  });
  return p;
};

// Start all three main backend services
startProcess('API_SERVER', 'src/server.js');
startProcess('BACKGROUND_WORKER', 'src/worker.js');
startProcess('CRON_SCHEDULER', 'src/cron.js');

// Handle process termination gracefully
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
