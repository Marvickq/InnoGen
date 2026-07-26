import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

try {
  const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = ai.getGenerativeModel({ model: 'gemini-3.5-flash' });
  const response = await model.generateContent('test');
  console.log('Gemini response:', response.response.text());
} catch (err) {
  console.error('Gemini error:', err);
}
