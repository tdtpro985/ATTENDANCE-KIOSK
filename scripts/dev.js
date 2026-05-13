const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// ANSI Color Codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m",
  bgGreen: "\x1b[42m"
};

function getIPAddress() {
  const interfaces = os.networkInterfaces();
  let fallbackIP = null;

  for (const devName in interfaces) {
    const iface = interfaces[devName];
    const isWifi = devName.toLowerCase().includes('wi-fi') || 
                   devName.toLowerCase().includes('wireless') || 
                   devName.toLowerCase().includes('wlan');

    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && !alias.internal) {
        if (isWifi) {
          return alias.address;
        }
        if (!fallbackIP) {
          fallbackIP = alias.address;
        }
      }
    }
  }
  
  return fallbackIP || '127.0.0.1';
}

function startDev() {
  const ip = getIPAddress();
  const port = 8000;
  const backendUrl = `http://${ip}:${port}`;

  console.log(`\n${colors.bright}${colors.green}Verification Successful${colors.reset}`);
  console.log(`${colors.blue}  [Network]${colors.reset} Detected IP: ${colors.bright}${ip}${colors.reset}`);
  console.log(`${colors.blue}  [Config] ${colors.reset} Setting BACKEND_URL to ${colors.bright}${backendUrl}${colors.reset}\n`);

  const configDir = path.join(__dirname, '../src/config');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configPath = path.join(configDir, 'backend.ts');
  const content = `export const BACKEND_URL = '${backendUrl}';\n`;
  fs.writeFileSync(configPath, content);

  console.log(`${colors.magenta}-------------------------------------------------${colors.reset}`);
  console.log(`${colors.bright}${colors.bgBlue}  PHP BACKEND  ${colors.reset} Starting on 0.0.0.0:${port}...`);
  
  // Resolve DEP0190 by passing the command as a single string when shell: true
  const phpCmd = `php -S 0.0.0.0:${port} -t backend-php/public`;
  const php = spawn(phpCmd, {
    stdio: 'inherit',
    shell: true
  });

  console.log(`${colors.bright}${colors.bgGreen}  EXPO ANDROID ${colors.reset} Building and launching...`);
  console.log(`${colors.magenta}-------------------------------------------------${colors.reset}\n`);
  
  const expoCmd = `npx expo run:android`;
  const expo = spawn(expoCmd, {
    stdio: 'inherit',
    shell: true
  });

  process.on('SIGINT', () => {
    console.log(`\n\n${colors.bright}${colors.yellow}Shutting down development servers...${colors.reset}`);
    php.kill();
    expo.kill();
    process.exit();
  });
}

console.log(`\n${colors.bright}${colors.cyan}HRIS Kiosk Development Environment${colors.reset}\n`);
process.stdout.write(`${colors.bright}${colors.yellow}Did you connect your mobile/tablet phone or run android studio tablet? y or n: ${colors.reset}`);

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');

process.stdin.on('data', (key) => {
  if (key === '\u0003') {
    process.exit();
  }

  const answer = key.toLowerCase();
  
  if (answer === 'y') {
    process.stdout.write('y\n');
    process.stdin.setRawMode(false);
    process.stdin.pause();
    startDev();
  } else if (answer === 'n') {
    process.stdout.write('n\n');
    console.log(`\n${colors.bright}${colors.yellow}Dev script cancelled. Please connect a device first.${colors.reset}\n`);
    process.exit();
  }
});
