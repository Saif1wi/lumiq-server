const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const { Pool }   = require('pg');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const multer     = require('multer');
const cloudinary = require('cloudinary').v2;

// ═══ CONFIG ═══
const JWT_SECRET    = process.env.JWT_SECRET    || 'lumiq_secret_2024';
const DATABASE_URL  = process.env.DATABASE_URL  || 'postgresql://postgres:egNpBttTyFpglzpNqAGOiATDXpCHAMLO@centerbeam.proxy.rlwy.net:43941/railway';
const ADMIN_KEY     = process.env.ADMIN_KEY     || 'saif11';
const PORT          = process.env.PORT          || 3000;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD  || 'dxahljm5o',
  api_key:    process.env.CLOUDINARY_KEY    || '536977242836915',
  api_secret: process.env.CLOUDINARY_SECRET || 'kqIUC7aXQJF_s8r6kA5e_z367yA'
});

// ═══ DB ═══
const db = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

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
    expires_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

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

  // Indexes
  await db.query('CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)').catch(function(){});
  await db.query('CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC)').catch(function(){});
  await db.query('CREATE INDEX IF NOT EXISTS idx_chats_participants ON chats USING GIN(participants)').catch(function(){});
  await db.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)').catch(function(){});
  await db.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)').catch(function(){});

  // Alters للتوافق مع قواعد بيانات قديمة
  var alters = [
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_join_date BOOLEAN DEFAULT true",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS battery_level INT DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_battery BOOLEAN DEFAULT true",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded BOOLEAN DEFAULT false"
  ];
  for (var i = 0; i < alters.length; i++) {
    await db.query(alters[i]).catch(function(){});
  }

  console.log('✅ DB ready');
}

// ═══ HELPERS ═══
function s(val) { return val ? String(val).trim() : ''; }

// Rate Limiter
var rateLimitStore = {};
function rateLimit(max, windowMs) {
  return function(req, res, next) {
    var ip  = req.ip || 'x';
    var now = Date.now();
    if (!rateLimitStore[ip]) rateLimitStore[ip] = [];
    rateLimitStore[ip] = rateLimitStore[ip].filter(function(t) { return now - t < windowMs; });
    if (rateLimitStore[ip].length >= max) return res.status(429).json({ error: 'طلبات كثيرة، حاول لاحقاً' });
    rateLimitStore[ip].push(now);
    next();
  };
}
setInterval(function() {
  var now = Date.now();
  Object.keys(rateLimitStore).forEach(function(ip) {
    if (rateLimitStore[ip].every(function(t) { return now - t > 900000; })) delete rateLimitStore[ip];
  });
}, 300000);

// ═══ Helper: تحديث unread_count وآخر رسالة ═══
async function updateChatMeta(chatId, senderId, lastMessage) {
  var chatRow = await db.query('SELECT participants, unread_count FROM chats WHERE id=$1', [chatId]);
  if (!chatRow.rows.length) return;
  var uc           = chatRow.rows[0].unread_count || {};
  var participants = chatRow.rows[0].participants  || [];
  participants.forEach(function(pid) {
    if (String(pid) !== String(senderId)) {
      uc[pid] = (parseInt(uc[pid]) || 0) + 1;
    }
  });
  await db.query(
    'UPDATE chats SET last_message=$1, last_message_at=NOW(), unread_count=$2 WHERE id=$3',
    [lastMessage, JSON.stringify(uc), chatId]
  );
}

// ═══ Helper: التحقق من الحظر بين مستخدمين ═══
async function checkBlock(userA, userB) {
  var r = await db.query(
    'SELECT id FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',
    [userA, userB]
  );
  return r.rows.length > 0;
}

// ═══ APP ═══
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// Security Headers
app.use(function(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','x-admin-key'] }));
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));

// ═══ STATIC ═══
app.get('/api/ping', function(req, res) { res.json({ ok: true }); });

app.get('/sw.js', function(req, res) {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.send([
    "var CACHE_NAME='lumiq-v2';",
    "self.addEventListener('install',function(e){self.skipWaiting();});",
    "self.addEventListener('activate',function(e){",
    "  e.waitUntil(caches.keys().then(function(keys){",
    "    return Promise.all(keys.filter(function(k){return k!==CACHE_NAME;}).map(function(k){return caches.delete(k);}));",
    "  }));self.clients.claim();",
    "});",
    "self.addEventListener('fetch',function(e){",
    "  var url=e.request.url;",
    "  if(url.includes('/api/')||url.includes('/socket.io')||e.request.method!=='GET')return;",
    "  e.respondWith(caches.open(CACHE_NAME).then(function(cache){",
    "    return cache.match(e.request).then(function(cached){",
    "      var fp=fetch(e.request).then(function(res){if(res&&res.status===200)cache.put(e.request,res.clone());return res;}).catch(function(){return cached;});",
    "      return cached||fp;",
    "    });",
    "  }));",
    "});",
    "self.addEventListener('push',function(e){if(!e.data)return;var d={};try{d=e.data.json();}catch(err){d={title:'LUMIQ',body:e.data.text()};}",
    "  e.waitUntil(self.registration.showNotification(d.title||'LUMIQ',{body:d.body||'',icon:d.icon||'/icon-192.png',badge:'/icon-192.png',tag:d.tag||'lumiq',data:{url:d.url||'/'}}));",
    "});",
    "self.addEventListener('notificationclick',function(e){e.notification.close();",
    "  e.waitUntil(clients.matchAll({type:'window'}).then(function(cls){for(var c of cls){if('focus'in c)return c.focus();}if(clients.openWindow)return clients.openWindow('/');}));",
    "});"
  ].join('\n'));
});

