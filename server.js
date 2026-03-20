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

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD || 'dxahljm5o',
  api_key: process.env.CLOUDINARY_KEY || '536977242836915',
  api_secret: process.env.CLOUDINARY_SECRET || 'kqIUC7aXQJF_s8r6kA5e_z367yA'
});

const db = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const CREATE_USERS = 'CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, bio TEXT DEFAULT \'\', photo_url TEXT DEFAULT \'\', is_online BOOLEAN DEFAULT false, last_seen TIMESTAMP DEFAULT NOW(), show_last_seen BOOLEAN DEFAULT true, show_online BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW())';

const CREATE_CHATS = 'CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, participants TEXT[], last_message TEXT DEFAULT \'\', last_message_at TIMESTAMP DEFAULT NOW(), unread_count JSONB DEFAULT \'{}\'::jsonb)';

const CREATE_MESSAGES = 'CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, chat_id TEXT REFERENCES chats(id), sender_id INT REFERENCES users(id), type TEXT DEFAULT \'text\', text TEXT, audio_url TEXT, image_url TEXT, duration INT, seen BOOLEAN DEFAULT false, reactions JSONB DEFAULT \'{}\'::jsonb, reply_to JSONB, created_at TIMESTAMP DEFAULT NOW())';

const CREATE_STORIES = 'CREATE TABLE IF NOT EXISTS stories (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, type TEXT DEFAULT \'text\', text TEXT, image_url TEXT, bg_color TEXT DEFAULT \'sg1\', views JSONB DEFAULT \'[]\'::jsonb, expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL \'24 hours\'), created_at TIMESTAMP DEFAULT NOW())';

async function initDB() {
  await db.query(CREATE_USERS);
  await db.query(CREATE_CHATS);
  await db.query(CREATE_MESSAGES);
  await db.query(CREATE_STORIES);
  console.log('DB ready');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.get('/api/ping', function(req, res) { res.json({ ok: true }); });

function auth(req, res, next) {
  var token = req.headers.authorization && req.headers.authorization.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch(e) { res.status(401).json({ error: 'Invalid token' }); }
}

app.post('/api/register', async function(req, res) {
  try {
    var name = req.body.name;
    var username = req.body.username;
    var email = req.body.email;
    var password = req.body.password;
    if (!name || !username || !email || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    if (password.length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
    var exists = await db.query('SELECT id FROM users WHERE username=$1 OR email=$2', [username.toLowerCase(), email.toLowerCase()]);
    if (exists.rows.length) return res.status(400).json({ error: 'اسم المستخدم أو البريد مستخدم' });
    var hash = await bcrypt.hash(password, 10);
    var result = await db.query('INSERT INTO users (name, username, email, password) VALUES ($1,$2,$3,$4) RETURNING id, name, username, email, bio, photo_url, is_online, last_seen, show_last_seen, show_online, created_at', [name, username.toLowerCase(), email.toLowerCase(), hash]);
    var user = result.rows[0];
    var token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token: token, user: user });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ في الخادم' }); }
});

app.post('/api/login', async function(req, res) {
  try {
    var email = req.body.email;
    var password = req.body.password;
    var result = await db.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    var user = result.rows[0];
    if (!user) return res.status(400).json({ error: 'البريد غير موجود' });
    if (user.is_banned) return res.status(403).json({ error: 'تم حظر حسابك من قبل الإدارة' });
    var ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'كلمة المرور خاطئة' });
    await db.query('UPDATE users SET is_online=true, last_seen=NOW() WHERE id=$1', [user.id]);
    delete user.password;
    var token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token: token, user: user });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ في الخادم' }); }
});

app.get('/api/me', auth, async function(req, res) {
  var result = await db.query('SELECT id,name,username,email,bio,photo_url,is_online,last_seen,show_last_seen,show_online,created_at FROM users WHERE id=$1', [req.user.id]);
  res.json(result.rows[0]);
});

