/* ═══════════════════════════════════════════════════
   LUMIQ SERVER v2.0
   Express + Socket.IO + MongoDB (Mongoose)
   + لوحة تحكم مدمجة على /admin
   ═══════════════════════════════════════════════════ */

require('dotenv').config();
const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const mongoose     = require('mongoose');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const multer       = require('multer');
const cloudinary   = require('cloudinary').v2;
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const path         = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ── ENV ──────────────────────────────────────────────
const PORT       = process.env.PORT       || 3000;
const MONGO_URI  = process.env.MONGO_URI  || 'mongodb://localhost:27017/lumiq';
const JWT_SECRET = process.env.JWT_SECRET || 'lumiq_secret_change_me';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

// Cloudinary (اختياري – إذا لم تُعيَّن يُستخدم تخزين مؤقت)
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name : process.env.CLOUDINARY_CLOUD_NAME,
    api_key    : process.env.CLOUDINARY_API_KEY,
    api_secret : process.env.CLOUDINARY_API_SECRET
  });
}

// ── MIDDLEWARE ────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true });
app.use('/api/', apiLimiter);

// ── MONGODB SCHEMAS ───────────────────────────────────

// User
const userSchema = new mongoose.Schema({
  name        : { type: String, required: true, trim: true },
  username    : { type: String, required: true, unique: true, lowercase: true, trim: true },
  email       : { type: String, required: true, unique: true, lowercase: true, trim: true },
  password    : { type: String, required: true },
  photo_url   : { type: String, default: '' },
  bio         : { type: String, default: '' },
  is_online   : { type: Boolean, default: false },
  last_seen   : { type: Date, default: Date.now },
  show_online : { type: Boolean, default: true },
  show_last_seen: { type: Boolean, default: true },
  is_verified : { type: Boolean, default: false },
  is_banned   : { type: Boolean, default: false },
  ban_reason  : { type: String, default: '' },
  socket_id   : { type: String, default: '' },
  created_at  : { type: Date, default: Date.now }
});

// Message
const messageSchema = new mongoose.Schema({
  chat_id    : { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  sender_id  : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text       : { type: String, default: '' },
  type       : { type: String, enum: ['text', 'image', 'voice', 'sticker'], default: 'text' },
  image_url  : { type: String, default: '' },
  audio_url  : { type: String, default: '' },
  duration   : { type: Number, default: 0 },
  reply_to   : { type: Object, default: null },
  reactions  : { type: Object, default: {} },
  forwarded  : { type: Boolean, default: false },
  sticker    : { type: Boolean, default: false },
  seen       : { type: Boolean, default: false },
  created_at : { type: Date, default: Date.now }
});

// Chat
const chatSchema = new mongoose.Schema({
  participants     : [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  last_message     : { type: String, default: '' },
  last_message_at  : { type: Date, default: Date.now },
  unread_count     : { type: Object, default: {} }
});

// Friend
const friendSchema = new mongoose.Schema({
  requester  : { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  recipient  : { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status     : { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  created_at : { type: Date, default: Date.now }
});

// Block
const blockSchema = new mongoose.Schema({
  blocker    : { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  blocked    : { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at : { type: Date, default: Date.now }
});

// Notification (Broadcast)
const notifSchema = new mongoose.Schema({
  title      : { type: String, required: true },
  message    : { type: String, required: true },
  created_at : { type: Date, default: Date.now },
  read_by    : [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

const User         = mongoose.model('User', userSchema);
const Message      = mongoose.model('Message', messageSchema);
const Chat         = mongoose.model('Chat', chatSchema);
const Friend       = mongoose.model('Friend', friendSchema);
const Block        = mongoose.model('Block', blockSchema);
const Notification = mongoose.model('Notification', notifSchema);

// ── HELPERS ───────────────────────────────────────────
const auth = async (req, res, next) => {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'غير مصرح' });
    const decoded = jwt.verify(h.slice(7), JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ error: 'المستخدم غير موجود' });
    if (user.is_banned) return res.status(403).json({ error: 'محظور', ban_reason: user.ban_reason });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'توكن غير صالح' });
  }
};

const adminAuth = (req, res, next) => {
  const pass = req.headers['x-admin-pass'] || req.query.pass || req.body?.pass;
  if (pass !== ADMIN_PASS) return res.status(403).json({ error: 'كلمة مرور المشرف غير صحيحة' });
  next();
};

const safeUser = (u) => ({
  id          : u._id,
  name        : u.name,
  username    : u.username,
  email       : u.email,
  photo_url   : u.photo_url,
  bio         : u.bio,
  is_online   : u.is_online,
  last_seen   : u.last_seen,
  show_online : u.show_online,
  show_last_seen: u.show_last_seen,
  is_verified : u.is_verified,
  created_at  : u.created_at
});

// Multer (memory storage → Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

const uploadToCloud = (buffer, folder, resourceType = 'image') =>
  new Promise((resolve, reject) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      // بدون Cloudinary – أعد Base64 مؤقتاً
      return resolve({ secure_url: `data:${resourceType}/${folder};base64,${buffer.toString('base64')}` });
    }
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (err, result) => err ? reject(err) : resolve(result)
    );
    stream.end(buffer);
  });

// ══════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════

// ── PING ─────────────────────────────────────────────
app.get('/api/ping', (req, res) => res.json({ ok: true, time: new Date() }));

// ── AUTH ─────────────────────────────────────────────

// تسجيل
app.post('/api/register', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!name || !username || !email || !password)
      return res.json({ error: 'جميع الحقول مطلوبة' });
    if (username.length < 3)
      return res.json({ error: 'اسم المستخدم 3 أحرف على الأقل' });
    if (!/^[a-zA-Z0-9_]+$/.test(username))
      return res.json({ error: 'أحرف إنجليزية وأرقام فقط' });
    if (password.length < 6)
      return res.json({ error: 'كلمة المرور 6 أحرف على الأقل' });

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.json({ error: 'البريد أو اسم المستخدم مستخدم مسبقاً' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, username, email, password: hashed });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '90d' });
    res.json({ token, user: safeUser(user) });
  } catch (e) {
    res.json({ error: 'خطأ في السيرفر: ' + e.message });
  }
});

// تسجيل دخول
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ error: 'أدخل البريد وكلمة المرور' });
    const user = await User.findOne({ email });
    if (!user) return res.json({ error: 'البريد الإلكتروني غير مسجل' });
    if (user.is_banned) return res.json({ error: 'تم حظر حسابك', ban_reason: user.ban_reason, banned: true });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ error: 'كلمة المرور غير صحيحة' });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '90d' });
    res.json({ token, user: safeUser(user) });
  } catch (e) {
    res.json({ error: 'خطأ في السيرفر' });
  }
});

