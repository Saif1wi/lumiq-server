const express   = require('express');
const http      = require('http');
const { Server } = require('socket.io');
const { Pool }  = require('pg');
const multer    = require('multer');
const cloudinary = require('cloudinary').v2;
const cors      = require('cors');
const path      = require('path');
const crypto    = require('crypto');

// ════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════
const PORT         = process.env.PORT         || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/lumiq_rooms';
const ADMIN_KEY    = process.env.ADMIN_KEY    || 'admin_secret_key';
const OWNER_SHARE  = 0.25; // 25% لصاحب الغرفة من كل هدية

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD  || 'your_cloud_name',
  api_key:    process.env.CLOUDINARY_KEY    || 'your_api_key',
  api_secret: process.env.CLOUDINARY_SECRET || 'your_api_secret'
});

// ════════════════════════════════════════════
// DB POOL
// ════════════════════════════════════════════
const db = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// ════════════════════════════════════════════
// DB INIT — إنشاء الجداول
// ════════════════════════════════════════════
async function initDB() {
  // جدول المستخدمين
  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    photo_url TEXT DEFAULT '',
    coins INT DEFAULT 1000,
    total_earned INT DEFAULT 0,
    is_banned BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  // جدول الغرف
  await db.query(`CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    owner_id INT REFERENCES users(id) ON DELETE SET NULL,
    background_id INT DEFAULT NULL,
    cover_url TEXT DEFAULT '',
    is_locked BOOLEAN DEFAULT false,
    password TEXT DEFAULT '',
    max_users INT DEFAULT 100,
    coins_earned INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  // جدول الخلفيات/الصور (يديرها الأدمن)
  await db.query(`CREATE TABLE IF NOT EXISTS backgrounds (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT DEFAULT '',
    type TEXT DEFAULT 'color',
    value TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  // جدول الهدايا (يديرها الأدمن)
  await db.query(`CREATE TABLE IF NOT EXISTS gifts (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '🎁',
    image_url TEXT DEFAULT '',
    price INT NOT NULL DEFAULT 10,
    animation TEXT DEFAULT 'bounce',
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  // جدول رسائل الغرف
  await db.query(`CREATE TABLE IF NOT EXISTS room_messages (
    id SERIAL PRIMARY KEY,
    room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    type TEXT DEFAULT 'text',
    text TEXT,
    gift_id INT REFERENCES gifts(id),
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  // جدول سجل الهدايا
  await db.query(`CREATE TABLE IF NOT EXISTS gift_logs (
    id SERIAL PRIMARY KEY,
    room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
    sender_id INT REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INT REFERENCES users(id) ON DELETE SET NULL,
    gift_id INT REFERENCES gifts(id) ON DELETE SET NULL,
    gift_name TEXT,
    amount INT NOT NULL,
    owner_share INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  // جدول أعضاء الغرف (لإدارة الحظر والمشرفين)
  await db.query(`CREATE TABLE IF NOT EXISTS room_members (
    room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    is_muted BOOLEAN DEFAULT false,
    joined_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY(room_id, user_id)
  )`);

  // إدراج بيانات تجريبية إذا كانت الجداول فارغة
  const giftsCount = await db.query('SELECT COUNT(*) FROM gifts');
  if (parseInt(giftsCount.rows[0].count) === 0) {
    await db.query(`INSERT INTO gifts (name, emoji, price, animation, sort_order) VALUES
      ('وردة', '🌹', 10, 'bounce', 1),
      ('قلب', '❤️', 20, 'pulse', 2),
      ('تاج', '👑', 50, 'spin', 3),
      ('ماسة', '💎', 100, 'sparkle', 4),
      ('صاروخ', '🚀', 200, 'rocket', 5),
      ('نار', '🔥', 30, 'shake', 6),
      ('نجمة', '⭐', 15, 'twinkle', 7),
      ('كيك', '🎂', 80, 'bounce', 8)
    `);
  }

  const bgCount = await db.query('SELECT COUNT(*) FROM backgrounds');
  if (parseInt(bgCount.rows[0].count) === 0) {
    await db.query(`INSERT INTO backgrounds (name, type, value, url, thumbnail_url, sort_order) VALUES
      ('سماء زرقاء', 'gradient', 'linear-gradient(135deg,#1a1a2e,#16213e)', '', '', 1),
      ('غروب الشمس', 'gradient', 'linear-gradient(135deg,#f093fb,#f5576c)', '', '', 2),
      ('الطبيعة', 'gradient', 'linear-gradient(135deg,#11998e,#38ef7d)', '', '', 3),
      ('الفضاء', 'gradient', 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)', '', '', 4),
      ('ذهبي', 'gradient', 'linear-gradient(135deg,#f7971e,#ffd200)', '', '', 5),
      ('ليلي', 'gradient', 'linear-gradient(135deg,#1a1a2e,#0f3460)', '', '', 6)
    `);
  }

  // فهارس الأداء
  await db.query('CREATE INDEX IF NOT EXISTS idx_room_messages_room ON room_messages(room_id, created_at DESC)').catch(()=>{});
  await db.query('CREATE INDEX IF NOT EXISTS idx_gift_logs_room ON gift_logs(room_id, created_at DESC)').catch(()=>{});

  console.log('✅ DB جاهز');
}

// ════════════════════════════════════════════
// MULTER — رفع الملفات في الذاكرة
// ════════════════════════════════════════════
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('الملف يجب أن يكون صورة'));
    cb(null, true);
  }
});

// ════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════
function s(v) { return v ? String(v).trim() : ''; }
function genRoomId() { return 'R' + crypto.randomInt(100000, 999999); }

function verifyAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.adminKey;
  if (key !== ADMIN_KEY) return res.status(403).json({ error: 'غير مصرح' });
  next();
}

async function uploadToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', quality: 'auto', fetch_format: 'auto' },
      (err, result) => err ? reject(err) : resolve(result)
    );
    stream.end(buffer);
  });
}

// Rate limiter بسيط
const _rl = {};
function rateLimit(max, ms) {
  return (req, res, next) => {
    const ip = req.ip || 'x';
    const now = Date.now();
    if (!_rl[ip]) _rl[ip] = [];
    _rl[ip] = _rl[ip].filter(t => now - t < ms);
    if (_rl[ip].length >= max) return res.status(429).json({ error: 'طلبات كثيرة' });
    _rl[ip].push(now);
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  Object.keys(_rl).forEach(ip => {
    _rl[ip] = _rl[ip].filter(t => now - t < 900000);
    if (!_rl[ip].length) delete _rl[ip];
  });
}, 300000);

// ════════════════════════════════════════════
// EXPRESS + SOCKET.IO
// ════════════════════════════════════════════
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ════════════════════════════════════════════
// REST API — المستخدمون
// ════════════════════════════════════════════

// تسجيل مستخدم جديد
app.post('/api/register', rateLimit(5, 60000), async (req, res) => {
  try {
    const { name, username, password } = req.body;
    if (!s(name) || !s(username) || !s(password)) return res.status(400).json({ error: 'بيانات ناقصة' });
    if (s(username).length < 3) return res.status(400).json({ error: 'اسم المستخدم قصير' });
    if (s(password).length < 6) return res.status(400).json({ error: 'كلمة المرور قصيرة' });

    const exists = await db.query('SELECT id FROM users WHERE username=$1', [s(username).toLowerCase()]);
    if (exists.rows.length) return res.status(400).json({ error: 'اسم المستخدم محجوز' });

    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(s(password), 10);
    const r = await db.query(
      'INSERT INTO users (name, username, password, coins) VALUES ($1,$2,$3,1000) RETURNING id,name,username,coins,photo_url',
      [s(name), s(username).toLowerCase(), hash]
    );
    res.json({ user: r.rows[0] });
  } catch(e) {
    console.error('register:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// تسجيل الدخول
app.post('/api/login', rateLimit(10, 60000), async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!s(username) || !s(password)) return res.status(400).json({ error: 'بيانات ناقصة' });

    const r = await db.query('SELECT * FROM users WHERE username=$1', [s(username).toLowerCase()]);
    if (!r.rows.length) return res.status(401).json({ error: 'بيانات غير صحيحة' });
    const user = r.rows[0];
    if (user.is_banned) return res.status(403).json({ error: 'الحساب محظور' });

    const bcrypt = require('bcryptjs');
    const ok = await bcrypt.compare(s(password), user.password);
    if (!ok) return res.status(401).json({ error: 'بيانات غير صحيحة' });

    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch(e) {
    console.error('login:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// رصيد مستخدم
app.get('/api/users/:id/coins', async (req, res) => {
  try {
    const r = await db.query('SELECT id, name, coins, total_earned FROM users WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'مستخدم غير موجود' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ════════════════════════════════════════════
// REST API — الغرف
// ════════════════════════════════════════════

// قائمة الغرف
app.get('/api/rooms', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT rm.*, u.name as owner_name, u.photo_url as owner_photo,
             bg.value as bg_value, bg.url as bg_url, bg.type as bg_type
      FROM rooms rm
      LEFT JOIN users u ON rm.owner_id = u.id
      LEFT JOIN backgrounds bg ON rm.background_id = bg.id
      ORDER BY rm.created_at DESC
    `);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// إنشاء غرفة
app.post('/api/rooms', rateLimit(3, 60000), async (req, res) => {
  try {
    const { name, description, owner_id, is_locked, password } = req.body;
    if (!s(name) || !owner_id) return res.status(400).json({ error: 'بيانات ناقصة' });

    const owner = await db.query('SELECT id FROM users WHERE id=$1 AND is_banned=false', [owner_id]);
    if (!owner.rows.length) return res.status(403).json({ error: 'غير مصرح' });

    const id = genRoomId();
    const r = await db.query(
      `INSERT INTO rooms (id, name, description, owner_id, is_locked, password)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, s(name), s(description), owner_id, !!is_locked, is_locked ? s(password) : '']
    );
    res.json(r.rows[0]);
  } catch(e) {
    console.error('create room:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// معلومات غرفة
app.get('/api/rooms/:id', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT rm.*, u.name as owner_name, u.photo_url as owner_photo,
             bg.value as bg_value, bg.url as bg_url, bg.type as bg_type
      FROM rooms rm
      LEFT JOIN users u ON rm.owner_id = u.id
      LEFT JOIN backgrounds bg ON rm.background_id = bg.id
      WHERE rm.id=$1
    `, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'غرفة غير موجودة' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// آخر رسائل الغرفة
app.get('/api/rooms/:id/messages', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const r = await db.query(`
      SELECT m.*, u.name as user_name, u.photo_url as user_photo, u.is_verified,
             g.name as gift_name, g.emoji as gift_emoji, g.price as gift_price, g.animation as gift_animation
      FROM room_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN gifts g ON m.gift_id = g.id
      WHERE m.room_id=$1
      ORDER BY m.created_at DESC LIMIT $2
    `, [req.params.id, limit]);
    res.json(r.rows.reverse());
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ════════════════════════════════════════════
// REST API — الخلفيات
// ════════════════════════════════════════════

app.get('/api/backgrounds', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM backgrounds WHERE is_active=true ORDER BY sort_order ASC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ════════════════════════════════════════════
// REST API — الهدايا
// ════════════════════════════════════════════

app.get('/api/gifts', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM gifts WHERE is_active=true ORDER BY sort_order ASC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ════════════════════════════════════════════
// ADMIN API — لوحة التحكم
// ════════════════════════════════════════════

// تحقق من مفتاح الأدمن
app.post('/api/admin/verify', (req, res) => {
  const { key } = req.body;
  if (key === ADMIN_KEY) return res.json({ ok: true });
  res.status(403).json({ error: 'مفتاح خاطئ' });
});

// ── إدارة الخلفيات ──

// رفع خلفية جديدة
app.post('/api/admin/backgrounds', verifyAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, type, value } = req.body;
    if (!s(name)) return res.status(400).json({ error: 'الاسم مطلوب' });

    let url = '', thumbnail_url = '';
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'lumiq/backgrounds');
      url = result.secure_url;
      thumbnail_url = result.secure_url.replace('/upload/', '/upload/w_200,h_200,c_fill/');
    }

    const maxOrder = await db.query('SELECT COALESCE(MAX(sort_order),0) as m FROM backgrounds');
    const r = await db.query(
      `INSERT INTO backgrounds (name, type, value, url, thumbnail_url, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [s(name), s(type)||'image', s(value), url, thumbnail_url, maxOrder.rows[0].m + 1]
    );
    io.emit('backgrounds_updated');
    res.json(r.rows[0]);
  } catch(e) {
    console.error('upload bg:', e.message);
    res.status(500).json({ error: 'فشل الرفع: ' + e.message });
  }
});

// تعديل خلفية
app.put('/api/admin/backgrounds/:id', verifyAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, type, value, is_active, sort_order } = req.body;
    let url = null, thumbnail_url = null;

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'lumiq/backgrounds');
      url = result.secure_url;
      thumbnail_url = result.secure_url.replace('/upload/', '/upload/w_200,h_200,c_fill/');
    }

    const existing = await db.query('SELECT * FROM backgrounds WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'غير موجود' });
    const bg = existing.rows[0];

    const r = await db.query(
      `UPDATE backgrounds SET
        name=$1, type=$2, value=$3, is_active=$4, sort_order=$5,
        url=COALESCE($6, url), thumbnail_url=COALESCE($7, thumbnail_url)
       WHERE id=$8 RETURNING *`,
      [
        s(name)||bg.name, s(type)||bg.type, s(value)!==''?s(value):bg.value,
        is_active!==undefined ? !!JSON.parse(is_active) : bg.is_active,
        sort_order ? parseInt(sort_order) : bg.sort_order,
        url, thumbnail_url,
        req.params.id
      ]
    );
    io.emit('backgrounds_updated');
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// حذف خلفية
app.delete('/api/admin/backgrounds/:id', verifyAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM backgrounds WHERE id=$1', [req.params.id]);
    io.emit('backgrounds_updated');
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// كل الخلفيات (للأدمن)
app.get('/api/admin/backgrounds', verifyAdmin, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM backgrounds ORDER BY sort_order ASC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ── إدارة الهدايا ──

app.get('/api/admin/gifts', verifyAdmin, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM gifts ORDER BY sort_order ASC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/admin/gifts', verifyAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, emoji, price, animation } = req.body;
    if (!s(name) || !price) return res.status(400).json({ error: 'بيانات ناقصة' });

    let image_url = '';
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'lumiq/gifts');
      image_url = result.secure_url;
    }

    const maxOrder = await db.query('SELECT COALESCE(MAX(sort_order),0) as m FROM gifts');
    const r = await db.query(
      `INSERT INTO gifts (name, emoji, price, animation, image_url, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [s(name), s(emoji)||'🎁', parseInt(price)||10, s(animation)||'bounce', image_url, maxOrder.rows[0].m + 1]
    );
    io.emit('gifts_updated');
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/gifts/:id', verifyAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, emoji, price, animation, is_active } = req.body;
    const ex = await db.query('SELECT * FROM gifts WHERE id=$1', [req.params.id]);
    if (!ex.rows.length) return res.status(404).json({ error: 'غير موجود' });
    const g = ex.rows[0];

    let image_url = g.image_url;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'lumiq/gifts');
      image_url = result.secure_url;
    }

    const r = await db.query(
      `UPDATE gifts SET name=$1,emoji=$2,price=$3,animation=$4,is_active=$5,image_url=$6 WHERE id=$7 RETURNING *`,
      [s(name)||g.name, s(emoji)||g.emoji, price?parseInt(price):g.price,
       s(animation)||g.animation, is_active!==undefined?!!JSON.parse(is_active):g.is_active,
       image_url, req.params.id]
    );
    io.emit('gifts_updated');
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/gifts/:id', verifyAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM gifts WHERE id=$1', [req.params.id]);
    io.emit('gifts_updated');
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── إدارة الغرف والمستخدمين ──

app.get('/api/admin/users', verifyAdmin, async (req, res) => {
  try {
    const r = await db.query(
      'SELECT id,name,username,coins,total_earned,is_banned,is_verified,created_at FROM users ORDER BY created_at DESC'
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.put('/api/admin/users/:id', verifyAdmin, async (req, res) => {
  try {
    const { is_banned, is_verified, coins } = req.body;
    const updates = [];
    const vals    = [];
    let idx = 1;
    if (is_banned !== undefined)   { updates.push(`is_banned=$${idx++}`);   vals.push(!!is_banned); }
    if (is_verified !== undefined) { updates.push(`is_verified=$${idx++}`); vals.push(!!is_verified); }
    if (coins !== undefined)       { updates.push(`coins=$${idx++}`);       vals.push(parseInt(coins)); }
    if (!updates.length) return res.status(400).json({ error: 'لا توجد بيانات' });
    vals.push(req.params.id);
    await db.query(`UPDATE users SET ${updates.join(',')} WHERE id=$${idx}`, vals);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/rooms', verifyAdmin, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT rm.*, u.name as owner_name
      FROM rooms rm LEFT JOIN users u ON rm.owner_id=u.id
      ORDER BY rm.created_at DESC
    `);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.delete('/api/admin/rooms/:id', verifyAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM rooms WHERE id=$1', [req.params.id]);
    io.to(req.params.id).emit('room_deleted', { room_id: req.params.id });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// إحصائيات لوحة التحكم
app.get('/api/admin/stats', verifyAdmin, async (req, res) => {
  try {
    const [users, rooms, gifts_sent, coins_transferred] = await Promise.all([
      db.query('SELECT COUNT(*) as c FROM users'),
      db.query('SELECT COUNT(*) as c FROM rooms'),
      db.query('SELECT COUNT(*) as c FROM gift_logs'),
      db.query('SELECT COALESCE(SUM(amount),0) as c FROM gift_logs')
    ]);
    res.json({
      users: parseInt(users.rows[0].c),
      rooms: parseInt(rooms.rows[0].c),
      gifts_sent: parseInt(gifts_sent.rows[0].c),
      coins_transferred: parseInt(coins_transferred.rows[0].c)
    });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ════════════════════════════════════════════
// SOCKET.IO — الغرف الفورية
// ════════════════════════════════════════════

// خريطة: socketId → { userId, roomId, name, photo }
const connectedUsers = {};
// خريطة: roomId → Set<socketId>
const roomUsers = {};

function getRoomUserCount(roomId) {
  return roomUsers[roomId] ? roomUsers[roomId].size : 0;
}

function getRoomUserList(roomId) {
  if (!roomUsers[roomId]) return [];
  return [...roomUsers[roomId]].map(sid => connectedUsers[sid]).filter(Boolean);
}

io.on('connection', (socket) => {
  console.log('🔌 اتصال جديد:', socket.id);

  // ── انضمام للغرفة ──
  socket.on('join_room', async (data) => {
    try {
      const { room_id, user_id, name, photo } = data;
      if (!room_id || !user_id || !name) return;

      // التحقق من وجود الغرفة
      const roomRow = await db.query('SELECT * FROM rooms WHERE id=$1', [room_id]);
      if (!roomRow.rows.length) {
        socket.emit('error', { message: 'الغرفة غير موجودة' });
        return;
      }

      // التحقق من عدم الحظر
      const member = await db.query(
        'SELECT * FROM room_members WHERE room_id=$1 AND user_id=$2',
        [room_id, user_id]
      );
      if (member.rows.length && member.rows[0].is_muted) {
        socket.emit('error', { message: 'أنت محظور في هذه الغرفة' });
        return;
      }

      // إذا كان في غرفة أخرى، أخرج منها أولاً
      if (connectedUsers[socket.id]?.roomId && connectedUsers[socket.id].roomId !== room_id) {
        await leaveRoom(socket);
      }

      // انضم للغرفة
      socket.join(room_id);
      connectedUsers[socket.id] = { userId: user_id, roomId: room_id, name, photo: photo || '' };
      if (!roomUsers[room_id]) roomUsers[room_id] = new Set();
      roomUsers[room_id].add(socket.id);

      // أضف أو حدّث العضو في DB
      await db.query(
        `INSERT INTO room_members (room_id, user_id) VALUES ($1,$2)
         ON CONFLICT (room_id, user_id) DO UPDATE SET joined_at=NOW()`,
        [room_id, user_id]
      );

      // أرسل معلومات الغرفة للمنضم
      const bgRow = await db.query(`
        SELECT bg.* FROM rooms rm LEFT JOIN backgrounds bg ON rm.background_id=bg.id WHERE rm.id=$1
      `, [room_id]);
      socket.emit('room_joined', {
        room: roomRow.rows[0],
        background: bgRow.rows[0] || null,
        users: getRoomUserList(room_id),
        user_count: getRoomUserCount(room_id)
      });

      // أخبر الجميع بالعضو الجديد
      socket.to(room_id).emit('user_joined', {
        user: connectedUsers[socket.id],
        user_count: getRoomUserCount(room_id),
        users: getRoomUserList(room_id)
      });

      console.log(`👤 ${name} انضم لـ ${room_id} (${getRoomUserCount(room_id)} مستخدم)`);
    } catch(e) {
      console.error('join_room error:', e.message);
      socket.emit('error', { message: 'خطأ في الانضمام' });
    }
  });

  // ── إرسال رسالة ──
  socket.on('send_message', async (data) => {
    try {
      const user = connectedUsers[socket.id];
      if (!user) return;
      const { text, type } = data;
      if (!s(text) || s(text).length > 500) return;

      const r = await db.query(
        `INSERT INTO room_messages (room_id, user_id, type, text)
         VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
        [user.roomId, user.userId, type||'text', s(text)]
      );

      const msg = {
        id: r.rows[0].id,
        room_id: user.roomId,
        user_id: user.userId,
        user_name: user.name,
        user_photo: user.photo,
        type: type || 'text',
        text: s(text),
        created_at: r.rows[0].created_at
      };

      io.to(user.roomId).emit('new_message', msg);
    } catch(e) { console.error('send_message:', e.message); }
  });

  // ── إرسال هدية ──
  socket.on('send_gift', async (data) => {
    try {
      const user = connectedUsers[socket.id];
      if (!user || !data.gift_id) return;

      // التحقق من الهدية والسعر على السيرفر
      const giftRow = await db.query('SELECT * FROM gifts WHERE id=$1 AND is_active=true', [data.gift_id]);
      if (!giftRow.rows.length) {
        socket.emit('error', { message: 'هدية غير متاحة' });
        return;
      }
      const gift = giftRow.rows[0];

      // التحقق من رصيد المرسل
      const senderRow = await db.query('SELECT coins FROM users WHERE id=$1', [user.userId]);
      if (!senderRow.rows.length || senderRow.rows[0].coins < gift.price) {
        socket.emit('error', { message: 'رصيدك غير كافٍ' });
        return;
      }

      // احسب حصة صاحب الغرفة
      const ownerShare = Math.floor(gift.price * OWNER_SHARE);

      // تحديث قاعدة البيانات في صفقة واحدة
      await db.query('BEGIN');
      try {
        // خصم من المرسل
        await db.query('UPDATE users SET coins = coins - $1 WHERE id=$2', [gift.price, user.userId]);

        // إضافة حصة الغرفة لصاحبها
        const roomRow = await db.query('SELECT owner_id FROM rooms WHERE id=$1', [user.roomId]);
        const ownerId = roomRow.rows[0]?.owner_id;
        if (ownerId && String(ownerId) !== String(user.userId)) {
          await db.query(
            'UPDATE users SET coins = coins + $1, total_earned = total_earned + $1 WHERE id=$2',
            [ownerShare, ownerId]
          );
          // تحديث coins_earned للغرفة
          await db.query('UPDATE rooms SET coins_earned = coins_earned + $1 WHERE id=$2', [ownerShare, user.roomId]);
        }

        // سجل الهدية
        const logRow = await db.query(
          `INSERT INTO gift_logs (room_id, sender_id, gift_id, gift_name, amount, owner_share)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
          [user.roomId, user.userId, gift.id, gift.name, gift.price, ownerShare]
        );

        // سجل كرسالة في الغرفة
        await db.query(
          'INSERT INTO room_messages (room_id, user_id, type, gift_id) VALUES ($1,$2,$3,$4)',
          [user.roomId, user.userId, 'gift', gift.id]
        );

        await db.query('COMMIT');

        // رصيد المرسل الجديد
        const newBalance = senderRow.rows[0].coins - gift.price;

        // أرسل الهدية للغرفة
        io.to(user.roomId).emit('new_gift', {
          id: logRow.rows[0].id,
          sender_id: user.userId,
          sender_name: user.name,
          sender_photo: user.photo,
          gift: {
            id: gift.id,
            name: gift.name,
            emoji: gift.emoji,
            image_url: gift.image_url,
            price: gift.price,
            animation: gift.animation
          },
          room_id: user.roomId,
          created_at: logRow.rows[0].created_at
        });

        // أرسل رصيد محدث للمرسل
        socket.emit('coins_updated', { coins: newBalance });

        // أرسل رصيد محدث لصاحب الغرفة إذا كان متصلاً
        if (ownerId) {
          const ownerSocket = Object.keys(connectedUsers).find(
            sid => String(connectedUsers[sid].userId) === String(ownerId)
          );
          if (ownerSocket) {
            const ownerBalance = await db.query('SELECT coins FROM users WHERE id=$1', [ownerId]);
            io.to(ownerSocket).emit('coins_updated', { coins: ownerBalance.rows[0].coins });
          }
        }

      } catch(e) {
        await db.query('ROLLBACK');
        throw e;
      }
    } catch(e) {
      console.error('send_gift:', e.message);
      socket.emit('error', { message: 'فشل إرسال الهدية' });
    }
  });

  // ── تغيير خلفية الغرفة ──
  socket.on('change_background', async (data) => {
    try {
      const user = connectedUsers[socket.id];
      if (!user || !data.background_id) return;

      // فقط المالك أو المشرف يمكنه التغيير
      const roomRow = await db.query('SELECT owner_id FROM rooms WHERE id=$1', [user.roomId]);
      const memberRow = await db.query(
        'SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2',
        [user.roomId, user.userId]
      );
      const isOwner = String(roomRow.rows[0]?.owner_id) === String(user.userId);
      const isMod   = memberRow.rows[0]?.role === 'mod';
      if (!isOwner && !isMod) {
        socket.emit('error', { message: 'فقط المالك يمكنه تغيير الخلفية' });
        return;
      }

      const bgRow = await db.query('SELECT * FROM backgrounds WHERE id=$1 AND is_active=true', [data.background_id]);
      if (!bgRow.rows.length) {
        socket.emit('error', { message: 'خلفية غير متاحة' });
        return;
      }

      await db.query('UPDATE rooms SET background_id=$1 WHERE id=$2', [data.background_id, user.roomId]);

      // أرسل التحديث للجميع في الغرفة
      io.to(user.roomId).emit('background_changed', {
        background: bgRow.rows[0],
        changed_by: user.name
      });
    } catch(e) { console.error('change_background:', e.message); }
  });

  // ── مؤشر الكتابة ──
  socket.on('typing', (data) => {
    const user = connectedUsers[socket.id];
    if (!user) return;
    socket.to(user.roomId).emit('typing', {
      user_id: user.userId,
      user_name: user.name,
      is_typing: !!data?.is_typing
    });
  });

  // ── تثبيت رسالة ──
  socket.on('pin_message', async (data) => {
    try {
      const user = connectedUsers[socket.id];
      if (!user || !data.message_id) return;

      const roomRow = await db.query('SELECT owner_id FROM rooms WHERE id=$1', [user.roomId]);
      const isOwner = String(roomRow.rows[0]?.owner_id) === String(user.userId);
      if (!isOwner) return;

      await db.query('UPDATE room_messages SET is_pinned=true WHERE id=$1 AND room_id=$2', [data.message_id, user.roomId]);
      const msgRow = await db.query(`
        SELECT m.*, u.name as user_name FROM room_messages m
        JOIN users u ON m.user_id=u.id WHERE m.id=$1
      `, [data.message_id]);

      if (msgRow.rows.length) {
        io.to(user.roomId).emit('message_pinned', msgRow.rows[0]);
      }
    } catch(e) { console.error('pin_message:', e.message); }
  });

  // ── مغادرة الغرفة ──
  socket.on('leave_room', async () => {
    await leaveRoom(socket);
  });

  // ── قطع الاتصال ──
  socket.on('disconnect', async () => {
    await leaveRoom(socket);
    delete connectedUsers[socket.id];
    console.log('🔌 انقطاع:', socket.id);
  });

  // دالة مغادرة الغرفة
  async function leaveRoom(socket) {
    const user = connectedUsers[socket.id];
    if (!user || !user.roomId) return;
    const roomId = user.roomId;

    socket.leave(roomId);
    if (roomUsers[roomId]) {
      roomUsers[roomId].delete(socket.id);
      if (roomUsers[roomId].size === 0) delete roomUsers[roomId];
    }

    connectedUsers[socket.id] = { ...user, roomId: null };

    io.to(roomId).emit('user_left', {
      user_id: user.userId,
      user_name: user.name,
      user_count: getRoomUserCount(roomId),
      users: getRoomUserList(roomId)
    });
  }
});

// ════════════════════════════════════════════
// START
// ════════════════════════════════════════════
initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 LUMIQ Rooms Server يعمل على المنفذ ${PORT}`);
  });
}).catch(e => {
  console.error('❌ خطأ في DB:', e.message);
  process.exit(1);
});