app.put('/api/me', auth, async function(req, res) {
  try {
    var name = req.body.name;
    var username = req.body.username;
    var bio = req.body.bio;
    var show_last_seen = req.body.show_last_seen;
    var show_online = req.body.show_online;
    if (username) {
      var exists = await db.query('SELECT id FROM users WHERE username=$1 AND id!=$2', [username.toLowerCase(), req.user.id]);
      if (exists.rows.length) return res.status(400).json({ error: 'اسم المستخدم مستخدم' });
    }
    await db.query('UPDATE users SET name=COALESCE($1,name), username=COALESCE($2,username), bio=COALESCE($3,bio), show_last_seen=COALESCE($4,show_last_seen), show_online=COALESCE($5,show_online) WHERE id=$6', [name, username ? username.toLowerCase() : null, bio, show_last_seen, show_online, req.user.id]);
    var result = await db.query('SELECT id,name,username,email,bio,photo_url,is_online,last_seen,show_last_seen,show_online FROM users WHERE id=$1', [req.user.id]);
    res.json(result.rows[0]);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/me/avatar', auth, upload.single('avatar'), async function(req, res) {
  try {
    var b64 = req.file.buffer.toString('base64');
    var dataURI = 'data:' + req.file.mimetype + ';base64,' + b64;
    var result = await cloudinary.uploader.upload(dataURI, { folder: 'lumiq/avatars', transformation: [{ width: 300, height: 300, crop: 'fill' }] });
    await db.query('UPDATE users SET photo_url=$1 WHERE id=$2', [result.secure_url, req.user.id]);
    res.json({ photo_url: result.secure_url });
  } catch(e) { res.status(500).json({ error: 'فشل رفع الصورة' }); }
});

app.get('/api/users/search', auth, async function(req, res) {
  var q = req.query.q ? req.query.q.toLowerCase() : '';
  if (!q || q.length < 2) return res.json([]);
  var result = await db.query('SELECT id,name,username,bio,photo_url,is_online,last_seen,show_last_seen,show_online,show_join_date,created_at FROM users WHERE username LIKE $1 AND id!=$2 LIMIT 20', [q + '%', req.user.id]);
  res.json(result.rows);
});

app.get('/api/users/:id', auth, async function(req, res) {
  var result = await db.query('SELECT id,name,username,bio,photo_url,is_online,last_seen,show_last_seen,show_online,show_join_date,created_at FROM users WHERE id=$1', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'غير موجود' });
  res.json(result.rows[0]);
});

app.delete('/api/me', auth, async function(req, res) {
  await db.query('DELETE FROM users WHERE id=$1', [req.user.id]);
  res.json({ ok: true });
});

