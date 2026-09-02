import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '../auth.js';

const router = Router();

// Model is configurable; set ANTHROPIC_MODEL=claude-haiku-4-5 (or claude-sonnet-5)
// in the environment to lower cost/latency for this lightweight assistant.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

// The assistant is deliberately narrow: it only helps a loan officer understand and
// compare the mortgage scenarios they pass in. It has no tools and cannot act.
const SYSTEM = `You are "LoanDr Assistant", a concise AI helper embedded in a mortgage loan officer's loan-comparison tool.
Your only job is to help the officer understand and compare the mortgage loan scenarios they provide, and answer general mortgage questions relevant to those scenarios (monthly payment, interest rate, APR, PMI/MIP, taxes/insurance, cash to close, total interest, which option costs less, and the trade-offs between them).

Rules:
- Only discuss mortgage and home-financing topics related to the scenarios provided. If asked about anything unrelated, briefly decline and steer back to the loan comparison.
- Use only the numbers given in the scenarios. Never invent figures or rates.
- Be concise and practical — a few short sentences or tight bullet points. Lead with the direct answer.
- You are an assistant, not a lender. For anything a borrower would rely on, note that these are estimates, not a commitment to lend or financial/legal advice.
- You cannot take actions, browse the web, or change anything in the app; you only answer questions.`;

const hasKey = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client = null;
const getClient = () => (client ??= new Anthropic());

// POST /api/ai/compare  { question, context } → { answer }
router.post('/compare', requireAuth, async (req, res) => {
  if (!hasKey()) {
    return res.status(503).json({
      notConfigured: true,
      error: 'The AI assistant isn’t turned on yet. Set ANTHROPIC_API_KEY in the server environment to enable it.',
    });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const question = String(body.question || '').trim().slice(0, 2000);
  const context = String(body.context || '').slice(0, 8000);
  if (!question) return res.status(400).json({ error: 'Type a question to ask the assistant.' });

  try {
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1500,
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `The loan officer is comparing these scenarios:\n\n${context || '(no scenarios provided)'}\n\nQuestion: ${question}`,
        },
      ],
    });
    const answer = (Array.isArray(msg.content) ? msg.content : [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    res.json({ answer: answer || 'I couldn’t produce an answer for that — try rephrasing.' });
  } catch (err) {
    const status = err?.status;
    if (status === 401) return res.status(502).json({ error: 'The AI key was rejected — check ANTHROPIC_API_KEY in the server environment.' });
    if (status === 429) return res.status(429).json({ error: 'The assistant is busy right now — try again in a moment.' });
    return res.status(502).json({ error: 'The assistant couldn’t answer right now. Please try again shortly.' });
  }
});

export default router;
