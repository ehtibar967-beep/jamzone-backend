# 🚀 JamZone Realtime Backend (Node.js + TypeScript + WebSockets + Prisma)

Это настоящий, боевой сервер для приложения **JamZone**, который превращает клиентский прототип в глобальную многопользовательскую платформу.

## 🌟 Что умеет этот сервер:
1. **Аутентификация и профили:** Регистрация, вход по JWT, безопасность аккаунтов.
2. **WebSockets (Socket.IO):** Мгновенный обмен сообщениями, статусы «в сети / печатает», и главное — **Синхронное управление плеерами (Listen Together & Watch Together)** без задержек!
3. **Indie Creator Hub & Турниры:** База данных независимых музыкантов, подсчет лайков в турнире месяца и транзакции виртуальной валюты **JamCoins 🪙**.

---

## ☁️ ПОШАГОВАЯ ИНСТРУКЦИЯ: Деплой в интернет за 10 минут (Бесплатно на Render.com)

Чтобы твое приложение работало для реальных людей по всему миру, сервер должен крутиться в облаке 24/7. Вот как это сделать бесплатно:

### Шаг 1. Загрузи код на GitHub
1. Зарегистрируйся на [GitHub.com](https://github.com), если у тебя еще нет аккаунта.
2. Создай новый репозиторий (например, `jamzone-backend`).
3. Загрузи в него все файлы из папки `jamzone-backend` (без папки `node_modules`).

### Шаг 2. Создай сервер на Render.com
1. Зайди на [Render.com](https://render.com) и войди через свой аккаунт GitHub.
2. Нажми кнопку **«New +»** ➔ выбери **«Web Service»**.
3. Выбери свой репозиторий `jamzone-backend` и нажми **«Connect»**.
4. Заполни настройки сервиса:
   * **Name:** `jamzone-server` (или любое другое имя)
   * **Region:** Выбери ближе к твоей аудитории (например, *Frankfurt* или *Singapore*)
   * **Branch:** `main`
   * **Runtime:** `Node`
   * **Build Command:** `npm install && npm run build`
   * **Start Command:** `npm start`
   * **Instance Type:** `Free` ($0/month)

### Шаг 3. Переменные окружения (Environment Variables)
Прокрути страницу вниз до раздела **Environment Variables**, нажми *Add Environment Variable* и добавь:
* `DATABASE_URL` = `file:./jamzone.db` (Для старта на SQLite) или URL бесплатной базы PostgreSQL (от Supabase или Neon.tech).
* `JWT_SECRET` = `jamzone-super-secret-key-2026`
* `NODE_ENV` = `production`

Нажми кнопку **«Create Web Service»**! Через 2–3 минуты Render соберет проект и выдадет тебе адрес сервера вида:  
👉 `https://jamzone-server-xxxx.onrender.com`

---

## 🔌 Как подключить приложение к живому серверу

1. Открой приложение **`JamZone_App_2026.html`**.
2. Перейди в **⚙️ Настройки ➔ 📡 Сервер**.
3. В поле *«Адрес backend»* вставь скопированный URL твоего сервера с Render (например, `https://jamzone-server-xxxx.onrender.com`).
4. Нажми кнопку **«🔌 Подключить backend»**!
5. Индикатор загорится зеленым: **`🟢 подключён — чат и турниры работают!`**.

Теперь все регистрации, монеты JamCoins, аудио-комнаты и музыкальные турниры сохраняются в настоящую базу данных в облаке! 🌍🚀

---

## 💻 Локальный запуск (На своем ПК для тестов)

Если ты хочешь запустить сервер прямо на своем компьютере:
```bash
cd jamzone-backend
npm install
npm run build
npm start
```
Сервер запустится на порту `8095`:
* 🏥 **Health Check:** `http://localhost:8095/health`
* 🔌 **Socket.IO:** `ws://localhost:8095`
