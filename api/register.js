import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { readJson, writeJson, sendJson, sendError, USERS_FILE, JWT_SECRET } from './_helpers.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', 405);
  }

  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return sendError(res, 'name, email, password required', 400);
  }

  if (password.length < 6) {
    return sendError(res, 'Password must be 6+ characters', 400);
  }

  try {
    const users = readJson(USERS_FILE, []);
    if (users.find(u => u.email === email)) {
      return sendError(res, 'Email already registered', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = { id: Date.now(), name, email, password: hashedPassword };
    users.push(user);
    writeJson(USERS_FILE, users);

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    return sendJson(res, { user: { id: user.id, name: user.name, email: user.email }, token }, 201);
  } catch (err) {
    console.error('Register error:', err);
    return sendError(res, 'Internal server error', 500);
  }
}
