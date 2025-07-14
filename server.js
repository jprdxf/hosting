const express = require('express');
const next = require('next');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'supersecretkey';

const users = {}; // Usuarios en memoria (demo)
const bots = {};  // Bots corriendo

// Configuración multer para subida de archivos
const upload = multer({ dest: 'uploads/' });

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);
  const io = socketIo(httpServer);

  server.use(express.json());

  // Registro (demo simple)
  server.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (users[username]) return res.status(400).json({ error: 'Usuario ya existe' });
    const hash = await bcrypt.hash(password, 10);
    users[username] = { password: hash, bots: [] };
    res.json({ success: true });
  });

  // Login (demo simple)
  server.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    if (!user) return res.status(400).json({ error: 'Usuario no existe' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Contraseña incorrecta' });
    const token = jwt.sign({ username }, SECRET_KEY);
    res.json({ token });
  });

  // Middleware autenticación
  server.use((req, res, next) => {
    if (req.path.startsWith('/api') && req.path !== '/api/login' && req.path !== '/api/register') {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ error: 'No autorizado' });
      try {
        req.user = jwt.verify(token, SECRET_KEY);
        next();
      } catch {
        res.status(401).json({ error: 'Token inválido' });
      }
    } else {
      next();
    }
  });

  // Subida de archivos para bots
  server.post('/api/upload', upload.single('file'), (req, res) => {
    const username = req.user.username;
    const destDir = path.join(__dirname, 'user_bots', username);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, req.file.originalname);
    fs.renameSync(req.file.path, destPath);
    users[username].bots.push(destPath);
    res.json({ success: true, path: destPath });
  });

  // Listar bots del usuario
  server.get('/api/bots', (req, res) => {
    const username = req.user.username;
    res.json({ bots: users[username].bots || [] });
  });

  // Ejecutar un bot (demo simple, no producción)
  server.post('/api/start', (req, res) => {
    const { botPath } = req.body;
    const username = req.user.username;
    if (!users[username].bots.includes(botPath)) return res.status(400).json({ error: 'Bot no encontrado' });
    if (bots[botPath]) return res.status(400).json({ error: 'Bot ya está corriendo' });
    const { spawn } = require('child_process');
    const botProcess = spawn('node', [botPath]);
    bots[botPath] = botProcess;

    botProcess.stdout.on('data', data => {
      io.to(username).emit('bot-output', { bot: botPath, output: data.toString() });
    });
    botProcess.stderr.on('data', data => {
      io.to(username).emit('bot-error', { bot: botPath, error: data.toString() });
    });
    botProcess.on('close', code => {
      io.to(username).emit('bot-closed', { bot: botPath, code });
      delete bots[botPath];
    });
    res.json({ success: true });
  });

  // Parar un bot
  server.post('/api/stop', (req, res) => {
    const { botPath } = req.body;
    const username = req.user.username;
    if (!bots[botPath]) return res.status(400).json({ error: 'Bot no está corriendo' });
    bots[botPath].kill();
    res.json({ success: true });
  });

  // Socket.io conexión para consola en vivo
  io.on('connection', socket => {
    const username = socket.handshake.query.username;
    if (username) {
      socket.join(username);
    }
  });

  // Next.js handler para otras rutas
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
});
