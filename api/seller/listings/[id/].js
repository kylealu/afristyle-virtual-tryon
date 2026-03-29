import { authMiddleware, readJson, writeJson, sendJson, sendError, LISTINGS_FILE } from '../../_helpers.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'DELETE') {
    return sendError(res, 'Method not allowed', 405);
  }

  const user = authMiddleware(req);
  if (!user) {
    return sendError(res, 'Missing or invalid token', 401);
  }

  try {
    const id = Number(req.query.id);
    const listings = readJson(LISTINGS_FILE, []);
    const index = listings.findIndex(l => l.id === id);

    if (index === -1) {
      return sendError(res, 'Listing not found', 404);
    }

    if (listings[index].seller !== user.name) {
      return sendError(res, 'Forbidden', 403);
    }

    listings.splice(index, 1);
    writeJson(LISTINGS_FILE, listings);

    return sendJson(res, { message: 'Deleted' });
  } catch (err) {
    console.error('Delete error:', err);
    return sendError(res, 'Internal server error', 500);
  }
}
