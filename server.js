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
  // نرسل المحتوى مباشرة بدون sendFile
  var swCode = "// LUMIQ Service Worker v2\nvar CACHE_NAME = 'lumiq-v2';\nself.addEventListener('install', function(e) { self.skipWaiting(); });\nself.addEventListener('activate', function(e) {\n  e.waitUntil(caches.keys().then(function(keys) {\n    return Promise.all(keys.filter(function(k){return k!==CACHE_NAME;}).map(function(k){return caches.delete(k);}));\n  })); self.clients.claim();\n});\nself.addEventListener('fetch', function(e) {\n  var url=e.request.url;\n  if(url.includes('/api/')||url.includes('/socket.io')||e.request.method!=='GET') return;\n  e.respondWith(caches.open(CACHE_NAME).then(function(cache){\n    return cache.match(e.request).then(function(cached){\n      var fp=fetch(e.request).then(function(res){if(res&&res.status===200)cache.put(e.request,res.clone());return res;}).catch(function(){return cached;});\n      return cached||fp;\n    });\n  }));\n});\nself.addEventListener('push',function(e){if(!e.data)return;var d={};try{d=e.data.json();}catch(err){d={title:'LUMIQ',body:e.data.text()};}e.waitUntil(self.registration.showNotification(d.title||'LUMIQ',{body:d.body||'',icon:d.icon||'/icon-192.png',badge:'/icon-192.png',tag:d.tag||'lumiq',data:{url:d.url||'/'}}));});\nself.addEventListener('notificationclick',function(e){e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(function(cls){for(var c of cls){if('focus'in c)return c.focus();}if(clients.openWindow)return clients.openWindow('/');}));});";
  res.send(swCode);
});

// خدمة manifest.json
app.get('/manifest.json', function(req, res) {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json({"name": "LUMIQ", "short_name": "LUMIQ", "description": "تواصل بذكاء مع من تحب", "start_url": "/", "display": "standalone", "orientation": "portrait", "background_color": "#0a0a0f", "theme_color": "#0A84FF", "lang": "ar", "dir": "rtl", "icons": [{"src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"}, {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}]});
});

// خدمة icon-192.png و icon-512.png
app.get('/icon-:size.png', function(req, res) {
  // أرسل placeholder SVG إذا لم يوجد أيقونة
  var size = parseInt(req.params.size) || 192;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'"><rect width="'+size+'" height="'+size+'" rx="'+(size*0.2)+'" fill="#0A84FF"/><text x="50%" y="54%" font-family="Arial" font-weight="bold" font-size="'+(size*0.4)+'" fill="white" text-anchor="middle" dominant-baseline="middle">LQ</text></svg>';
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
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
const ADMIN_KEY = process.env.ADMIN_KEY || 'saif11';

function adminAuth(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'غير مصرح' });
  next();
}

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
    var banned = req.body.banned !== false;
    var reason = req.body.reason || 'تم حظر حسابك من قِبَل الإدارة';
    await db.query('UPDATE users SET is_banned=$1 WHERE id=$2', [banned, req.params.id]);
    // أرسل الـ event أولاً قبل أي شيء
    if (banned && onlineUsers[String(req.params.id)]) {
      var payload = { type: 'ban', reason: reason };
      io.to(onlineUsers[String(req.params.id)]).emit('force_logout', payload);
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

// تعديل بيانات مستخدم
app.put('/api/admin/users/:id', adminAuth, async function(req, res) {
  try {
    var { name, username, email, bio } = req.body;
    await db.query('UPDATE users SET name=COALESCE($1,name), username=COALESCE($2,username), email=COALESCE($3,email), bio=COALESCE($4,bio) WHERE id=$5',
      [name||null, username||null, email||null, bio||null, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// جلب محادثات مستخدم
app.get('/api/admin/users/:id/chats', adminAuth, async function(req, res) {
  try {
    var r = await db.query('SELECT c.*,(SELECT COUNT(*) FROM messages m WHERE m.chat_id=c.id) as msg_count FROM chats c WHERE $1=ANY(c.participants) ORDER BY c.last_message_at DESC', [String(req.params.id)]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// حذف محادثة
app.delete('/api/admin/chats/:id', adminAuth, async function(req, res) {
  try {
    await db.query('DELETE FROM messages WHERE chat_id=$1', [req.params.id]);
    await db.query('DELETE FROM chats WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// جلب كل المحادثات
app.get('/api/admin/chats', adminAuth, async function(req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var r = await db.query('SELECT c.id, c.participants, c.last_message, c.last_message_at, (SELECT COUNT(*) FROM messages m WHERE m.chat_id=c.id) as msg_count FROM chats c ORDER BY c.last_message_at DESC LIMIT 20 OFFSET $1', [(page-1)*20]);
    var total = await db.query('SELECT COUNT(*) as c FROM chats');
    res.json({ chats: r.rows, total: parseInt(total.rows[0].c) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// رسائل محادثة معينة
app.get('/api/admin/chats/:id/messages', adminAuth, async function(req, res) {
  try {
    var r = await db.query('SELECT m.*, u.name as sender_name, u.username FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.chat_id=$1 ORDER BY m.created_at DESC LIMIT 50', [req.params.id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// تغيير كلمة مرور مستخدم
app.post('/api/admin/users/:id/password', adminAuth, async function(req, res) {
  try {
    var hash = await bcrypt.hash(req.body.password, 10);
    await db.query('UPDATE users SET password=$1 WHERE id=$2', [hash, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// حذف صورة مستخدم
app.delete('/api/admin/users/:id/photo', adminAuth, async function(req, res) {
  try {
    await db.query("UPDATE users SET photo_url='' WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
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

