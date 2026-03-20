const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const JWT_SECRET = process.env.JWT_SECRET || 'lumiq_secret_2024';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:egNpBttTyFpglzpNqAGOiATDXpCHAMLO@centerbeam.proxy.rlwy.net:43941/railway';
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'lumiq_admin_2024';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD || 'dxahljm5o',
  api_key: process.env.CLOUDINARY_KEY || '536977242836915',
  api_secret: process.env.CLOUDINARY_SECRET || 'kqIUC7aXQJF_s8r6kA5e_z367yA'
});

const db = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initDB() {
  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    bio TEXT DEFAULT '',
    photo_url TEXT DEFAULT '',
    is_online BOOLEAN DEFAULT false,
    is_banned BOOLEAN DEFAULT false,
    last_seen TIMESTAMP DEFAULT NOW(),
    show_last_seen BOOLEAN DEFAULT true,
    show_online BOOLEAN DEFAULT true,
    show_join_date BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    participants TEXT[],
    last_message TEXT DEFAULT '',
    last_message_at TIMESTAMP DEFAULT NOW(),
    unread_count JSONB DEFAULT '{}'
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    chat_id TEXT REFERENCES chats(id),
    sender_id INT REFERENCES users(id),
    type TEXT DEFAULT 'text',
    text TEXT,
    audio_url TEXT,
    image_url TEXT,
    duration INT,
    seen BOOLEAN DEFAULT false,
    reactions JSONB DEFAULT '{}',
    reply_to JSONB,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  // أعمدة جديدة إن لم تكن موجودة
  const alters = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_join_date BOOLEAN DEFAULT true",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false"
  ];
  for (var i = 0; i < alters.length; i++) {
    await db.query(alters[i]).catch(function(){});
  }
  console.log('✅ DB ready');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','x-admin-key'] }));
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ═══ HELPERS ═══
app.get('/api/ping', function(req, res) { res.json({ ok: true }); });

function auth(req, res, next) {
  var token = req.headers.authorization && req.headers.authorization.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch(e) { res.status(401).json({ error: 'Invalid token' }); }
}

function adminAuth(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'غير مصرح' });
  next();
}

// ═══ AUTH ═══
app.post('/api/register', async function(req, res) {
  try {
    var name = req.body.name, username = req.body.username, email = req.body.email, password = req.body.password;
    if (!name || !username || !email || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    if (password.length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
    var exists = await db.query('SELECT id FROM users WHERE username=$1 OR email=$2', [username.toLowerCase(), email.toLowerCase()]);
    if (exists.rows.length) return res.status(400).json({ error: 'اسم المستخدم أو البريد مستخدم' });
    var hash = await bcrypt.hash(password, 10);
    var result = await db.query(
      'INSERT INTO users (name,username,email,password) VALUES ($1,$2,$3,$4) RETURNING id,name,username,email,bio,photo_url,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,created_at',
      [name, username.toLowerCase(), email.toLowerCase(), hash]
    );
    var user = result.rows[0];
    var token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token: token, user: user });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ في الخادم' }); }
});

app.post('/api/login', async function(req, res) {
  try {
    var email = req.body.email, password = req.body.password;
    var result = await db.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    var user = result.rows[0];
    if (!user) return res.status(400).json({ error: 'البريد غير موجود' });
    if (user.is_banned) return res.status(403).json({ error: 'تم حظر حسابك' });
    var ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'كلمة المرور خاطئة' });
    await db.query('UPDATE users SET is_online=true,last_seen=NOW() WHERE id=$1', [user.id]);
    delete user.password;
    var token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token: token, user: user });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ في الخادم' }); }
});

// ═══ USERS ═══
app.get('/api/me', auth, async function(req, res) {
  var r = await db.query('SELECT id,name,username,email,bio,photo_url,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,created_at FROM users WHERE id=$1', [req.user.id]);
  res.json(r.rows[0]);
});

