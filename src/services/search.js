/**
 * INNOGEN RESEARCH ENGINE - SEARCH SERVICE
 * Integrates real search provider API (Serper / Tavily)
 */

import dotenv from 'dotenv';
dotenv.config();

function computeDomainAuthority(url, title, snippet) {
  const hostname = new URL(url).hostname.replace('www.', '').toLowerCase();
  const fullText = (title + ' ' + snippet).toLowerCase();
  let score = 0.55;

  if (hostname.endsWith('.gov') || hostname.endsWith('.gov.in') || hostname.endsWith('.gov.uk') || fullText.includes('government of')) score = Math.max(score, 0.95);
  else if (hostname.endsWith('.edu') || hostname.endsWith('.ac.in') || hostname.endsWith('.ac.uk')) score = Math.max(score, 0.92);
  else if (hostname.endsWith('.int') || hostname.endsWith('.ngo')) score = Math.max(score, 0.90);
  else if (hostname.endsWith('.org') || hostname.endsWith('.org.in')) score = Math.max(score, 0.82);

  if (fullText.includes('iea') || fullText.includes('international energy agency')) score = Math.max(score, 0.96);
  if (fullText.includes('world bank') || fullText.includes('imf') || fullText.includes('oecd') || fullText.includes('united nations') || fullText.includes('who')) score = Math.max(score, 0.95);
  if (fullText.includes('nature') || fullText.includes('science journal') || fullText.includes('the lancet') || fullText.includes('nejm')) score = Math.max(score, 0.94);
  if (fullText.includes('ceew') || fullText.includes('council on energy') || fullText.includes('niti aayog') || fullText.includes('mnre') || fullText.includes('ministry of')) score = Math.max(score, 0.93);
  if (fullText.includes('reuters') || fullText.includes('bloomberg') || fullText.includes('bbc') || fullText.includes('associated press')) score = Math.max(score, 0.85);
  if (fullText.includes('wikipedia') || fullText.includes('wiki')) score = Math.min(score, 0.75);
  if (fullText.includes('blog') || fullText.includes('medium.com')) score = Math.min(score, 0.60);

  return +score.toFixed(2);
}

export async function executeWebSearch(query, options = {}) {
  // 1. Serper as primary search provider (with retry)
  const serperKey = process.env.SEARCH_API_KEY || process.env.Search_API_KEY || process.env.search_api_key;
  if (serperKey) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': serperKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ q: query, num: 5 })
        });

        if (response.ok) {
          const data = await response.json();
          return (data.organic || []).map(item => ({
            url: item.link,
            title: item.title,
            publisher: new URL(item.link).hostname.replace('www.', ''),
            snippet: item.snippet || item.snippetTemplate || '',
            domainAuthorityScore: computeDomainAuthority(item.link, item.title, item.snippet || '')
          }));
        } else {
          console.warn(`[Search Service] Serper response error: ${response.status} ${response.statusText}`);
        }
      } catch (err) {
        console.warn(`[Search Service] Serper Search API call failed (attempt ${attempt + 1}):`, err.message);
        if (attempt === 0) continue;
      }
    }
  }

  // 2. Tavily as available fallback/alternative (with retry)
  const tavilyKey = process.env.TAVILY_API_KEY || process.env.Tavily_API_KEY || process.env.tavily_api_key;
  if (tavilyKey) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: tavilyKey,
            query: query,
            search_depth: options.depth === 'deep' ? 'advanced' : 'basic',
            include_answer: true,
            max_results: 5
          })
        });

        if (response.ok) {
          const data = await response.json();
          return (data.results || []).map(item => ({
            url: item.url,
            title: item.title,
            publisher: new URL(item.url).hostname.replace('www.', ''),
            snippet: item.content,
            domainAuthorityScore: computeDomainAuthority(item.url, item.title, item.content || '')
          }));
        }
      } catch (err) {
        console.warn(`[Search Service] Tavily Search API call failed (attempt ${attempt + 1}):`, err.message);
        if (attempt === 0) continue;
      }
    }
  }

  return [];
}