app.get('/manifest.json', function(req, res) {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json({
    name: 'LUMIQ', short_name: 'LUMIQ',
    description: 'تواصل بذكاء مع من تحب',
    start_url: '/', display: 'standalone', orientation: 'portrait',
    background_color: '#0a0a0f', theme_color: '#0A84FF',
    lang: 'ar', dir: 'rtl',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ]
  });
});

app.get('/icon-:size.png', function(req, res) {
  var size = parseInt(req.params.size) || 192;
  var svg  = '<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'"><rect width="'+size+'" height="'+size+'" rx="'+(size*0.2)+'" fill="#0A84FF"/><text x="50%" y="54%" font-family="Arial" font-weight="bold" font-size="'+(size*0.4)+'" fill="white" text-anchor="middle" dominant-baseline="middle">LQ</text></svg>';
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ═══ MIDDLEWARE: AUTH ═══
function auth(req, res, next) {
  var token = req.headers.authorization && req.headers.authorization.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch(e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminAuth(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'غير مصرح' });
  next();
}

// ═══ AUTH ═══
app.post('/api/register', rateLimit(5, 60000), async function(req, res) {
  try {
    var name     = s(req.body.name);
    var username = s(req.body.username).toLowerCase();
    var email    = s(req.body.email).toLowerCase();
    var password = s(req.body.password);

    if (!name || !username || !email || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    if (password.length < 6)  return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
    if (name.length > 40)     return res.status(400).json({ error: 'الاسم طويل جداً' });
    if (username.length > 20 || !/^[a-z0-9_]+$/.test(username)) return res.status(400).json({ error: 'اسم المستخدم غير صالح' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'البريد غير صالح' });

    var exists = await db.query('SELECT id FROM users WHERE username=$1 OR email=$2', [username, email]);
    if (exists.rows.length) return res.status(400).json({ error: 'اسم المستخدم أو البريد مستخدم' });

    var hash   = await bcrypt.hash(password, 10);
    var result = await db.query(
      'INSERT INTO users (name,username,email,password) VALUES ($1,$2,$3,$4) RETURNING id,name,username,email,bio,photo_url,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,created_at',
      [name, username, email, hash]
    );
    var user  = result.rows[0];
    var token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ في الخادم' }); }
});

app.post('/api/login', rateLimit(10, 60000), async function(req, res) {
  try {
    var email    = s(req.body.email).toLowerCase();
    var password = s(req.body.password);
    if (!email || !password) return res.status(400).json({ error: 'البريد وكلمة المرور مطلوبان' });

    var result = await db.query('SELECT * FROM users WHERE email=$1', [email]);
    var user   = result.rows[0];
    if (!user)          return res.status(400).json({ error: 'البريد غير موجود' });
    if (user.is_banned) return res.status(403).json({ error: 'تم حظر حسابك' });

    var ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'كلمة المرور خاطئة' });

    await db.query('UPDATE users SET is_online=true, last_seen=NOW() WHERE id=$1', [user.id]);
    delete user.password;
    var token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ في الخادم' }); }
});

// ═══ USERS ═══
app.get('/api/me', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT id,name,username,email,bio,photo_url,nickname,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,battery_level,show_battery,created_at FROM users WHERE id=$1', [req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'غير موجود' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.put('/api/me', auth, async function(req, res) {
  try {
    var name            = req.body.name    || null;
    var bio             = req.body.bio     !== undefined ? req.body.bio    : null;
    var nickname        = req.body.nickname !== undefined ? req.body.nickname : null;
    var username        = req.body.username || null;
    var show_last_seen  = req.body.show_last_seen !== undefined ? req.body.show_last_seen : null;
    var show_online     = req.body.show_online    !== undefined ? req.body.show_online    : null;
    var show_join_date  = req.body.show_join_date !== undefined ? req.body.show_join_date : null;
    var show_battery    = req.body.show_battery   !== undefined ? req.body.show_battery   : null;

    if (username) {
      username = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (username.length < 3) return res.status(400).json({ error: 'اسم المستخدم قصير جداً' });
      var ex = await db.query('SELECT id FROM users WHERE username=$1 AND id!=$2', [username, req.user.id]);
      if (ex.rows.length) return res.status(400).json({ error: 'اسم المستخدم مستخدم' });
    }
    if (nickname && nickname.length > 30) return res.status(400).json({ error: 'الكنية طويلة جداً' });

    await db.query(
      'UPDATE users SET name=COALESCE($1,name), username=COALESCE($2,username), bio=COALESCE($3,bio), nickname=COALESCE($4,nickname), show_last_seen=COALESCE($5,show_last_seen), show_online=COALESCE($6,show_online), show_join_date=COALESCE($7,show_join_date), show_battery=COALESCE($8,show_battery) WHERE id=$9',
      [name, username, bio, nickname, show_last_seen, show_online, show_join_date, show_battery, req.user.id]
    );
    var r = await db.query('SELECT id,name,username,email,bio,photo_url,nickname,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,battery_level,show_battery,created_at FROM users WHERE id=$1', [req.user.id]);
    res.json(r.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/me/avatar', auth, upload.single('avatar'), async function(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
    var b64 = req.file.buffer.toString('base64');
    var up  = await cloudinary.uploader.upload('data:' + req.file.mimetype + ';base64,' + b64, {
      folder: 'lumiq/avatars',
      transformation: [{ width: 300, height: 300, crop: 'fill' }]
    });
    await db.query('UPDATE users SET photo_url=$1 WHERE id=$2', [up.secure_url, req.user.id]);
    res.json({ photo_url: up.secure_url });
  } catch(e) { console.error(e); res.status(500).json({ error: 'فشل رفع الصورة' }); }
});

app.get('/api/users/search', auth, async function(req, res) {
  try {
    var q = req.query.q ? req.query.q.toLowerCase().trim() : '';
    if (!q || q.length < 2) return res.json([]);
    var r = await db.query(
      'SELECT id,name,username,bio,photo_url,nickname,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,battery_level,show_battery,created_at FROM users WHERE (username ILIKE $1 OR name ILIKE $1) AND id!=$2 AND is_banned=false LIMIT 20',
      ['%' + q + '%', req.user.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/users/:id', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT id,name,username,bio,photo_url,nickname,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,battery_level,show_battery,created_at FROM users WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'غير موجود' });
    var user = Object.assign({}, r.rows[0]);
    // إذا هو حظرني → أخفِ بياناته
    var theyBlockedMe = await db.query('SELECT id FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.params.id, req.user.id]);
    if (theyBlockedMe.rows.length) {
      user.photo_url    = '';
      user.is_online    = false;
      user.last_seen    = null;
      user.show_online  = false;
      user.show_last_seen = false;
    }
    res.json(user);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.delete('/api/me', auth, async function(req, res) {
  try {
    var uid = req.user.id;
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

app.get('/api/block/status/:userId', auth, async function(req, res) {
  try {
    var targetId  = parseInt(req.params.userId);
    var iBlocked  = await db.query('SELECT id FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user.id, targetId]);
    var theyBlocked = await db.query('SELECT id FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [targetId, req.user.id]);
    res.json({ i_blocked: iBlocked.rows.length > 0, they_blocked: theyBlocked.rows.length > 0 });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ═══ FRIENDS ═══
app.post('/api/friends/request', auth, async function(req, res) {
  try {
    var targetId = parseInt(req.body.user_id);
    if (!targetId || targetId === req.user.id) return res.status(400).json({ error: 'غير صالح' });
    if (await checkBlock(req.user.id, targetId)) return res.status(403).json({ error: 'لا يمكن إرسال طلب' });

    var exists = await db.query(
      'SELECT * FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)',
      [req.user.id, targetId]
    );
    if (exists.rows.length) return res.status(400).json({ error: 'طلب موجود مسبقاً', status: exists.rows[0].status });

    await db.query('INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1,$2,$3)', [req.user.id, targetId, 'pending']);
    var sender = await db.query('SELECT id,name,username,photo_url,is_verified FROM users WHERE id=$1', [req.user.id]);
    if (onlineUsers[String(targetId)]) {
      io.to(onlineUsers[String(targetId)]).emit('friend_request', { from: sender.rows[0] });
    }
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/friends/accept', auth, async function(req, res) {
  try {
    var requesterId = parseInt(req.body.user_id);
    var r = await db.query(
      'UPDATE friendships SET status=$1 WHERE requester_id=$2 AND addressee_id=$3 AND status=$4 RETURNING *',
      ['accepted', requesterId, req.user.id, 'pending']
    );
    if (!r.rows.length) return res.status(404).json({ error: 'الطلب غير موجود' });
    var accepter = await db.query('SELECT id,name,username,photo_url,is_verified FROM users WHERE id=$1', [req.user.id]);
    if (onlineUsers[String(requesterId)]) {
      io.to(onlineUsers[String(requesterId)]).emit('friend_accepted', { by: accepter.rows[0] });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/friends/reject', auth, async function(req, res) {
  try {
    var otherId = parseInt(req.body.user_id);
    await db.query(
      'DELETE FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)',
      [req.user.id, otherId]
    );
    if (onlineUsers[String(otherId)]) {
      io.to(onlineUsers[String(otherId)]).emit('friend_rejected', { by_user_id: req.user.id });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/friends', auth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT u.id,u.name,u.username,u.photo_url,u.is_online,u.is_verified,u.last_seen,u.show_online,u.show_last_seen,u.battery_level,u.show_battery, f.status, f.requester_id FROM friendships f JOIN users u ON (CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END)=u.id WHERE (f.requester_id=$1 OR f.addressee_id=$1) ORDER BY f.created_at DESC',
      [req.user.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/friends/requests', auth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT u.id,u.name,u.username,u.photo_url,u.is_verified,f.created_at FROM friendships f JOIN users u ON f.requester_id=u.id WHERE f.addressee_id=$1 AND f.status=$2 ORDER BY f.created_at DESC',
      [req.user.id, 'pending']
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/friends/status/:userId', auth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT * FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)',
      [req.user.id, req.params.userId]
    );
    if (!r.rows.length) return res.json({ status: 'none' });
    var f = r.rows[0];
    res.json({ status: f.status, i_requested: String(f.requester_id) === String(req.user.id) });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ═══ CHATS ═══
app.post('/api/chats', auth, async function(req, res) {
  try {
    var other = String(req.body.other_user_id);
    var ids   = [String(req.user.id), other].sort();
    var cid   = ids.join('_');
    var ex    = await db.query('SELECT * FROM chats WHERE id=$1', [cid]);
    if (ex.rows.length) return res.json(ex.rows[0]);
    var uc    = {}; uc[req.user.id] = 0; uc[other] = 0;
    var r     = await db.query('INSERT INTO chats (id,participants,unread_count) VALUES ($1,$2,$3) RETURNING *', [cid, ids, JSON.stringify(uc)]);
    res.json(r.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/chats', auth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT * FROM chats WHERE $1=ANY(participants) ORDER BY last_message_at DESC NULLS LAST LIMIT 100',
      [String(req.user.id)]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ═══ MESSAGES ═══
app.delete('/api/chats/:chatId/delete', auth, async function(req, res) {
  try {
    var chatId  = req.params.chatId;
    var chatRow = await db.query('SELECT participants FROM chats WHERE id=$1', [chatId]);
    if (!chatRow.rows.length) return res.status(404).json({ error: 'المحادثة غير موجودة' });
    if (!chatRow.rows[0].participants.includes(String(req.user.id))) return res.status(403).json({ error: 'غير مسموح' });
    await db.query('DELETE FROM messages WHERE chat_id=$1', [chatId]);
    await db.query('DELETE FROM chats WHERE id=$1', [chatId]);
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
    var chatId   = req.params.chatId;
    var text     = req.body.text;
    var reply_to = req.body.reply_to;
    if (!text || !text.trim()) return res.status(400).json({ error: 'الرسالة فارغة' });

    // التحقق من الحظر
    var chatRow = await db.query('SELECT participants FROM chats WHERE id=$1', [chatId]);
    if (chatRow.rows.length) {
      var otherPid = chatRow.rows[0].participants.find(function(p) { return String(p) !== String(req.user.id); });
      if (otherPid && await checkBlock(req.user.id, otherPid)) return res.status(403).json({ error: 'blocked' });
    }

    var forwarded   = req.body.forwarded === true;
    var expires_sec = req.body.expires_after ? parseInt(req.body.expires_after) : null;
    var expires_at  = expires_sec ? new Date(Date.now() + expires_sec * 1000).toISOString() : null;

    var r   = await db.query(
      'INSERT INTO messages (chat_id,sender_id,type,text,reply_to,forwarded,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [chatId, req.user.id, 'text', text.trim(), reply_to ? JSON.stringify(reply_to) : null, forwarded, expires_at]
    );
    var msg = r.rows[0];

    await updateChatMeta(chatId, req.user.id, text.trim());
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/chats/:chatId/messages/image', auth, upload.single('image'), async function(req, res) {
  try {
    var chatId = req.params.chatId;
    if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });

    var chatRow = await db.query('SELECT participants FROM chats WHERE id=$1', [chatId]);
    if (chatRow.rows.length) {
      var otherPid = chatRow.rows[0].participants.find(function(p) { return String(p) !== String(req.user.id); });
      if (otherPid && await checkBlock(req.user.id, otherPid)) return res.status(403).json({ error: 'blocked' });
    }

    var b64 = req.file.buffer.toString('base64');
    var up  = await cloudinary.uploader.upload('data:' + req.file.mimetype + ';base64,' + b64, {
      folder: 'lumiq/images',
      transformation: [{ quality: 'auto', fetch_format: 'auto' }]
    });

    // FIX 4: قبول reply_to مع الصورة
    var reply_to = req.body.reply_to || null;
    if (reply_to && typeof reply_to === 'string') { try { reply_to = JSON.parse(reply_to); } catch(e) { reply_to = null; } }

    var r   = await db.query(
      'INSERT INTO messages (chat_id,sender_id,type,image_url,text,reply_to) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [chatId, req.user.id, 'image', up.secure_url, 'صورة', reply_to ? JSON.stringify(reply_to) : null]
    );
    var msg = r.rows[0];

    await updateChatMeta(chatId, req.user.id, 'صورة 🖼️');
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/chats/:chatId/messages/audio', auth, upload.single('audio'), async function(req, res) {
  try {
    var chatId   = req.params.chatId;
    var duration = parseInt(req.body.duration) || 0;
    if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });

    var chatRow = await db.query('SELECT participants FROM chats WHERE id=$1', [chatId]);
    if (chatRow.rows.length) {
      var otherPid = chatRow.rows[0].participants.find(function(p) { return String(p) !== String(req.user.id); });
      if (otherPid && await checkBlock(req.user.id, otherPid)) return res.status(403).json({ error: 'blocked' });
    }

    var b64 = req.file.buffer.toString('base64');
    var up  = await cloudinary.uploader.upload('data:' + req.file.mimetype + ';base64,' + b64, {
      folder: 'lumiq/audio',
      resource_type: 'video'
    });

    // FIX 4: قبول reply_to مع الصوت
    var reply_to = req.body.reply_to || null;
    if (reply_to && typeof reply_to === 'string') { try { reply_to = JSON.parse(reply_to); } catch(e) { reply_to = null; } }

    var r   = await db.query(
      'INSERT INTO messages (chat_id,sender_id,type,audio_url,duration,text,reply_to) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [chatId, req.user.id, 'voice', up.secure_url, duration, 'رسالة صوتية', reply_to ? JSON.stringify(reply_to) : null]
    );
    var msg = r.rows[0];

    await updateChatMeta(chatId, req.user.id, '🎤 رسالة صوتية');
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

// ═══ FORWARD — يقبل URL مباشرة بدون re-upload ═══
app.post('/api/chats/:chatId/messages/forward', auth, async function(req, res) {
  try {
    var chatId    = req.params.chatId;
    var type      = req.body.type || 'text';
    var audio_url = req.body.audio_url || null;
    var image_url = req.body.image_url || null;
    var text      = req.body.text     || null;
    var duration  = parseInt(req.body.duration) || 0;

    // التحقق من الحظر
    var chatRow = await db.query('SELECT participants FROM chats WHERE id=$1', [chatId]);
    if (chatRow.rows.length) {
      var otherPid = chatRow.rows[0].participants.find(function(p) { return String(p) !== String(req.user.id); });
      if (otherPid && await checkBlock(req.user.id, otherPid)) return res.status(403).json({ error: 'blocked' });
    }

    var r, msg, lastMsg;
    if (type === 'voice' && audio_url) {
      r = await db.query(
        'INSERT INTO messages (chat_id,sender_id,type,audio_url,duration,text,forwarded) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING *',
        [chatId, req.user.id, 'voice', audio_url, duration, 'رسالة صوتية']
      );
      msg = r.rows[0];
      lastMsg = '🎤 رسالة صوتية';
    } else if (type === 'image' && image_url) {
      r = await db.query(
        'INSERT INTO messages (chat_id,sender_id,type,image_url,text,forwarded) VALUES ($1,$2,$3,$4,$5,true) RETURNING *',
        [chatId, req.user.id, 'image', image_url, 'صورة']
      );
      msg = r.rows[0];
      lastMsg = 'صورة 🖼️';
    } else {
      if (!text || !text.trim()) return res.status(400).json({ error: 'بيانات ناقصة' });
      r = await db.query(
        'INSERT INTO messages (chat_id,sender_id,type,text,forwarded) VALUES ($1,$2,$3,$4,true) RETURNING *',
        [chatId, req.user.id, 'text', text.trim()]
      );
      msg = r.rows[0];
      lastMsg = text.trim();
    }

    await updateChatMeta(chatId, req.user.id, lastMsg);
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.put('/api/messages/:id', auth, async function(req, res) {
  try {
    var text  = req.body.text;
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
    // FIX: إرسال id بدلاً من msg_id ليتوافق مع الـ frontend
    io.to(check.rows[0].chat_id).emit('delete_message', { id: parseInt(req.params.id) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/messages/:id/react', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT reactions, chat_id FROM messages WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'غير موجود' });
    var reactions = r.rows[0].reactions || {};
    var chatId    = r.rows[0].chat_id;
    // toggle
    if (reactions[req.user.id] === req.body.emoji) {
      delete reactions[req.user.id];
    } else {
      reactions[req.user.id] = req.body.emoji;
    }
    await db.query('UPDATE messages SET reactions=$1 WHERE id=$2', [JSON.stringify(reactions), req.params.id]);
    io.to(chatId).emit('reaction', { msg_id: parseInt(req.params.id), reactions });
    res.json({ reactions });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/chats/:chatId/read', auth, async function(req, res) {
  try {
    await db.query('UPDATE messages SET seen=true WHERE chat_id=$1 AND sender_id!=$2 AND seen=false', [req.params.chatId, req.user.id]);
    var chatRow = await db.query('SELECT unread_count FROM chats WHERE id=$1', [req.params.chatId]);
    if (chatRow.rows.length) {
      var uc = chatRow.rows[0].unread_count || {};
      uc[String(req.user.id)] = 0;
      await db.query('UPDATE chats SET unread_count=$1 WHERE id=$2', [JSON.stringify(uc), req.params.chatId]);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ═══ NOTIFICATIONS ═══
app.get('/api/notifications', auth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT n.*, (SELECT COUNT(*) FROM notification_reads nr WHERE nr.notification_id=n.id AND nr.user_id=$1) as is_read FROM notifications n ORDER BY n.created_at DESC LIMIT 50',
      [req.user.id]
    );
    // FIX: إرجاع array مباشرة بدلاً من { notifications: [] }
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/notifications/read', auth, async function(req, res) {
  try {
    var ids = req.body.ids || [];
    if (!ids.length) {
      var all = await db.query('SELECT id FROM notifications');
      ids = all.rows.map(function(row) { return row.id; });
    }
    for (var i = 0; i < ids.length; i++) {
      await db.query(
        'INSERT INTO notification_reads (user_id, notification_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.user.id, ids[i]]
      ).catch(function(){});
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ═══ ADMIN ═══
app.get('/api/admin/stats', adminAuth, async function(req, res) {
  try {
    var [users, messages, images, voice, chats, online, today_u, today_m] = await Promise.all([
      db.query('SELECT COUNT(*) as c FROM users'),
      db.query('SELECT COUNT(*) as c FROM messages'),
      db.query("SELECT COUNT(*) as c FROM messages WHERE type='image'"),
      db.query("SELECT COUNT(*) as c FROM messages WHERE type='voice'"),
      db.query('SELECT COUNT(*) as c FROM chats'),
      db.query('SELECT COUNT(*) as c FROM users WHERE is_online=true'),
      db.query("SELECT COUNT(*) as c FROM users WHERE created_at > NOW() - INTERVAL '24 hours'"),
      db.query("SELECT COUNT(*) as c FROM messages WHERE created_at > NOW() - INTERVAL '24 hours'")
    ]);
    res.json({
      users:            parseInt(users.rows[0].c),
      messages:         parseInt(messages.rows[0].c),
      images:           parseInt(images.rows[0].c),
      voice:            parseInt(voice.rows[0].c),
      chats:            parseInt(chats.rows[0].c),
      online:           parseInt(online.rows[0].c),
      new_users_today:  parseInt(today_u.rows[0].c),
      messages_today:   parseInt(today_m.rows[0].c)
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', adminAuth, async function(req, res) {
  try {
    var page   = parseInt(req.query.page) || 1;
    var search = req.query.search ? '%' + req.query.search + '%' : '%';
    var r      = await db.query(
      'SELECT id,name,username,email,photo_url,is_online,is_banned,is_verified,last_seen,created_at,ban_reason FROM users WHERE username ILIKE $1 OR name ILIKE $1 OR email ILIKE $1 ORDER BY created_at DESC LIMIT 50 OFFSET $2',
      [search, (page-1)*50]
    );
    res.json(r.rows); // FIX: array مباشرة
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id', adminAuth, async function(req, res) {
  try {
    var uid = req.params.id;
    await db.query('DELETE FROM messages WHERE sender_id=$1', [uid]);
    await db.query("DELETE FROM chats WHERE $1=ANY(participants)", [String(uid)]);
    await db.query('DELETE FROM users WHERE id=$1', [uid]);
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
    if (banned && onlineUsers[String(req.params.id)]) {
      io.to(onlineUsers[String(req.params.id)]).emit('force_logout', { type: 'ban', reason });
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

// FIX: messages يُرجع image_url + audio_url + sender_photo + type filter
app.get('/api/admin/messages', adminAuth, async function(req, res) {
  try {
    var type  = req.query.type || null;
    var query = type
      ? 'SELECT m.id,m.text,m.type,m.image_url,m.audio_url,m.duration,m.created_at,u.name as sender_name,u.username as sender_username,u.photo_url as sender_photo FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.type=$1 ORDER BY m.created_at DESC LIMIT 50'
      : 'SELECT m.id,m.text,m.type,m.image_url,m.audio_url,m.duration,m.created_at,u.name as sender_name,u.username as sender_username,u.photo_url as sender_photo FROM messages m JOIN users u ON m.sender_id=u.id ORDER BY m.created_at DESC LIMIT 50';
    var r = type ? await db.query(query, [type]) : await db.query(query);
    res.json(r.rows);
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
    var r    = await db.query(
      "SELECT m.id,m.image_url,m.created_at,u.name as sender_name,u.photo_url as sender_photo FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.type='image' ORDER BY m.created_at DESC LIMIT 20 OFFSET $1",
      [(page-1)*20]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// FIX: PUT users يدعم is_banned + is_verified + ban_reason
app.put('/api/admin/users/:id', adminAuth, async function(req, res) {
  try {
    var b = req.body;
    var updates = [];
    var vals    = [];
    var i       = 1;
    if (b.name       !== undefined) { updates.push('name=$'       + i++); vals.push(b.name); }
    if (b.username   !== undefined) { updates.push('username=$'   + i++); vals.push(b.username); }
    if (b.email      !== undefined) { updates.push('email=$'      + i++); vals.push(b.email); }
    if (b.bio        !== undefined) { updates.push('bio=$'        + i++); vals.push(b.bio); }
    if (b.is_banned  !== undefined) { updates.push('is_banned=$'  + i++); vals.push(b.is_banned);
      if (b.is_banned && onlineUsers[String(req.params.id)]) {
        io.to(onlineUsers[String(req.params.id)]).emit('force_logout', { type: 'ban', reason: b.ban_reason || 'تم حظرك' });
      }
    }
    if (b.ban_reason !== undefined) { updates.push('ban_reason=$' + i++); vals.push(b.ban_reason); }
    if (b.is_verified!== undefined) { updates.push('is_verified=$'+ i++); vals.push(b.is_verified);
      if (onlineUsers[String(req.params.id)]) {
        io.to(onlineUsers[String(req.params.id)]).emit('verified', { is_verified: b.is_verified });
      }
    }
    if (!updates.length) return res.json({ ok: true });
    vals.push(req.params.id);
    await db.query('UPDATE users SET ' + updates.join(',') + ' WHERE id=$' + i, vals);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users/:id/chats', adminAuth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT c.*,(SELECT COUNT(*) FROM messages m WHERE m.chat_id=c.id) as msg_count FROM chats c WHERE $1=ANY(c.participants) ORDER BY c.last_message_at DESC',
      [String(req.params.id)]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/chats/:id', adminAuth, async function(req, res) {
  try {
    await db.query('DELETE FROM messages WHERE chat_id=$1', [req.params.id]);
    await db.query('DELETE FROM chats WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// FIX: chats يُرجع أسماء وصور المستخدمين
app.get('/api/admin/chats', adminAuth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT c.id,c.participants,c.last_message,c.last_message_at,(SELECT COUNT(*) FROM messages m WHERE m.chat_id=c.id) as msg_count FROM chats c ORDER BY c.last_message_at DESC NULLS LAST LIMIT 50'
    );
    var chats = r.rows;
    // جلب بيانات المستخدمين لكل محادثة
    var allIds = [];
    chats.forEach(function(c) { if (c.participants) c.participants.forEach(function(p) { if (!allIds.includes(String(p))) allIds.push(String(p)); }); });
    var usersMap = {};
    if (allIds.length) {
      var uRes = await db.query('SELECT id,name,username,photo_url FROM users WHERE id=ANY($1::int[])', [allIds]);
      uRes.rows.forEach(function(u) { usersMap[String(u.id)] = u; });
    }
    chats = chats.map(function(c) {
      var parts = c.participants || [];
      var u1 = usersMap[String(parts[0])] || {};
      var u2 = usersMap[String(parts[1])] || {};
      return Object.assign({}, c, {
        user1_name: u1.name, user1_photo: u1.photo_url,
        user2_name: u2.name, user2_photo: u2.photo_url
      });
    });
    res.json(chats);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/chats/:id/messages', adminAuth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT m.*,u.name as sender_name,u.username,u.photo_url as sender_photo FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.chat_id=$1 ORDER BY m.created_at DESC LIMIT 50',
      [req.params.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/:id/password', adminAuth, async function(req, res) {
  try {
    var hash = await bcrypt.hash(req.body.password, 10);
    await db.query('UPDATE users SET password=$1 WHERE id=$2', [hash, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id/photo', adminAuth, async function(req, res) {
  try {
    await db.query("UPDATE users SET photo_url='' WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/broadcast', adminAuth, async function(req, res) {
  try {
    var title   = s(req.body.title)   || 'LUMIQ';
    var message = s(req.body.message) || '';
    if (!message) return res.status(400).json({ error: 'الرسالة مطلوبة' });
    var r     = await db.query('INSERT INTO notifications (title, message) VALUES ($1, $2) RETURNING *', [title, message]);
    var notif = r.rows[0];
    io.emit('broadcast', { id: notif.id, title, message, created_at: notif.created_at });
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/admin/notifications', adminAuth, async function(req, res) {
  try {
    var r = await db.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/notifications/:id', adminAuth, async function(req, res) {
  try {
    await db.query('DELETE FROM notifications WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/blocks', adminAuth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT b.*,u1.name as blocker_name,u1.username as blocker_username,u1.photo_url as blocker_photo,u2.name as blocked_name,u2.username as blocked_username,u2.photo_url as blocked_photo FROM blocks b JOIN users u1 ON b.blocker_id=u1.id JOIN users u2 ON b.blocked_id=u2.id ORDER BY b.id DESC LIMIT 200'
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/blocks', adminAuth, async function(req, res) {
  try {
    var blocker = req.query.blocker, blocked = req.query.blocked;
    if (!blocker || !blocked) return res.status(400).json({ error: 'مطلوب blocker و blocked' });
    await db.query('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [blocker, blocked]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/friends', adminAuth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT f.*,u1.name as requester_name,u1.username as requester_username,u1.photo_url as requester_photo,u2.name as addressee_name,u2.username as addressee_username,u2.photo_url as addressee_photo FROM friendships f JOIN users u1 ON f.requester_id=u1.id JOIN users u2 ON f.addressee_id=u2.id ORDER BY f.id DESC LIMIT 200'
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/online', adminAuth, function(req, res) {
  res.json({ count: Object.keys(onlineUsers).length, users: Object.keys(onlineUsers) });
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

      // انضمام لجميع غرف المحادثات
      var chats = await db.query('SELECT id FROM chats WHERE $1=ANY(participants)', [String(user.id)]);
      chats.rows.forEach(function(c) { socket.join(c.id); });

      // FIX: إرسال الإشعارات المعلقة كـ array مباشرة (يتوافق مع frontend)
      var pending = await db.query(
        'SELECT n.* FROM notifications n WHERE n.id NOT IN (SELECT notification_id FROM notification_reads WHERE user_id=$1) ORDER BY n.created_at ASC',
        [user.id]
      );
      if (pending.rows.length > 0) {
        socket.emit('pending_notifications', pending.rows);
      }

      // FIX: إرسال طلبات الصداقة المعلقة كـ array مباشرة (يتوافق مع frontend)
      var pendingFriends = await db.query(
        'SELECT u.id,u.name,u.username,u.photo_url,u.is_verified FROM friendships f JOIN users u ON f.requester_id=u.id WHERE f.addressee_id=$1 AND f.status=$2',
        [user.id, 'pending']
      );
      if (pendingFriends.rows.length > 0) {
        socket.emit('pending_friend_requests', pendingFriends.rows);
      }
    } catch(e) { console.error('join error:', e.message); }
  });

  socket.on('join_chat', function(data) {
    if (data && data.chat_id) socket.join(data.chat_id);
  });

  // ── يستمع لرسالة صوتية ──
  socket.on('listening_voice', function(data) {
    if (!data || !data.chat_id) return;
    socket.to(data.chat_id).emit('partner_listening', {
      user_id:    socket.userId,
      chat_id:    data.chat_id,
      is_listening: !!data.is_listening,
      msg_id:     data.msg_id || null
    });
  });


  // ── تحديث البطارية ──
  socket.on('battery_update', async function(data) {
    if (!socket.userId || data.level === undefined) return;
    var level = Math.round(Math.max(0, Math.min(100, Number(data.level))));
    try {
      await db.query('UPDATE users SET battery_level=$1 WHERE id=$2', [level, socket.userId]);
      socket.broadcast.emit('battery_changed', { user_id: socket.userId, level: level });
    } catch(e) {}
  });

  socket.on('viewing_chat', function(data) {
    if (!data || !data.chat_id) return;
    socket.to(data.chat_id).emit('partner_viewing', {
      user_id:    socket.userId,
      chat_id:    data.chat_id,
      is_viewing: !!data.is_viewing,
      _reply:     !!data._reply
    });
  });

  socket.on('typing', function(data) {
    if (data && data.chat_id) {
      socket.to(data.chat_id).emit('typing', {
        chat_id:   data.chat_id,
        user_id:   data.user_id,
        is_typing: !!data.is_typing
      });
    }
  });

  socket.on('messages_seen', function(data) {
    if (data.partner_id && onlineUsers[String(data.partner_id)]) {
      io.to(onlineUsers[String(data.partner_id)]).emit('messages_seen', {
        chat_id:   data.chat_id,
        reader_id: data.reader_id
      });
    }
  });

  socket.on('call_request', async function(data) {
    try {
      if (socket.userId) {
        var blocked = await db.query(
          'SELECT id FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',
          [socket.userId, data.to_user_id]
        );
        if (blocked.rows.length) {
          socket.emit('call_failed', { reason: 'لا يمكن الاتصال بهذا المستخدم' });
          return;
        }
      }
      var toSocket = onlineUsers[String(data.to_user_id)];
      if (toSocket) {
        io.to(toSocket).emit('call_incoming', {
          from_user_id: data.from_user ? data.from_user.id : socket.userId,
          from_name:    data.from_user ? data.from_user.name : 'مجهول',
          from_photo:   data.from_user ? data.from_user.photo_url : null,
          from_user:    data.from_user,
          chat_id:      data.chat_id,
          socket_id:    socket.id
        });
      } else {
        socket.emit('call_failed', { reason: 'المستخدم غير متصل حالياً' });
      }
    } catch(e) {
      console.error('call_request error:', e.message);
      socket.emit('call_failed', { reason: 'خطأ في الاتصال' });
    }
  });

  socket.on('call_accept', function(d) {
    if (d.to_socket_id) {
      io.to(d.to_socket_id).emit('call_accepted', { from_user: d.from_user, socket_id: socket.id });
    }
  });

  socket.on('call_reject', function(d) {
    if (d.to_socket_id) {
      io.to(d.to_socket_id).emit('call_rejected', { reason: d.reason || 'rejected' });
    } else if (d.to_user_id && onlineUsers[String(d.to_user_id)]) {
      io.to(onlineUsers[String(d.to_user_id)]).emit('call_rejected', { reason: d.reason || 'rejected' });
    }
  });

  socket.on('call_end', function(d) {
    if (d.to_socket_id) {
      io.to(d.to_socket_id).emit('call_ended');
    } else if (d.to_user_id && onlineUsers[String(d.to_user_id)]) {
      io.to(onlineUsers[String(d.to_user_id)]).emit('call_ended');
    }
  });

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

// ═══ START ═══
initDB().then(function() {
  server.listen(PORT, function() {
    console.log('🚀 LUMIQ Server running on port ' + PORT);
  });

  // حذف الرسائل المؤقتة المنتهية كل 30 ثانية
  setInterval(async function() {
    try {
      var expired = await db.query("SELECT id, chat_id FROM messages WHERE expires_at IS NOT NULL AND expires_at < NOW()");
      if (!expired.rows.length) return;
      var ids = expired.rows.map(function(r) { return r.id; });
      await db.query('DELETE FROM messages WHERE id = ANY($1)', [ids]);
      // تجميع حسب المحادثة وإرسال delete_message لكل رسالة
      var chatGroups = {};
      expired.rows.forEach(function(r) {
        if (!chatGroups[r.chat_id]) chatGroups[r.chat_id] = [];
        chatGroups[r.chat_id].push(r.id);
      });
      Object.keys(chatGroups).forEach(function(cid) {
        chatGroups[cid].forEach(function(mid) {
          // FIX: إرسال id ليتوافق مع الـ frontend
          io.to(cid).emit('delete_message', { id: mid });
        });
      });
    } catch(e) { console.error('Cleanup error:', e.message); }
  }, 30000);

}).catch(function(e) {
  console.error('❌ DB Error:', e);
  process.exit(1);
});