app.put('/api/me', auth, async function(req, res) {
  try {
    var name = req.body.name, username = req.body.username, bio = req.body.bio;
    var show_last_seen = req.body.show_last_seen, show_online = req.body.show_online, show_join_date = req.body.show_join_date;
    if (username) {
      var ex = await db.query('SELECT id FROM users WHERE username=$1 AND id!=$2', [username.toLowerCase(), req.user.id]);
      if (ex.rows.length) return res.status(400).json({ error: 'اسم المستخدم مستخدم' });
    }
    await db.query(
      'UPDATE users SET name=COALESCE($1,name),username=COALESCE($2,username),bio=COALESCE($3,bio),show_last_seen=COALESCE($4,show_last_seen),show_online=COALESCE($5,show_online),show_join_date=COALESCE($6,show_join_date) WHERE id=$7',
      [name, username ? username.toLowerCase() : null, bio, show_last_seen, show_online, show_join_date, req.user.id]
    );
    var r = await db.query('SELECT id,name,username,email,bio,photo_url,is_online,last_seen,show_last_seen,show_online,show_join_date FROM users WHERE id=$1', [req.user.id]);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/me/avatar', auth, upload.single('avatar'), async function(req, res) {
  try {
    var b64 = req.file.buffer.toString('base64');
    var up = await cloudinary.uploader.upload('data:'+req.file.mimetype+';base64,'+b64, { folder:'lumiq/avatars', transformation:[{width:300,height:300,crop:'fill'}] });
    await db.query('UPDATE users SET photo_url=$1 WHERE id=$2', [up.secure_url, req.user.id]);
    res.json({ photo_url: up.secure_url });
  } catch(e) { res.status(500).json({ error: 'فشل رفع الصورة' }); }
});

app.get('/api/users/search', auth, async function(req, res) {
  var q = req.query.q ? req.query.q.toLowerCase() : '';
  if (!q || q.length < 2) return res.json([]);
  var r = await db.query('SELECT id,name,username,bio,photo_url,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,created_at FROM users WHERE username LIKE $1 AND id!=$2 LIMIT 20', [q+'%', req.user.id]);
  res.json(r.rows);
});

app.get('/api/users/:id', auth, async function(req, res) {
  var r = await db.query('SELECT id,name,username,bio,photo_url,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,created_at FROM users WHERE id=$1', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'غير موجود' });
  res.json(r.rows[0]);
});

app.delete('/api/me', auth, async function(req, res) {
  await db.query('DELETE FROM users WHERE id=$1', [req.user.id]);
  res.json({ ok: true });
});

