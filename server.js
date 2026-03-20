const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const { Pool }   = require('pg');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const multer     = require('multer');
const cloudinary = require('cloudinary').v2;

// ═══ CONFIG ═══
const JWT_SECRET   = process.env.JWT_SECRET   || 'lumiq_secret_2024';
const DATABASE_URL = process.env.DATABASE_URL  || 'postgresql://postgres:egNpBttTyFpglzpNqAGOiATDXpCHAMLO@centerbeam.proxy.rlwy.net:43941/railway';
const PORT         = process.env.PORT          || 3000;

cloudinary.config({
  cloud_name : process.env.CLOUDINARY_CLOUD  || 'dxahljm5o',
  api_key    : process.env.CLOUDINARY_KEY    || '536977242836915',
  api_secret : process.env.CLOUDINARY_SECRET || 'kqIUC7aXQJF_s8r6kA5e_z367yA'
});

// ═══ DATABASE ═══
const db = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      username    TEXT UNIQUE NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      bio         TEXT DEFAULT '',
      photo_url   TEXT DEFAULT '',
      is_online   BOOLEAN DEFAULT false,
      last_seen   TIMESTAMP DEFAULT NOW(),
      show_last_seen  BOOLEAN DEFAULT true,
      show_online     BOOLEAN DEFAULT true,
      created_at  TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chats (
      id              TEXT PRIMARY KEY,
      participants    TEXT[],
      last_message    TEXT DEFAULT '',
      last_message_at TIMESTAMP DEFAULT NOW(),
      unread_count    JSONB DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS messages (
      id          SERIAL PRIMARY KEY,
      chat_id     TEXT REFERENCES chats(id),
      sender_id   INT  REFERENCES users(id),
      type        TEXT DEFAULT 'text',
      text        TEXT,
      audio_url   TEXT,
      image_url   TEXT,
      duration    INT,
      seen        BOOLEAN DEFAULT false,
      reactions   JSONB DEFAULT '{}',
      reply_to    JSONB,
      created_at  TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS stories (
      id          SERIAL PRIMARY KEY,
      user_id     INT REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT DEFAULT 'text',
      text        TEXT,
      image_url   TEXT,
      bg_color    TEXT DEFAULT 'sg1',
      views       JSONB DEFAULT '[]',
      expires_at  TIMESTAMP DEFAULT (NOW() + INTERVAL '24 hours'),
      created_at  TIMESTAMP DEFAULT NOW()
    );
  \`);
  console.log('✅ Database ready');
}

// ═══ APP ═══
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(cors());

// Ping endpoint لمنع السيرفر من النوم
app.get('/api/ping', (req, res) => res.json({ ok: true, time: new Date() }));
app.use(express.json({ limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ═══ AUTH MIDDLEWARE ═══
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ═══ AUTH ROUTES ═══

// تسجيل
app.post('/api/register', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!name || !username || !email || !password)
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    if (password.length < 6)
      return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });

    const exists = await db.query('SELECT id FROM users WHERE username=$1 OR email=$2', [username.toLowerCase(), email.toLowerCase()]);
    if (exists.rows.length) return res.status(400).json({ error: 'اسم المستخدم أو البريد مستخدم' });

    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (name, username, email, password) VALUES ($1,$2,$3,$4) RETURNING id, name, username, email, bio, photo_url, is_online, last_seen, show_last_seen, show_online, created_at',
      [name, username.toLowerCase(), email.toLowerCase(), hash]
    );
    const user  = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await db.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    const user   = result.rows[0];
    if (!user) return res.status(400).json({ error: 'البريد غير موجود' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'كلمة المرور خاطئة' });

    await db.query('UPDATE users SET is_online=true, last_seen=NOW() WHERE id=$1', [user.id]);
    delete user.password;
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch (e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// نسيت كلمة المرور (إعادة تعيين)
app.post('/api/forgot-password', async (req, res) => {
  res.json({ message: 'تم إرسال رابط إعادة التعيين (ميزة قادمة)' });
});

// ═══ USER ROUTES ═══

// الملف الشخصي
app.get('/api/me', auth, async (req, res) => {
  const result = await db.query('SELECT id,name,username,email,bio,photo_url,is_online,last_seen,show_last_seen,show_online,created_at FROM users WHERE id=$1', [req.user.id]);
  res.json(result.rows[0]);
});

// تحديث الملف الشخصي
app.put('/api/me', auth, async (req, res) => {
  try {
    const { name, username, bio, show_last_seen, show_online } = req.body;
    if (username) {
      const exists = await db.query('SELECT id FROM users WHERE username=$1 AND id!=$2', [username.toLowerCase(), req.user.id]);
      if (exists.rows.length) return res.status(400).json({ error: 'اسم المستخدم مستخدم' });
    }
    await db.query(
      'UPDATE users SET name=COALESCE($1,name), username=COALESCE($2,username), bio=COALESCE($3,bio), show_last_seen=COALESCE($4,show_last_seen), show_online=COALESCE($5,show_online) WHERE id=$6',
      [name, username?.toLowerCase(), bio, show_last_seen, show_online, req.user.id]
    );
    const result = await db.query('SELECT id,name,username,email,bio,photo_url,is_online,last_seen,show_last_seen,show_online FROM users WHERE id=$1', [req.user.id]);
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'خطأ في التحديث' });
  }
});

// رفع الصورة الشخصية
app.post('/api/me/avatar', auth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
    const b64    = req.file.buffer.toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const result  = await cloudinary.uploader.upload(dataURI, { folder: 'lumiq/avatars', transformation: [{ width: 300, height: 300, crop: 'fill' }] });
    await db.query('UPDATE users SET photo_url=$1 WHERE id=$2', [result.secure_url, req.user.id]);
    res.json({ photo_url: result.secure_url });
  } catch (e) {
    res.status(500).json({ error: 'فشل رفع الصورة' });
  }
});

// البحث عن مستخدمين
app.get('/api/users/search', auth, async (req, res) => {
  const q = req.query.q?.toLowerCase();
  if (!q || q.length < 2) return res.json([]);
  const result = await db.query(
    'SELECT id,name,username,bio,photo_url,is_online,last_seen,show_last_seen,show_online FROM users WHERE username LIKE $1 AND id!=$2 LIMIT 20',
    [q + '%', req.user.id]
  );
  res.json(result.rows);
});

// مستخدم بالـ ID
app.get('/api/users/:id', auth, async (req, res) => {
  const result = await db.query('SELECT id,name,username,bio,photo_url,is_online,last_seen,show_last_seen,show_online FROM users WHERE id=$1', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json(result.rows[0]);
});

// حذف الحساب
app.delete('/api/me', auth, async (req, res) => {
  await db.query('DELETE FROM users WHERE id=$1', [req.user.id]);
  res.json({ message: 'تم حذف الحساب' });
});

// ═══ CHAT ROUTES ═══

// إنشاء أو جلب محادثة
app.post('/api/chats', auth, async (req, res) => {
  try {
    const { other_user_id } = req.body;
    const ids  = [String(req.user.id), String(other_user_id)].sort();
    const cid  = ids.join('_');
    const exists = await db.query('SELECT * FROM chats WHERE id=$1', [cid]);
    if (exists.rows.length) return res.json(exists.rows[0]);
    const result = await db.query(
      'INSERT INTO chats (id, participants, unread_count) VALUES ($1,$2,$3) RETURNING *',
      [cid, ids, JSON.stringify({ [req.user.id]: 0, [other_user_id]: 0 })]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'خطأ في إنشاء المحادثة' });
  }
});

// قائمة المحادثات
app.get('/api/chats', auth, async (req, res) => {
  const result = await db.query(
    'SELECT * FROM chats WHERE $1=ANY(participants) ORDER BY last_message_at DESC',
    [String(req.user.id)]
  );
  res.json(result.rows);
});

// ═══ MESSAGE ROUTES ═══

// رسائل محادثة
app.get('/api/chats/:chatId/messages', auth, async (req, res) => {
  const result = await db.query(
    'SELECT * FROM messages WHERE chat_id=$1 ORDER BY created_at ASC',
    [req.params.chatId]
  );
  res.json(result.rows);
});

// إرسال رسالة نصية
app.post('/api/chats/:chatId/messages', auth, async (req, res) => {
  try {
    const { text, reply_to } = req.body;
    const chatId = req.params.chatId;
    const result = await db.query(
      'INSERT INTO messages (chat_id, sender_id, type, text, reply_to) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [chatId, req.user.id, 'text', text, reply_to ? JSON.stringify(reply_to) : null]
    );
    const msg = result.rows[0];
    // تحديث آخر رسالة
    await db.query('UPDATE chats SET last_message=$1, last_message_at=NOW() WHERE id=$2', [text, chatId]);
    // إرسال عبر Socket
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch (e) {
    res.status(500).json({ error: 'فشل إرسال الرسالة' });
  }
});

// إرسال صورة
app.post('/api/chats/:chatId/messages/image', auth, upload.single('image'), async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const b64    = req.file.buffer.toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const upload_result = await cloudinary.uploader.upload(dataURI, { folder: 'lumiq/images', resource_type: 'image' });
    const result = await db.query(
      'INSERT INTO messages (chat_id, sender_id, type, image_url, text) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [chatId, req.user.id, 'image', upload_result.secure_url, '📷 صورة']
    );
    const msg = result.rows[0];
    await db.query('UPDATE chats SET last_message=$1, last_message_at=NOW() WHERE id=$2', ['📷 صورة', chatId]);
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch (e) {
    res.status(500).json({ error: 'فشل رفع الصورة' });
  }
});

// إرسال صوت
app.post('/api/chats/:chatId/messages/audio', auth, upload.single('audio'), async (req, res) => {
  try {
    const chatId   = req.params.chatId;
    const duration = parseInt(req.body.duration) || 0;
    const b64      = req.file.buffer.toString('base64');
    const dataURI  = `data:${req.file.mimetype};base64,${b64}`;
    const upload_result = await cloudinary.uploader.upload(dataURI, { folder: 'lumiq/audio', resource_type: 'video' });
    const result = await db.query(
      'INSERT INTO messages (chat_id, sender_id, type, audio_url, duration, text) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [chatId, req.user.id, 'voice', upload_result.secure_url, duration, '🎤 رسالة صوتية']
    );
    const msg = result.rows[0];
    await db.query('UPDATE chats SET last_message=$1, last_message_at=NOW() WHERE id=$2', ['🎤 رسالة صوتية', chatId]);
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch (e) {
    res.status(500).json({ error: 'فشل رفع الصوت' });
  }
});

// حذف رسالة
app.delete('/api/messages/:msgId', auth, async (req, res) => {
  await db.query('DELETE FROM messages WHERE id=$1 AND sender_id=$2', [req.params.msgId, req.user.id]);
  io.emit('delete_message', { id: req.params.msgId });
  res.json({ message: 'تم الحذف' });
});

// تفاعل إيموجي
app.post('/api/messages/:msgId/react', auth, async (req, res) => {
  try {
    const { emoji } = req.body;
    const result    = await db.query('SELECT reactions FROM messages WHERE id=$1', [req.params.msgId]);
    if (!result.rows.length) return res.status(404).json({ error: 'الرسالة غير موجودة' });
    const reactions = result.rows[0].reactions || {};
    reactions[req.user.id] = emoji;
    await db.query('UPDATE messages SET reactions=$1 WHERE id=$2', [JSON.stringify(reactions), req.params.msgId]);
    io.emit('reaction', { msg_id: req.params.msgId, reactions });
    res.json({ reactions });
  } catch (e) {
    res.status(500).json({ error: 'خطأ' });
  }
});

// تحديد كمقروء
app.post('/api/chats/:chatId/read', auth, async (req, res) => {
  await db.query(
    'UPDATE messages SET seen=true WHERE chat_id=$1 AND sender_id!=$2 AND seen=false',
    [req.params.chatId, req.user.id]
  );
  const chat = await db.query('SELECT unread_count FROM chats WHERE id=$1', [req.params.chatId]);
  if (chat.rows.length) {
    const uc = chat.rows[0].unread_count || {};
    uc[req.user.id] = 0;
    await db.query('UPDATE chats SET unread_count=$1 WHERE id=$2', [JSON.stringify(uc), req.params.chatId]);
  }
  res.json({ ok: true });
});


// ═══ STORY ROUTES ═══

// نشر story نصية
app.post('/api/stories', auth, async (req, res) => {
  try {
    const { text, bg_color } = req.body;
    if (!text) return res.status(400).json({ error: 'النص مطلوب' });
    const result = await db.query(
      'INSERT INTO stories (user_id, type, text, bg_color) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.id, 'text', text, bg_color || 'sg1']
    );
    io.emit('new_story', result.rows[0]);
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: 'خطأ' }); }
});

// نشر story صورة
app.post('/api/stories/image', auth, upload.single('image'), async (req, res) => {
  try {
    const b64 = req.file.buffer.toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const up = await cloudinary.uploader.upload(dataURI, { folder: 'lumiq/stories' });
    const result = await db.query(
      'INSERT INTO stories (user_id, type, image_url) VALUES ($1,$2,$3) RETURNING *',
      [req.user.id, 'image', up.secure_url]
    );
    io.emit('new_story', result.rows[0]);
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: 'فشل رفع الصورة' }); }
});

// جلب stories النشطة (أقل من 24 ساعة)
app.get('/api/stories', auth, async (req, res) => {
  try {
    const result = await db.query(
      \`SELECT s.*, u.name, u.username, u.photo_url
       FROM stories s JOIN users u ON s.user_id = u.id
       WHERE s.expires_at > NOW()
       ORDER BY s.created_at DESC\`
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'خطأ' }); }
});

// تسجيل مشاهدة
app.post('/api/stories/:id/view', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const story = await db.query('SELECT views FROM stories WHERE id=$1', [id]);
    if (!story.rows.length) return res.status(404).json({ error: 'غير موجود' });
    let views = story.rows[0].views || [];
    if (!views.includes(req.user.id)) {
      views.push(req.user.id);
      await db.query('UPDATE stories SET views=$1 WHERE id=$2', [JSON.stringify(views), id]);
    }
    res.json({ views });
  } catch (e) { res.status(500).json({ error: 'خطأ' }); }
});

// حذف story
app.delete('/api/stories/:id', auth, async (req, res) => {
  await db.query('DELETE FROM stories WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  io.emit('delete_story', { id: req.params.id });
  res.json({ ok: true });
});

// ═══ SOCKET.IO ═══
const onlineUsers = {};

io.on('connection', (socket) => {
  console.log('🔌 connected:', socket.id);

  // تسجيل دخول المستخدم
  socket.on('join', async ({ token }) => {
    try {
      const user = jwt.verify(token, JWT_SECRET);
      socket.userId = user.id;
      onlineUsers[user.id] = socket.id;
      await db.query('UPDATE users SET is_online=true, last_seen=NOW() WHERE id=$1', [user.id]);
      io.emit('user_online', { user_id: user.id, is_online: true });
      // انضمام لجميع المحادثات
      const chats = await db.query('SELECT id FROM chats WHERE $1=ANY(participants)', [String(user.id)]);
      chats.rows.forEach(c => socket.join(c.id));
    } catch (e) {
      console.error('join error:', e.message);
    }
  });

  // الانضمام لمحادثة
  socket.on('join_chat', ({ chat_id }) => {
    socket.join(chat_id);
  });

  // مؤشر يكتب
  // Story events
  socket.on('story_view', ({ story_id }) => {
    // broadcast view update
    io.emit('story_viewed', { story_id, user_id: socket.userId });
  });

  socket.on('typing', ({ chat_id, user_id, is_typing }) => {
    socket.to(chat_id).emit('typing', { user_id, is_typing });
  });

  // ═══ WEBRTC VOICE CALL SIGNALING ═══

  // طلب اتصال
  socket.on('call_request', ({ to_user_id, from_user, chat_id }) => {
    const toSocket = onlineUsers[to_user_id];
    if (toSocket) {
      io.to(toSocket).emit('call_incoming', { from_user, chat_id, socket_id: socket.id });
    } else {
      socket.emit('call_failed', { reason: 'المستخدم غير متصل' });
    }
  });

  // قبول الاتصال
  socket.on('call_accept', ({ to_socket_id, from_user }) => {
    io.to(to_socket_id).emit('call_accepted', { from_user, socket_id: socket.id });
  });

  // رفض الاتصال
  socket.on('call_reject', ({ to_socket_id }) => {
    io.to(to_socket_id).emit('call_rejected');
  });

  // إنهاء الاتصال
  socket.on('call_end', ({ to_socket_id }) => {
    if (to_socket_id) io.to(to_socket_id).emit('call_ended');
  });

  // WebRTC Offer
  socket.on('webrtc_offer', ({ to_socket_id, offer }) => {
    io.to(to_socket_id).emit('webrtc_offer', { offer, from_socket_id: socket.id });
  });

  // WebRTC Answer
  socket.on('webrtc_answer', ({ to_socket_id, answer }) => {
    io.to(to_socket_id).emit('webrtc_answer', { answer });
  });

  // WebRTC ICE Candidate
  socket.on('webrtc_ice', ({ to_socket_id, candidate }) => {
    io.to(to_socket_id).emit('webrtc_ice', { candidate });
  });

  // قطع الاتصال
  socket.on('disconnect', async () => {
    if (socket.userId) {
      // إنهاء أي اتصال جارٍ
      io.emit('call_ended');
      delete onlineUsers[socket.userId];
      await db.query('UPDATE users SET is_online=false, last_seen=NOW() WHERE id=$1', [socket.userId]);
      io.emit('user_online', { user_id: socket.userId, is_online: false, last_seen: new Date() });
    }
  });
});

// ═══ START ═══
initDB().then(() => {
  server.listen(PORT, () => console.log(`🚀 LUMIQ Server running on port ${PORT}`));
}).catch(e => {
  console.error('❌ DB Error:', e);
  process.exit(1);
});
