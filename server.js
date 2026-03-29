import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

const jwtSecret = process.env.JWT_SECRET || 'afristyle_jwt_secret';

if (!process.env.OPENAI_API_KEY) {
  console.error('⚠️ WARNING: OPENAI_API_KEY not set in environment variables');
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Retry logic with exponential backoff for rate limits
async function callOpenAIWithRetry(promiseFunc, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await promiseFunc();
    } catch (err) {
      const isRateLimit = err.status === 429 || err.message?.includes('429');
      const isLastAttempt = attempt === maxRetries - 1;
      
      if (isRateLimit && !isLastAttempt) {
        const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.log(`Rate limited. Retrying in ${delayMs}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
}

function readJson(storageFile, defaultVal) {
  try {
    if (!fs.existsSync(storageFile)) return defaultVal;
    const raw = fs.readFileSync(storageFile, 'utf-8');
    if (!raw) return defaultVal;
    return JSON.parse(raw);
  } catch (err) {
    console.error('readJson error', err);
    return defaultVal;
  }
}

function writeJson(storageFile, obj) {
  fs.writeFileSync(storageFile, JSON.stringify(obj, null, 2));
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name/email/password required' });

  const users = readJson(USERS_FILE, []);
  if (users.find((u) => u.email === email)) {
    return res.status(409).json({ message: 'Email already exists' });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = { id: Date.now(), name, email, password: hashed, role: 'user' };
  users.push(user);
  writeJson(USERS_FILE, users);

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, jwtSecret, { expiresIn: '7d' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email/password required' });

  const users = readJson(USERS_FILE, []);
  const user = users.find((u) => u.email === email);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const matched = await bcrypt.compare(password, user.password);
  if (!matched) return res.status(401).json({ message: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, jwtSecret, { expiresIn: '7d' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token });
});

app.get('/api/users', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const users = readJson(USERS_FILE, []).map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }));
  res.json(users);
});

app.post('/api/tryon', authMiddleware, async (req, res) => {
  const { clothing, style } = req.body;
  if (!clothing || !style) return res.status(400).json({ message: 'clothing and style required' });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ message: 'OpenAI API key not configured on server' });
  }

  try {
    const prompt = `You are a fashion AI for AfriStyle.
User's selection: ${clothing} - ${style}.
Return ONLY JSON object with keys: headline, description, tip, occasion, vibe (array).`;

    const completion = await callOpenAIWithRetry(() => 
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 220,
        temperature: 0.8
      })
    );

    let raw = completion.choices?.[0]?.message?.content || '{}';
    raw = raw.replace(/```json|```/g, '').trim();

    let json;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      return res.status(500).json({ message: 'OpenAI returned invalid JSON', detail: raw });
    }

    res.json(json);
  } catch (err) {
    console.error('OpenAI error:', err.message || err);
    const errorMsg = err.message || 'Unknown error';
    if (errorMsg.includes('401') || errorMsg.includes('authentication')) {
      return res.status(401).json({ message: 'OpenAI authentication failed - invalid API key' });
    }
    if (errorMsg.includes('429') || err.status === 429) {
      return res.status(429).json({ message: 'OpenAI rate limit exceeded. Please wait a moment and try again.' });
    }
    if (errorMsg.includes('timeout')) {
      return res.status(504).json({ message: 'OpenAI request timed out' });
    }
    res.status(500).json({ message: 'OpenAI request failed: ' + errorMsg });
  }
});

app.post('/api/seller/listings', authMiddleware, (req, res) => {
  const { name, category, price, desc, imageSrc } = req.body;
  if (!name || !category) return res.status(400).json({ message: 'name and category required' });

  const listings = readJson(LISTINGS_FILE, []);
  const item = {
    id: Date.now(),
    name,
    category,
    price,
    desc,
    imageSrc,
    seller: req.user.name,
    createdAt: new Date().toISOString(),
    active: true,
    tryOns: 0
  };
  listings.unshift(item);
  writeJson(LISTINGS_FILE, listings);
  res.json(item);
});

app.get('/api/seller/listings', authMiddleware, (req, res) => {
  const listings = readJson(LISTINGS_FILE, []);
  if (req.user.role === 'admin') return res.json(listings);
  res.json(listings.filter((it) => it.seller === req.user.name));
});

app.delete('/api/seller/listings/:id', authMiddleware, (req, res) => {
  const listings = readJson(LISTINGS_FILE, []);
  const id = Number(req.params.id);
  const index = listings.findIndex((it) => it.id === id);
  if (index === -1) return res.status(404).json({ message: 'Not found' });
  if (req.user.role !== 'admin' && listings[index].seller !== req.user.name) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  listings.splice(index, 1);
  writeJson(LISTINGS_FILE, listings);
  res.json({ message: 'Deleted' });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Backend running on http://localhost:${port}`));
