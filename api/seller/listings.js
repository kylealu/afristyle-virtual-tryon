import { authMiddleware, readJson, writeJson, sendJson, sendError, LISTINGS_FILE } from '../_helpers.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const user = authMiddleware(req);
  if (!user) {
    return sendError(res, 'Missing or invalid token', 401);
  }

  try {
    if (req.method === 'POST') {
      const { name, category, price, desc, imageSrc } = req.body;
      if (!name || !category) {
        return sendError(res, 'name and category required', 400);
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
      
      return sendJson(res, item, 201);
    }

    if (req.method === 'GET') {
      const listings = readJson(LISTINGS_FILE, []);
      const myListings = listings.filter(l => l.seller === user.name);
      return sendJson(res, myListings);
    }

    return sendError(res, 'Method not allowed', 405);
  } catch (err) {
    console.error('Listings error:', err);
    return sendError(res, 'Internal server error', 500);
  }
}
