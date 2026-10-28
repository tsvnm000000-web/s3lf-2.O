require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { SelfbotManager } = require('../selfbot/manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const manager = new SelfbotManager(io);

// ─── API ROUTES ──────────────────────────────────────────────

/** Add a new token */
app.post('/api/tokens', async (req, res) => {
  try {
    const { token, alias } = req.body;
    if (!token || token.trim().length < 10) {
      return res.status(400).json({ error: 'Invalid token format.' });
    }
    const result = await manager.addToken(token.trim(), alias);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** List all tokens (masked) */
app.get('/api/tokens', (req, res) => {
  res.json(manager.listTokens());
});

/** Update a single token / account */
app.patch('/api/tokens/:id', async (req, res) => {
  try {
    const result = await manager.updateToken(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Bulk edit multiple tokens */
app.post('/api/tokens/bulk-edit', async (req, res) => {
  try {
    const { ids, updates } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No tokens selected.' });
    }
    const results = await manager.bulkUpdate(ids, updates);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Remove a token */
app.delete('/api/tokens/:id', async (req, res) => {
  try {
    await manager.removeToken(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Toggle 24/7 VC for a token */
app.post('/api/tokens/:id/vc', async (req, res) => {
  try {
    const { guildId, channelId } = req.body;
    if (!guildId || !channelId) {
      return res.status(400).json({ error: 'guildId and channelId are required.' });
    }
    const result = await manager.toggleVC(req.params.id, guildId, channelId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SOCKET.IO ────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.emit('tokens:list', manager.listTokens());
  manager.onUpdate = (tokens) => {
    io.emit('tokens:list', tokens);
  };
});

// ─── START ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Panel running at http://localhost:${PORT}`);
});
