import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');
const JWT_SECRET = process.env.JWT_SECRET || 'afristyle_jwt_secret';

export function readJson(storageFile, defaultVal) {
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

export function writeJson(storageFile, obj) {
  try {
    fs.writeFileSync(storageFile, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error('writeJson error', err);
  }
}

export function authMiddleware(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

export function sendJson(res, data, status = 200) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(status).json(data);
}

export function sendError(res, message, status = 400) {
  sendJson(res, { message }, status);
}

export { USERS_FILE, LISTINGS_FILE, JWT_SECRET };

// Retry logic for OpenAI
import OpenAI from 'openai';

export async function callOpenAIWithRetry(promiseFunc, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await promiseFunc();
    } catch (err) {
      const isRateLimit = 
        err.status === 429 || 
        err.code === 'rate_limit_exceeded' ||
        err.error?.code === 'rate_limit_exceeded' ||
        err.message?.includes('rate_limit') ||
        err.message?.includes('rate limit');
      
      const isLastAttempt = attempt === maxRetries - 1;
      
      if (isRateLimit && !isLastAttempt) {
        const delayMs = Math.pow(2, attempt + 1) * 1000;
        console.log(`⏳ Rate limited. Waiting ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
}

export function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
