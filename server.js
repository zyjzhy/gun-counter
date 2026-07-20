const express = require('express');
const compression = require('compression');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const fsp = require('fs/promises');
const net = require('net');
const path = require('path');
const os = require('os');

const BASE_PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (err) {
    console.warn('读取计数文件失败，已使用默认值:', err.message);
  }
  return { count: 0, lastTime: '' };
}

let data = loadData();
let saveTimer = null;
let saving = Promise.resolve();

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const snapshot = JSON.stringify(data);
    saving = saving
      .then(() => fsp.writeFile(DATA_FILE, snapshot, 'utf-8'))
      .catch((err) => console.error('保存计数失败:', err.message));
  }, 80);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(compression());
app.use(express.json());

app.use(express.static(PUBLIC_DIR, {
  etag: true,
  lastModified: true,
  maxAge: '10m',
  setHeaders(res, filePath) {
    if (path.basename(filePath) === 'index.html') {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

app.get('/api/count', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(data);
});

app.post('/api/count', (req, res) => {
  data.count += 1;
  data.lastTime = new Date().toLocaleString('zh-CN', { hour12: false });
  queueSave();
  broadcast({ type: 'update', count: data.count, lastTime: data.lastTime });
  res.json(data);
});

app.post('/api/reset', (req, res) => {
  data = { count: 0, lastTime: '' };
  queueSave();
  broadcast({ type: 'update', count: 0, lastTime: '' });
  res.json(data);
});

const server = createServer(app);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

const wss = new WebSocketServer({
  server,
  perMessageDeflate: false,
  clientTracking: true,
});

wss.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') {
    console.error('WebSocket 服务错误:', err.message);
  }
});

function broadcast(msg) {
  const str = JSON.stringify(msg);
  for (const ws of wss.clients) {
    if (ws.readyState === 1) ws.send(str);
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.send(JSON.stringify({ type: 'update', count: data.count, lastTime: data.lastTime }));
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

async function flushAndExit() {
  clearInterval(heartbeat);
  clearTimeout(saveTimer);
  await saving;
  server.close(() => process.exit(0));
}

process.on('SIGINT', flushAndExit);
process.on('SIGTERM', flushAndExit);

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const probe = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        probe.close(() => resolve(true));
      })
      .listen(port);
  });
}

async function findAvailablePort(basePort) {
  for (let port = basePort; port <= basePort + 20; port += 1) {
    if (await isPortAvailable(port)) {
      if (port !== basePort) console.warn(`端口 ${basePort} 已占用，改用 ${port}`);
      return port;
    }
  }
  throw new Error(`端口 ${basePort}-${basePort + 20} 都已被占用`);
}

function printAddresses(port) {
  console.log('计数器服务已启动');
  console.log(`  本地地址: http://localhost:${port}`);
  for (const name of Object.keys(os.networkInterfaces())) {
    for (const info of os.networkInterfaces()[name] || []) {
      if (info.family === 'IPv4' && !info.internal) {
        console.log(`  局域网地址: http://${info.address}:${port}`);
      }
    }
  }
  console.log('');
  console.log('  按 Ctrl+C 停止服务');
}

findAvailablePort(BASE_PORT)
  .then((port) => {
    server.on('error', (err) => {
      console.error('服务启动失败:', err.message);
      process.exit(1);
    });
    server.listen(port, () => printAddresses(port));
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
