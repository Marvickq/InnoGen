import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Groq } from 'groq-sdk';

dotenv.config();

async function testGroq() {
  const key = process.env.Groq_API_KEY || process.env.GROQ_API_KEY;
  if (!key) {
    console.log('Groq: NOT CONFIGURED');
    return;
  }
  try {
    const groq = new Groq({ apiKey: key });
    const res = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'test' }],
      model: 'llama-3.1-8b-instant',
      max_tokens: 5
    });
    if (res.choices?.[0]?.message?.content) {
      console.log('Groq: CONNECTED AND VERIFIED');
    } else {
      console.log('Groq: CONFIGURED BUT FAILED');
    }
  } catch (err) {
    console.log('Groq: CONFIGURED BUT FAILED', err.message);
  }
}

async function testGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.log('Gemini: NOT CONFIGURED');
    return;
  }
  try {
    const ai = new GoogleGenerativeAI(key);
    const model = ai.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const response = await model.generateContent('test');
    if (response.response && response.response.text()) {
      console.log('Gemini: CONNECTED AND VERIFIED');
    } else {
      console.log('Gemini: CONFIGURED BUT FAILED');
    }
  } catch (err) {
    console.log('Gemini: CONFIGURED BUT FAILED', err.message);
  }
}

async function testSerper() {
  const key = process.env.SEARCH_API_KEY;
  if (!key) {
    console.log('Serper: NOT CONFIGURED');
    return;
  }
  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: 'renewable energy targets india', num: 1 })
    });
    if (response.ok) {
      const data = await response.json();
      if (data.organic) {
        console.log('Serper: CONNECTED AND VERIFIED');
      } else {
        console.log('Serper: CONFIGURED BUT FAILED');
      }
    } else {
      console.log('Serper: CONFIGURED BUT FAILED', response.statusText);
    }
  } catch (err) {
    console.log('Serper: CONFIGURED BUT FAILED', err.message);
  }
}

async function testTavily() {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    console.log('Tavily: NOT CONFIGURED');
    return;
  }
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: 'renewable energy targets india',
        max_results: 1
      })
    });
    if (response.ok) {
      const data = await response.json();
      if (data.results) {
        console.log('Tavily: CONNECTED AND VERIFIED');
      } else {
        console.log('Tavily: CONFIGURED BUT FAILED');
      }
    } else {
      console.log('Tavily: CONFIGURED BUT FAILED', response.statusText);
    }
  } catch (err) {
    console.log('Tavily: CONFIGURED BUT FAILED', err.message);
  }
}

async function runAll() {
  console.log('--- API INTEGRATION TEST ---');
  await testGroq();
  await testGemini();
  await testSerper();
  await testTavily();
  console.log('----------------------------');
}

runAll();
