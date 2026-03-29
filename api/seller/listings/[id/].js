import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LISTINGS_FILE = path.join(__dirname, '../../../data/listings.json');
const JWT_SECRET = process.env.JWT_SECRET || 'afristyle_jwt_secret';

function readJson(file, def) {
  try {
    if (!fs.existsSync(file)) return def;
    return JSON.parse(fs.readFileSync(file, 'utf-8') || 'null') || def;
  } catch (e) {
    return def;
  }
}

function writeJson(file, data) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function authMiddleware(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'DELETE') {
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  const user = authMiddleware(req);
  if (!user) {
    res.status(401).json({ message: 'Missing or invalid token' });
    return;
  }

  try {
    const id = Number(req.query.id);
    const listings = readJson(LISTINGS_FILE, []);
    const index = listings.findIndex(l => l.id === id);

    if (index === -1) {
      res.status(404).json({ message: 'Listing not found' });
      return;
    }

    if (listings[index].seller !== user.name) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    listings.splice(index, 1);
    writeJson(LISTINGS_FILE, listings);

    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}