// ═══ CHATS ═══
app.post('/api/chats', auth, async function(req, res) {
  try {
    var other = req.body.other_user_id;
    var ids = [String(req.user.id), String(other)].sort();
    var cid = ids.join('_');
    var ex = await db.query('SELECT * FROM chats WHERE id=$1', [cid]);
    if (ex.rows.length) return res.json(ex.rows[0]);
    var uc = {}; uc[req.user.id] = 0; uc[other] = 0;
    var r = await db.query('INSERT INTO chats (id,participants,unread_count) VALUES ($1,$2,$3) RETURNING *', [cid, ids, JSON.stringify(uc)]);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/chats', auth, async function(req, res) {
  var r = await db.query("SELECT * FROM chats WHERE $1=ANY(participants) ORDER BY last_message_at DESC", [String(req.user.id)]);
  res.json(r.rows);
});

// ═══ MESSAGES ═══
app.get('/api/chats/:chatId/messages', auth, async function(req, res) {
  var r = await db.query('SELECT * FROM messages WHERE chat_id=$1 ORDER BY created_at ASC', [req.params.chatId]);
  res.json(r.rows);
});

app.post('/api/chats/:chatId/messages', auth, async function(req, res) {
  try {
    var chatId = req.params.chatId, text = req.body.text, reply_to = req.body.reply_to;
    var r = await db.query('INSERT INTO messages (chat_id,sender_id,type,text,reply_to) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [chatId, req.user.id, 'text', text, reply_to ? JSON.stringify(reply_to) : null]);
    var msg = r.rows[0];
    await db.query('UPDATE chats SET last_message=$1,last_message_at=NOW() WHERE id=$2', [text, chatId]);
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/chats/:chatId/messages/image', auth, upload.single('image'), async function(req, res) {
  try {
    var chatId = req.params.chatId;
    var b64 = req.file.buffer.toString('base64');
    var up = await cloudinary.uploader.upload('data:'+req.file.mimetype+';base64,'+b64, { folder:'lumiq/images' });
    var r = await db.query('INSERT INTO messages (chat_id,sender_id,type,image_url,text) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [chatId, req.user.id, 'image', up.secure_url, 'صورة']);
    var msg = r.rows[0];
    await db.query('UPDATE chats SET last_message=$1,last_message_at=NOW() WHERE id=$2', ['صورة', chatId]);
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/chats/:chatId/messages/audio', auth, upload.single('audio'), async function(req, res) {
  try {
    var chatId = req.params.chatId, duration = parseInt(req.body.duration) || 0;
    var b64 = req.file.buffer.toString('base64');
    var up = await cloudinary.uploader.upload('data:'+req.file.mimetype+';base64,'+b64, { folder:'lumiq/audio', resource_type:'video' });
    var r = await db.query('INSERT INTO messages (chat_id,sender_id,type,audio_url,duration,text) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [chatId, req.user.id, 'voice', up.secure_url, duration, 'رسالة صوتية']);
    var msg = r.rows[0];
    await db.query('UPDATE chats SET last_message=$1,last_message_at=NOW() WHERE id=$2', ['رسالة صوتية', chatId]);
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.put('/api/messages/:id', auth, async function(req, res) {
  try {
    var text = req.body.text;
    var check = await db.query('SELECT sender_id FROM messages WHERE id=$1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'غير موجود' });
    if (String(check.rows[0].sender_id) !== String(req.user.id)) return res.status(403).json({ error: 'غير مسموح' });
    await db.query('UPDATE messages SET text=$1 WHERE id=$2', [text, req.params.id]);
    io.emit('edit_message', { id: req.params.id, text: text });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.delete('/api/messages/:id', auth, async function(req, res) {
  await db.query('DELETE FROM messages WHERE id=$1 AND sender_id=$2', [req.params.id, req.user.id]);
  io.emit('delete_message', { id: req.params.id });
  res.json({ ok: true });
});

app.post('/api/messages/:id/react', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT reactions FROM messages WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'غير موجود' });
    var reactions = r.rows[0].reactions || {};
    reactions[req.user.id] = req.body.emoji;
    await db.query('UPDATE messages SET reactions=$1 WHERE id=$2', [JSON.stringify(reactions), req.params.id]);
    io.emit('reaction', { msg_id: req.params.id, reactions: reactions });
    res.json({ reactions: reactions });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/chats/:chatId/read', auth, async function(req, res) {
  await db.query('UPDATE messages SET seen=true WHERE chat_id=$1 AND sender_id!=$2 AND seen=false', [req.params.chatId, req.user.id]);
  var chat = await db.query('SELECT unread_count FROM chats WHERE id=$1', [req.params.chatId]);
  if (chat.rows.length) {
    var uc = chat.rows[0].unread_count || {};
    uc[req.user.id] = 0;
    await db.query('UPDATE chats SET unread_count=$1 WHERE id=$2', [JSON.stringify(uc), req.params.chatId]);
  }
  res.json({ ok: true });
});

// ═══ ADMIN ═══
app.get('/api/admin/stats', adminAuth, async function(req, res) {
  try {
    var users    = await db.query('SELECT COUNT(*) as c FROM users');
    var messages = await db.query('SELECT COUNT(*) as c FROM messages');
    var images   = await db.query("SELECT COUNT(*) as c FROM messages WHERE type='image'");
    var voice    = await db.query("SELECT COUNT(*) as c FROM messages WHERE type='voice'");
    var chats    = await db.query('SELECT COUNT(*) as c FROM chats');
    var online   = await db.query('SELECT COUNT(*) as c FROM users WHERE is_online=true');
    var today_u  = await db.query("SELECT COUNT(*) as c FROM users WHERE created_at > NOW() - INTERVAL '24 hours'");
    var today_m  = await db.query("SELECT COUNT(*) as c FROM messages WHERE created_at > NOW() - INTERVAL '24 hours'");
    res.json({
      users: parseInt(users.rows[0].c),
      messages: parseInt(messages.rows[0].c),
      images: parseInt(images.rows[0].c),
      voice: parseInt(voice.rows[0].c),
      chats: parseInt(chats.rows[0].c),
      online: parseInt(online.rows[0].c),
      new_users_today: parseInt(today_u.rows[0].c),
      messages_today: parseInt(today_m.rows[0].c)
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', adminAuth, async function(req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var search = req.query.search ? '%'+req.query.search.toLowerCase()+'%' : '%';
    var r = await db.query('SELECT id,name,username,email,photo_url,is_online,is_banned,is_verified,last_seen,created_at FROM users WHERE username LIKE $1 OR name ILIKE $1 ORDER BY created_at DESC LIMIT 20 OFFSET $2', [search, (page-1)*20]);
    var total = await db.query('SELECT COUNT(*) as c FROM users WHERE username LIKE $1 OR name ILIKE $1', [search]);
    res.json({ users: r.rows, total: parseInt(total.rows[0].c), page: page });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id', adminAuth, async function(req, res) {
  await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/ban', adminAuth, async function(req, res) {
  await db.query('UPDATE users SET is_banned=$1 WHERE id=$2', [req.body.banned, req.params.id]);
  if (req.body.banned) {
    var uid = String(req.params.id);
    if (onlineUsers[uid]) io.to(onlineUsers[uid]).emit('force_logout', { reason: 'تم حظر حسابك' });
  }
  res.json({ ok: true });
});

app.get('/api/admin/messages', adminAuth, async function(req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var r = await db.query('SELECT m.id,m.text,m.type,m.created_at,m.chat_id,u.name as sender_name,u.username FROM messages m JOIN users u ON m.sender_id=u.id ORDER BY m.created_at DESC LIMIT 30 OFFSET $1', [(page-1)*30]);
    var total = await db.query('SELECT COUNT(*) as c FROM messages');
    res.json({ messages: r.rows, total: parseInt(total.rows[0].c), page: page });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/messages/:id', adminAuth, async function(req, res) {
  await db.query('DELETE FROM messages WHERE id=$1', [req.params.id]);
  io.emit('delete_message', { id: req.params.id });
  res.json({ ok: true });
});

app.get('/api/admin/images', adminAuth, async function(req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var r = await db.query("SELECT m.id,m.image_url,m.created_at,u.name as sender_name,u.username FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.type='image' ORDER BY m.created_at DESC LIMIT 20 OFFSET $1", [(page-1)*20]);
    var total = await db.query("SELECT COUNT(*) as c FROM messages WHERE type='image'");
    res.json({ images: r.rows, total: parseInt(total.rows[0].c), page: page });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// توثيق مستخدم
app.post('/api/admin/users/:id/verify', adminAuth, async function(req, res) {
  try {
    var verified = req.body.verified;
    await db.query('UPDATE users SET is_verified=$1 WHERE id=$2', [verified, req.params.id]);
    // إشعار المستخدم
    var uid = String(req.params.id);
    if (onlineUsers[uid]) {
      io.to(onlineUsers[uid]).emit('verified', { is_verified: verified });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/broadcast', adminAuth, async function(req, res) {
  io.emit('broadcast', { title: req.body.title || 'LUMIQ', message: req.body.message, time: new Date() });
  res.json({ ok: true });
});

// ═══ SOCKET ═══
var onlineUsers = {};

io.on('connection', function(socket) {
  socket.on('join', async function(data) {
    try {
      var user = jwt.verify(data.token, JWT_SECRET);
      socket.userId = user.id;
      onlineUsers[String(user.id)] = socket.id;
      await db.query('UPDATE users SET is_online=true,last_seen=NOW() WHERE id=$1', [user.id]);
      io.emit('user_online', { user_id: user.id, is_online: true });
      var chats = await db.query('SELECT id FROM chats WHERE $1=ANY(participants)', [String(user.id)]);
      chats.rows.forEach(function(c) { socket.join(c.id); });
    } catch(e) { console.error('join:', e.message); }
  });

  socket.on('join_chat', function(data) { socket.join(data.chat_id); });

  socket.on('typing', function(data) {
    socket.to(data.chat_id).emit('typing', { user_id: data.user_id, is_typing: data.is_typing });
  });

  socket.on('call_request', function(data) {
    var to = onlineUsers[String(data.to_user_id)];
    if (to) io.to(to).emit('call_incoming', { from_user: data.from_user, chat_id: data.chat_id, socket_id: socket.id });
    else socket.emit('call_failed', { reason: 'المستخدم غير متصل' });
  });
  socket.on('call_accept',  function(d) { io.to(d.to_socket_id).emit('call_accepted',  { from_user: d.from_user, socket_id: socket.id }); });
  socket.on('call_reject',  function(d) { io.to(d.to_socket_id).emit('call_rejected'); });
  socket.on('call_end',     function(d) { if (d.to_socket_id) io.to(d.to_socket_id).emit('call_ended'); });
  socket.on('webrtc_offer', function(d) { io.to(d.to_socket_id).emit('webrtc_offer',  { offer: d.offer, from_socket_id: socket.id }); });
  socket.on('webrtc_answer',function(d) { io.to(d.to_socket_id).emit('webrtc_answer', { answer: d.answer }); });
  socket.on('webrtc_ice',   function(d) { io.to(d.to_socket_id).emit('webrtc_ice',    { candidate: d.candidate }); });

  socket.on('disconnect', async function() {
    if (socket.userId) {
      delete onlineUsers[String(socket.userId)];
      await db.query('UPDATE users SET is_online=false,last_seen=NOW() WHERE id=$1', [socket.userId]);
      io.emit('user_online', { user_id: socket.userId, is_online: false, last_seen: new Date() });
    }
  });
});

initDB().then(function() {
  server.listen(PORT, function() { console.log('🚀 LUMIQ Server on port ' + PORT); });
}).catch(function(e) { console.error('DB Error:', e); process.exit(1); });
