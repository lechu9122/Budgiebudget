const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

function toWslPath(winPath) {
  const normalized = path.resolve(winPath).replace(/\\/g, '/');
  const drive = normalized.slice(0, 1).toLowerCase();
  const rest = normalized.slice(2);
  return `/mnt/${drive}${rest}`;
}

const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');

if (!fs.existsSync(path.join(frontendDir, 'package.json'))) {
  console.error('Cannot find frontend/package.json. Run this command from repo root.');
  process.exit(1);
}

const isWindows = process.platform === 'win32';

const rootWslPath = toWslPath(rootDir);
const backendCommand = [
  `cd "${rootWslPath}"`,
  "if [ -f .env ]; then eval \"$(tr -d '\\r' < .env | sed -e '/^#/d' -e '/^$/d' -e 's/^/export /')\"; fi",
  'cd backend',
  'cmake -B build -DCMAKE_BUILD_TYPE=Release',
  'cmake --build build --parallel',
  './build/budgie_backend',
].join(' && ');

const backend = spawn('wsl', ['bash', '-lc', backendCommand], {
  stdio: 'inherit',
});

let frontend = null;

function startFrontend() {
  frontend = isWindows
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'npm start'], {
        cwd: frontendDir,
        stdio: 'inherit',
      })
    : spawn('npm', ['start'], {
        cwd: frontendDir,
        stdio: 'inherit',
      });

  frontend.on('exit', (code) => {
    if (!shuttingDown) {
      console.log(`Frontend exited with code ${code ?? 0}. Stopping backend...`);
      shutdown('SIGTERM');
    }
  });

  frontend.on('error', (err) => {
    console.error('Failed to start frontend process:', err.message);
    shutdown('SIGTERM');
  });
}

function waitForBackendThenStartFrontend() {
  let attempts = 0;
  const maxAttempts = 40; // ~20 seconds

  const timer = setInterval(() => {
    if (shuttingDown) {
      clearInterval(timer);
      return;
    }

    attempts += 1;

    const req = http.get('http://127.0.0.1:8080/api/health', (res) => {
      if (res.statusCode === 200) {
        clearInterval(timer);
        startFrontend();
      }
      res.resume();
    });

    req.on('error', () => {
      if (attempts >= maxAttempts) {
        clearInterval(timer);
        console.warn('Backend health check timed out. Starting frontend anyway...');
        startFrontend();
      }
    });

    req.setTimeout(800, () => {
      req.destroy();
    });
  }, 500);
}

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (backend && !backend.killed) {
    backend.kill(signal);
  }
  if (frontend && !frontend.killed) {
    frontend.kill(signal);
  }

  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

backend.on('exit', (code) => {
  if (!shuttingDown) {
    console.log(`Backend exited with code ${code ?? 0}. Stopping frontend...`);
    shutdown('SIGTERM');
  }
});

backend.on('error', (err) => {
  console.error('Failed to start backend process:', err.message);
  shutdown('SIGTERM');
});

waitForBackendThenStartFrontend();
