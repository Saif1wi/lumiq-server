'use strict';
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const { Pool }   = require('pg');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const multer     = require('multer');
const cloudinary = require('cloudinary').v2;
const path       = require('path');
const fs         = require('fs');

// CONFIG
const JWT_SECRET   = process.env.JWT_SECRET   || 'lumiq_secret_2024';
const DATABASE_URL = process.env.DATABASE_URL  || '';
const PORT         = process.env.PORT          || 3000;
const ADMIN_PASS   = process.env.ADMIN_PASS    || 'admin123';

cloudinary.config({
  cloud_name : process.env.CLOUDINARY_CLOUD  || 'dxahljm5o',
  api_key    : process.env.CLOUDINARY_KEY    || '536977242836915',
  api_secret : process.env.CLOUDINARY_SECRET || 'kqIUC7aXQJF_s8r6kA5e_z367yA'
});

// DATABASE
const db = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id             SERIAL PRIMARY KEY,
      name           TEXT NOT NULL,
      username       TEXT UNIQUE NOT NULL,
      email          TEXT UNIQUE NOT NULL,
      password       TEXT NOT NULL,
      bio            TEXT    DEFAULT '',
      photo_url      TEXT    DEFAULT '',
      is_online      BOOLEAN DEFAULT false,
      last_seen      TIMESTAMP DEFAULT NOW(),
      show_last_seen BOOLEAN DEFAULT true,
      show_online    BOOLEAN DEFAULT true,
      is_verified    BOOLEAN DEFAULT false,
      is_banned      BOOLEAN DEFAULT false,
      ban_reason     TEXT    DEFAULT '',
      socket_id      TEXT    DEFAULT '',
      created_at     TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chats (
      id              TEXT PRIMARY KEY,
      participants    TEXT[],
      last_message    TEXT    DEFAULT '',
      last_message_at TIMESTAMP DEFAULT NOW(),
      unread_count    JSONB   DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS messages (
      id          SERIAL PRIMARY KEY,
      chat_id     TEXT REFERENCES chats(id) ON DELETE CASCADE,
      sender_id   INT  REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT    DEFAULT 'text',
      text        TEXT    DEFAULT '',
      audio_url   TEXT    DEFAULT '',
      image_url   TEXT    DEFAULT '',
      duration    INT     DEFAULT 0,
      seen        BOOLEAN DEFAULT false,
      reactions   JSONB   DEFAULT '{}',
      reply_to    JSONB,
      forwarded   BOOLEAN DEFAULT false,
      sticker     BOOLEAN DEFAULT false,
      created_at  TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS blocks (
      id         SERIAL PRIMARY KEY,
      blocker_id INT REFERENCES users(id) ON DELETE CASCADE,
      blocked_id INT REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(blocker_id, blocked_id)
    );
    CREATE TABLE IF NOT EXISTS friends (
      id           SERIAL PRIMARY KEY,
      requester_id INT REFERENCES users(id) ON DELETE CASCADE,
      recipient_id INT REFERENCES users(id) ON DELETE CASCADE,
      status       TEXT DEFAULT 'pending',
      created_at   TIMESTAMP DEFAULT NOW(),
      UNIQUE(requester_id, recipient_id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL,
      message    TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS notification_reads (
      user_id  INT REFERENCES users(id) ON DELETE CASCADE,
      notif_id INT REFERENCES notifications(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id, notif_id)
    );
  `);
  console.log('Database ready');
}

// APP
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// MIDDLEWARE
function auth(req, res, next) {
  var h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'غير مصرح' });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch (e) { res.status(401).json({ error: 'توكن غير صالح' }); }
}

function adminAuth(req, res, next) {
  var pass = req.headers['x-admin-pass'] || req.query.pass || (req.body && req.body.pass);
  if (pass !== ADMIN_PASS) return res.status(403).json({ error: 'غير مصرح' });
  next();
}

// PING
app.get('/api/ping', function(req, res) { res.json({ ok: true }); });

// ═══ AUTH ═══
app.post('/api/register', async function(req, res) {
  try {
    var name     = (req.body.name     || '').trim();
    var username = (req.body.username || '').toLowerCase().trim();
    var email    = (req.body.email    || '').toLowerCase().trim();
    var password = req.body.password  || '';
    if (!name || !username || !email || !password) return res.json({ error: 'جميع الحقول مطلوبة' });
    if (username.length < 3) return res.json({ error: 'اسم المستخدم 3 أحرف على الأقل' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.json({ error: 'أحرف إنجليزية وأرقام فقط' });
    if (password.length < 6) return res.json({ error: 'كلمة المرور 6 أحرف على الأقل' });
    var exists = await db.query('SELECT id FROM users WHERE username=$1 OR email=$2', [username, email]);
    if (exists.rows.length) return res.json({ error: 'البريد أو اسم المستخدم مستخدم مسبقاً' });
    var hash   = await bcrypt.hash(password, 10);
    var result = await db.query(
      'INSERT INTO users (name,username,email,password) VALUES ($1,$2,$3,$4) RETURNING id,name,username,email,bio,photo_url,is_online,last_seen,show_last_seen,show_online,is_verified,created_at',
      [name, username, email, hash]
    );
    var user  = result.rows[0];
    var token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '90d' });
    res.json({ token: token, user: user });
  } catch (e) { res.json({ error: 'خطأ في السيرفر' }); }
});

app.post('/api/login', async function(req, res) {
  try {
    var email    = (req.body.email    || '').toLowerCase().trim();
    var password = req.body.password  || '';
    var result   = await db.query('SELECT * FROM users WHERE email=$1', [email]);
    var user     = result.rows[0];
    if (!user) return res.json({ error: 'البريد الإلكتروني غير مسجل' });
    if (user.is_banned) return res.json({ error: 'تم حظر حسابك', ban_reason: user.ban_reason, banned: true });
    var ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ error: 'كلمة المرور غير صحيحة' });
    await db.query('UPDATE users SET is_online=true, last_seen=NOW() WHERE id=$1', [user.id]);
    delete user.password;
    var token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '90d' });
    res.json({ token: token, user: user });
  } catch (e) { res.json({ error: 'خطأ في السيرفر' }); }
});

// ═══ ME ═══
app.get('/api/me', auth, async function(req, res) {
  var r = await db.query('SELECT id,name,username,email,bio,photo_url,is_online,last_seen,show_last_seen,show_online,is_verified,created_at FROM users WHERE id=$1', [req.user.id]);
  res.json(r.rows[0] || {});
});

app.put('/api/me', auth, async function(req, res) {
  try {
    var name = req.body.name; var bio = req.body.bio;
    var show_online = req.body.show_online; var show_last_seen = req.body.show_last_seen;
    await db.query('UPDATE users SET name=COALESCE($1,name), bio=COALESCE($2,bio), show_online=COALESCE($3,show_online), show_last_seen=COALESCE($4,show_last_seen) WHERE id=$5',
      [name, bio, show_online, show_last_seen, req.user.id]);
    var r = await db.query('SELECT id,name,username,email,bio,photo_url,is_online,last_seen,show_last_seen,show_online,is_verified FROM users WHERE id=$1', [req.user.id]);
    res.json(r.rows[0]);
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/me/photo', auth, upload.single('photo'), async function(req, res) {
  try {
    if (!req.file) return res.json({ error: 'لم يتم رفع ملف' });
    var uri = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
    var up  = await cloudinary.uploader.upload(uri, { folder: 'lumiq/avatars', transformation: [{ width: 300, height: 300, crop: 'fill' }] });
    await db.query('UPDATE users SET photo_url=$1 WHERE id=$2', [up.secure_url, req.user.id]);
    res.json({ photo_url: up.secure_url });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/me/password', auth, async function(req, res) {
  try {
    var old_pw = req.body.old_password; var new_pw = req.body.new_password;
    var r = await db.query('SELECT password FROM users WHERE id=$1', [req.user.id]);
    var ok = await bcrypt.compare(old_pw, r.rows[0].password);
    if (!ok) return res.json({ error: 'كلمة المرور القديمة غير صحيحة' });
    if (!new_pw || new_pw.length < 6) return res.json({ error: 'كلمة المرور الجديدة 6 أحرف على الأقل' });
    await db.query('UPDATE users SET password=$1 WHERE id=$2', [await bcrypt.hash(new_pw, 10), req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

// ═══ USERS ═══
app.get('/api/users/search', auth, async function(req, res) {
  try {
    var q = (req.query.q || '').toLowerCase();
    if (q.length < 2) return res.json([]);
    var r = await db.query('SELECT id,name,username,bio,photo_url,is_online,last_seen,show_last_seen,show_online,is_verified FROM users WHERE (username LIKE $1 OR name ILIKE $1) AND id!=$2 AND is_banned=false LIMIT 20', [q + '%', req.user.id]);
    res.json(r.rows);
  } catch (e) { res.json([]); }
});

app.get('/api/users/:id', auth, async function(req, res) {
  var r = await db.query('SELECT id,name,username,bio,photo_url,is_online,last_seen,show_last_seen,show_online,is_verified FROM users WHERE id=$1', [req.params.id]);
  if (!r.rows.length) return res.json({ error: 'المستخدم غير موجود' });
  res.json(r.rows[0]);
});

// ═══ CHATS ═══
app.get('/api/chats', auth, async function(req, res) {
  var r = await db.query('SELECT * FROM chats WHERE $1=ANY(participants) ORDER BY last_message_at DESC', [String(req.user.id)]);
  res.json(r.rows);
});

app.post('/api/chats', auth, async function(req, res) {
  try {
    var other = String(req.body.user_id || req.body.other_user_id);
    var ids   = [String(req.user.id), other].sort();
    var cid   = ids.join('_');
    var ex    = await db.query('SELECT * FROM chats WHERE id=$1', [cid]);
    if (ex.rows.length) return res.json(ex.rows[0]);
    var r = await db.query('INSERT INTO chats (id,participants,unread_count) VALUES ($1,$2,$3) RETURNING *', [cid, ids, JSON.stringify({ [req.user.id]: 0, [other]: 0 })]);
    res.json(r.rows[0]);
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/chats/:id/read', auth, async function(req, res) {
  try {
    await db.query('UPDATE messages SET seen=true WHERE chat_id=$1 AND sender_id!=$2 AND seen=false', [req.params.id, req.user.id]);
    var c = await db.query('SELECT unread_count FROM chats WHERE id=$1', [req.params.id]);
    if (c.rows.length) {
      var uc = c.rows[0].unread_count || {};
      uc[req.user.id] = 0;
      await db.query('UPDATE chats SET unread_count=$1 WHERE id=$2', [JSON.stringify(uc), req.params.id]);
    }
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

app.delete('/api/chats/:id/delete', auth, async function(req, res) {
  try {
    var c = await db.query('SELECT * FROM chats WHERE id=$1', [req.params.id]);
    if (!c.rows.length) return res.json({ error: 'المحادثة غير موجودة' });
    if (!c.rows[0].participants.includes(String(req.user.id))) return res.json({ error: 'غير مصرح' });
    await db.query('DELETE FROM messages WHERE chat_id=$1', [req.params.id]);
    await db.query('DELETE FROM chats WHERE id=$1', [req.params.id]);
    var other = c.rows[0].participants.find(function(p) { return p !== String(req.user.id); });
    if (other && onlineUsers[other]) io.to(onlineUsers[other]).emit('chat_deleted', { chat_id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

// ═══ MESSAGES ═══
app.get('/api/chats/:id/messages', auth, async function(req, res) {
  var r = await db.query('SELECT * FROM messages WHERE chat_id=$1 ORDER BY created_at ASC LIMIT 300', [req.params.id]);
  res.json(r.rows);
});

app.post('/api/chats/:id/messages', auth, async function(req, res) {
  try {
    var chatId = req.params.id;
    var text   = req.body.text || '';
    var r = await db.query(
      'INSERT INTO messages (chat_id,sender_id,type,text,reply_to,forwarded,sticker) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [chatId, req.user.id, req.body.sticker ? 'sticker' : 'text', text, req.body.reply_to ? JSON.stringify(req.body.reply_to) : null, !!req.body.forwarded, !!req.body.sticker]
    );
    var msg = r.rows[0];
    var c   = await db.query('SELECT participants,unread_count FROM chats WHERE id=$1', [chatId]);
    if (c.rows.length) {
      var other = c.rows[0].participants.find(function(p) { return p !== String(req.user.id); });
      var uc    = c.rows[0].unread_count || {};
      uc[other] = (uc[other] || 0) + 1;
      await db.query('UPDATE chats SET last_message=$1, last_message_at=NOW(), unread_count=$2 WHERE id=$3', [text || '...', JSON.stringify(uc), chatId]);
      io.to(chatId).emit('new_message', msg);
      if (other && onlineUsers[other]) io.to(onlineUsers[other]).emit('new_message', msg);
    }
    res.json(msg);
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/chats/:id/messages/image', auth, upload.single('image'), async function(req, res) {
  try {
    var chatId = req.params.id;
    if (!req.file) return res.json({ error: 'لا توجد صورة' });
    var uri = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
    var up  = await cloudinary.uploader.upload(uri, { folder: 'lumiq/images' });
    var r   = await db.query('INSERT INTO messages (chat_id,sender_id,type,image_url,text) VALUES ($1,$2,$3,$4,$5) RETURNING *', [chatId, req.user.id, 'image', up.secure_url, 'صورة']);
    var msg = r.rows[0];
    var c   = await db.query('SELECT participants,unread_count FROM chats WHERE id=$1', [chatId]);
    if (c.rows.length) {
      var other = c.rows[0].participants.find(function(p) { return p !== String(req.user.id); });
      var uc    = c.rows[0].unread_count || {};
      uc[other] = (uc[other] || 0) + 1;
      await db.query('UPDATE chats SET last_message=$1, last_message_at=NOW(), unread_count=$2 WHERE id=$3', ['صورة', JSON.stringify(uc), chatId]);
      io.to(chatId).emit('new_message', msg);
      if (other && onlineUsers[other]) io.to(onlineUsers[other]).emit('new_message', msg);
    }
    res.json(msg);
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/chats/:id/messages/voice', auth, upload.single('audio'), async function(req, res) {
  try {
    var chatId   = req.params.id;
    var duration = parseInt(req.body.duration) || 0;
    if (!req.file) return res.json({ error: 'لا يوجد ملف صوتي' });
    var uri = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
    var up  = await cloudinary.uploader.upload(uri, { folder: 'lumiq/audio', resource_type: 'video' });
    var r   = await db.query('INSERT INTO messages (chat_id,sender_id,type,audio_url,duration,text) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [chatId, req.user.id, 'voice', up.secure_url, duration, 'رسالة صوتية']);
    var msg = r.rows[0];
    var c   = await db.query('SELECT participants,unread_count FROM chats WHERE id=$1', [chatId]);
    if (c.rows.length) {
      var other = c.rows[0].participants.find(function(p) { return p !== String(req.user.id); });
      var uc    = c.rows[0].unread_count || {};
      uc[other] = (uc[other] || 0) + 1;
      await db.query('UPDATE chats SET last_message=$1, last_message_at=NOW(), unread_count=$2 WHERE id=$3', ['رسالة صوتية', JSON.stringify(uc), chatId]);
      io.to(chatId).emit('new_message', msg);
      if (other && onlineUsers[other]) io.to(onlineUsers[other]).emit('new_message', msg);
    }
    res.json(msg);
  } catch (e) { res.json({ error: e.message }); }
});

app.put('/api/messages/:id', auth, async function(req, res) {
  try {
    var m = await db.query('SELECT sender_id FROM messages WHERE id=$1', [req.params.id]);
    if (!m.rows.length) return res.json({ error: 'الرسالة غير موجودة' });
    if (String(m.rows[0].sender_id) !== String(req.user.id)) return res.json({ error: 'غير مصرح' });
    var r = await db.query('UPDATE messages SET text=$1 WHERE id=$2 RETURNING *', [req.body.text, req.params.id]);
    res.json(r.rows[0]);
  } catch (e) { res.json({ error: e.message }); }
});

app.delete('/api/messages/:id', auth, async function(req, res) {
  try {
    var m = await db.query('SELECT chat_id,sender_id FROM messages WHERE id=$1', [req.params.id]);
    if (!m.rows.length) return res.json({ error: 'الرسالة غير موجودة' });
    if (String(m.rows[0].sender_id) !== String(req.user.id)) return res.json({ error: 'غير مصرح' });
    await db.query('DELETE FROM messages WHERE id=$1', [req.params.id]);
    io.to(m.rows[0].chat_id).emit('delete_message', { id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/messages/:id/react', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT reactions,chat_id FROM messages WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.json({ error: 'الرسالة غير موجودة' });
    var reactions = r.rows[0].reactions || {};
    var uid = String(req.user.id);
    if (reactions[uid] === req.body.emoji) delete reactions[uid];
    else reactions[uid] = req.body.emoji;
    await db.query('UPDATE messages SET reactions=$1 WHERE id=$2', [JSON.stringify(reactions), req.params.id]);
    io.to(r.rows[0].chat_id).emit('reaction', { msg_id: req.params.id, reactions: reactions });
    res.json({ reactions: reactions });
  } catch (e) { res.json({ error: e.message }); }
});

// ═══ BLOCK ═══
app.post('/api/block', auth, async function(req, res) {
  try {
    await db.query('INSERT INTO blocks (blocker_id,blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.body.user_id]);
    if (onlineUsers[String(req.body.user_id)]) io.to(onlineUsers[String(req.body.user_id)]).emit('you_are_blocked', { by_user_id: req.user.id });
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/unblock', auth, async function(req, res) {
  try {
    await db.query('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user.id, req.body.user_id]);
    if (onlineUsers[String(req.body.user_id)]) io.to(onlineUsers[String(req.body.user_id)]).emit('you_are_unblocked', { by_user_id: req.user.id });
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

app.get('/api/block/status/:id', auth, async function(req, res) {
  try {
    var a = await db.query('SELECT 1 FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user.id, req.params.id]);
    var b = await db.query('SELECT 1 FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.params.id, req.user.id]);
    res.json({ i_blocked: a.rows.length > 0, they_blocked: b.rows.length > 0 });
  } catch (e) { res.json({ error: e.message }); }
});

// ═══ FRIENDS ═══
app.get('/api/friends', auth, async function(req, res) {
  try {
    var r = await db.query(
      "SELECT f.status, f.requester_id, u.id, u.name, u.username, u.photo_url, u.is_online, u.last_seen, u.show_online, u.show_last_seen, u.is_verified FROM friends f JOIN users u ON (CASE WHEN f.requester_id=$1 THEN f.recipient_id ELSE f.requester_id END)=u.id WHERE (f.requester_id=$1 OR f.recipient_id=$1) AND f.status IN ('accepted','pending')",
      [req.user.id]
    );
    res.json(r.rows.map(function(f) {
      return { id: f.id, name: f.name, username: f.username, photo_url: f.photo_url, is_online: f.is_online, last_seen: f.last_seen, show_online: f.show_online, show_last_seen: f.show_last_seen, is_verified: f.is_verified, status: f.status, i_requested: String(f.requester_id) === String(req.user.id) };
    }));
  } catch (e) { res.json([]); }
});

app.post('/api/friends/request', auth, async function(req, res) {
  try {
    await db.query('INSERT INTO friends (requester_id,recipient_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.body.user_id]);
    if (onlineUsers[String(req.body.user_id)]) {
      var me = await db.query('SELECT id,name,username,photo_url FROM users WHERE id=$1', [req.user.id]);
      io.to(onlineUsers[String(req.body.user_id)]).emit('friend_request', { from: me.rows[0] });
    }
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/friends/accept', auth, async function(req, res) {
  try {
    await db.query("UPDATE friends SET status='accepted' WHERE requester_id=$1 AND recipient_id=$2", [req.body.user_id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/friends/reject', auth, async function(req, res) {
  try {
    await db.query('DELETE FROM friends WHERE (requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1)', [req.user.id, req.body.user_id]);
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

// ═══ NOTIFICATIONS ═══
app.get('/api/notifications', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50');
    res.json(r.rows);
  } catch (e) { res.json([]); }
});

app.post('/api/notifications/read', auth, async function(req, res) {
  try {
    var ids = req.body.ids || [];
    for (var i = 0; i < ids.length; i++) {
      await db.query('INSERT INTO notification_reads (user_id,notif_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, ids[i]]);
    }
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

// ═══ ADMIN ═══
app.get('/api/admin/stats', adminAuth, async function(req, res) {
  try {
    var u  = await db.query('SELECT COUNT(*) FROM users');
    var on = await db.query('SELECT COUNT(*) FROM users WHERE is_online=true');
    var c  = await db.query('SELECT COUNT(*) FROM chats');
    var m  = await db.query('SELECT COUNT(*) FROM messages');
    var bn = await db.query('SELECT COUNT(*) FROM users WHERE is_banned=true');
    var vr = await db.query('SELECT COUNT(*) FROM users WHERE is_verified=true');
    var td = await db.query('SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE');
    var nt = await db.query('SELECT COUNT(*) FROM notifications');
    res.json({ users: parseInt(u.rows[0].count), online: parseInt(on.rows[0].count), chats: parseInt(c.rows[0].count), messages: parseInt(m.rows[0].count), banned: parseInt(bn.rows[0].count), verified: parseInt(vr.rows[0].count), newToday: parseInt(td.rows[0].count), notifs: parseInt(nt.rows[0].count) });
  } catch (e) { res.json({ error: e.message }); }
});

app.get('/api/admin/users', adminAuth, async function(req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var lim  = parseInt(req.query.limit) || 30;
    var q    = req.query.q || '';
    var off  = (page - 1) * lim;
    var rows, total;
    if (q) {
      rows  = await db.query('SELECT id,name,username,email,photo_url,is_online,is_banned,ban_reason,is_verified,created_at FROM users WHERE name ILIKE $3 OR username ILIKE $3 OR email ILIKE $3 ORDER BY created_at DESC LIMIT $1 OFFSET $2', [lim, off, '%' + q + '%']);
      total = await db.query('SELECT COUNT(*) FROM users WHERE name ILIKE $1 OR username ILIKE $1 OR email ILIKE $1', ['%' + q + '%']);
    } else {
      rows  = await db.query('SELECT id,name,username,email,photo_url,is_online,is_banned,ban_reason,is_verified,created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2', [lim, off]);
      total = await db.query('SELECT COUNT(*) FROM users');
    }
    var tot = parseInt(total.rows[0].count);
    res.json({ users: rows.rows, total: tot, page: page, pages: Math.ceil(tot / lim) });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/admin/ban/:id', adminAuth, async function(req, res) {
  try {
    var reason = req.body.reason || 'لم يتم تحديد سبب';
    await db.query('UPDATE users SET is_banned=true, ban_reason=$1 WHERE id=$2', [reason, req.params.id]);
    var u = await db.query('SELECT socket_id FROM users WHERE id=$1', [req.params.id]);
    if (u.rows.length && u.rows[0].socket_id) io.to(u.rows[0].socket_id).emit('force_ban', { reason: reason, type: 'ban' });
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/admin/unban/:id', adminAuth, async function(req, res) {
  try {
    await db.query("UPDATE users SET is_banned=false, ban_reason='' WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/admin/verify/:id', adminAuth, async function(req, res) {
  try {
    var r = await db.query('UPDATE users SET is_verified = NOT is_verified WHERE id=$1 RETURNING is_verified', [req.params.id]);
    res.json({ ok: true, is_verified: r.rows[0].is_verified });
  } catch (e) { res.json({ error: e.message }); }
});

app.delete('/api/admin/users/:id', adminAuth, async function(req, res) {
  try {
    await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/admin/broadcast', adminAuth, async function(req, res) {
  try {
    var title = req.body.title; var message = req.body.message;
    if (!title || !message) return res.json({ error: 'العنوان والرسالة مطلوبان' });
    var r = await db.query('INSERT INTO notifications (title,message) VALUES ($1,$2) RETURNING *', [title, message]);
    var notif = r.rows[0];
    io.emit('broadcast', { title: notif.title, message: notif.message, id: notif.id, created_at: notif.created_at });
    res.json({ ok: true, notif: notif });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/admin/logout/:id', adminAuth, async function(req, res) {
  try {
    var u = await db.query('SELECT socket_id FROM users WHERE id=$1', [req.params.id]);
    if (u.rows.length && u.rows[0].socket_id) io.to(u.rows[0].socket_id).emit('force_logout', { reason: req.body.reason || '', type: 'logout' });
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

// ADMIN DASHBOARD
app.get('/admin', function(req, res) {
  var f = path.join(__dirname, 'admin.html');
  if (fs.existsSync(f)) { res.sendFile(f); }
  else { res.send('<h2 style="font-family:sans-serif;text-align:center;margin-top:60px">admin.html not found</h2>'); }
});

// ═══ SOCKET.IO ═══
var onlineUsers = {};

io.on('connection', function(socket) {
  socket.on('join', async function(data) {
    try {
      var user = jwt.verify(data.token, JWT_SECRET);
      socket.userId = user.id;
      onlineUsers[String(user.id)] = socket.id;
      await db.query('UPDATE users SET is_online=true, last_seen=NOW(), socket_id=$1 WHERE id=$2', [socket.id, user.id]);
      socket.broadcast.emit('user_online', { user_id: user.id, is_online: true });
      var chats = await db.query('SELECT id FROM chats WHERE $1=ANY(participants)', [String(user.id)]);
      chats.rows.forEach(function(c) { socket.join(c.id); });
      var pending = await db.query('SELECT n.* FROM notifications n WHERE n.id NOT IN (SELECT notif_id FROM notification_reads WHERE user_id=$1) ORDER BY created_at DESC LIMIT 10', [user.id]);
      if (pending.rows.length) socket.emit('pending_notifications', { notifications: pending.rows });
    } catch (e) { console.error('join:', e.message); }
  });

  socket.on('join_chat', function(d) { socket.join(d.chat_id); });
  socket.on('typing', function(d) { socket.to(d.chat_id).emit('typing', { user_id: d.user_id, is_typing: d.is_typing }); });

  socket.on('messages_seen', async function(d) {
    try {
      if (onlineUsers[String(d.partner_id)]) io.to(onlineUsers[String(d.partner_id)]).emit('messages_seen', { chat_id: d.chat_id, reader_id: d.reader_id });
      await db.query('UPDATE messages SET seen=true WHERE chat_id=$1 AND sender_id=$2 AND seen=false', [d.chat_id, d.partner_id]);
    } catch (e) {}
  });

  socket.on('call_user', async function(d) {
    try {
      var t = onlineUsers[String(d.to_user_id)];
      if (t) {
        var me = await db.query('SELECT id,name,photo_url FROM users WHERE id=$1', [socket.userId]);
        io.to(t).emit('incoming_call', { from: me.rows[0] || {}, from_socket_id: socket.id, signal: d.signal });
      } else { socket.emit('call_failed', { reason: 'المستخدم غير متصل' }); }
    } catch (e) {}
  });
  socket.on('call_accept',  function(d) { io.to(d.to_socket_id).emit('call_accepted', { socket_id: socket.id }); });
  socket.on('call_reject',  function(d) { io.to(d.to_socket_id).emit('call_rejected'); });
  socket.on('call_end',     function(d) { io.to(d.to_socket_id).emit('call_ended'); });
  socket.on('webrtc_offer', function(d) { io.to(d.to_socket_id).emit('webrtc_offer', { offer: d.offer, from_socket_id: socket.id }); });
  socket.on('webrtc_answer',function(d) { io.to(d.to_socket_id).emit('webrtc_answer', { answer: d.answer }); });
  socket.on('webrtc_ice',   function(d) { io.to(d.to_socket_id).emit('webrtc_ice', { candidate: d.candidate }); });

  socket.on('disconnect', async function() {
    delete onlineUsers[String(socket.userId)];
    if (socket.userId) {
      try {
        await db.query("UPDATE users SET is_online=false, last_seen=NOW(), socket_id='' WHERE id=$1", [socket.userId]);
        socket.broadcast.emit('user_online', { user_id: socket.userId, is_online: false, last_seen: new Date() });
      } catch (e) {}
    }
  });
});

// ═══ START ═══
initDB().then(function() {
  server.listen(PORT, function() {
    console.log('LUMIQ Server running on port ' + PORT);
  });
}).catch(function(e) {
  console.error('DB Error:', e.message);
  process.exit(1);
});
