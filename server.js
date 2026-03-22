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
// ═══════════════════════════════════════════════════════
// ADMIN DASHBOARD — served from admin.html file
// ═══════════════════════════════════════════════════════
const fs = require('fs');

app.get('/admin', (req, res) => {
  const adminFile = path.join(__dirname, 'admin.html');
  if (fs.existsSync(adminFile)) {
    res.sendFile(adminFile);
  } else {
    res.send('<h2>admin.html not found — please upload it to the server root</h2>');
  }
});

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
    console.log(`🚀 LUMIQ Server running on port ${PORT}`);
    console.log(`🔧 Admin Dashboard: http://localhost:${PORT}/admin`);
  });
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

