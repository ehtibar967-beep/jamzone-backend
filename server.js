'use strict';
// JamZone Backend Lite: health + realtime WebSocket С‡Р°С‚ РґР»СЏ С‚РІРѕРµРіРѕ HTML-РїСЂРёР»РѕР¶РµРЅРёСЏ.
// Р Р°Р±РѕС‚Р°РµС‚ РЅР° Render.com Р±РµР· Р·Р°РІРёСЃРёРјРѕСЃС‚РµР№.
const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8095);
const HOST = process.env.HOST || '0.0.0.0';

const onlineByName = new Map(); // username -> Set(conn)
const history = []; // {from,to,text,ts,...} С…СЂР°РЅРёС‚СЃСЏ РїРѕРєР° СЃРµСЂРІРµСЂ РЅРµ РїРµСЂРµР·Р°РїСѓСЃС‚РёС‚СЃСЏ

function cors(res, code, type) {
  res.writeHead(code, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': type || 'application/json; charset=utf-8'
  });
}
function sendJson(res, code, obj) { cors(res, code); res.end(JSON.stringify(obj)); }

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { cors(res, 204); return res.end(); }
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') {
    return sendJson(res, 200, {
      ok: true,
      name: 'JamZone Backend',
      users: onlineByName.size,
      messages: history.length,
      time: new Date().toISOString()
    });
  }
  if (url.pathname === '/') {
    cors(res, 200, 'text/html; charset=utf-8');
    return res.end('<h1>рџџў JamZone Backend СЂР°Р±РѕС‚Р°РµС‚</h1><p>Health: <a href="/health">/health</a></p><p>WebSocket: /ws</p>');
  }
  sendJson(res, 404, { ok: false, error: 'not_found' });
});

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws') return socket.destroy();
  const key = req.headers['sec-websocket-key'];
  if (!key) return socket.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + accept,
    '\r\n'
  ].join('\r\n'));
  const conn = makeConn(socket);
  conn.send({ type: 'welcome', server: 'JamZone', ts: Date.now() });
});

function makeConn(socket) {
  const conn = { socket, name: '', displayName: '', avatar: '', alive: true, buffer: Buffer.alloc(0) };
  conn.send = obj => sendFrame(socket, JSON.stringify(obj));
  conn.close = () => { try { socket.end(); } catch(e) {} };
  socket.on('data', chunk => {
    conn.buffer = Buffer.concat([conn.buffer, chunk]);
    while (true) {
      const parsed = readFrame(conn.buffer);
      if (!parsed) break;
      conn.buffer = conn.buffer.slice(parsed.bytes);
      if (parsed.opcode === 0x8) { conn.close(); break; }
      if (parsed.opcode === 0x9) { sendPong(socket, parsed.payload); continue; }
      if (parsed.opcode !== 0x1) continue;
      try { handleMsg(conn, JSON.parse(parsed.payload.toString('utf8'))); } catch(e) {}
    }
  });
  socket.on('close', () => disconnect(conn));
  socket.on('error', () => disconnect(conn));
  return conn;
}

function handleMsg(conn, msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'auth' && msg.username) {
    const name = cleanName(msg.username);
    if (!name) return;
    conn.name = name;
    conn.displayName = msg.name || name;
    conn.avatar = msg.avatar || '';
    if (!onlineByName.has(name)) onlineByName.set(name, new Set());
    onlineByName.get(name).add(conn);
    conn.send({ type: 'auth_ok', username: name, online: Array.from(onlineByName.keys()) });
    broadcast({ type: 'user_online', username: name, name: conn.displayName, avatar: conn.avatar });
    console.log('рџџў online:', name);
    return;
  }
  if (!conn.name) return;
  if (msg.type === 'typing' && msg.to) {
    sendToName(cleanName(msg.to), { type: 'typing', from: conn.name, fromName: conn.displayName }, conn);
    return;
  }
  if (msg.type === 'dm' && msg.to) {
    const to = cleanName(msg.to);
    const item = {
      type: 'dm', from: conn.name, to,
      fromName: msg.fromName || conn.displayName,
      avatar: msg.avatar || conn.avatar,
      text: String(msg.text || ''),
      msgType: msg.msgType || 'text',
      replyTo: msg.replyTo || null,
      fileUrl: msg.fileUrl || '',
      ts: Date.now(),
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()
    };
    history.push(item);
    if (history.length > 2000) history.splice(0, history.length - 2000);
    sendToName(to, item, conn);
    conn.send({ type: 'delivered', to, id: item.id, ts: item.ts });
    console.log('рџ“©', conn.name, '->', to, item.text.slice(0, 80));
    return;
  }
  if (msg.type === 'get_history' && msg.with) {
    const other = cleanName(msg.with);
    const items = history.filter(m => (m.from === conn.name && m.to === other) || (m.from === other && m.to === conn.name));
    conn.send({ type: 'history', with: other, messages: items });
    return;
  }
}

function cleanName(x) { return String(x || '').replace('@','').trim().toLowerCase().replace(/[^a-z0-9_\-.Р°-СЏС‘]/gi, '').slice(0, 40); }
function sendToName(name, obj, exceptConn) { const set = onlineByName.get(name); if (set) for (const c of set) if (c !== exceptConn) c.send(obj); }
function broadcast(obj) { for (const set of onlineByName.values()) for (const c of set) c.send(obj); }
function disconnect(conn) {
  if (!conn.alive) return;
  conn.alive = false;
  if (conn.name && onlineByName.has(conn.name)) {
    const set = onlineByName.get(conn.name);
    set.delete(conn);
    if (set.size === 0) { onlineByName.delete(conn.name); broadcast({ type: 'user_offline', username: conn.name }); }
    console.log('рџ”ґ offline:', conn.name);
  }
}

function readFrame(buf) {
  if (buf.length < 2) return null;
  const b0 = buf[0], b1 = buf[1];
  const opcode = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  let len = b1 & 0x7f, off = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (buf.length < 10) return null; const hi = buf.readUInt32BE(2); const lo = buf.readUInt32BE(6); len = hi * 2 ** 32 + lo; off = 10; }
  let mask;
  if (masked) { if (buf.length < off + 4) return null; mask = buf.slice(off, off + 4); off += 4; }
  if (buf.length < off + len) return null;
  const payload = Buffer.from(buf.slice(off, off + len));
  if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
  return { opcode, payload, bytes: off + len };
}
function sendFrame(socket, text) {
  const payload = Buffer.from(text);
  let header;
  if (payload.length < 126) header = Buffer.from([0x81, payload.length]);
  else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(payload.length, 6); }
  socket.write(Buffer.concat([header, payload]));
}
function sendPong(socket, payload) { const h = Buffer.from([0x8a, payload.length]); socket.write(Buffer.concat([h, payload])); }

server.listen(PORT, HOST, () => {
  console.log('вњ… JamZone Backend Р·Р°РїСѓС‰РµРЅ');
  console.log('HTTP: http://localhost:' + PORT + '/health');
  console.log('WS: ws://localhost:' + PORT + '/ws');
});
