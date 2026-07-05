import express, { Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

const prisma = new PrismaClient();
const PORT = process.env.PORT || 8095;

app.use(cors());
app.use(express.json());

// ==========================================
// 🏥 Health Check Route (Для мониторинга Render / Railway)
// ==========================================
app.get('/health', async (req: Request, res: Response) => {
  try {
    const usersCount = await prisma.user.count();
    const roomsCount = await prisma.room.count();
    const tracksCount = await prisma.track.count();
    res.json({
      status: 'ok',
      service: 'JamZone Realtime Backend 2026',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      stats: {
        users: usersCount,
        rooms: roomsCount,
        tracks: tracksCount
      }
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// 👤 REST API: Авторизация и Юзеры
// ==========================================
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, name, avatar, bio } = req.body;
    if (!username || !name) {
      return res.status(400).json({ error: 'Username и Имя обязательны' });
    }
    const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
    let user = await prisma.user.findUnique({ where: { username: cleanUsername } });
    if (user) {
      return res.status(400).json({ error: 'Пользователь @' + cleanUsername + ' уже существует' });
    }
    user = await prisma.user.create({
      data: {
        username: cleanUsername,
        name: name.trim(),
        avatar: avatar || '😎',
        bio: bio || 'Vibing in JamZone',
        jamCoins: 500 // 500 подарочных монет новичкам
      }
    });
    res.json({ success: true, user, token: 'jz_jwt_' + user.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username обязателен' });
    const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
    const user = await prisma.user.findUnique({ where: { username: cleanUsername } });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден. Пройди регистрацию.' });
    }
    res.json({ success: true, user, token: 'jz_jwt_' + user.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:username', async (req: Request, res: Response) => {
  try {
    const username = req.params.username.toLowerCase().replace(/^@/, '');
    const user = await prisma.user.findUnique({
      where: { username },
      include: { creator: true }
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🎸 REST API: Indie Creator Hub (Артисты & Треки)
// ==========================================
app.post('/api/creators/register', async (req: Request, res: Response) => {
  try {
    const { userId, stageName, genre, bio } = req.body;
    let creator = await prisma.creatorProfile.findUnique({ where: { userId } });
    if (creator) {
      creator = await prisma.creatorProfile.update({
        where: { userId },
        data: { stageName, genre, bio }
      });
    } else {
      creator = await prisma.creatorProfile.create({
        data: { userId, stageName, genre, bio: bio || 'Indie Artist on JamZone', verified: true }
      });
    }
    res.json({ success: true, creator });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/creators', async (req: Request, res: Response) => {
  try {
    const creators = await prisma.creatorProfile.findMany({
      include: { user: true, releases: true },
      orderBy: { totalEarned: 'desc' }
    });
    res.json(creators);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Донат (чаевые JamCoins артисту или другу)
app.post('/api/tips/send', async (req: Request, res: Response) => {
  try {
    const { fromUsername, toUsername, amount, message, trackId } = req.body;
    const coins = parseInt(amount, 10);
    if (!coins || coins <= 0) return res.status(400).json({ error: 'Неверная сумма' });

    const sender = await prisma.user.findUnique({ where: { username: fromUsername.toLowerCase() } });
    const receiver = await prisma.user.findUnique({
      where: { username: toUsername.toLowerCase() },
      include: { creator: true }
    });

    if (!sender || !receiver) return res.status(404).json({ error: 'Пользователь не найден' });
    if (sender.jamCoins < coins) return res.status(400).json({ error: 'Недостаточно монеток JamCoins на балансе!' });

    // Транзакция обновления балансов
    await prisma.$transaction([
      prisma.user.update({ where: { id: sender.id }, data: { jamCoins: { decrement: coins } } }),
      prisma.user.update({ where: { id: receiver.id }, data: { jamCoins: { increment: coins } } }),
      prisma.jamCoinTransaction.create({
        data: {
          fromId: sender.id,
          toId: receiver.id,
          amount: coins,
          message: message || 'Праздничный донат за отличный вайб! 🎉',
          trackId: trackId || null
        }
      })
    ]);

    // Если получатель артист — увеличиваем счетчик заработанного
    if (receiver.creator) {
      await prisma.creatorProfile.update({
        where: { id: receiver.creator.id },
        data: { totalEarned: { increment: coins } }
      });
    }

    // Уведомляем по сокетам в реальном времени!
    io.emit('tip_received', {
      from: sender.name,
      to: receiver.name,
      amount: coins,
      message: message || 'Праздничный донат за отличный вайб! 🎉',
      timestamp: Date.now()
    });

    res.json({ success: true, newBalance: sender.jamCoins - coins });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 💬 REST API: Комнаты и Треки
// ==========================================
app.get('/api/rooms', async (req: Request, res: Response) => {
  try {
    const rooms = await prisma.room.findMany({
      include: { host: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(rooms);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rooms/create', async (req: Request, res: Response) => {
  try {
    const { name, topic, cover, hostUsername } = req.body;
    const host = await prisma.user.findUnique({ where: { username: hostUsername.toLowerCase() } });
    if (!host) return res.status(404).json({ error: 'Хост не найден' });

    const room = await prisma.room.create({
      data: {
        name,
        topic: topic || 'General Music Room',
        cover: cover || '🎧',
        hostId: host.id
      },
      include: { host: true }
    });
    io.emit('room_created', room);
    res.json({ success: true, room });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tracks', async (req: Request, res: Response) => {
  try {
    const tracks = await prisma.track.findMany({
      include: { uploader: true, creator: true },
      orderBy: { playCount: 'desc' }
    });
    res.json(tracks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ⚡ WebSockets: Синхронное прослушивание (Listen Together) & Чат
// ==========================================
const onlineUsers = new Map<string, string>(); // socketId -> username
const activeListenSessions = new Map<string, any>(); // sessionId -> sessionData

io.on('connection', (socket: Socket) => {
  console.log(`[Socket.IO] Подключился клиент: ${socket.id}`);

  // Регистрация сокета пользователя
  socket.on('user_online', (username: string) => {
    if (username) {
      const clean = username.toLowerCase().replace(/^@/, '');
      onlineUsers.set(socket.id, clean);
      socket.join('user_' + clean);
      io.emit('online_users_update', Array.from(new Set(onlineUsers.values())));
      console.log(`[Socket.IO] Пользователь онлайн: @${clean}`);
    }
  });

  // Вход в комнату (Join Room)
  socket.on('join_room', (roomId: string) => {
    socket.join(roomId);
    console.log(`[Socket.IO] ${socket.id} вошел в комнату ${roomId}`);
  });

  // Отправка сообщения в комнату
  socket.on('send_message', async (data: { roomId: string; senderUsername: string; text: string; msgType?: string }) => {
    try {
      const { roomId, senderUsername, text, msgType } = data;
      const sender = await prisma.user.findUnique({ where: { username: senderUsername.toLowerCase() } });
      if (sender) {
        const msg = await prisma.message.create({
          data: { roomId, senderId: sender.id, text, msgType: msgType || 'text' },
          include: { sender: true }
        });
        io.to(roomId).emit('new_message', msg);
      }
    } catch (err) {
      console.error('[Socket.IO] Error saving message:', err);
    }
  });

  // 🎧 Синхронное прослушивание: Приглашение (Listen Together Invite)
  socket.on('listen_invite', (data: { to: string; from: string; track: any; sessionId: string }) => {
    const targetRoom = 'user_' + data.to.toLowerCase();
    io.to(targetRoom).emit('listen_invite_received', {
      from: data.from,
      track: data.track,
      sessionId: data.sessionId,
      timestamp: Date.now()
    });
    console.log(`[Listen Together] Приглашение от @${data.from} для @${data.to}`);
  });

  // 🎧 Синхронное прослушивание: Принятие приглашения
  socket.on('listen_accept', (data: { to: string; from: string; sessionId: string }) => {
    const targetRoom = 'user_' + data.to.toLowerCase();
    io.to(targetRoom).emit('listen_accepted', {
      from: data.from,
      sessionId: data.sessionId,
      timestamp: Date.now()
    });
    socket.join(data.sessionId);
  });

  // 🎧 Синхронная пауза / воспроизведение / перемотка
  socket.on('listen_control', (data: { sessionId: string; action: 'play' | 'pause' | 'seek'; pos: number; sender: string }) => {
    socket.to(data.sessionId).emit('listen_sync_action', {
      action: data.action,
      pos: data.pos,
      sender: data.sender,
      timestamp: Date.now()
    });
  });

  // Отключение
  socket.on('disconnect', () => {
    const username = onlineUsers.get(socket.id);
    if (username) {
      onlineUsers.delete(socket.id);
      io.emit('online_users_update', Array.from(new Set(onlineUsers.values())));
      console.log(`[Socket.IO] Отключился @${username}`);
    }
  });
});

// Инициализация базы данных и запуск сервера
async function startServer() {
  try {
    // Автосоздание стартовых демо-пользователей и треков при первом запуске
    const usersCount = await prisma.user.count();
    if (usersCount === 0) {
      console.log('🌱 Инициализация базы данных стартовыми демо-данными...');
      const demoUser = await prisma.user.create({
        data: { username: 'demo', name: 'Demo Founder', avatar: '🎧', jamCoins: 1000, isPremium: true, bio: 'JamZone Creator & Vibe Master' }
      });
      const alex = await prisma.user.create({
        data: { username: 'alex', name: 'Alex Nova', avatar: '🎸', jamCoins: 750, bio: 'Indie Rock Producer' }
      });
      const sofia = await prisma.user.create({
        data: { username: 'sofia', name: 'Sofia Sky', avatar: '🎬', jamCoins: 600, bio: 'Cinema & Chill Room Host' }
      });

      // Создаем профиль криэйтора Alex Nova
      const creatorAlex = await prisma.creatorProfile.create({
        data: { userId: alex.id, stageName: 'Alex Nova Band', genre: 'Indie / Synthwave', totalEarned: 2450, bio: 'Making synthwave hits for JamZone' }
      });

      // Создаем комнаты
      await prisma.room.create({
        data: { name: 'Lo-Fi Chill & Chat ☕', topic: 'chill, lofi, study', cover: '☕', hostId: sofia.id }
      });
      await prisma.room.create({
        data: { name: 'Midnight Synthwave Drive 🌆', topic: 'synthwave, retro, cyberpunk', cover: '🌆', hostId: alex.id }
      });

      // Создаем трек
      await prisma.track.create({
        data: { title: 'Neon Pulse 2026', artist: 'Alex Nova Band', genre: 'Synthwave', duration: 210, coverUrl: '🌆', isLicensed: true, uploaderId: alex.id, creatorId: creatorAlex.id, playCount: 142 }
      });
      console.log('✅ Стартовые данные успешно загружены!');
    }

    server.listen(PORT, () => {
      console.log(`\n🚀 JamZone Realtime Backend (Node.js + Socket.IO + Prisma) успешно запущен!`);
      console.log(`📡 HTTP REST API: http://localhost:${PORT}/api`);
      console.log(`🏥 Health Check:  http://localhost:${PORT}/health\n`);
    });
  } catch (err) {
    console.error('❌ Ошибка запуска сервера:', err);
    process.exit(1);
  }
}

startServer();
