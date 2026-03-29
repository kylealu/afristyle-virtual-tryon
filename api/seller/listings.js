import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LISTINGS_FILE = path.join(__dirname, '../../data/listings.json');
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const user = authMiddleware(req);
  if (!user) {
    res.status(401).json({ message: 'Missing or invalid token' });
    return;
  }

  try {
    if (req.method === 'POST') {
      const { name, category, price, desc, imageSrc } = req.body;
      if (!name || !category) {
        res.status(400).json({ message: 'name and category required' });
        return;
      }

      const listings = readJson(LISTINGS_FILE, []);
      const item = {
        id: Date.now(),
        name,
        category,
        price,
        desc,
        imageSrc,
        seller: user.name,
        createdAt: new Date().toISOString(),
        active: true,
        tryOns: 0
      };
      listings.unshift(item);
      writeJson(LISTINGS_FILE, listings);
      
      res.status(201).json(item);
      return;
    }

    if (req.method === 'GET') {
      const listings = readJson(LISTINGS_FILE, []);
      const myListings = listings.filter(l => l.seller === user.name);
      res.json(myListings);
      return;
    }

    res.status(405).json({ message: 'Method not allowed' });
  } catch (err) {
    console.error('Listings error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}
