import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { loadConfig } from './config.js';
import { bridgeClient } from './voiceLiveBridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`\n[config] ${err.message}\n`);
    process.exit(1);
  }

  const app = express();
  app.use(express.static(PUBLIC_DIR));

  // 자격증명이 아닌 런타임 정보만 브라우저에 노출한다.
  app.get('/api/info', (_req, res) => {
    res.json({ model: config.model, voice: config.voice });
  });

  const server = http.createServer(app);

  // 브라우저 시그널링 WebSocket. 연결마다 자신만의 Azure 브리지를 만든다.
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (clientWs) => {
    console.log('[server] 브라우저 연결됨, Voice Live 브리지 시작');
    bridgeClient(clientWs, config);
  });

  server.listen(config.port, () => {
    const auth = config.useEntraId ? 'Entra ID (DefaultAzureCredential)' : 'API key';
    console.log(`\n  Voice Live WebRTC lab 실행 중`);
    console.log(`  → http://localhost:${config.port}`);
    console.log(`  Model: ${config.model}  |  Voice: ${config.voice}  |  Auth: ${auth}\n`);
  });
}

main();
