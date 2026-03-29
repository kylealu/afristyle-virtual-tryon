import { authMiddleware, sendJson, sendError, callOpenAIWithRetry, getOpenAI } from './_helpers.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', 405);
  }

  const user = authMiddleware(req);
  if (!user) {
    return sendError(res, 'Missing or invalid token', 401);
  }

  const { clothing, style } = req.body;
  if (!clothing || !style) {
    return sendError(res, 'clothing and style required', 400);
  }

  if (!process.env.OPENAI_API_KEY) {
    return sendError(res, 'OpenAI API key not configured', 500);
  }

  try {
    const prompt = `You are a fashion AI for AfriStyle.
User's selection: ${clothing} - ${style}.
Return ONLY JSON object with keys: headline, description, tip, occasion, vibe (array).`;

    const openai = getOpenAI();
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
      return sendError(res, 'OpenAI returned invalid JSON', 500);
    }

    return sendJson(res, json);
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
      return sendError(res, 'OpenAI rate limit exceeded. Please try again in a few minutes.', 429);
    }

    if (err.status === 401 || errorMsg.includes('authentication')) {
      return sendError(res, 'OpenAI authentication failed - invalid API key', 401);
    }

    if (errorMsg.includes('timeout')) {
      return sendError(res, 'OpenAI request timed out', 504);
    }

    return sendError(res, 'OpenAI error: ' + errorMsg, 500);
  }
}
