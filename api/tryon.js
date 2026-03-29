import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || 'afristyle_jwt_secret';

function authMiddleware(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

async function callOpenAIWithRetry(promiseFunc, maxRetries = 5) {
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  const user = authMiddleware(req);
  if (!user) {
    res.status(401).json({ message: 'Missing or invalid token' });
    return;
  }

  const { clothing, style } = req.body;
  if (!clothing || !style) {
    res.status(400).json({ message: 'clothing and style required' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ message: 'OpenAI API key not configured' });
    return;
  }

  try {
    const prompt = `You are a fashion AI for AfriStyle.
User's selection: ${clothing} - ${style}.
Return ONLY JSON object with keys: headline, description, tip, occasion, vibe (array).`;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await callOpenAIWithRetry(() =>
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 220,
        temperature: 0.8
      }),
      5
    );

    let raw = completion.choices?.[0]?.message?.content || '{}';
    raw = raw.replace(/```json|```/g, '').trim();

    let json;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      res.status(500).json({ message: 'OpenAI returned invalid JSON', detail: raw });
      return;
    }

    res.json(json);
  } catch (err) {
    console.error('🔴 OpenAI error:', {
      status: err.status,
      code: err.code,
      message: err.message
    });

    const errorMsg = err.message || 'Unknown error';

    if (err.status === 429 || 
        err.code === 'rate_limit_exceeded' ||
        err.error?.code === 'rate_limit_exceeded' ||
        errorMsg.includes('rate_limit') ||
        errorMsg.includes('rate limit')) {
      res.status(429).json({ message: 'OpenAI rate limit exceeded. Please try again in a few minutes.' });
      return;
    }

    if (err.status === 401 || errorMsg.includes('authentication')) {
      res.status(401).json({ message: 'OpenAI authentication failed - invalid API key' });
      return;
    }

    if (errorMsg.includes('timeout')) {
      res.status(504).json({ message: 'OpenAI request timed out' });
      return;
    }

    res.status(500).json({ message: 'OpenAI error: ' + errorMsg });
  }
}
