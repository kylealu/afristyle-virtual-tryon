import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { readJson, sendJson, sendError, USERS_FILE, JWT_SECRET } from './_helpers.js';

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

  const { email, password } = req.body;

  if (!email || !password) {
    return sendError(res, 'email and password required', 400);
  }

  try {
    const users = readJson(USERS_FILE, []);
    const user = users.find(u => u.email === email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return sendError(res, 'Invalid credentials', 401);
    }

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    return sendJson(res, { user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (err) {
    console.error('Login error:', err);
    return sendError(res, 'Internal server error', 500);
  }
}
