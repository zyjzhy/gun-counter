const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2] || process.env.PORT || 3000);
const outFile = path.join(__dirname, 'tunnel-url.txt');

function startTunnel() {
  const ssh = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-R', `80:localhost:${port}`,
    'serveo.net'
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  ssh.stdout.on('data', (data) => {
    const text = data.toString();
    console.log(text.trim());
    const match = text.match(/https:\/\/\S+\.serveousercontent\.com/);
    if (match) {
      fs.writeFileSync(outFile, match[0], 'utf8');
      console.log('✓ 外网地址: ' + match[0]);
    }
  });

  ssh.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (text) console.error(text);
  });

  ssh.on('error', (err) => {
    console.error('SSH tunnel error:', err.message);
  });

  ssh.on('exit', (code) => {
    console.log('隧道断开 (' + code + ')，5秒后重连...');
    setTimeout(startTunnel, 5000);
  });

  process.on('SIGINT', () => { ssh.kill(); process.exit(0); });
  process.on('SIGTERM', () => { ssh.kill(); process.exit(0); });
}

startTunnel();