app.post('/api/chats', auth, async function(req, res) {
  try {
    var other = req.body.other_user_id;
    var ids = [String(req.user.id), String(other)].sort();
    var cid = ids.join('_');
    var exists = await db.query('SELECT * FROM chats WHERE id=$1', [cid]);
    if (exists.rows.length) return res.json(exists.rows[0]);
    var uc = {};
    uc[req.user.id] = 0;
    uc[other] = 0;
    var result = await db.query('INSERT INTO chats (id, participants, unread_count) VALUES ($1,$2,$3) RETURNING *', [cid, ids, JSON.stringify(uc)]);
    res.json(result.rows[0]);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/chats', auth, async function(req, res) {
  var result = await db.query('SELECT * FROM chats WHERE $1=ANY(participants) ORDER BY last_message_at DESC', [String(req.user.id)]);
  res.json(result.rows);
});

app.get('/api/chats/:chatId/messages', auth, async function(req, res) {
  var result = await db.query('SELECT * FROM messages WHERE chat_id=$1 ORDER BY created_at ASC', [req.params.chatId]);
  res.json(result.rows);
});

app.post('/api/chats/:chatId/messages', auth, async function(req, res) {
  try {
    var chatId = req.params.chatId;
    var text = req.body.text;
    var reply_to = req.body.reply_to;
    var result = await db.query('INSERT INTO messages (chat_id, sender_id, type, text, reply_to) VALUES ($1,$2,$3,$4,$5) RETURNING *', [chatId, req.user.id, 'text', text, reply_to ? JSON.stringify(reply_to) : null]);
    var msg = result.rows[0];
    await db.query('UPDATE chats SET last_message=$1, last_message_at=NOW() WHERE id=$2', [text, chatId]);
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/chats/:chatId/messages/image', auth, upload.single('image'), async function(req, res) {
  try {
    var chatId = req.params.chatId;
    var b64 = req.file.buffer.toString('base64');
    var dataURI = 'data:' + req.file.mimetype + ';base64,' + b64;
    var up = await cloudinary.uploader.upload(dataURI, { folder: 'lumiq/images' });
    var result = await db.query('INSERT INTO messages (chat_id, sender_id, type, image_url, text) VALUES ($1,$2,$3,$4,$5) RETURNING *', [chatId, req.user.id, 'image', up.secure_url, 'صورة']);
    var msg = result.rows[0];
    await db.query('UPDATE chats SET last_message=$1, last_message_at=NOW() WHERE id=$2', ['صورة', chatId]);
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/chats/:chatId/messages/audio', auth, upload.single('audio'), async function(req, res) {
  try {
    var chatId = req.params.chatId;
    var duration = parseInt(req.body.duration) || 0;
    var b64 = req.file.buffer.toString('base64');
    var dataURI = 'data:' + req.file.mimetype + ';base64,' + b64;
    var up = await cloudinary.uploader.upload(dataURI, { folder: 'lumiq/audio', resource_type: 'video' });
    var result = await db.query('INSERT INTO messages (chat_id, sender_id, type, audio_url, duration, text) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [chatId, req.user.id, 'voice', up.secure_url, duration, 'رسالة صوتية']);
    var msg = result.rows[0];
    await db.query('UPDATE chats SET last_message=$1, last_message_at=NOW() WHERE id=$2', ['رسالة صوتية', chatId]);
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.put('/api/messages/:msgId', auth, async function(req, res) {
  try {
    var text = req.body.text;
    if (!text) return res.status(400).json({ error: 'النص مطلوب' });
    var result = await db.query('SELECT sender_id FROM messages WHERE id=$1', [req.params.msgId]);
    if (!result.rows.length) return res.status(404).json({ error: 'غير موجود' });
    if (String(result.rows[0].sender_id) !== String(req.user.id)) return res.status(403).json({ error: 'غير مسموح' });
    var updated = await db.query('UPDATE messages SET text=$1 WHERE id=$2 RETURNING *', [text, req.params.msgId]);
    io.emit('edit_message', { id: req.params.msgId, text: text });
    res.json(updated.rows[0]);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.delete('/api/messages/:msgId', auth, async function(req, res) {
  await db.query('DELETE FROM messages WHERE id=$1 AND sender_id=$2', [req.params.msgId, req.user.id]);
  io.emit('delete_message', { id: req.params.msgId });
  res.json({ ok: true });
});

app.post('/api/messages/:msgId/react', auth, async function(req, res) {
  try {
    var emoji = req.body.emoji;
    var result = await db.query('SELECT reactions FROM messages WHERE id=$1', [req.params.msgId]);
    if (!result.rows.length) return res.status(404).json({ error: 'غير موجود' });
    var reactions = result.rows[0].reactions || {};
    reactions[req.user.id] = emoji;
    await db.query('UPDATE messages SET reactions=$1 WHERE id=$2', [JSON.stringify(reactions), req.params.msgId]);
    io.emit('reaction', { msg_id: req.params.msgId, reactions: reactions });
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

app.post('/api/stories', auth, async function(req, res) {
  try {
    var text = req.body.text;
    var bg_color = req.body.bg_color || 'sg1';
    var result = await db.query('INSERT INTO stories (user_id, type, text, bg_color) VALUES ($1,$2,$3,$4) RETURNING *', [req.user.id, 'text', text, bg_color]);
    io.emit('new_story', result.rows[0]);
    res.json(result.rows[0]);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/stories/image', auth, upload.single('image'), async function(req, res) {
  try {
    var b64 = req.file.buffer.toString('base64');
    var dataURI = 'data:' + req.file.mimetype + ';base64,' + b64;
    var up = await cloudinary.uploader.upload(dataURI, { folder: 'lumiq/stories' });
    var result = await db.query('INSERT INTO stories (user_id, type, image_url) VALUES ($1,$2,$3) RETURNING *', [req.user.id, 'image', up.secure_url]);
    io.emit('new_story', result.rows[0]);
    res.json(result.rows[0]);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/stories', auth, async function(req, res) {
  try {
    var result = await db.query('SELECT s.*, u.name, u.username, u.photo_url FROM stories s JOIN users u ON s.user_id = u.id WHERE s.expires_at > NOW() ORDER BY s.created_at DESC');
    res.json(result.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/stories/:id/view', auth, async function(req, res) {
  try {
    var story = await db.query('SELECT views FROM stories WHERE id=$1', [req.params.id]);
    if (!story.rows.length) return res.status(404).json({ error: 'غير موجود' });
    var views = story.rows[0].views || [];
    if (!views.includes(req.user.id)) {
      views.push(req.user.id);
      await db.query('UPDATE stories SET views=$1 WHERE id=$2', [JSON.stringify(views), req.params.id]);
    }
    res.json({ views: views });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.delete('/api/stories/:id', auth, async function(req, res) {
  await db.query('DELETE FROM stories WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  io.emit('delete_story', { id: req.params.id });
  res.json({ ok: true });
});


// ══ ADMIN ROUTES ══
var ADMIN_KEY = process.env.ADMIN_KEY || 'lumiq_admin_2024';

function adminAuth(req, res, next) {
  var key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'غير مصرح' });
  next();
}

// إحصائيات عامة
app.get('/api/admin/stats', adminAuth, async function(req, res) {
  try {
    var users = await db.query('SELECT COUNT(*) as count FROM users');
    var messages = await db.query('SELECT COUNT(*) as count FROM messages');
    var images = await db.query("SELECT COUNT(*) as count FROM messages WHERE type='image'");
    var voice = await db.query("SELECT COUNT(*) as count FROM messages WHERE type='voice'");
    var chats = await db.query('SELECT COUNT(*) as count FROM chats');
    var online = await db.query('SELECT COUNT(*) as count FROM users WHERE is_online=true');
    var today = await db.query("SELECT COUNT(*) as count FROM users WHERE created_at > NOW() - INTERVAL '24 hours'");
    var msgs_today = await db.query("SELECT COUNT(*) as count FROM messages WHERE created_at > NOW() - INTERVAL '24 hours'");
    res.json({
      users: parseInt(users.rows[0].count),
      messages: parseInt(messages.rows[0].count),
      images: parseInt(images.rows[0].count),
      voice: parseInt(voice.rows[0].count),
      chats: parseInt(chats.rows[0].count),
      online: parseInt(online.rows[0].count),
      new_users_today: parseInt(today.rows[0].count),
      messages_today: parseInt(msgs_today.rows[0].count)
    });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// قائمة المستخدمين
app.get('/api/admin/users', adminAuth, async function(req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = 20;
    var offset = (page - 1) * limit;
    var search = req.query.search ? '%' + req.query.search.toLowerCase() + '%' : '%';
    var result = await db.query(
      'SELECT id, name, username, email, is_online, is_banned, last_seen, created_at, photo_url FROM users WHERE username LIKE $1 OR name ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [search, limit, offset]
    );
    var total = await db.query('SELECT COUNT(*) as count FROM users WHERE username LIKE $1 OR name ILIKE $1', [search]);
    res.json({ users: result.rows, total: parseInt(total.rows[0].count), page: page });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// حذف مستخدم
app.delete('/api/admin/users/:id', adminAuth, async function(req, res) {
  try {
    await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// حظر/رفع حظر مستخدم
app.post('/api/admin/users/:id/ban', adminAuth, async function(req, res) {
  try {
    var banned = req.body.banned;
    await db.query('UPDATE users SET is_banned=$1 WHERE id=$2', [banned, req.params.id]);
    if (banned) {
      var toSocket = onlineUsers[req.params.id];
      if (toSocket) io.to(toSocket).emit('force_logout', { reason: 'تم حظر حسابك' });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// عرض الصور المرسلة
app.get('/api/admin/images', adminAuth, async function(req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = 20;
    var offset = (page - 1) * limit;
    var result = await db.query(
      'SELECT m.id, m.image_url, m.created_at, m.chat_id, u.name as sender_name, u.username FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.type=$1 ORDER BY m.created_at DESC LIMIT $2 OFFSET $3',
      ['image', limit, offset]
    );
    var total = await db.query("SELECT COUNT(*) as count FROM messages WHERE type='image'");
    res.json({ images: result.rows, total: parseInt(total.rows[0].count), page: page });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// عرض الرسائل
app.get('/api/admin/messages', adminAuth, async function(req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = 30;
    var offset = (page - 1) * limit;
    var result = await db.query(
      'SELECT m.id, m.text, m.type, m.created_at, m.chat_id, u.name as sender_name, u.username FROM messages m JOIN users u ON m.sender_id = u.id ORDER BY m.created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    var total = await db.query('SELECT COUNT(*) as count FROM messages');
    res.json({ messages: result.rows, total: parseInt(total.rows[0].count), page: page });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// حذف رسالة (admin)
app.delete('/api/admin/messages/:id', adminAuth, async function(req, res) {
  try {
    await db.query('DELETE FROM messages WHERE id=$1', [req.params.id]);
    io.emit('delete_message', { id: req.params.id });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// إرسال إشعار لجميع المستخدمين
app.post('/api/admin/broadcast', adminAuth, async function(req, res) {
  try {
    var message = req.body.message;
    var title = req.body.title || 'LUMIQ';
    if (!message) return res.status(400).json({ error: 'الرسالة مطلوبة' });
    io.emit('broadcast', { title: title, message: message, time: new Date() });
    res.json({ ok: true, sent: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

var onlineUsers = {};

io.on('connection', function(socket) {
  socket.on('join', async function(data) {
    try {
      var user = jwt.verify(data.token, JWT_SECRET);
      socket.userId = user.id;
      onlineUsers[user.id] = socket.id;
      await db.query('UPDATE users SET is_online=true, last_seen=NOW() WHERE id=$1', [user.id]);
      io.emit('user_online', { user_id: user.id, is_online: true });
      var chats = await db.query('SELECT id FROM chats WHERE $1=ANY(participants)', [String(user.id)]);
      chats.rows.forEach(function(c) { socket.join(c.id); });
      // Check if banned
      var banCheck = await db.query('SELECT is_banned FROM users WHERE id=$1', [user.id]);
      if (banCheck.rows.length && banCheck.rows[0].is_banned) {
        socket.emit('force_logout', { reason: 'تم حظر حسابك' });
        socket.disconnect();
      }
    } catch(e) { console.error('join error:', e.message); }
  });

  socket.on('join_chat', function(data) { socket.join(data.chat_id); });

  socket.on('typing', function(data) {
    socket.to(data.chat_id).emit('typing', { user_id: data.user_id, is_typing: data.is_typing });
  });

  socket.on('call_request', function(data) {
    var toSocket = onlineUsers[data.to_user_id];
    if (toSocket) io.to(toSocket).emit('call_incoming', { from_user: data.from_user, chat_id: data.chat_id, socket_id: socket.id });
    else socket.emit('call_failed', { reason: 'المستخدم غير متصل' });
  });

  socket.on('call_accept', function(data) {
    io.to(data.to_socket_id).emit('call_accepted', { from_user: data.from_user, socket_id: socket.id });
  });

  socket.on('call_reject', function(data) { io.to(data.to_socket_id).emit('call_rejected'); });

  socket.on('call_end', function(data) {
    if (data.to_socket_id) io.to(data.to_socket_id).emit('call_ended');
  });

  socket.on('webrtc_offer', function(data) {
    io.to(data.to_socket_id).emit('webrtc_offer', { offer: data.offer, from_socket_id: socket.id });
  });

  socket.on('webrtc_answer', function(data) {
    io.to(data.to_socket_id).emit('webrtc_answer', { answer: data.answer });
  });

  socket.on('webrtc_ice', function(data) {
    io.to(data.to_socket_id).emit('webrtc_ice', { candidate: data.candidate });
  });

  socket.on('msg_edit', function(data) {
    io.emit('edit_message', { id: data.id, text: data.text });
  });

  socket.on('disconnect', async function() {
    if (socket.userId) {
      delete onlineUsers[socket.userId];
      await db.query('UPDATE users SET is_online=false, last_seen=NOW() WHERE id=$1', [socket.userId]);
      io.emit('user_online', { user_id: socket.userId, is_online: false, last_seen: new Date() });
    }
  });
});

initDB().then(function() {
  server.listen(PORT, function() { console.log('LUMIQ Server running on port ' + PORT); });
}).catch(function(e) {
  console.error('DB Error:', e);
  process.exit(1);
});
