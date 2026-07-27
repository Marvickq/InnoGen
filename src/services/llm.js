/**
 * INNOGEN RESEARCH ENGINE - LLM SERVICE
 * Integrates real LLM provider API (Gemini / Groq API client)
 */

import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Groq } from 'groq-sdk';

dotenv.config();

export async function executeLlmInference(prompt, systemInstruction = '') {
  // Try Groq first as primary (with retry)
  const groqKey = process.env.Groq_API_KEY || process.env.GROQ_API_KEY || process.env.groq_api_key;
  if (groqKey) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const groq = new Groq({ apiKey: groqKey });
        const completion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ],
          model: 'llama-3.1-8b-instant',
        });
        if (completion.choices?.[0]?.message?.content) {
          return completion.choices[0].message.content;
        }
      } catch (err) {
        console.warn(`[LLM Service] Groq API call failed (attempt ${attempt + 1}):`, err.message);
        if (attempt === 0) continue;
      }
    }
  }

  // Try Gemini as available fallback/alternative
  const geminiKey = process.env.GEMINI_API_KEY || process.env.Gemini_API_KEY;
  if (geminiKey) {
    try {
      const ai = new GoogleGenerativeAI(geminiKey);
      const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const response = await model.generateContent(`${systemInstruction}\n\n${prompt}`);
      if (response.response && response.response.text) {
        return response.response.text();
      }
    } catch (err) {
      console.warn('[LLM Service] Gemini API call failed:', err.message);
    }
  }

  return null; // Signals agent node to use evidence-based rule logic
}