// ── ME & PROFILE ─────────────────────────────────────
app.get('/api/me', auth, (req, res) => res.json(safeUser(req.user)));

app.put('/api/me', auth, async (req, res) => {
  try {
    const { name, bio, show_online, show_last_seen } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (bio  !== undefined) update.bio  = bio;
    if (show_online    !== undefined) update.show_online    = show_online;
    if (show_last_seen !== undefined) update.show_last_seen = show_last_seen;
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });
    res.json(safeUser(user));
  } catch (e) {
    res.json({ error: e.message });
  }
});

// رفع صورة الملف الشخصي
app.post('/api/me/photo', auth, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.json({ error: 'لم يتم رفع ملف' });
    const result = await uploadToCloud(req.file.buffer, 'lumiq/avatars');
    const user = await User.findByIdAndUpdate(
      req.user._id, { photo_url: result.secure_url }, { new: true }
    );
    res.json({ photo_url: user.photo_url });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// تغيير كلمة المرور
app.post('/api/me/password', auth, async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    const user = await User.findById(req.user._id);
    const ok = await bcrypt.compare(old_password, user.password);
    if (!ok) return res.json({ error: 'كلمة المرور القديمة غير صحيحة' });
    if (new_password.length < 6) return res.json({ error: 'كلمة المرور الجديدة 6 أحرف على الأقل' });
    user.password = await bcrypt.hash(new_password, 10);
    await user.save();
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ── USERS ─────────────────────────────────────────────
app.get('/api/users/search', auth, async (req, res) => {
  try {
    const q = req.query.q || '';
    if (q.length < 2) return res.json([]);
    const users = await User.find({
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { name:     { $regex: q, $options: 'i' } }
      ],
      _id: { $ne: req.user._id },
      is_banned: false
    }).limit(20);
    res.json(users.map(safeUser));
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.get('/api/users/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.json({ error: 'المستخدم غير موجود' });
    res.json(safeUser(user));
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ── CHATS ─────────────────────────────────────────────
app.get('/api/chats', auth, async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.user._id })
      .sort({ last_message_at: -1 });
    res.json(chats);
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/chats', auth, async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.json({ error: 'user_id مطلوب' });
    const other = await User.findById(user_id);
    if (!other) return res.json({ error: 'المستخدم غير موجود' });

    let chat = await Chat.findOne({
      participants: { $all: [req.user._id, other._id], $size: 2 }
    });
    if (!chat) {
      chat = await Chat.create({
        participants: [req.user._id, other._id],
        unread_count: {}
      });
    }
    res.json(chat);
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/chats/:id/read', auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.json({ error: 'المحادثة غير موجودة' });
    const uc = chat.unread_count || {};
    uc[String(req.user._id)] = 0;
    await Chat.findByIdAndUpdate(req.params.id, { unread_count: uc });
    // علّم الرسائل كمقروءة
    await Message.updateMany(
      { chat_id: req.params.id, sender_id: { $ne: req.user._id }, seen: false },
      { seen: true }
    );
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.delete('/api/chats/:id/delete', auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.json({ error: 'المحادثة غير موجودة' });
    if (!chat.participants.map(String).includes(String(req.user._id)))
      return res.json({ error: 'غير مصرح' });
    await Message.deleteMany({ chat_id: req.params.id });
    await Chat.findByIdAndDelete(req.params.id);
    // أخبر الطرف الآخر
    const otherId = chat.participants.find(p => String(p) !== String(req.user._id));
    if (otherId) {
      const otherUser = await User.findById(otherId);
      if (otherUser && otherUser.socket_id) {
        io.to(otherUser.socket_id).emit('chat_deleted', { chat_id: req.params.id });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ── MESSAGES ──────────────────────────────────────────
app.get('/api/chats/:id/messages', auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat || !chat.participants.map(String).includes(String(req.user._id)))
      return res.json({ error: 'غير مصرح' });
    const msgs = await Message.find({ chat_id: req.params.id })
      .sort({ created_at: 1 }).limit(200);
    res.json(msgs);
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/chats/:id/messages', auth, async (req, res) => {
  try {
    const { text, reply_to, forwarded, sticker } = req.body;
    const chat = await Chat.findById(req.params.id);
    if (!chat || !chat.participants.map(String).includes(String(req.user._id)))
      return res.json({ error: 'غير مصرح' });

    const msg = await Message.create({
      chat_id  : req.params.id,
      sender_id: req.user._id,
      text     : text || '',
      type     : sticker ? 'sticker' : 'text',
      reply_to : reply_to || null,
      forwarded: !!forwarded,
      sticker  : !!sticker
    });

    // تحديث المحادثة
    const otherId = chat.participants.find(p => String(p) !== String(req.user._id));
    const uc = chat.unread_count || {};
    uc[String(otherId)] = (uc[String(otherId)] || 0) + 1;
    await Chat.findByIdAndUpdate(req.params.id, {
      last_message   : text || (sticker ? '🎭 ملصق' : '...'),
      last_message_at: new Date(),
      unread_count   : uc
    });

    // إرسال للمشاركين عبر Socket
    chat.participants.forEach(async pid => {
      const u = await User.findById(pid);
      if (u && u.socket_id) {
        io.to(u.socket_id).emit('new_message', msg);
      }
    });

    res.json(msg);
  } catch (e) {
    res.json({ error: e.message });
  }
});

// رفع صورة في محادثة
app.post('/api/chats/:id/messages/image', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.json({ error: 'لا توجد صورة' });
    const chat = await Chat.findById(req.params.id);
    if (!chat || !chat.participants.map(String).includes(String(req.user._id)))
      return res.json({ error: 'غير مصرح' });

    const result = await uploadToCloud(req.file.buffer, 'lumiq/images');
    const msg = await Message.create({
      chat_id  : req.params.id,
      sender_id: req.user._id,
      type     : 'image',
      image_url: result.secure_url
    });

    const otherId = chat.participants.find(p => String(p) !== String(req.user._id));
    const uc = chat.unread_count || {};
    uc[String(otherId)] = (uc[String(otherId)] || 0) + 1;
    await Chat.findByIdAndUpdate(req.params.id, {
      last_message   : '📷 صورة',
      last_message_at: new Date(),
      unread_count   : uc
    });

    chat.participants.forEach(async pid => {
      const u = await User.findById(pid);
      if (u && u.socket_id) io.to(u.socket_id).emit('new_message', msg);
    });

    res.json(msg);
  } catch (e) {
    res.json({ error: e.message });
  }
});

// رفع رسالة صوتية
app.post('/api/chats/:id/messages/voice', auth, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.json({ error: 'لا يوجد ملف صوتي' });
    const chat = await Chat.findById(req.params.id);
    if (!chat || !chat.participants.map(String).includes(String(req.user._id)))
      return res.json({ error: 'غير مصرح' });

    const result = await uploadToCloud(req.file.buffer, 'lumiq/audio', 'video');
    const msg = await Message.create({
      chat_id  : req.params.id,
      sender_id: req.user._id,
      type     : 'voice',
      audio_url: result.secure_url,
      duration : parseInt(req.body.duration) || 0
    });

    const otherId = chat.participants.find(p => String(p) !== String(req.user._id));
    const uc = chat.unread_count || {};
    uc[String(otherId)] = (uc[String(otherId)] || 0) + 1;
    await Chat.findByIdAndUpdate(req.params.id, {
      last_message   : '🎤 رسالة صوتية',
      last_message_at: new Date(),
      unread_count   : uc
    });

    chat.participants.forEach(async pid => {
      const u = await User.findById(pid);
      if (u && u.socket_id) io.to(u.socket_id).emit('new_message', msg);
    });

    res.json(msg);
  } catch (e) {
    res.json({ error: e.message });
  }
});

// تعديل رسالة
app.put('/api/messages/:id', auth, async (req, res) => {
  try {
    const { text } = req.body;
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.json({ error: 'الرسالة غير موجودة' });
    if (String(msg.sender_id) !== String(req.user._id))
      return res.json({ error: 'لا يمكنك تعديل رسالة شخص آخر' });
    msg.text = text;
    await msg.save();
    res.json(msg);
  } catch (e) {
    res.json({ error: e.message });
  }
});

// حذف رسالة
app.delete('/api/messages/:id', auth, async (req, res) => {
  try {
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.json({ error: 'الرسالة غير موجودة' });
    if (String(msg.sender_id) !== String(req.user._id))
      return res.json({ error: 'غير مصرح' });
    const chat = await Chat.findById(msg.chat_id);
    await Message.findByIdAndDelete(req.params.id);
    // أخبر المشاركين
    if (chat) {
      chat.participants.forEach(async pid => {
        const u = await User.findById(pid);
        if (u && u.socket_id) io.to(u.socket_id).emit('delete_message', { id: req.params.id });
      });
    }
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// تفاعل على رسالة
app.post('/api/messages/:id/react', auth, async (req, res) => {
  try {
    const { emoji } = req.body;
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.json({ error: 'الرسالة غير موجودة' });
    const reactions = msg.reactions || {};
    const uid = String(req.user._id);
    if (reactions[uid] === emoji) delete reactions[uid];
    else reactions[uid] = emoji;
    msg.reactions = reactions;
    msg.markModified('reactions');
    await msg.save();
    const chat = await Chat.findById(msg.chat_id);
    if (chat) {
      chat.participants.forEach(async pid => {
        const u = await User.findById(pid);
        if (u && u.socket_id) io.to(u.socket_id).emit('reaction', { msg_id: req.params.id, reactions });
      });
    }
    res.json({ reactions });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ── BLOCK ─────────────────────────────────────────────
app.post('/api/block', auth, async (req, res) => {
  try {
    const { user_id } = req.body;
    const exists = await Block.findOne({ blocker: req.user._id, blocked: user_id });
    if (!exists) await Block.create({ blocker: req.user._id, blocked: user_id });
    const other = await User.findById(user_id);
    if (other && other.socket_id) {
      io.to(other.socket_id).emit('you_are_blocked', { by_user_id: req.user._id });
    }
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/unblock', auth, async (req, res) => {
  try {
    const { user_id } = req.body;
    await Block.deleteOne({ blocker: req.user._id, blocked: user_id });
    const other = await User.findById(user_id);
    if (other && other.socket_id) {
      io.to(other.socket_id).emit('you_are_unblocked', { by_user_id: req.user._id });
    }
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.get('/api/block/status/:id', auth, async (req, res) => {
  try {
    const i_blocked  = await Block.exists({ blocker: req.user._id, blocked: req.params.id });
    const they_blocked = await Block.exists({ blocker: req.params.id, blocked: req.user._id });
    res.json({ i_blocked: !!i_blocked, they_blocked: !!they_blocked });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ── FRIENDS ───────────────────────────────────────────
app.get('/api/friends', auth, async (req, res) => {
  try {
    const friends = await Friend.find({
      $or: [{ requester: req.user._id }, { recipient: req.user._id }],
      status: { $in: ['accepted', 'pending'] }
    }).populate('requester recipient', '-password');
    const result = friends.map(f => {
      const other = String(f.requester._id) === String(req.user._id) ? f.recipient : f.requester;
      return { ...safeUser(other), status: f.status, i_requested: String(f.requester._id) === String(req.user._id) };
    });
    res.json(result);
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/friends/request', auth, async (req, res) => {
  try {
    const { user_id } = req.body;
    const exists = await Friend.findOne({
      $or: [
        { requester: req.user._id, recipient: user_id },
        { requester: user_id, recipient: req.user._id }
      ]
    });
    if (exists) return res.json({ error: 'الطلب موجود مسبقاً' });
    await Friend.create({ requester: req.user._id, recipient: user_id });
    // أشعر المستخدم الآخر
    const other = await User.findById(user_id);
    if (other && other.socket_id) {
      io.to(other.socket_id).emit('friend_request', { from: safeUser(req.user) });
    }
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/friends/accept', auth, async (req, res) => {
  try {
    const { user_id } = req.body;
    await Friend.findOneAndUpdate(
      { requester: user_id, recipient: req.user._id, status: 'pending' },
      { status: 'accepted' }
    );
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/friends/reject', auth, async (req, res) => {
  try {
    const { user_id } = req.body;
    await Friend.deleteOne({
      $or: [
        { requester: req.user._id, recipient: user_id },
        { requester: user_id, recipient: req.user._id }
      ]
    });
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ── NOTIFICATIONS ─────────────────────────────────────
app.get('/api/notifications', auth, async (req, res) => {
  try {
    const notifs = await Notification.find().sort({ created_at: -1 }).limit(50);
    res.json(notifs);
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/notifications/read', auth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (ids && ids.length) {
      await Notification.updateMany(
        { _id: { $in: ids } },
        { $addToSet: { read_by: req.user._id } }
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ── ADMIN API ─────────────────────────────────────────

// إحصائيات
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const [users, chats, messages, notifs, online] = await Promise.all([
      User.countDocuments(),
      Chat.countDocuments(),
      Message.countDocuments(),
      Notification.countDocuments(),
      User.countDocuments({ is_online: true })
    ]);
    const banned   = await User.countDocuments({ is_banned: true });
    const verified = await User.countDocuments({ is_verified: true });
    const today = new Date(); today.setHours(0,0,0,0);
    const newToday = await User.countDocuments({ created_at: { $gte: today } });
    res.json({ users, chats, messages, notifs, online, banned, verified, newToday });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// قائمة المستخدمين
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const q     = req.query.q || '';
    const filter = q ? { $or: [{ name: { $regex: q, $options: 'i' } }, { username: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } }] } : {};
    const [users, total] = await Promise.all([
      User.find(filter).select('-password').sort({ created_at: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(filter)
    ]);
    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// حظر مستخدم
app.post('/api/admin/ban/:id', adminAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { is_banned: true, ban_reason: reason || 'لم يتم تحديد سبب' },
      { new: true }
    );
    if (!user) return res.json({ error: 'المستخدم غير موجود' });
    if (user.socket_id) {
      io.to(user.socket_id).emit('force_ban', { reason: user.ban_reason, type: 'ban' });
    }
    res.json({ ok: true, user: safeUser(user) });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// رفع الحظر
app.post('/api/admin/unban/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { is_banned: false, ban_reason: '' },
      { new: true }
    );
    res.json({ ok: true, user: safeUser(user) });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// توثيق / إلغاء توثيق
app.post('/api/admin/verify/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.json({ error: 'المستخدم غير موجود' });
    user.is_verified = !user.is_verified;
    await user.save();
    res.json({ ok: true, is_verified: user.is_verified });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// حذف مستخدم
app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// إرسال broadcast
app.post('/api/admin/broadcast', adminAuth, async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) return res.json({ error: 'العنوان والرسالة مطلوبان' });
    const notif = await Notification.create({ title, message });
    io.emit('broadcast', { title, message, id: notif._id, created_at: notif.created_at });
    res.json({ ok: true, notif });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// إرسال تسجيل خروج قسري
app.post('/api/admin/logout/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.json({ error: 'المستخدم غير موجود' });
    if (user.socket_id) {
      io.to(user.socket_id).emit('force_logout', { reason: req.body.reason || '', type: 'logout' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════
// ADMIN DASHBOARD (HTML مدمج)
// ═══════════════════════════════════════════════════════
app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>LUMIQ — لوحة التحكم</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet"/>
<style>
:root{--bg:#F0F2F5;--card:#fff;--blue:#0A84FF;--blue2:#5E5CE6;--text:#1C1C1E;--sub:#8E8E93;--border:#E5E5EA;--red:#FF3B30;--green:#34C759;--orange:#FF9500;--r:14px;--fn:'Tajawal',sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--fn);background:var(--bg);color:var(--text);min-height:100vh}
a{color:inherit;text-decoration:none}
button,input,textarea,select{font-family:var(--fn);outline:none;border:none}
button{cursor:pointer}

/* LOGIN */
#login-wrap{display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#0A84FF22,#5E5CE622)}
.login-box{background:var(--card);border-radius:24px;padding:40px 36px;width:100%;max-width:400px;box-shadow:0 8px 40px rgba(0,0,0,.12)}
.login-logo{width:64px;height:64px;background:linear-gradient(135deg,var(--blue),var(--blue2));border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 6px 20px rgba(10,132,255,.3)}
.login-logo span{font-size:18px;font-weight:900;color:#fff}
.login-box h1{text-align:center;font-size:22px;font-weight:900;margin-bottom:4px}
.login-box p{text-align:center;color:var(--sub);font-size:14px;margin-bottom:24px}
.inp{width:100%;padding:13px 16px;background:var(--bg);border:1.5px solid var(--border);border-radius:12px;font-size:15px;color:var(--text);margin-bottom:12px}
.inp:focus{border-color:var(--blue)}
.btn-main{width:100%;padding:14px;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;border-radius:12px;font-size:16px;font-weight:700}
.btn-main:hover{opacity:.9}
.err{color:var(--red);font-size:13px;text-align:center;margin-top:8px;display:none}

/* LAYOUT */
#dashboard{display:none}
.sidebar{position:fixed;top:0;right:0;width:240px;height:100vh;background:var(--card);border-left:1px solid var(--border);display:flex;flex-direction:column;z-index:100}
.sidebar-logo{display:flex;align-items:center;gap:10px;padding:20px 18px 14px}
.sl-ico{width:40px;height:40px;background:linear-gradient(135deg,var(--blue),var(--blue2));border-radius:12px;display:flex;align-items:center;justify-content:center}
.sl-ico span{font-size:13px;font-weight:900;color:#fff}
.sl-name{font-size:17px;font-weight:900}
.sl-sub{font-size:11px;color:var(--sub)}
nav{flex:1;padding:6px 10px;overflow-y:auto}
.nav-item{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:12px;font-size:15px;font-weight:600;color:var(--sub);cursor:pointer;transition:all .2s;margin-bottom:2px}
.nav-item:hover{background:var(--bg)}
.nav-item.on{background:rgba(10,132,255,.1);color:var(--blue)}
.nav-item svg{width:20px;height:20px;flex-shrink:0}
.sidebar-foot{padding:14px 18px;border-top:1px solid var(--border);font-size:12px;color:var(--sub)}
.main{margin-right:240px;padding:28px;min-height:100vh}

/* TOPBAR */
.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
.topbar h1{font-size:26px;font-weight:900}
.badge-online{padding:5px 12px;background:rgba(52,199,89,.12);color:var(--green);border-radius:999px;font-size:13px;font-weight:700}

/* STATS */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:16px;margin-bottom:28px}
.stat-card{background:var(--card);border-radius:var(--r);padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.05)}
.stat-ico{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:12px}
.stat-ico svg{width:20px;height:20px}
.stat-val{font-size:28px;font-weight:900;line-height:1}
.stat-lbl{font-size:13px;color:var(--sub);margin-top:4px;font-weight:600}

/* SECTION */
.section{background:var(--card);border-radius:var(--r);padding:22px;box-shadow:0 2px 8px rgba(0,0,0,.05);margin-bottom:20px}
.section-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.section-title{font-size:17px;font-weight:800}

/* TABLE */
.tbl{width:100%;border-collapse:collapse}
.tbl th{text-align:right;padding:10px 14px;font-size:12px;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);background:var(--bg)}
.tbl td{padding:11px 14px;border-bottom:1px solid var(--border);font-size:14px;vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tr:hover td{background:var(--bg)}
.ava-sm{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--blue),var(--blue2));display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0;overflow:hidden}
.ava-sm img{width:100%;height:100%;object-fit:cover}
.uinfo{display:flex;align-items:center;gap:10px}
.uname{font-size:15px;font-weight:700}
.uemail{font-size:12px;color:var(--sub)}
.badge{padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700}
.badge-ban{background:rgba(255,59,48,.12);color:var(--red)}
.badge-ver{background:rgba(10,132,255,.12);color:var(--blue)}
.badge-ok{background:rgba(52,199,89,.12);color:var(--green)}
.badge-off{background:rgba(142,142,147,.1);color:var(--sub)}
.acts{display:flex;gap:6px;flex-wrap:wrap}
.act-btn{padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s;border:none}
.act-btn:active{opacity:.8}
.btn-ban{background:rgba(255,59,48,.1);color:var(--red)}
.btn-ban:hover{background:rgba(255,59,48,.2)}
.btn-unban{background:rgba(52,199,89,.1);color:var(--green)}
.btn-unban:hover{background:rgba(52,199,89,.2)}
.btn-verify{background:rgba(10,132,255,.1);color:var(--blue)}
.btn-verify:hover{background:rgba(10,132,255,.2)}
.btn-del{background:rgba(255,59,48,.06);color:var(--red)}
.btn-del:hover{background:rgba(255,59,48,.15)}
.btn-logout{background:rgba(255,149,0,.1);color:var(--orange)}

/* SEARCH BAR */
.sbar{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.s-inp{flex:1;padding:10px 14px;background:var(--bg);border:1.5px solid var(--border);border-radius:10px;font-size:14px;color:var(--text)}
.s-inp:focus{border-color:var(--blue)}
.btn-blue{padding:10px 18px;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer}
.btn-blue:hover{opacity:.9}

/* BROADCAST */
.bcast-form{display:flex;flex-direction:column;gap:12px}
.bcast-form input,.bcast-form textarea{width:100%;padding:12px 14px;background:var(--bg);border:1.5px solid var(--border);border-radius:10px;font-size:14px;color:var(--text)}
.bcast-form input:focus,.bcast-form textarea:focus{border-color:var(--blue)}
.bcast-form textarea{min-height:90px;resize:vertical}

/* TOAST */
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background:#1C1C1E;color:#fff;padding:11px 22px;border-radius:999px;font-size:14px;font-weight:600;opacity:0;transition:all .3s;z-index:999;pointer-events:none;white-space:nowrap}
.toast.on{opacity:1;transform:translateX(-50%) translateY(0)}

/* PANEL */
.panel{display:none}
.panel.on{display:block}

/* PAGINATION */
.pagi{display:flex;gap:8px;margin-top:16px;justify-content:center}
.pagi-btn{padding:7px 14px;background:var(--bg);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:1.5px solid var(--border)}
.pagi-btn.on{background:var(--blue);color:#fff;border-color:var(--blue)}
.pagi-btn:disabled{opacity:.4;cursor:default}

/* LOADER */
.loading-row td{text-align:center;padding:30px;color:var(--sub)}

/* MODAL */
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);z-index:500;display:none;align-items:center;justify-content:center}
.modal-bg.on{display:flex}
.modal-box{background:var(--card);border-radius:20px;padding:30px;max-width:440px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.2)}
.modal-box h2{font-size:18px;font-weight:900;margin-bottom:6px}
.modal-box p{font-size:13px;color:var(--sub);margin-bottom:16px}
.modal-box input,.modal-box textarea{width:100%;padding:11px 14px;background:var(--bg);border:1.5px solid var(--border);border-radius:10px;font-size:14px;color:var(--text);margin-bottom:12px}
.modal-box input:focus,.modal-box textarea:focus{border-color:var(--blue)}
.modal-acts{display:flex;gap:10px;justify-content:flex-end}
.btn-cancel{padding:10px 18px;background:var(--bg);color:var(--sub);border-radius:10px;font-size:14px;font-weight:700;cursor:pointer}
.btn-red{padding:10px 18px;background:linear-gradient(135deg,var(--red),#FF6B6B);color:#fff;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer}
.btn-send{padding:10px 18px;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer}

@media(max-width:768px){
  .sidebar{width:100%;height:auto;position:static;flex-direction:row;flex-wrap:wrap;border-left:none;border-bottom:1px solid var(--border)}
  .main{margin-right:0;padding:16px}
  .stats-grid{grid-template-columns:repeat(2,1fr)}
  nav{display:flex;flex-wrap:wrap;gap:4px;padding:8px}
  .nav-item{padding:8px 12px;font-size:13px}
  .sidebar-foot{display:none}
}
</style>
</head>
<body>

<!-- LOGIN -->
<div id="login-wrap">
  <div class="login-box">
    <div class="login-logo"><span>L</span></div>
    <h1>لوحة تحكم LUMIQ</h1>
    <p>أدخل كلمة المرور للمتابعة</p>
    <input class="inp" type="password" id="admin-pass" placeholder="كلمة المرور" onkeydown="if(event.key==='Enter')doLogin()"/>
    <button class="btn-main" onclick="doLogin()">دخول</button>
    <div class="err" id="login-err">كلمة المرور غير صحيحة</div>
  </div>
</div>

<!-- DASHBOARD -->
<div id="dashboard">
  <!-- Sidebar -->
  <div class="sidebar">
    <div class="sidebar-logo">
      <div class="sl-ico"><span>LQ</span></div>
      <div><div class="sl-name">LUMIQ</div><div class="sl-sub">لوحة التحكم v2.0</div></div>
    </div>
    <nav>
      <div class="nav-item on" onclick="showPanel('overview')" id="nav-overview">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        نظرة عامة
      </div>
      <div class="nav-item" onclick="showPanel('users')" id="nav-users">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        إدارة المستخدمين
      </div>
      <div class="nav-item" onclick="showPanel('broadcast')" id="nav-broadcast">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        إرسال إشعار
      </div>
      <div class="nav-item" onclick="showPanel('notifs')" id="nav-notifs">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        سجل الإشعارات
      </div>
    </nav>
    <div class="sidebar-foot">LUMIQ Admin Panel © 2025</div>
  </div>

  <!-- MAIN -->
  <div class="main">
    <div class="topbar">
      <h1 id="page-title">نظرة عامة</h1>
      <div class="badge-online" id="online-badge">● 0 متصل</div>
    </div>

    <!-- OVERVIEW -->
    <div class="panel on" id="panel-overview">
      <div class="stats-grid" id="stats-grid">
        <div class="stat-card"><div class="stat-ico" style="background:rgba(10,132,255,.12);color:var(--blue)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div class="stat-val" id="st-users">—</div><div class="stat-lbl">إجمالي المستخدمين</div></div>
        <div class="stat-card"><div class="stat-ico" style="background:rgba(52,199,89,.12);color:var(--green)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="stat-val" id="st-online">—</div><div class="stat-lbl">متصلون الآن</div></div>
        <div class="stat-card"><div class="stat-ico" style="background:rgba(94,92,230,.12);color:var(--blue2)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div><div class="stat-val" id="st-chats">—</div><div class="stat-lbl">المحادثات</div></div>
        <div class="stat-card"><div class="stat-ico" style="background:rgba(255,149,0,.12);color:var(--orange)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></div><div class="stat-val" id="st-msgs">—</div><div class="stat-lbl">الرسائل</div></div>
        <div class="stat-card"><div class="stat-ico" style="background:rgba(255,59,48,.12);color:var(--red)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></div><div class="stat-val" id="st-banned">—</div><div class="stat-lbl">محظورون</div></div>
        <div class="stat-card"><div class="stat-ico" style="background:rgba(10,132,255,.12);color:var(--blue)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816s-.852-.972-1.438-1.246c.223-.607.27-1.264.14-1.897s-.437-1.218-.882-1.687"/></svg></div><div class="stat-val" id="st-verified">—</div><div class="stat-lbl">موثّقون</div></div>
        <div class="stat-card"><div class="stat-ico" style="background:rgba(52,199,89,.12);color:var(--green)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></div><div class="stat-val" id="st-new">—</div><div class="stat-lbl">مسجلون اليوم</div></div>
        <div class="stat-card"><div class="stat-ico" style="background:rgba(94,92,230,.12);color:var(--blue2)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div><div class="stat-val" id="st-notifs">—</div><div class="stat-lbl">الإشعارات المُرسلة</div></div>
      </div>

      <!-- آخر المستخدمين -->
      <div class="section">
        <div class="section-hdr">
          <div class="section-title">آخر المسجلين</div>
          <button class="btn-blue" onclick="showPanel('users')">عرض الكل</button>
        </div>
        <div style="overflow-x:auto">
          <table class="tbl">
            <thead><tr><th>المستخدم</th><th>تاريخ التسجيل</th><th>الحالة</th></tr></thead>
            <tbody id="recent-users-tbl"><tr class="loading-row"><td colspan="3">جاري التحميل...</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- USERS -->
    <div class="panel" id="panel-users">
      <div class="section">
        <div class="section-hdr">
          <div class="section-title">إدارة المستخدمين</div>
          <div id="users-count" style="font-size:13px;color:var(--sub)"></div>
        </div>
        <div class="sbar">
          <input class="s-inp" id="user-search" type="text" placeholder="بحث بالاسم أو البريد أو اسم المستخدم..." oninput="searchUsers()"/>
        </div>
        <div style="overflow-x:auto">
          <table class="tbl">
            <thead><tr><th>المستخدم</th><th>البريد</th><th>الحالة</th><th>الصلاحيات</th><th>إجراءات</th></tr></thead>
            <tbody id="users-tbl"><tr class="loading-row"><td colspan="5">جاري التحميل...</td></tr></tbody>
          </table>
        </div>
        <div class="pagi" id="users-pagi"></div>
      </div>
    </div>

    <!-- BROADCAST -->
    <div class="panel" id="panel-broadcast">
      <div class="section" style="max-width:600px">
        <div class="section-hdr"><div class="section-title">إرسال إشعار لجميع المستخدمين</div></div>
        <div class="bcast-form">
          <input id="bc-title" type="text" placeholder="عنوان الإشعار..."/>
          <textarea id="bc-msg" placeholder="نص الإشعار..."></textarea>
          <div style="display:flex;gap:10px">
            <button class="btn-blue" onclick="sendBroadcast()" style="flex:1">إرسال الإشعار 🔔</button>
            <button class="btn-cancel" onclick="document.getElementById('bc-title').value='';document.getElementById('bc-msg').value=''">مسح</button>
          </div>
        </div>
      </div>
    </div>

    <!-- NOTIFS LOG -->
    <div class="panel" id="panel-notifs">
      <div class="section">
        <div class="section-hdr"><div class="section-title">سجل الإشعارات المُرسلة</div></div>
        <div style="overflow-x:auto">
          <table class="tbl">
            <thead><tr><th>العنوان</th><th>الرسالة</th><th>التاريخ</th></tr></thead>
            <tbody id="notifs-tbl"><tr class="loading-row"><td colspan="3">جاري التحميل...</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>

  </div><!-- /main -->
</div><!-- /dashboard -->

<!-- BAN MODAL -->
<div class="modal-bg" id="ban-modal">
  <div class="modal-box">
    <h2>حظر المستخدم</h2>
    <p>سيتم إبلاغ المستخدم بالحظر وتسجيل خروجه فوراً</p>
    <input id="ban-reason-inp" type="text" placeholder="سبب الحظر (اختياري)..."/>
    <div class="modal-acts">
      <button class="btn-cancel" onclick="closeBanModal()">إلغاء</button>
      <button class="btn-red" onclick="confirmBan()">تأكيد الحظر</button>
    </div>
  </div>
</div>

<!-- TOAST -->
<div class="toast" id="toast"></div>

<script>
var PASS = '';
var currentPage = 1;
var searchQ = '';
var banUserId = null;

// ── LOGIN ─────────────────────────────────────────────
function doLogin() {
  var p = document.getElementById('admin-pass').value;
  fetch('/api/admin/stats?pass=' + encodeURIComponent(p))
    .then(r => r.json()).then(data => {
      if (data.error) { document.getElementById('login-err').style.display = 'block'; return; }
      PASS = p;
      document.getElementById('login-wrap').style.display = 'none';
      document.getElementById('dashboard').style.display = 'block';
      loadOverview();
      setInterval(loadStats, 15000);
    }).catch(() => { document.getElementById('login-err').style.display = 'block'; });
}

// ── PANEL ─────────────────────────────────────────────
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('on'));
  document.getElementById('panel-' + name).classList.add('on');
  document.getElementById('nav-' + name).classList.add('on');
  var titles = { overview:'نظرة عامة', users:'إدارة المستخدمين', broadcast:'إرسال إشعار', notifs:'سجل الإشعارات' };
  document.getElementById('page-title').textContent = titles[name] || '';
  if (name === 'users') loadUsers();
  if (name === 'notifs') loadNotifs();
}

// ── TOAST ─────────────────────────────────────────────
function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('on');
  setTimeout(() => el.classList.remove('on'), 2800);
}

// ── API ───────────────────────────────────────────────
async function api(method, path, body) {
  var opts = { method, headers: { 'Content-Type': 'application/json', 'x-admin-pass': PASS } };
  if (body) opts.body = JSON.stringify(body);
  var r = await fetch(path, opts);
  return r.json();
}

// ── OVERVIEW ─────────────────────────────────────────
async function loadOverview() {
  await loadStats();
  // آخر المسجلين
  var data = await api('GET', '/api/admin/users?limit=8&pass=' + PASS);
  var tbody = document.getElementById('recent-users-tbl');
  if (!data.users || !data.users.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--sub)">لا يوجد مستخدمون</td></tr>';
    return;
  }
  tbody.innerHTML = data.users.map(u => \`
    <tr>
      <td><div class="uinfo">
        <div class="ava-sm">\${u.photo_url ? '<img src="'+u.photo_url+'" alt=""/>' : u.name[0]}</div>
        <div><div class="uname">\${esc(u.name)} \${u.is_verified ? '✓' : ''}</div><div class="uemail">@\${esc(u.username)}</div></div>
      </div></td>
      <td style="color:var(--sub);font-size:13px">\${fmtDate(u.created_at)}</td>
      <td><span class="badge \${u.is_banned ? 'badge-ban' : u.is_online ? 'badge-ok' : 'badge-off'}">\${u.is_banned ? 'محظور' : u.is_online ? 'متصل' : 'غير متصل'}</span></td>
    </tr>
  \`).join('');
}

async function loadStats() {
  var d = await api('GET', '/api/admin/stats?pass=' + PASS);
  if (d.error) return;
  document.getElementById('st-users').textContent = d.users || 0;
  document.getElementById('st-online').textContent = d.online || 0;
  document.getElementById('st-chats').textContent = d.chats || 0;
  document.getElementById('st-msgs').textContent = d.messages || 0;
  document.getElementById('st-banned').textContent = d.banned || 0;
  document.getElementById('st-verified').textContent = d.verified || 0;
  document.getElementById('st-new').textContent = d.newToday || 0;
  document.getElementById('st-notifs').textContent = d.notifs || 0;
  document.getElementById('online-badge').textContent = '● ' + (d.online || 0) + ' متصل';
}

// ── USERS ─────────────────────────────────────────────
var searchTimer;
function searchUsers() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchQ = document.getElementById('user-search').value.trim();
    currentPage = 1;
    loadUsers();
  }, 400);
}

async function loadUsers(page) {
  if (page) currentPage = page;
  var url = \`/api/admin/users?pass=\${PASS}&page=\${currentPage}&limit=20\${searchQ ? '&q='+encodeURIComponent(searchQ) : ''}\`;
  var data = await api('GET', url);
  var tbody = document.getElementById('users-tbl');
  if (!data.users) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--sub)">خطأ في التحميل</td></tr>';
    return;
  }
  document.getElementById('users-count').textContent = data.total + ' مستخدم';
  if (!data.users.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--sub)">لا يوجد نتائج</td></tr>';
    document.getElementById('users-pagi').innerHTML = '';
    return;
  }
  tbody.innerHTML = data.users.map(u => \`
    <tr id="row-\${u.id}">
      <td><div class="uinfo">
        <div class="ava-sm">\${u.photo_url ? '<img src="'+u.photo_url+'" alt=""/>' : u.name[0]}</div>
        <div><div class="uname">\${esc(u.name)}</div><div class="uemail">@\${esc(u.username)}</div></div>
      </div></td>
      <td style="font-size:13px;color:var(--sub)">\${esc(u.email)}</td>
      <td><span class="badge \${u.is_online ? 'badge-ok' : 'badge-off'}">\${u.is_online ? 'متصل' : 'غير متصل'}</span></td>
      <td>
        \${u.is_banned ? '<span class="badge badge-ban">محظور</span>' : ''}
        \${u.is_verified ? '<span class="badge badge-ver" style="margin-right:4px">موثق ✓</span>' : ''}
      </td>
      <td><div class="acts">
        \${u.is_banned
          ? '<button class="act-btn btn-unban" onclick="unbanUser(\''+u.id+'\')">رفع الحظر</button>'
          : '<button class="act-btn btn-ban" onclick="openBanModal(\''+u.id+'\')">حظر</button>'
        }
        <button class="act-btn btn-verify" onclick="toggleVerify(\''+u.id+'\')">
          \${u.is_verified ? 'إلغاء التوثيق' : 'توثيق'}
        </button>
        <button class="act-btn btn-logout" onclick="forceLogout(\''+u.id+'\')">تسجيل خروج</button>
        <button class="act-btn btn-del" onclick="deleteUser(\''+u.id+'\', \''+esc(u.name)+'\')">حذف</button>
      </div></td>
    </tr>
  \`).join('');

  // pagination
  var pagi = document.getElementById('users-pagi');
  pagi.innerHTML = '';
  if (data.pages > 1) {
    for (var i = 1; i <= data.pages; i++) {
      var btn = document.createElement('button');
      btn.className = 'pagi-btn' + (i === currentPage ? ' on' : '');
      btn.textContent = i;
      btn.onclick = (function(p){ return function(){ loadUsers(p); }; })(i);
      pagi.appendChild(btn);
    }
  }
}

// BAN
function openBanModal(id) {
  banUserId = id;
  document.getElementById('ban-reason-inp').value = '';
  document.getElementById('ban-modal').classList.add('on');
}
function closeBanModal() { document.getElementById('ban-modal').classList.remove('on'); banUserId = null; }
async function confirmBan() {
  if (!banUserId) return;
  var reason = document.getElementById('ban-reason-inp').value.trim() || 'لم يتم تحديد سبب';
  await api('POST', '/api/admin/ban/' + banUserId, { pass: PASS, reason });
  closeBanModal(); toast('✅ تم حظر المستخدم'); loadUsers();
}
async function unbanUser(id) {
  await api('POST', '/api/admin/unban/' + id, { pass: PASS });
  toast('✅ تم رفع الحظر'); loadUsers();
}
async function toggleVerify(id) {
  var data = await api('POST', '/api/admin/verify/' + id, { pass: PASS });
  toast(data.is_verified ? '✅ تم التوثيق' : '✅ تم إلغاء التوثيق'); loadUsers();
}
async function forceLogout(id) {
  await api('POST', '/api/admin/logout/' + id, { pass: PASS, reason: 'تسجيل خروج من قِبل الإدارة' });
  toast('✅ تم تسجيل خروج المستخدم');
}
async function deleteUser(id, name) {
  if (!confirm('هل تريد حذف المستخدم ' + name + ' نهائياً؟')) return;
  await api('DELETE', '/api/admin/users/' + id, { pass: PASS });
  toast('🗑️ تم حذف المستخدم'); loadUsers();
}

// BROADCAST
async function sendBroadcast() {
  var title = document.getElementById('bc-title').value.trim();
  var message = document.getElementById('bc-msg').value.trim();
  if (!title || !message) { toast('⚠️ العنوان والرسالة مطلوبان'); return; }
  var data = await api('POST', '/api/admin/broadcast', { pass: PASS, title, message });
  if (data.ok) {
    toast('✅ تم إرسال الإشعار لجميع المستخدمين');
    document.getElementById('bc-title').value = '';
    document.getElementById('bc-msg').value = '';
  } else { toast('❌ ' + (data.error || 'خطأ')); }
}

// NOTIFS LOG
async function loadNotifs() {
  var data = await api('GET', '/api/notifications?pass=' + PASS);
  var tbody = document.getElementById('notifs-tbl');
  if (!Array.isArray(data) || !data.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:30px;color:var(--sub)">لا توجد إشعارات مُرسلة</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(n => \`
    <tr>
      <td style="font-weight:700">\${esc(n.title)}</td>
      <td style="color:var(--sub);max-width:300px">\${esc(n.message)}</td>
      <td style="font-size:13px;color:var(--sub);white-space:nowrap">\${fmtDate(n.created_at)}</td>
    </tr>
  \`).join('');
}

// HELPERS
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(ts) {
  if (!ts) return '—';
  var d = new Date(ts);
  return d.toLocaleDateString('ar-SA', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

// Close modal on bg click
document.getElementById('ban-modal').onclick = function(e) {
  if (e.target === this) closeBanModal();
};
</script>
</body>
</html>`);
});

// ══════════════════════════════════════════════════════
// SOCKET.IO
// ══════════════════════════════════════════════════════
const onlineUsers = new Map(); // socketId → userId

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  // انضمام
  socket.on('join', async ({ token: t }) => {
    try {
      const decoded = jwt.verify(t, JWT_SECRET);
      const user = await User.findByIdAndUpdate(
        decoded.id,
        { is_online: true, socket_id: socket.id, last_seen: new Date() },
        { new: true }
      );
      if (!user) return;
      socket.userId = decoded.id;
      onlineUsers.set(socket.id, decoded.id);

      // أرسل للجميع حالة الاتصال
      socket.broadcast.emit('user_online', { user_id: decoded.id, is_online: true });

      // إشعارات غير مقروءة
      const pendingNotifs = await Notification.find({
        read_by: { $ne: decoded.id }
      }).sort({ created_at: -1 }).limit(10);
      if (pendingNotifs.length) {
        socket.emit('pending_notifications', { notifications: pendingNotifs });
      }
    } catch (e) {
      console.error('join error:', e.message);
    }
  });

  // انضمام لغرفة محادثة
  socket.on('join_chat', ({ chat_id }) => {
    socket.join('chat_' + chat_id);
  });

  // كتابة
  socket.on('typing', ({ chat_id, user_id, is_typing }) => {
    socket.to('chat_' + chat_id).emit('typing', { user_id, is_typing });
  });

  // تمت القراءة
  socket.on('messages_seen', async ({ chat_id, reader_id, partner_id }) => {
    try {
      const partner = await User.findById(partner_id);
      if (partner && partner.socket_id) {
        io.to(partner.socket_id).emit('messages_seen', { chat_id, reader_id });
      }
      // تحديث تيكات الرسائل
      await Message.updateMany(
        { chat_id, sender_id: partner_id, seen: false },
        { seen: true }
      );
    } catch (e) {}
  });

  // WebRTC – مكالمات
  socket.on('call_user', async ({ to_user_id, from_socket_id, signal }) => {
    try {
      const target = await User.findById(to_user_id);
      if (target && target.socket_id) {
        const caller = await User.findOne({ socket_id: socket.id });
        io.to(target.socket_id).emit('incoming_call', {
          from: caller ? { id: caller._id, name: caller.name, photo_url: caller.photo_url } : {},
          from_socket_id: socket.id,
          signal
        });
      } else {
        socket.emit('call_failed', { reason: 'المستخدم غير متصل' });
      }
    } catch (e) {}
  });

  socket.on('call_accept', ({ to_socket_id }) => {
    io.to(to_socket_id).emit('call_accepted', { socket_id: socket.id });
  });

  socket.on('call_reject', ({ to_socket_id }) => {
    io.to(to_socket_id).emit('call_rejected');
  });

  socket.on('call_end', ({ to_socket_id }) => {
    io.to(to_socket_id).emit('call_ended');
  });

  socket.on('webrtc_offer', ({ to_socket_id, offer }) => {
    io.to(to_socket_id).emit('webrtc_offer', { offer, from_socket_id: socket.id });
  });

  socket.on('webrtc_answer', ({ to_socket_id, answer }) => {
    io.to(to_socket_id).emit('webrtc_answer', { answer });
  });

  socket.on('webrtc_ice', ({ to_socket_id, candidate }) => {
    io.to(to_socket_id).emit('webrtc_ice', { candidate });
  });

  // قطع الاتصال
  socket.on('disconnect', async () => {
    console.log('❌ Socket disconnected:', socket.id);
    onlineUsers.delete(socket.id);
    if (socket.userId) {
      try {
        await User.findByIdAndUpdate(socket.userId, {
          is_online: false,
          socket_id: '',
          last_seen: new Date()
        });
        socket.broadcast.emit('user_online', { user_id: socket.userId, is_online: false, last_seen: new Date() });
      } catch (e) {}
    }
  });
});

// ══════════════════════════════════════════════════════
// START SERVER
// ══════════════════════════════════════════════════════
mongoose.connect(MONGO_URI).then(() => {
  console.log('✅ MongoDB connected');
  server.listen(PORT, () => {
    console.log(\`🚀 LUMIQ Server running on port \${PORT}\`);
    console.log(\`🔧 Admin Dashboard: http://localhost:\${PORT}/admin\`);
  });
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});
