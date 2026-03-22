const express = require('express');
const path = require('path');
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
    is_verified BOOLEAN DEFAULT false,
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
    chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
    sender_id INT REFERENCES users(id) ON DELETE CASCADE,
    type TEXT DEFAULT 'text',
    text TEXT,
    audio_url TEXT,
    image_url TEXT,
    duration INT,
    seen BOOLEAN DEFAULT false,
    reactions JSONB DEFAULT '{}',
    reply_to JSONB,
    forwarded BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  // أعمدة جديدة إن لم تكن موجودة
  var alters = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_join_date BOOLEAN DEFAULT true",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded BOOLEAN DEFAULT false"
  ];
  for (var i = 0; i < alters.length; i++) {
    await db.query(alters[i]).catch(function(){});
  }
  await db.query(`CREATE TABLE IF NOT EXISTS blocks (
    id SERIAL PRIMARY KEY,
    blocker_id INT REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INT REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS friendships (
    id SERIAL PRIMARY KEY,
    requester_id INT REFERENCES users(id) ON DELETE CASCADE,
    addressee_id INT REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(requester_id, addressee_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS notification_reads (
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    notification_id INT REFERENCES notifications(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id, notification_id)
  )`);
  console.log('✅ DB ready');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','x-admin-key'] }));
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));

// ═══ STATIC FILES ═══
// خدمة sw.js مع الـ headers المطلوبة
app.get('/sw.js', function(req, res) {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

// خدمة manifest.json
app.get('/manifest.json', function(req, res) {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

// خدمة icon-192.png و icon-512.png
app.get('/icon-:size.png', function(req, res) {
  var file = path.join(__dirname, 'icon-' + req.params.size + '.png');
  res.sendFile(file, function(err) {
    if (err) res.status(404).end();
  });
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ═══ HELPERS ═══
app.get('/api/ping', function(req, res) { res.json({ ok: true }); });

function auth(req, res, next) {
  var token = req.headers.authorization && req.headers.authorization.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch(e) { res.status(401).json({ error: 'Invalid token' }); }
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
  if (!r.rows.length) return res.status(404).json({ error: 'غير موجود' });
  res.json(r.rows[0]);
});

app.put('/api/me', auth, async function(req, res) {
  try {
    var name = req.body.name, username = req.body.username, bio = req.body.bio;
    var show_last_seen = req.body.show_last_seen, show_online = req.body.show_online, show_join_date = req.body.show_join_date;
    if (username) {
      username = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (username.length < 3) return res.status(400).json({ error: 'اسم المستخدم قصير جداً' });
      var ex = await db.query('SELECT id FROM users WHERE username=$1 AND id!=$2', [username, req.user.id]);
      if (ex.rows.length) return res.status(400).json({ error: 'اسم المستخدم مستخدم' });
    }
    await db.query(
      'UPDATE users SET name=COALESCE($1,name), username=COALESCE($2,username), bio=COALESCE($3,bio), show_last_seen=COALESCE($4,show_last_seen), show_online=COALESCE($5,show_online), show_join_date=COALESCE($6,show_join_date) WHERE id=$7',
      [name || null, username || null, bio !== undefined ? bio : null, show_last_seen !== undefined ? show_last_seen : null, show_online !== undefined ? show_online : null, show_join_date !== undefined ? show_join_date : null, req.user.id]
    );
    var r = await db.query('SELECT id,name,username,email,bio,photo_url,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,created_at FROM users WHERE id=$1', [req.user.id]);
    res.json(r.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/me/avatar', auth, upload.single('avatar'), async function(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
    var b64 = req.file.buffer.toString('base64');
    var up = await cloudinary.uploader.upload('data:' + req.file.mimetype + ';base64,' + b64, {
      folder: 'lumiq/avatars',
      transformation: [{ width: 300, height: 300, crop: 'fill' }]
    });
    await db.query('UPDATE users SET photo_url=$1 WHERE id=$2', [up.secure_url, req.user.id]);
    res.json({ photo_url: up.secure_url });
  } catch(e) { console.error(e); res.status(500).json({ error: 'فشل رفع الصورة' }); }
});

// ✅ إصلاح: البحث بالاسم واسم المستخدم معاً
app.get('/api/users/search', auth, async function(req, res) {
  try {
    var q = req.query.q ? req.query.q.toLowerCase().trim() : '';
    if (!q || q.length < 2) return res.json([]);
    var r = await db.query(
      'SELECT id,name,username,bio,photo_url,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,created_at FROM users WHERE (username ILIKE $1 OR name ILIKE $1) AND id!=$2 AND is_banned=false LIMIT 20',
      ['%' + q + '%', req.user.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/users/:id', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT id,name,username,bio,photo_url,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,created_at FROM users WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'غير موجود' });
    var user = Object.assign({}, r.rows[0]);
    // إذا هو حظرني → أخفِ صورته وحالته عني
    var theyBlockedMe = await db.query('SELECT id FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.params.id, req.user.id]);
    if (theyBlockedMe.rows.length) {
      user.photo_url = '';
      user.is_online = false;
      user.last_seen = null;
      user.show_online = false;
      user.show_last_seen = false;
    }
    res.json(user);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

// ✅ إصلاح: حذف المستخدم يحذف كل بياناته
app.delete('/api/me', auth, async function(req, res) {
  try {
    var uid = req.user.id;
    // حذف الرسائل والمحادثات أولاً بسبب FK
    await db.query('DELETE FROM messages WHERE sender_id=$1', [uid]);
    await db.query("DELETE FROM chats WHERE $1=ANY(participants)", [String(uid)]);
    await db.query('DELETE FROM users WHERE id=$1', [uid]);
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

// ═══ BLOCK ═══
app.post('/api/block', auth, async function(req, res) {
  try {
    var targetId = parseInt(req.body.user_id);
    if (!targetId || targetId === req.user.id) return res.status(400).json({ error: 'غير صالح' });
    await db.query('INSERT INTO blocks (blocker_id,blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, targetId]);
    // إشعار المحظور
    if (onlineUsers[String(targetId)]) {
      io.to(onlineUsers[String(targetId)]).emit('you_are_blocked', { by_user_id: req.user.id });
    }
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/unblock', auth, async function(req, res) {
  try {
    var targetId = parseInt(req.body.user_id);
    await db.query('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user.id, targetId]);
    if (onlineUsers[String(targetId)]) {
      io.to(onlineUsers[String(targetId)]).emit('you_are_unblocked', { by_user_id: req.user.id });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// التحقق من حالة الحظر بين مستخدمين
app.get('/api/block/status/:userId', auth, async function(req, res) {
  try {
    var targetId = parseInt(req.params.userId);
    var iBlocked = await db.query('SELECT id FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user.id, targetId]);
    var theyBlocked = await db.query('SELECT id FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [targetId, req.user.id]);
    res.json({ i_blocked: iBlocked.rows.length > 0, they_blocked: theyBlocked.rows.length > 0 });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ═══ FRIENDS ═══

// إرسال طلب صداقة
app.post('/api/friends/request', auth, async function(req, res) {
  try {
    var targetId = parseInt(req.body.user_id);
    if (!targetId || targetId === req.user.id) return res.status(400).json({ error: 'غير صالح' });
    // تحقق من الحظر
    var blocked = await db.query('SELECT id FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [req.user.id, targetId]);
    if (blocked.rows.length) return res.status(403).json({ error: 'لا يمكن إرسال طلب' });
    // تحقق إذا موجود مسبقاً
    var exists = await db.query('SELECT * FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)', [req.user.id, targetId]);
    if (exists.rows.length) return res.status(400).json({ error: 'طلب موجود مسبقاً', status: exists.rows[0].status });
    await db.query('INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1,$2,$3)', [req.user.id, targetId, 'pending']);
    // إشعار الطرف الآخر
    var sender = await db.query('SELECT id,name,username,photo_url,is_verified FROM users WHERE id=$1', [req.user.id]);
    if (onlineUsers[String(targetId)]) {
      io.to(onlineUsers[String(targetId)]).emit('friend_request', { from: sender.rows[0] });
    }
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

// قبول طلب صداقة
app.post('/api/friends/accept', auth, async function(req, res) {
  try {
    var requesterId = parseInt(req.body.user_id);
    var r = await db.query('UPDATE friendships SET status=$1 WHERE requester_id=$2 AND addressee_id=$3 AND status=$4 RETURNING *', ['accepted', requesterId, req.user.id, 'pending']);
    if (!r.rows.length) return res.status(404).json({ error: 'الطلب غير موجود' });
    // إشعار المرسل
    var accepter = await db.query('SELECT id,name,username,photo_url,is_verified FROM users WHERE id=$1', [req.user.id]);
    if (onlineUsers[String(requesterId)]) {
      io.to(onlineUsers[String(requesterId)]).emit('friend_accepted', { by: accepter.rows[0] });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// رفض/إلغاء طلب صداقة
app.post('/api/friends/reject', auth, async function(req, res) {
  try {
    var otherId = parseInt(req.body.user_id);
    await db.query('DELETE FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)', [req.user.id, otherId]);
    if (onlineUsers[String(otherId)]) {
      io.to(onlineUsers[String(otherId)]).emit('friend_rejected', { by_user_id: req.user.id });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// جلب قائمة الأصدقاء
app.get('/api/friends', auth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT u.id,u.name,u.username,u.photo_url,u.is_online,u.is_verified,u.last_seen,u.show_online,u.show_last_seen, f.status, f.requester_id FROM friendships f JOIN users u ON (CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END)=u.id WHERE (f.requester_id=$1 OR f.addressee_id=$1) ORDER BY f.created_at DESC',
      [req.user.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// جلب طلبات الصداقة الواردة
app.get('/api/friends/requests', auth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT u.id,u.name,u.username,u.photo_url,u.is_verified,f.created_at FROM friendships f JOIN users u ON f.requester_id=u.id WHERE f.addressee_id=$1 AND f.status=$2 ORDER BY f.created_at DESC',
      [req.user.id, 'pending']
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// حالة الصداقة مع مستخدم
app.get('/api/friends/status/:userId', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT * FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)', [req.user.id, req.params.userId]);
    if (!r.rows.length) return res.json({ status: 'none' });
    var f = r.rows[0];
    res.json({ status: f.status, i_requested: String(f.requester_id) === String(req.user.id) });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ═══ CHATS ═══
app.post('/api/chats', auth, async function(req, res) {
  try {
    var other = String(req.body.other_user_id);
    var ids = [String(req.user.id), other].sort();
    var cid = ids.join('_');
    var ex = await db.query('SELECT * FROM chats WHERE id=$1', [cid]);
    if (ex.rows.length) return res.json(ex.rows[0]);
    var uc = {}; uc[req.user.id] = 0; uc[other] = 0;
    var r = await db.query('INSERT INTO chats (id,participants,unread_count) VALUES ($1,$2,$3) RETURNING *', [cid, ids, JSON.stringify(uc)]);
    res.json(r.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/chats', auth, async function(req, res) {
  try {
    var r = await db.query("SELECT * FROM chats WHERE $1=ANY(participants) ORDER BY last_message_at DESC", [String(req.user.id)]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ═══ MESSAGES ═══

// ✅ حذف المحادثة نهائياً للطرفين
app.delete('/api/chats/:chatId/delete', auth, async function(req, res) {
  try {
    var chatId = req.params.chatId;
    // التحقق أن المستخدم عضو في المحادثة
    var chat = await db.query('SELECT participants FROM chats WHERE id=$1', [chatId]);
    if (!chat.rows.length) return res.status(404).json({ error: 'المحادثة غير موجودة' });
    var participants = chat.rows[0].participants || [];
    if (!participants.includes(String(req.user.id))) return res.status(403).json({ error: 'غير مسموح' });
    // حذف الرسائل أولاً ثم المحادثة
    await db.query('DELETE FROM messages WHERE chat_id=$1', [chatId]);
    await db.query('DELETE FROM chats WHERE id=$1', [chatId]);
    // إشعار الطرف الآخر بحذف المحادثة
    io.to(chatId).emit('chat_deleted', { chat_id: chatId });
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/chats/:chatId/messages', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT * FROM messages WHERE chat_id=$1 ORDER BY created_at ASC LIMIT 200', [req.params.chatId]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/chats/:chatId/messages', auth, async function(req, res) {
  try {
    var chatId = req.params.chatId, text = req.body.text, reply_to = req.body.reply_to;
    if (!text || !text.trim()) return res.status(400).json({ error: 'الرسالة فارغة' });
    // التحقق من الحظر
    var chat = await db.query('SELECT participants FROM chats WHERE id=$1', [chatId]);
    if (chat.rows.length) {
      var otherPid = chat.rows[0].participants.find(function(p) { return String(p) !== String(req.user.id); });
      if (otherPid) {
        var blockCheck = await db.query('SELECT id FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [req.user.id, otherPid]);
        if (blockCheck.rows.length) return res.status(403).json({ error: 'blocked' });
      }
    }

    var forwarded = req.body.forwarded === true;
    var r = await db.query(
      'INSERT INTO messages (chat_id,sender_id,type,text,reply_to,forwarded) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [chatId, req.user.id, 'text', text ? text.trim() : null, reply_to ? JSON.stringify(reply_to) : null, forwarded]
    );
    var msg = r.rows[0];

    // ✅ إصلاح: تحديث unread_count للطرف الآخر
    var chat = await db.query('SELECT participants,unread_count FROM chats WHERE id=$1', [chatId]);
    if (chat.rows.length) {
      var uc = chat.rows[0].unread_count || {};
      var participants = chat.rows[0].participants || [];
      participants.forEach(function(pid) {
        if (String(pid) !== String(req.user.id)) {
          uc[pid] = (parseInt(uc[pid]) || 0) + 1;
        }
      });
      await db.query('UPDATE chats SET last_message=$1, last_message_at=NOW(), unread_count=$2 WHERE id=$3',
        [text.trim(), JSON.stringify(uc), chatId]);
    }

    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/chats/:chatId/messages/image', auth, upload.single('image'), async function(req, res) {
  try {
    var chatId = req.params.chatId;
    if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
    var chatCheck = await db.query('SELECT participants FROM chats WHERE id=$1', [chatId]);
    if (chatCheck.rows.length) {
      var otherPid2 = chatCheck.rows[0].participants.find(function(p) { return String(p) !== String(req.user.id); });
      if (otherPid2) {
        var bc2 = await db.query('SELECT id FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [req.user.id, otherPid2]);
        if (bc2.rows.length) return res.status(403).json({ error: 'blocked' });
      }
    }

    var b64 = req.file.buffer.toString('base64');
    var up = await cloudinary.uploader.upload('data:' + req.file.mimetype + ';base64,' + b64, {
      folder: 'lumiq/images',
      transformation: [{ quality: 'auto', fetch_format: 'auto' }]
    });

    var r = await db.query(
      'INSERT INTO messages (chat_id,sender_id,type,image_url,text) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [chatId, req.user.id, 'image', up.secure_url, 'صورة']
    );
    var msg = r.rows[0];

    // ✅ إصلاح: تحديث unread_count
    var chat = await db.query('SELECT participants,unread_count FROM chats WHERE id=$1', [chatId]);
    if (chat.rows.length) {
      var uc = chat.rows[0].unread_count || {};
      var participants = chat.rows[0].participants || [];
      participants.forEach(function(pid) {
        if (String(pid) !== String(req.user.id)) {
          uc[pid] = (parseInt(uc[pid]) || 0) + 1;
        }
      });
      await db.query('UPDATE chats SET last_message=$1, last_message_at=NOW(), unread_count=$2 WHERE id=$3',
        ['صورة 🖼️', JSON.stringify(uc), chatId]);
    }

    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/chats/:chatId/messages/audio', auth, upload.single('audio'), async function(req, res) {
  try {
    var chatId = req.params.chatId;
    var duration = parseInt(req.body.duration) || 0;
    if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
    var chatCheck3 = await db.query('SELECT participants FROM chats WHERE id=$1', [chatId]);
    if (chatCheck3.rows.length) {
      var otherPid3 = chatCheck3.rows[0].participants.find(function(p) { return String(p) !== String(req.user.id); });
      if (otherPid3) {
        var bc3 = await db.query('SELECT id FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [req.user.id, otherPid3]);
        if (bc3.rows.length) return res.status(403).json({ error: 'blocked' });
      }
    }

    var b64 = req.file.buffer.toString('base64');
    var up = await cloudinary.uploader.upload('data:' + req.file.mimetype + ';base64,' + b64, {
      folder: 'lumiq/audio',
      resource_type: 'video'
    });

    var r = await db.query(
      'INSERT INTO messages (chat_id,sender_id,type,audio_url,duration,text) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [chatId, req.user.id, 'voice', up.secure_url, duration, 'رسالة صوتية']
    );
    var msg = r.rows[0];

    // ✅ إصلاح: تحديث unread_count
    var chat = await db.query('SELECT participants,unread_count FROM chats WHERE id=$1', [chatId]);
    if (chat.rows.length) {
      var uc = chat.rows[0].unread_count || {};
      var participants = chat.rows[0].participants || [];
      participants.forEach(function(pid) {
        if (String(pid) !== String(req.user.id)) {
          uc[pid] = (parseInt(uc[pid]) || 0) + 1;
        }
      });
      await db.query('UPDATE chats SET last_message=$1, last_message_at=NOW(), unread_count=$2 WHERE id=$3',
        ['🎤 رسالة صوتية', JSON.stringify(uc), chatId]);
    }

    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.put('/api/messages/:id', auth, async function(req, res) {
  try {
    var text = req.body.text;
    if (!text || !text.trim()) return res.status(400).json({ error: 'النص فارغ' });
    var check = await db.query('SELECT sender_id, chat_id FROM messages WHERE id=$1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'غير موجود' });
    if (String(check.rows[0].sender_id) !== String(req.user.id)) return res.status(403).json({ error: 'غير مسموح' });
    await db.query('UPDATE messages SET text=$1 WHERE id=$2', [text.trim(), req.params.id]);
    io.to(check.rows[0].chat_id).emit('edit_message', { id: parseInt(req.params.id), text: text.trim() });
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.delete('/api/messages/:id', auth, async function(req, res) {
  try {
    var check = await db.query('SELECT sender_id, chat_id FROM messages WHERE id=$1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'غير موجود' });
    if (String(check.rows[0].sender_id) !== String(req.user.id)) return res.status(403).json({ error: 'غير مسموح' });
    await db.query('DELETE FROM messages WHERE id=$1', [req.params.id]);
    io.to(check.rows[0].chat_id).emit('delete_message', { id: parseInt(req.params.id) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/messages/:id/react', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT reactions, chat_id FROM messages WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'غير موجود' });
    var reactions = r.rows[0].reactions || {};
    var chatId = r.rows[0].chat_id;
    // toggle: إذا نفس الإيموجي احذفه
    if (reactions[req.user.id] === req.body.emoji) {
      delete reactions[req.user.id];
    } else {
      reactions[req.user.id] = req.body.emoji;
    }
    await db.query('UPDATE messages SET reactions=$1 WHERE id=$2', [JSON.stringify(reactions), req.params.id]);
    io.to(chatId).emit('reaction', { msg_id: parseInt(req.params.id), reactions: reactions });
    res.json({ reactions: reactions });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ✅ إصلاح: تصفير unread_count بشكل صحيح
app.post('/api/chats/:chatId/read', auth, async function(req, res) {
  try {
    await db.query('UPDATE messages SET seen=true WHERE chat_id=$1 AND sender_id!=$2 AND seen=false', [req.params.chatId, req.user.id]);
    var chat = await db.query('SELECT unread_count FROM chats WHERE id=$1', [req.params.chatId]);
    if (chat.rows.length) {
      var uc = chat.rows[0].unread_count || {};
      uc[String(req.user.id)] = 0;
      await db.query('UPDATE chats SET unread_count=$1 WHERE id=$2', [JSON.stringify(uc), req.params.chatId]);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ═══ ADMIN ═══
const ADMIN_KEY = process.env.ADMIN_KEY || 'lumiq_admin_2024';

function adminAuth(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'غير مصرح' });
  next();
}

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>LUMIQ Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0f172a;--card:#1e293b;--card2:#334155;--blue:#3b82f6;--green:#22c55e;--red:#ef4444;--yellow:#f59e0b;--text:#f1f5f9;--sub:#94a3b8;--border:#334155;--r:12px}
body{font-family:Tahoma,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:var(--card2);border-radius:3px}
input,textarea,button,select{font-family:inherit}
.login{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.lbox{background:var(--card);border-radius:20px;padding:36px;width:100%;max-width:360px;border:1px solid var(--border)}
.llogo{text-align:center;margin-bottom:24px}
.llogo h1{font-size:26px;font-weight:900;color:var(--blue)}
.llogo p{font-size:13px;color:var(--sub);margin-top:3px}
.fi{width:100%;padding:11px 13px;background:var(--bg);border:1.5px solid var(--border);border-radius:10px;font-size:14px;color:var(--text);margin-bottom:10px}
.fi:focus{border-color:var(--blue);outline:none}
.fi::placeholder{color:var(--sub)}
.btn{padding:11px 18px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:none;transition:opacity .2s}
.btn:hover{opacity:.85}.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-blue{background:var(--blue);color:#fff;width:100%}
.btn-red{background:var(--red);color:#fff}
.btn-green{background:var(--green);color:#fff}
.btn-yellow{background:var(--yellow);color:#000}
.btn-gray{background:var(--card2);color:var(--text)}
.btn-sm{padding:5px 12px;font-size:12px;border-radius:7px}
.err{color:var(--red);font-size:13px;margin-bottom:8px;background:rgba(239,68,68,.1);padding:9px 12px;border-radius:8px;display:none}
.err.on{display:block}
.layout{display:flex;min-height:100vh}
.sidebar{width:220px;background:var(--card);border-left:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;right:0;bottom:0}
.slogo{padding:18px 14px 12px;border-bottom:1px solid var(--border)}
.slogo h2{font-size:17px;font-weight:800;color:var(--blue)}
.nav{display:flex;flex-direction:column;padding:6px 0;flex:1}
.ni{display:flex;align-items:center;gap:9px;padding:10px 14px;cursor:pointer;color:var(--sub);font-size:13px;font-weight:500;border-right:3px solid transparent;transition:all .2s}
.ni:hover{background:rgba(255,255,255,.04);color:var(--text)}
.ni.on{color:var(--blue);background:rgba(59,130,246,.08);border-right-color:var(--blue)}
.ni svg{width:16px;height:16px;flex-shrink:0}
.sfooter{padding:12px 14px;border-top:1px solid var(--border)}
.content{margin-right:220px;flex:1;padding:20px}
.ph{margin-bottom:18px}.ph h1{font-size:20px;font-weight:800}.ph p{font-size:12px;color:var(--sub);margin-top:2px}
.sgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:20px}
.sc{background:var(--card);border-radius:12px;padding:16px;border:1px solid var(--border);display:flex;align-items:center;gap:10px}
.si{width:40px;height:40px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.sv{font-size:22px;font-weight:800}.sl{font-size:12px;color:var(--sub);margin-top:1px}
.box{background:var(--card);border-radius:12px;border:1px solid var(--border);overflow:hidden;margin-bottom:14px}
.bh{padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.bh h3{font-size:14px;font-weight:700}
.sb{display:flex;align-items:center;gap:7px;background:var(--bg);border:1.5px solid var(--border);border-radius:8px;padding:6px 10px}
.sb input{background:none;border:none;color:var(--text);font-size:13px;width:160px;outline:none}
.sb input::placeholder{color:var(--sub)}
table{width:100%;border-collapse:collapse}
th{padding:10px 12px;text-align:right;font-size:11px;font-weight:600;color:var(--sub);border-bottom:1px solid var(--border);background:rgba(255,255,255,.02)}
td{padding:10px 12px;font-size:13px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle}
tr:last-child td{border-bottom:none}tr:hover td{background:rgba(255,255,255,.02)}
.badge{display:inline-flex;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
.bg-green{background:rgba(34,197,94,.15);color:var(--green)}
.bg-red{background:rgba(239,68,68,.15);color:var(--red)}
.bg-blue{background:rgba(59,130,246,.15);color:var(--blue)}
.bg-gray{background:rgba(148,163,184,.15);color:var(--sub)}
.bg-yellow{background:rgba(245,158,11,.15);color:var(--yellow)}
.uc{display:flex;align-items:center;gap:8px}
.ua{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0;overflow:hidden}
.ua img{width:100%;height:100%;object-fit:cover}
.un{font-weight:600;font-size:13px}.us{font-size:11px;color:var(--sub)}
.acts{display:flex;gap:4px;flex-wrap:wrap}
.idb{font-size:11px;color:var(--sub);font-family:monospace;background:var(--bg);padding:2px 5px;border-radius:4px}
.pager{display:flex;align-items:center;gap:8px;padding:12px 14px;border-top:1px solid var(--border)}
.pinfo{font-size:12px;color:var(--sub);flex:1}
.igrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding:12px}
.icard{background:var(--card2);border-radius:9px;overflow:hidden;border:1px solid var(--border)}
.icard img{width:100%;height:110px;object-fit:cover;cursor:pointer;display:block}
.icardinfo{padding:6px 9px}
.isender{font-size:12px;font-weight:600}.itime{font-size:10px;color:var(--sub);margin-top:1px}
.idel{width:100%;padding:4px;background:rgba(239,68,68,.1);color:var(--red);border:none;cursor:pointer;font-size:11px;border-radius:5px;margin-top:4px}
.viewer{position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:999;display:none;align-items:center;justify-content:center}
.viewer img{max-width:92%;max-height:92%;border-radius:8px}
.vx{position:absolute;top:16px;right:16px;width:40px;height:40px;background:rgba(255,255,255,.1);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px;color:#fff}
.bcast{background:var(--card);border-radius:12px;border:1px solid var(--border);padding:20px;margin-bottom:14px}
.bcast h3{font-size:14px;font-weight:700;margin-bottom:12px}
.ig{margin-bottom:10px}.ig label{font-size:12px;color:var(--sub);display:block;margin-bottom:4px}
.if{width:100%;padding:9px 11px;background:var(--bg);border:1.5px solid var(--border);border-radius:9px;font-size:13px;color:var(--text)}
.if:focus{border-color:var(--blue);outline:none}
textarea.if{resize:vertical;min-height:80px}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);z-index:500;display:none;align-items:center;justify-content:center;padding:20px}
.mbox{background:var(--card);border-radius:14px;padding:22px;width:100%;max-width:400px;border:1px solid var(--border)}
.mbox h3{font-size:16px;font-weight:700;margin-bottom:10px}
.macts{display:flex;gap:9px;margin-top:14px}
.toast{position:fixed;bottom:18px;left:18px;background:var(--card2);color:var(--text);padding:10px 16px;border-radius:9px;font-size:13px;font-weight:600;z-index:900;opacity:0;transition:all .3s;pointer-events:none;border:1px solid var(--border)}
.toast.on{opacity:1}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;color:var(--sub);text-align:center}
.empty h3{font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px}
.lw{display:flex;align-items:center;justify-content:center;padding:40px;color:var(--sub)}
.spin{width:24px;height:24px;border:3px solid var(--border);border-top-color:var(--blue);border-radius:50%;animation:spin .8s linear infinite;margin-left:8px}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="toast" id="toast"></div>
<div class="viewer" id="viewer" style="display:none">
  <img id="vimg" src="" alt=""/>
  <div class="vx" onclick="closeViewer()">✕</div>
</div>
<div class="modal" id="modal" style="display:none">
  <div class="mbox">
    <h3 id="mttl"></h3>
    <div id="mbody" style="color:var(--sub);font-size:13px;line-height:1.6"></div>
    <div class="macts">
      <button class="btn btn-gray btn-sm" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-red btn-sm" id="mok">تأكيد</button>
    </div>
  </div>
</div>
<div id="login" class="login">
  <div class="lbox">
    <div class="llogo"><h1>⚙️ LUMIQ</h1><p>لوحة تحكم المشرف</p></div>
    <div class="err" id="lerr"></div>
    <input class="fi" type="password" id="akey" placeholder="مفتاح المشرف..." autocomplete="off"/>
    <button class="btn btn-blue" id="lbtn" onclick="doLogin()">دخول</button>
  </div>
</div>
<div id="dash" class="layout" style="display:none">
  <div class="sidebar">
    <div class="slogo"><h2>⚙️ LUMIQ Admin</h2></div>
    <div class="nav">
      <div class="ni on" data-p="stats" onclick="go('stats')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>الإحصائيات</div>
      <div class="ni" data-p="users" onclick="go('users')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>المستخدمون</div>
      <div class="ni" data-p="messages" onclick="go('messages')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>الرسائل</div>
      <div class="ni" data-p="images" onclick="go('images')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>الصور</div>
      <div class="ni" data-p="broadcast" onclick="go('broadcast')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>الإشعارات</div>
    </div>
    <div class="sfooter"><button class="btn btn-gray btn-sm" style="width:100%" onclick="doLogout()">خروج</button></div>
  </div>
  <div class="content" id="content"></div>
</div>
<script>
var KEY='';var mcb=null;
function G(id){return document.getElementById(id);}
function ini(n){return n?n.trim()[0].toUpperCase():'?';}
function fd(ts){if(!ts)return'';var d=new Date(ts);return d.toLocaleDateString('ar',{year:'numeric',month:'short',day:'numeric'});}
function toast(msg,t){var e=G('toast');e.textContent=msg;e.style.borderColor=t==='ok'?'var(--green)':t==='err'?'var(--red)':'var(--border)';e.classList.add('on');setTimeout(function(){e.classList.remove('on');},3000);}
function req(method,path,body){return fetch(path,{method:method,headers:{'x-admin-key':KEY,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||r.status);return d;});});}
function showModal(ttl,html,okTxt,okColor,cb){G('mttl').textContent=ttl;G('mbody').innerHTML=html;G('mok').textContent=okTxt||'تأكيد';G('mok').style.background=okColor||'var(--red)';mcb=cb;G('modal').style.display='flex';}
function closeModal(){G('modal').style.display='none';mcb=null;}
G('mok').onclick=function(){if(mcb)mcb();closeModal();};
G('modal').onclick=function(e){if(e.target===this)closeModal();};
function openViewer(src){G('vimg').src=src;G('viewer').style.display='flex';}
function closeViewer(){G('viewer').style.display='none';}
G('viewer').onclick=function(e){if(e.target===this)closeViewer();};
G('akey').onkeydown=function(e){if(e.key==='Enter')doLogin();};
function doLogin(){var k=G('akey').value.trim();if(!k)return;KEY=k;var btn=G('lbtn');btn.disabled=true;btn.textContent='...';req('GET','/api/admin/stats').then(function(){sessionStorage.setItem('ak',k);G('login').style.display='none';G('dash').style.display='flex';go('stats');}).catch(function(e){KEY='';btn.disabled=false;btn.textContent='دخول';G('lerr').textContent=String(e.message).includes('401')||String(e.message).includes('مصرح')?'مفتاح خاطئ':'خطأ في الاتصال';G('lerr').classList.add('on');});}
function doLogout(){KEY='';sessionStorage.removeItem('ak');G('login').style.display='flex';G('dash').style.display='none';}
function go(page){document.querySelectorAll('.ni').forEach(function(el){el.classList.toggle('on',el.getAttribute('data-p')===page);});G('content').innerHTML='<div class="lw"><div class="spin"></div> جارٍ...</div>';if(page==='stats')loadStats();else if(page==='users')loadUsers(1,'');else if(page==='messages')loadMsgs(1);else if(page==='images')loadImgs(1);else if(page==='broadcast')loadBcast();}
function loadStats(){req('GET','/api/admin/stats').then(function(r){var cards=[{e:'👥',l:'المستخدمون',v:r.users,bg:'#3b82f622'},{e:'🟢',l:'متصل الآن',v:r.online,bg:'#22c55e22'},{e:'💬',l:'الرسائل',v:r.messages,bg:'#8b5cf622'},{e:'🖼️',l:'الصور',v:r.images,bg:'#f59e0b22'},{e:'🎤',l:'صوتية',v:r.voice,bg:'#ec489922'},{e:'🤝',l:'المحادثات',v:r.chats,bg:'#06b6d422'},{e:'🆕',l:'مستخدمو اليوم',v:r.new_users_today,bg:'#22c55e22'},{e:'📨',l:'رسائل اليوم',v:r.messages_today,bg:'#f59e0b22'}];var h='<div class="ph"><h1>📊 الإحصائيات</h1></div><div class="sgrid">';cards.forEach(function(c){h+='<div class="sc"><div class="si" style="background:'+c.bg+'">'+c.e+'</div><div><div class="sv">'+(c.v||0)+'</div><div class="sl">'+c.l+'</div></div></div>';});G('content').innerHTML=h+'</div>';}).catch(function(e){G('content').innerHTML='<div class="empty"><h3>خطأ: '+e.message+'</h3></div>';});}
var upage=1,usearch='';
function loadUsers(page,search){upage=page;if(search!==undefined)usearch=search;req('GET','/api/admin/users?page='+upage+'&search='+encodeURIComponent(usearch)).then(function(r){var pages=Math.ceil((r.total||0)/20);var h='<div class="ph"><h1>👥 المستخدمون</h1><p>'+r.total+' مستخدم</p></div>';h+='<div class="box"><div class="bh"><h3>القائمة</h3><div class="sb"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input id="si" type="text" placeholder="بحث..." value="'+usearch+'"/></div></div>';if(!r.users||!r.users.length){h+='<div class="empty"><h3>لا نتائج</h3></div>';}else{h+='<table><thead><tr><th>ID</th><th>المستخدم</th><th>البريد</th><th>الحالة</th><th>التسجيل</th><th>إجراء</th></tr></thead><tbody>';r.users.forEach(function(u){h+='<tr><td><span class="idb">#'+u.id+'</span></td>';h+='<td><div class="uc"><div class="ua">'+(u.photo_url?'<img src="'+u.photo_url+'" alt=""/>':ini(u.name))+'</div><div><div class="un">'+u.name+(u.is_verified?' ✅':'')+'</div><div class="us">@'+u.username+'</div></div></div></td>';h+='<td style="color:var(--sub);font-size:11px">'+u.email+'</td>';h+='<td>'+(u.is_banned?'<span class="badge bg-red">محظور</span>':u.is_online?'<span class="badge bg-green">متصل</span>':'<span class="badge bg-gray">غير متصل</span>')+'</td>';h+='<td style="color:var(--sub);font-size:11px">'+fd(u.created_at)+'</td>';h+='<td><div class="acts">';h+=u.is_banned?'<button class="btn btn-green btn-sm" onclick="unban('+u.id+')">رفع الحظر</button>':'<button class="btn btn-yellow btn-sm" onclick="ban('+u.id+',\''+u.name+'\')">حظر</button>';h+=u.is_verified?'<button class="btn btn-gray btn-sm" onclick="unverify('+u.id+')">إلغاء التوثيق</button>':'<button class="btn btn-blue btn-sm" onclick="verify('+u.id+',\''+u.name+'\')">✅ توثيق</button>';h+='<button class="btn btn-red btn-sm" onclick="delUser('+u.id+',\''+u.name+'\')">حذف</button>';h+='</div></td></tr>';});h+='</tbody></table>';}h+='<div class="pager"><span class="pinfo">صفحة '+upage+' من '+pages+'</span>';if(upage>1)h+='<button class="btn btn-gray btn-sm" onclick="loadUsers('+(upage-1)+')">السابق</button>';if(upage<pages)h+='<button class="btn btn-gray btn-sm" onclick="loadUsers('+(upage+1)+')">التالي</button>';h+='</div></div>';G('content').innerHTML=h;var si=G('si');if(si){si.focus();si.oninput=function(){clearTimeout(window._t);window._t=setTimeout(function(){loadUsers(1,si.value);},400);};}}).catch(function(e){G('content').innerHTML='<div class="empty"><h3>خطأ: '+e.message+'</h3></div>';});}
function ban(id,n){showModal('حظر '+n,'هل تريد حظر هذا المستخدم؟','حظر','var(--red)',function(){req('POST','/api/admin/users/'+id+'/ban',{banned:true}).then(function(){toast('✅ تم','ok');loadUsers(upage,usearch);}).catch(function(e){toast('❌ '+e.message,'err');});});}
function unban(id){req('POST','/api/admin/users/'+id+'/ban',{banned:false}).then(function(){toast('✅ رُفع الحظر','ok');loadUsers(upage,usearch);}).catch(function(e){toast('❌ '+e.message,'err');});}
function verify(id,n){showModal('توثيق '+n,'سيظهر ✅ بجانب اسمه.','توثيق','var(--blue)',function(){req('POST','/api/admin/users/'+id+'/verify',{verified:true}).then(function(){toast('✅ تم التوثيق','ok');loadUsers(upage,usearch);}).catch(function(e){toast('❌ '+e.message,'err');});});}
function unverify(id){req('POST','/api/admin/users/'+id+'/verify',{verified:false}).then(function(){toast('✅ تم','ok');loadUsers(upage,usearch);}).catch(function(e){toast('❌ '+e.message,'err');});}
function delUser(id,n){showModal('حذف '+n,'سيُحذف نهائياً مع جميع رسائله.','حذف','var(--red)',function(){req('DELETE','/api/admin/users/'+id).then(function(){toast('✅ تم الحذف','ok');loadUsers(upage,usearch);}).catch(function(e){toast('❌ '+e.message,'err');});});}
var mpage=1;
function loadMsgs(page){mpage=page;req('GET','/api/admin/messages?page='+mpage).then(function(r){var pages=Math.ceil((r.total||0)/30);var h='<div class="ph"><h1>💬 الرسائل</h1><p>'+r.total+' رسالة</p></div>';h+='<div class="box"><div class="bh"><h3>جميع الرسائل</h3></div>';if(!r.messages||!r.messages.length){h+='<div class="empty"><h3>لا توجد رسائل</h3></div>';}else{h+='<table><thead><tr><th>المرسل</th><th>الرسالة</th><th>النوع</th><th>التاريخ</th><th>إجراء</th></tr></thead><tbody>';r.messages.forEach(function(m){var t=m.type==='image'?'🖼️':m.type==='voice'?'🎤':'💬';h+='<tr><td><div class="uc"><div class="ua">'+ini(m.sender_name)+'</div><div><div class="un">'+m.sender_name+'</div><div class="us">@'+m.username+'</div></div></div></td>';h+='<td style="max-width:200px;font-size:12px;color:var(--sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(m.text||'-')+'</td>';h+='<td>'+t+'</td><td style="color:var(--sub);font-size:11px">'+fd(m.created_at)+'</td>';h+='<td><button class="btn btn-red btn-sm" onclick="delMsg('+m.id+')">حذف</button></td></tr>';});h+='</tbody></table>';}h+='<div class="pager"><span class="pinfo">صفحة '+mpage+' من '+pages+'</span>';if(mpage>1)h+='<button class="btn btn-gray btn-sm" onclick="loadMsgs('+(mpage-1)+')">السابق</button>';if(mpage<pages)h+='<button class="btn btn-gray btn-sm" onclick="loadMsgs('+(mpage+1)+')">التالي</button>';h+='</div></div>';G('content').innerHTML=h;}).catch(function(e){G('content').innerHTML='<div class="empty"><h3>خطأ: '+e.message+'</h3></div>';});}
function delMsg(id){showModal('حذف الرسالة','لا يمكن التراجع.','حذف','var(--red)',function(){req('DELETE','/api/admin/messages/'+id).then(function(){toast('✅ تم','ok');loadMsgs(mpage);}).catch(function(e){toast('❌ '+e.message,'err');});});}
var ipage=1;
function loadImgs(page){ipage=page;req('GET','/api/admin/images?page='+ipage).then(function(r){var pages=Math.ceil((r.total||0)/20);var h='<div class="ph"><h1>🖼️ الصور</h1><p>'+r.total+' صورة</p></div>';h+='<div class="box">';if(!r.images||!r.images.length){h+='<div class="empty"><h3>لا توجد صور</h3></div>';}else{h+='<div class="igrid">';r.images.forEach(function(img){h+='<div class="icard"><img src="'+img.image_url+'" onclick="openViewer(\''+img.image_url+'\')" loading="lazy"/><div class="icardinfo"><div class="isender">'+img.sender_name+'</div><div class="itime">'+fd(img.created_at)+'</div><button class="idel" onclick="delMsg('+img.id+')">🗑️ حذف</button></div></div>';});h+='</div>';}h+='<div class="pager"><span class="pinfo">صفحة '+ipage+' من '+pages+'</span>';if(ipage>1)h+='<button class="btn btn-gray btn-sm" onclick="loadImgs('+(ipage-1)+')">السابق</button>';if(ipage<pages)h+='<button class="btn btn-gray btn-sm" onclick="loadImgs('+(ipage+1)+')">التالي</button>';h+='</div></div>';G('content').innerHTML=h;}).catch(function(e){G('content').innerHTML='<div class="empty"><h3>خطأ: '+e.message+'</h3></div>';});}
function loadBcast(){G('content').innerHTML='<div class="ph"><h1>📢 إشعار</h1></div><div class="bcast"><h3>إرسال لجميع المتصلين</h3><div class="ig"><label>العنوان</label><input class="if" id="bt" type="text" value="LUMIQ"/></div><div class="ig"><label>الرسالة</label><textarea class="if" id="bm" placeholder="اكتب الرسالة..."></textarea></div><button class="btn btn-blue" onclick="sendBcast()">📢 إرسال</button></div>';}
function sendBcast(){var t=G('bt').value.trim(),m=G('bm').value.trim();if(!m){toast('⚠️ اكتب الرسالة','err');return;}req('POST','/api/admin/broadcast',{title:t,message:m}).then(function(){toast('✅ تم الإرسال','ok');G('bm').value='';}).catch(function(e){toast('❌ '+e.message,'err');});}
(function(){var k=sessionStorage.getItem('ak');if(k){KEY=k;G('akey').value=k;req('GET','/api/admin/stats').then(function(){G('login').style.display='none';G('dash').style.display='flex';go('stats');}).catch(function(){KEY='';sessionStorage.removeItem('ak');});}})();
</script>
</body>
</html>`;

// صفحة لوحة التحكم
app.get('/admin', function(req, res) { res.send(ADMIN_HTML); });

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
    res.json({ users: parseInt(users.rows[0].c), messages: parseInt(messages.rows[0].c), images: parseInt(images.rows[0].c), voice: parseInt(voice.rows[0].c), chats: parseInt(chats.rows[0].c), online: parseInt(online.rows[0].c), new_users_today: parseInt(today_u.rows[0].c), messages_today: parseInt(today_m.rows[0].c) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', adminAuth, async function(req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var search = req.query.search ? '%' + req.query.search + '%' : '%';
    var r = await db.query('SELECT id,name,username,email,photo_url,is_online,is_banned,is_verified,last_seen,created_at FROM users WHERE username ILIKE $1 OR name ILIKE $1 ORDER BY created_at DESC LIMIT 20 OFFSET $2', [search, (page-1)*20]);
    var total = await db.query('SELECT COUNT(*) as c FROM users WHERE username ILIKE $1 OR name ILIKE $1', [search]);
    res.json({ users: r.rows, total: parseInt(total.rows[0].c), page: page });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ✅ إصلاح: حذف المستخدم من الأدمن يحذف كل بياناته
app.delete('/api/admin/users/:id', adminAuth, async function(req, res) {
  try {
    var uid = req.params.id;
    await db.query('DELETE FROM messages WHERE sender_id=$1', [uid]);
    await db.query("DELETE FROM chats WHERE $1=ANY(participants)", [String(uid)]);
    await db.query('DELETE FROM users WHERE id=$1', [uid]);
    // طرده من السوكيت إن كان متصلاً
    if (onlineUsers[String(uid)]) {
      io.to(onlineUsers[String(uid)]).emit('force_logout', { reason: 'تم حذف حسابك' });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/:id/ban', adminAuth, async function(req, res) {
  try {
    await db.query('UPDATE users SET is_banned=$1 WHERE id=$2', [req.body.banned, req.params.id]);
    if (req.body.banned && onlineUsers[String(req.params.id)]) {
      io.to(onlineUsers[String(req.params.id)]).emit('force_logout', { reason: 'تم حظر حسابك' });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/:id/verify', adminAuth, async function(req, res) {
  try {
    await db.query('UPDATE users SET is_verified=$1 WHERE id=$2', [req.body.verified, req.params.id]);
    if (onlineUsers[String(req.params.id)]) {
      io.to(onlineUsers[String(req.params.id)]).emit('verified', { is_verified: req.body.verified });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/messages', adminAuth, async function(req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var r = await db.query('SELECT m.id,m.text,m.type,m.created_at,u.name as sender_name,u.username FROM messages m JOIN users u ON m.sender_id=u.id ORDER BY m.created_at DESC LIMIT 30 OFFSET $1', [(page-1)*30]);
    var total = await db.query('SELECT COUNT(*) as c FROM messages');
    res.json({ messages: r.rows, total: parseInt(total.rows[0].c) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/messages/:id', adminAuth, async function(req, res) {
  try {
    var r = await db.query('SELECT chat_id FROM messages WHERE id=$1', [req.params.id]);
    await db.query('DELETE FROM messages WHERE id=$1', [req.params.id]);
    if (r.rows.length) io.to(r.rows[0].chat_id).emit('delete_message', { id: parseInt(req.params.id) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/images', adminAuth, async function(req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var r = await db.query("SELECT m.id,m.image_url,m.created_at,u.name as sender_name FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.type='image' ORDER BY m.created_at DESC LIMIT 20 OFFSET $1", [(page-1)*20]);
    var total = await db.query("SELECT COUNT(*) as c FROM messages WHERE type='image'");
    res.json({ images: r.rows, total: parseInt(total.rows[0].c) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/broadcast', adminAuth, async function(req, res) {
  try {
    var title = req.body.title || 'LUMIQ';
    var message = req.body.message || '';
    // حفظ الإشعار في قاعدة البيانات
    var r = await db.query(
      'INSERT INTO notifications (title, message) VALUES ($1, $2) RETURNING *',
      [title, message]
    );
    var notif = r.rows[0];
    // إرسال فوري للمتصلين
    io.emit('broadcast', { id: notif.id, title: title, message: message, created_at: notif.created_at });
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

// جلب الإشعارات غير المقروءة للمستخدم
app.get('/api/notifications', auth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT n.*, (SELECT COUNT(*) FROM notification_reads nr WHERE nr.notification_id=n.id AND nr.user_id=$1) as is_read FROM notifications n ORDER BY n.created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// تعليم إشعار كمقروء
app.post('/api/notifications/read', auth, async function(req, res) {
  try {
    var ids = req.body.ids || [];
    if (!ids.length) {
      // قراءة الكل
      var all = await db.query('SELECT id FROM notifications');
      ids = all.rows.map(function(r) { return r.id; });
    }
    for (var i = 0; i < ids.length; i++) {
      await db.query(
        'INSERT INTO notification_reads (user_id, notification_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.user.id, ids[i]]
      ).catch(function() {});
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ═══ SOCKET ═══
var onlineUsers = {};

io.on('connection', function(socket) {

  socket.on('join', async function(data) {
    try {
      var user = jwt.verify(data.token, JWT_SECRET);
      socket.userId = user.id;
      onlineUsers[String(user.id)] = socket.id;
      await db.query('UPDATE users SET is_online=true, last_seen=NOW() WHERE id=$1', [user.id]);
      io.emit('user_online', { user_id: user.id, is_online: true });
      var chats = await db.query('SELECT id FROM chats WHERE $1=ANY(participants)', [String(user.id)]);
      chats.rows.forEach(function(c) { socket.join(c.id); });

      // إرسال الإشعارات غير المقروءة عند الاتصال
      var pending = await db.query(
        'SELECT n.* FROM notifications n WHERE n.id NOT IN (SELECT notification_id FROM notification_reads WHERE user_id=$1) ORDER BY n.created_at ASC',
        [user.id]
      );
      if (pending.rows.length > 0) {
        socket.emit('pending_notifications', { notifications: pending.rows });
      }
      // إرسال طلبات الصداقة المعلقة
      var pendingFriends = await db.query(
        'SELECT u.id,u.name,u.username,u.photo_url,u.is_verified FROM friendships f JOIN users u ON f.requester_id=u.id WHERE f.addressee_id=$1 AND f.status=$2',
        [user.id, 'pending']
      );
      if (pendingFriends.rows.length > 0) {
        socket.emit('pending_friend_requests', { requests: pendingFriends.rows });
      }
    } catch(e) { console.error('join error:', e.message); }
  });

  socket.on('join_chat', function(data) {
    if (data && data.chat_id) socket.join(data.chat_id);
  });

  socket.on('typing', function(data) {
    if (data && data.chat_id) {
      socket.to(data.chat_id).emit('typing', { user_id: data.user_id, is_typing: data.is_typing });
    }
  });

  socket.on('messages_seen', function(data) {
    // أعلم المرسل الأصلي أن رسائله قُرئت
    if (data.partner_id && onlineUsers[String(data.partner_id)]) {
      io.to(onlineUsers[String(data.partner_id)]).emit('messages_seen', {
        chat_id: data.chat_id,
        reader_id: data.reader_id
      });
    }
  });

  socket.on('call_request', async function(data) {
    try {
      // التحقق من الحظر قبل الاتصال
      var blockCheck = await db.query(
        'SELECT id FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',
        [socket.userId, data.to_user_id]
      );
      if (blockCheck.rows.length) {
        socket.emit('call_failed', { reason: 'لا يمكن الاتصال بهذا المستخدم' });
        return;
      }
      var to = onlineUsers[String(data.to_user_id)];
      if (to) io.to(to).emit('call_incoming', { from_user: data.from_user, chat_id: data.chat_id, socket_id: socket.id });
      else socket.emit('call_failed', { reason: 'المستخدم غير متصل حالياً' });
    } catch(e) {
      var to2 = onlineUsers[String(data.to_user_id)];
      if (to2) io.to(to2).emit('call_incoming', { from_user: data.from_user, chat_id: data.chat_id, socket_id: socket.id });
    }
  });

  socket.on('call_accept',   function(d) { if (d.to_socket_id) io.to(d.to_socket_id).emit('call_accepted',  { from_user: d.from_user, socket_id: socket.id }); });
  socket.on('call_reject',   function(d) { if (d.to_socket_id) io.to(d.to_socket_id).emit('call_rejected'); });
  socket.on('call_end',      function(d) { if (d.to_socket_id) io.to(d.to_socket_id).emit('call_ended'); });
  socket.on('webrtc_offer',  function(d) { if (d.to_socket_id) io.to(d.to_socket_id).emit('webrtc_offer',  { offer: d.offer, from_socket_id: socket.id }); });
  socket.on('webrtc_answer', function(d) { if (d.to_socket_id) io.to(d.to_socket_id).emit('webrtc_answer', { answer: d.answer }); });
  socket.on('webrtc_ice',    function(d) { if (d.to_socket_id) io.to(d.to_socket_id).emit('webrtc_ice',    { candidate: d.candidate }); });

  socket.on('disconnect', async function() {
    if (socket.userId) {
      delete onlineUsers[String(socket.userId)];
      try {
        await db.query('UPDATE users SET is_online=false, last_seen=NOW() WHERE id=$1', [socket.userId]);
        io.emit('user_online', { user_id: socket.userId, is_online: false, last_seen: new Date() });
      } catch(e) { console.error('disconnect error:', e.message); }
    }
  });
});

initDB().then(function() {
  server.listen(PORT, function() {
    console.log('🚀 LUMIQ Server running on port ' + PORT);
  });
}).catch(function(e) {
  console.error('❌ DB Error:', e);
  process.exit(1);
});
