import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { db } from '../db/prisma.js';
import { executeWebSearch } from '../services/search.js';
import { executeLlmInference } from '../services/llm.js';
import { getCachedLLM, setCachedLLM, getCachedSearch, setCachedSearch } from '../services/cache.js';
import { logger, startTimer, endTimer, incrementMetric, logError } from '../services/monitor.js';
import { setGraphState } from '../services/redis.js';

const wsSubscribers = new Set();

export function registerWsClient(ws) {
  wsSubscribers.add(ws);
  ws.on('close', () => wsSubscribers.delete(ws));
}

function broadcastNodeEvent(event) {
  const payload = JSON.stringify(event);
  for (const client of wsSubscribers) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

const ResearchState = Annotation.Root({
  jobId: Annotation(),
  query: Annotation(),
  depth: Annotation(),
  academicOnly: Annotation(),
  researchPlan: Annotation(),
  tasks: Annotation(),
  rawSearchResults: Annotation(),
  evidence: Annotation(),
  claims: Annotation(),
  citations: Annotation(),
  contradictions: Annotation(),
  overallConfidence: Annotation(),
  confidenceBreakdown: Annotation(),
  hallucinationScore: Annotation(),
  sourceRankings: Annotation(),
  reportMarkdown: Annotation()
});

async function plannerNode(state) {
  broadcastNodeEvent({ node: 'Planner', status: 'RUNNING' });
  const systemInstruction = `You are a research planner. Given a research query, produce a structured research plan.

Return ONLY a raw JSON object with:
{
  "objectives": ["objective 1", "objective 2", "objective 3"],
  "subQuestions": ["sub-question 1", "sub-question 2", "sub-question 3"],
  "investigationStrategy": "Brief description of how the research will be conducted",
  "expectedEvidence": "What types of evidence are expected (e.g. government data, news reports, academic papers)"
}

No markdown formatting. No extra text. Exactly 3 objectives and 3 sub-questions.`;

  let researchPlan;
  try {
    const cached = await getCachedLLM(state.query, systemInstruction, 'planner');
    const response = cached || await executeLlmInference(state.query, systemInstruction);
    if (!cached && response) await setCachedLLM(state.query, systemInstruction, 'planner', response, 600);
    const cleanResponse = (response || '').replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanResponse);
    if (!parsed || !Array.isArray(parsed.objectives)) throw new Error('Invalid plan structure');
    researchPlan = {
      objectives: parsed.objectives.slice(0, 3),
      subQuestions: Array.isArray(parsed.subQuestions) ? parsed.subQuestions.slice(0, 3) : [],
      investigationStrategy: typeof parsed.investigationStrategy === 'string' ? parsed.investigationStrategy : 'Multi-source cross-verification across government, academic, and news sources.',
      expectedEvidence: typeof parsed.expectedEvidence === 'string' ? parsed.expectedEvidence : 'Web search results, academic references, and official publications.'
    };
  } catch (err) {
    logger.warn(`[Planner Node] LLM parse failed: ${err.message}`);
    researchPlan = {
      objectives: [
        `Find authoritative information about: ${state.query}`,
        `Find expert analysis and commentary about: ${state.query}`,
        `Find supporting evidence and related findings about: ${state.query}`
      ],
      subQuestions: [
        `What are the primary facts about ${state.query}?`,
        `What do authoritative sources say about ${state.query}?`,
        `Are there differing perspectives on ${state.query}?`
      ],
      investigationStrategy: 'Multi-source cross-verification across government, academic, and news sources.',
      expectedEvidence: 'Web search results, academic references, and official publications.'
    };
  }
  broadcastNodeEvent({
    node: 'Planner', status: 'COMPLETED',
    plan: researchPlan
  });
  return { researchPlan };
}

async function decompositionNode(state) {
  broadcastNodeEvent({ node: 'Task Decomposer', status: 'RUNNING' });
  const systemInstruction = `You are a research task decomposer. Given research objectives, generate exactly 3 specific web search queries. Each query must target different source types for comprehensive coverage.

Return ONLY a raw JSON array of strings. No markdown formatting.`;

  let taskObjs;
  try {
    const cached = await getCachedLLM(JSON.stringify(state.researchPlan), systemInstruction, 'decomposer');
    const response = cached || await executeLlmInference(`Generate 3 search queries for: ${state.query}`, systemInstruction);
    if (!cached && response) await setCachedLLM(JSON.stringify(state.researchPlan), systemInstruction, 'decomposer', response, 600);
    const cleanResponse = (response || '').replace(/```json/g, '').replace(/```/g, '').trim();
    taskObjs = JSON.parse(cleanResponse);
    if (!Array.isArray(taskObjs)) throw new Error('Not an array');
  } catch (err) {
    logger.warn(`[Decomposer Node] LLM parse failed: ${err.message}`);
    taskObjs = [
      `Search authoritative reference sources for: ${state.query}`,
      `Search expert analysis and commentary for: ${state.query}`,
      `Search supporting evidence and related findings for: ${state.query}`
    ];
  }
  const createdTasks = await db.task.createMany(state.jobId, taskObjs);
  broadcastNodeEvent({
    node: 'Task Decomposer', status: 'COMPLETED',
    searchQueries: taskObjs
  });
  return { tasks: createdTasks };
}

async function parallelResearchNode(state) {
  broadcastNodeEvent({ node: 'Parallel Research Agents', status: 'RUNNING' });
  const searchPromises = state.tasks.map(async t => {
    const cached = await getCachedSearch(t.objective, 'web');
    if (cached) return cached;
    const results = await executeWebSearch(t.objective, { depth: state.depth });
    if (results && results.length > 0) await setCachedSearch(t.objective, 'web', results, 300);
    return results || [];
  });
  const searchResultsArray = await Promise.all(searchPromises);
  const rawEvidenceList = [];
  let totalResults = 0;
  searchResultsArray.forEach((results, idx) => {
    const taskId = state.tasks[idx]?.id;
    (results || []).forEach(res => {
      rawEvidenceList.push({ ...res, taskId });
      totalResults++;
    });
  });

  const sources = rawEvidenceList.map(r => ({
    url: r.url,
    title: r.title,
    publisher: r.publisher,
    snippet: r.snippet ? r.snippet.substring(0, 200) : ''
  }));

  broadcastNodeEvent({
    node: 'Parallel Research Agents', status: 'COMPLETED',
    sourcesDiscovered: totalResults,
    sources: totalResults > 0 ? sources : [{ note: 'No sources retrieved — search services returned empty. Confidence will be adjusted accordingly.' }]
  });
  return { rawSearchResults: rawEvidenceList };
}

function classifySource(url, title, snippet, domainAuthorityScore) {
  const hostname = (url || '').toLowerCase();
  const fullText = ((title || '') + ' ' + (snippet || '')).toLowerCase();
  let category = 'News';
  if (hostname.endsWith('.gov') || hostname.endsWith('.gov.in') || hostname.endsWith('.gov.uk')) category = 'Government';
  else if (hostname.endsWith('.edu') || hostname.endsWith('.ac.in') || hostname.endsWith('.ac.uk')) category = 'Academic';
  else if (fullText.includes('wikipedia') || fullText.includes('wiki')) category = 'Encyclopedia';
  else if (fullText.includes('bloomberg') || fullText.includes('reuters') || fullText.includes('bbc')) category = 'News';
  return category;
}

function computeTrustScore(domainAuthorityScore, snippetLength) {
  const base = (domainAuthorityScore || 0.55) * 100;
  const snippetBonus = Math.min(5, (snippetLength || 0) / 40);
  return Math.min(100, Math.round(base + snippetBonus));
}

function computeRelevanceScore(snippet, query) {
  if (!snippet || !query) return 50;
  const qWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (qWords.length === 0) return 50;
  const snippetLower = snippet.toLowerCase();
  const matchCount = qWords.filter(w => snippetLower.includes(w)).length;
  return Math.min(100, Math.round(30 + (matchCount / qWords.length) * 70));
}

function sourceSelectionReason(category, trustScore, domainAuthorityScore) {
  const reasons = [];
  if (category === 'Government') reasons.push('Official government source — highest authority tier');
  else if (category === 'Academic') reasons.push('Academic/educational institution — peer-reviewed standards');
  else if (category === 'Encyclopedia') reasons.push('Encyclopedic reference — broad factual overview');
  else reasons.push(`${category} source — evaluated for relevance`);
  if (trustScore >= 80) reasons.push('High trust score based on domain reputation');
  else if (trustScore < 50) reasons.push('Lower authority source — corroboration recommended');
  return reasons.join('. ');
}

async function evidenceCollectionNode(state) {
  broadcastNodeEvent({ node: 'Evidence Collection', status: 'RUNNING' });
  const storedEvidence = [];
  for (const raw of state.rawSearchResults) {
    const category = classifySource(raw.url, raw.title, raw.snippet, raw.domainAuthorityScore);
    const trustScore = computeTrustScore(raw.domainAuthorityScore, (raw.snippet || '').length);
    const relevanceScore = computeRelevanceScore(raw.snippet, state.query);
    const selectionReason = sourceSelectionReason(category, trustScore, raw.domainAuthorityScore);
    const ev = await db.evidence.create({
      jobId: state.jobId,
      taskId: raw.taskId,
      sourceUrl: raw.url,
      sourceTitle: raw.title,
      publisher: raw.publisher,
      snippet: raw.snippet,
      domainAuthorityScore: raw.domainAuthorityScore
    });
    const enriched = {
      ...ev,
      category,
      trustScore,
      relevanceScore,
      selectionReason,
      quotedStatement: raw.snippet ? raw.snippet.substring(0, 300) : ''
    };
    storedEvidence.push(enriched);
  }

  const evidenceSummary = storedEvidence.map(e => ({
    title: e.sourceTitle,
    url: e.sourceUrl,
    publisher: e.publisher,
    category: e.category,
    trustScore: e.trustScore,
    relevanceScore: e.relevanceScore,
    selectionReason: e.selectionReason,
    snippet: e.snippet ? e.snippet.substring(0, 120) + '...' : ''
  }));

  broadcastNodeEvent({
    node: 'Evidence Collection', status: 'COMPLETED',
    evidenceItems: evidenceSummary.length > 0 ? evidenceSummary : [{ note: 'No evidence could be collected from available sources.' }]
  });
  return { evidence: storedEvidence };
}

async function claimExtractionNode(state) {
  broadcastNodeEvent({ node: 'Claim Extraction', status: 'RUNNING' });
  if (state.evidence.length === 0) {
    broadcastNodeEvent({ node: 'Claim Extraction', status: 'COMPLETED', claims: [] });
    return { claims: [] };
  }
  const evidenceInput = state.evidence.map(e => ({ id: e.id, snippet: e.snippet, title: e.sourceTitle, publisher: e.publisher, sourceUrl: e.sourceUrl }));
  const systemInstruction = `You are a fact extraction agent. Analyze the provided evidence items and extract key factual claims that can be directly verified from the evidence. For each claim, identify which evidence item IDs support it. Do NOT invent claims that are not present in the evidence. Each claim must map to at least one evidence ID.

Return ONLY a raw JSON array of objects:
[
  {
    "claimText": "Clean, concise factual statement that can be verified from evidence",
    "evidenceIds": ["ev-xxxx"]
  }
]
No markdown formatting or conversational text.`;

  const prompt = `Research Query: "${state.query}"\nEvidence items:\n${JSON.stringify(evidenceInput, null, 2)}`;
  let claimsList = [];
  try {
    const cached = await getCachedLLM(prompt, systemInstruction, 'claim_extraction');
    const response = cached || await executeLlmInference(prompt, systemInstruction);
    if (!cached && response) await setCachedLLM(prompt, systemInstruction, 'claim_extraction', response, 600);
    const cleanResponse = (response || '').replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedClaims = JSON.parse(cleanResponse);
    if (Array.isArray(parsedClaims)) {
      for (const item of parsedClaims) {
        if (item.claimText && Array.isArray(item.evidenceIds) && item.evidenceIds.length > 0) {
          const claim = await db.claim.create({ jobId: state.jobId, claimText: item.claimText, status: 'UNCHECKED', evidenceIds: item.evidenceIds });
          claimsList.push(claim);
        }
      }
    }
  } catch (err) {
    logger.warn(`[Claim Extraction Node] LLM parse failed: ${err.message}`);
  }
  if (claimsList.length === 0) {
    logger.warn('[Claim Extraction Node] No valid claims from LLM. Using evidence-based fallback.');
    const seenTopics = new Set();
    for (const ev of state.evidence) {
      if (ev.snippet && ev.snippet.length > 20) {
        const shortClaim = ev.snippet.substring(0, 120).replace(/\s+\S*$/, '') + '.';
        const key = shortClaim.substring(0, 40);
        if (!seenTopics.has(key) && seenTopics.size < 5) {
          seenTopics.add(key);
          const claim = await db.claim.create({ jobId: state.jobId, claimText: shortClaim, status: 'UNCHECKED', evidenceIds: [ev.id] });
          claimsList.push(claim);
        }
      }
    }
  }

  const claimsSummary = claimsList.map(c => ({ claimText: c.claimText, sourceEvidenceCount: (c.evidenceIds || []).length }));

  broadcastNodeEvent({
    node: 'Claim Extraction', status: 'COMPLETED',
    claimsExtracted: claimsList.length,
    claims: claimsSummary.length > 0 ? claimsSummary : [{ note: 'No verifiable claims could be extracted from the available evidence.' }]
  });
  return { claims: claimsList };
}

async function citationVerificationNode(state) {
  broadcastNodeEvent({ node: 'Citation Verification', status: 'RUNNING' });
  const verifiedCitations = [];
  const systemInstruction = `You are a citation verification specialist. Compare each claim against its referenced evidence snippet(s). Evaluate semantically whether the evidence actually supports, partially supports, or does not support the claim. Read the actual content — do not use URL patterns, source existence, or keyword overlap alone.

Return ONLY a raw JSON object:
{
  "supportStatus": "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED",
  "supportConfidence": 85.5,
  "explanation": "Specific semantic explanation of how the evidence content does or does not support the claim",
  "quotedEvidence": "Direct quote from the evidence that is most relevant to the claim",
  "reasoning": "Step-by-step reasoning of why the evidence supports, partially supports, or does not support the claim"
}
supportConfidence must be between 10.0 and 99.0. No extra text.`;

  for (const claim of state.claims) {
    const matchedEvidence = state.evidence.filter(e => (claim.evidenceIds || []).includes(e.id));
    if (matchedEvidence.length === 0) {
      for (const ev of state.evidence) {
        verifiedCitations.push(await db.citation.create({
          claimId: claim.id, evidenceId: ev.id, jobId: state.jobId, url: ev.sourceUrl,
          title: ev.sourceTitle, publisher: ev.publisher, isValid: true,
          supportsClaim: false, supportStatus: 'UNSUPPORTED', supportConfidence: 10.0,
          explanation: 'No evidence was linked to this claim during extraction.',
          quotedEvidence: '', reasoning: 'No linked evidence to evaluate.'
        }));
      }
      continue;
    }
    const evidenceText = matchedEvidence.map(e => `[${e.id}] Title: ${e.sourceTitle}, Publisher: ${e.publisher}, Content: ${e.snippet}`).join('\n');
    const prompt = `Claim: "${claim.claimText}"\nReferenced Evidence:\n${evidenceText}`;

    let supportStatus = 'UNSUPPORTED', supportConfidence = 10.0, explanation = 'Evidence does not semantically support the claim.';
    let quotedEvidence = '', reasoning = '';
    try {
      const cached = await getCachedLLM(prompt, systemInstruction, 'citation');
      const response = cached || await executeLlmInference(prompt, systemInstruction);
      if (!cached && response) await setCachedLLM(prompt, systemInstruction, 'citation', response, 600);
      const cleanResponse = (response || '').replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanResponse);
      supportStatus = parsed.supportStatus || 'UNSUPPORTED';
      supportConfidence = parsed.supportConfidence || 10.0;
      explanation = typeof parsed.explanation === 'string' ? parsed.explanation : JSON.stringify(parsed.explanation || explanation);
      quotedEvidence = typeof parsed.quotedEvidence === 'string' ? parsed.quotedEvidence : JSON.stringify(parsed.quotedEvidence || '');
      reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : JSON.stringify(parsed.reasoning || '');
    } catch (err) {
      logger.warn(`[Citation Verification] LLM parse failed for claim ${claim.id}: ${err.message}`);
      const overlapScore = matchedEvidence.reduce((acc, ev) => {
        const claimWords = new Set(claim.claimText.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        const evWords = new Set(ev.snippet.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        const common = [...claimWords].filter(w => evWords.has(w));
        return acc + (claimWords.size > 0 ? common.length / claimWords.size : 0);
      }, 0) / matchedEvidence.length;
      if (overlapScore > 0.3) { supportStatus = 'PARTIALLY_SUPPORTED'; supportConfidence = 30 + overlapScore * 50; explanation = `Partial term overlap (${(overlapScore * 100).toFixed(0)}% match) — LLM unavailable, fallback used. This is a less reliable verification.`; quotedEvidence = matchedEvidence[0]?.snippet?.substring(0, 100) || ''; reasoning = `Fallback evaluation: ${(overlapScore * 100).toFixed(0)}% term overlap between claim and evidence. This method is less reliable than semantic verification.`; }
      else { supportStatus = 'UNSUPPORTED'; supportConfidence = 10 + overlapScore * 20; explanation = `Low term overlap (${(overlapScore * 100).toFixed(0)}%) — LLM unavailable, fallback used. This verification has low reliability.`; quotedEvidence = ''; reasoning = `Fallback evaluation: Only ${(overlapScore * 100).toFixed(0)}% of claim terms appear in evidence. This method is less reliable than semantic verification.`; }
    }
    for (const ev of matchedEvidence) {
      verifiedCitations.push(await db.citation.create({
        claimId: claim.id, evidenceId: ev.id, jobId: state.jobId, url: ev.sourceUrl,
        title: ev.sourceTitle, publisher: ev.publisher, isValid: true,
        supportsClaim: supportStatus === 'SUPPORTED' || supportStatus === 'PARTIALLY_SUPPORTED',
        supportStatus, supportConfidence, explanation, quotedEvidence, reasoning
      }));
    }
  }

  const supported = verifiedCitations.filter(c => c.supportStatus === 'SUPPORTED').length;
  const partial = verifiedCitations.filter(c => c.supportStatus === 'PARTIALLY_SUPPORTED').length;
  const unsupported = verifiedCitations.filter(c => c.supportStatus === 'UNSUPPORTED').length;
  const llmBased = verifiedCitations.filter(c => !c.explanation?.includes('fallback')).length;
  const fallbackBased = verifiedCitations.filter(c => c.explanation?.includes('fallback')).length;

  broadcastNodeEvent({
    node: 'Citation Verification', status: 'COMPLETED',
    citationsSummary: { total: verifiedCitations.length, supported, partiallySupported: partial, unsupported, llmBased, fallbackBased }
  });
  return { citations: verifiedCitations };
}

async function factVerificationNode(state) {
  broadcastNodeEvent({ node: 'Fact Verification', status: 'RUNNING' });
  const systemInstruction = `You are a fact verification specialist. Verify each claim against its referenced evidence using semantic analysis of evidence content and source provenance. Consider: evidence quality, source credibility, semantic support, agreement across sources. Do NOT use keyword matching. Assign a unique confidenceScore for each claim based on this specific evidence.

Return ONLY a raw JSON object:
{
  "status": "VERIFIED" | "PARTIALLY_VERIFIED" | "CONTRADICTED" | "UNSUPPORTED" | "INSUFFICIENT_EVIDENCE",
  "confidenceScore": 85.5,
  "explanation": "Specific semantic explanation of verification decision based on evidence content"
}
No extra text. confidenceScore must vary per claim (10.0-99.0).`;
  const updatedClaims = [...state.claims];

  for (let idx = 0; idx < updatedClaims.length; idx++) {
    const claim = { ...updatedClaims[idx] };
    const linkedEvidence = state.evidence.filter(e => (claim.evidenceIds || []).includes(e.id));
    const claimCitations = state.citations.filter(c => c.claimId === claim.id);
    const citedEvidenceIds = new Set(claimCitations.map(c => c.evidenceId));
    const citedEvidence = state.evidence.filter(e => citedEvidenceIds.has(e.id));
    const relevantEvidence = linkedEvidence.length > 0 ? linkedEvidence : citedEvidence;

    const evidenceText = relevantEvidence.length > 0
      ? relevantEvidence.map(e => `Title: ${e.sourceTitle}, Publisher: ${e.publisher}, Authority: ${e.domainAuthorityScore}, Content: ${e.snippet}`).join('\n')
      : state.evidence.map(e => `Title: ${e.sourceTitle}, Publisher: ${e.publisher}, Authority: ${e.domainAuthorityScore}, Content: ${e.snippet}`).join('\n');

    const prompt = `Claim: "${claim.claimText}"\nEvidence:\n${evidenceText}`;
    try {
      const cached = await getCachedLLM(prompt, systemInstruction, 'fact_verification');
      const response = cached || await executeLlmInference(prompt, systemInstruction);
      if (!cached && response) await setCachedLLM(prompt, systemInstruction, 'fact_verification', response, 600);
      const cleanResponse = (response || '').replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanResponse);
      claim.status = parsed.status || 'INSUFFICIENT_EVIDENCE';
      claim.confidenceScore = parsed.confidenceScore || 30.0;
      claim.explanation = typeof parsed.explanation === 'string' ? parsed.explanation : JSON.stringify(parsed.explanation || 'Verification could not be completed from available evidence.');
      await db.claim.update(claim.id, { status: claim.status, confidenceScore: claim.confidenceScore, explanation: claim.explanation });
    } catch (err) {
      logger.warn(`[Fact Verification] LLM parse failed for claim ${claim.id}: ${err.message}`);
      const numEvSources = relevantEvidence.length;
      const avgAuthority = relevantEvidence.reduce((a, e) => a + (e.domainAuthorityScore || 0.85), 0) / Math.max(1, numEvSources);
      const supportRatio = claimCitations.filter(c => c.supportStatus === 'SUPPORTED').length / Math.max(1, claimCitations.length);
      const hasContradiction = state.contradictions.some(c => (c.evidenceIds || []).some(eid => (claim.evidenceIds || []).includes(eid)));
      if (numEvSources === 0) {
        claim.status = 'INSUFFICIENT_EVIDENCE'; claim.confidenceScore = +(10 * state.evidence.length / Math.max(1, state.claims.length)).toFixed(1); claim.explanation = `No evidence directly linked to this claim. ${state.evidence.length} total evidence items available for this query.`;
      } else if (hasContradiction) {
        claim.status = 'CONTRADICTED'; claim.confidenceScore = +Math.min(40, 15 + supportRatio * 20 - 10).toFixed(1); claim.explanation = `Evidence contains conflicting information about this claim. ${claimCitations.length} citation(s) evaluated with ${(supportRatio * 100).toFixed(0)}% support rate.`;
      } else if (supportRatio >= 0.5) {
        claim.status = 'PARTIALLY_VERIFIED'; claim.confidenceScore = +Math.min(70, 30 + supportRatio * 30 + avgAuthority * 15).toFixed(1); claim.explanation = `${numEvSources} source(s) evaluated. Average authority: ${(avgAuthority * 100).toFixed(0)}%. Citation support: ${(supportRatio * 100).toFixed(0)}% LLM parsing failed — fallback used.`;
      } else {
        claim.status = 'UNSUPPORTED'; claim.confidenceScore = +Math.min(30, 10 + supportRatio * 15).toFixed(1); claim.explanation = `Limited support from ${numEvSources} source(s). Only ${(supportRatio * 100).toFixed(0)}% of citations support this claim.`;
      }
      await db.claim.update(claim.id, { status: claim.status, confidenceScore: claim.confidenceScore, explanation: claim.explanation });
    }
    updatedClaims[idx] = claim;
  }

  const verified = updatedClaims.filter(c => c.status === 'VERIFIED').length;
  const partial = updatedClaims.filter(c => c.status === 'PARTIALLY_VERIFIED').length;
  const contradicted = updatedClaims.filter(c => c.status === 'CONTRADICTED').length;
  const unsupported = updatedClaims.filter(c => c.status === 'UNSUPPORTED' || c.status === 'INSUFFICIENT_EVIDENCE').length;

  broadcastNodeEvent({
    node: 'Fact Verification', status: 'COMPLETED',
    factCheckSummary: { total: updatedClaims.length, verified, partiallyVerified: partial, contradicted, unsupported }
  });
  return { claims: updatedClaims };
}

async function contradictionDetectionNode(state) {
  broadcastNodeEvent({ node: 'Contradiction Detection', status: 'RUNNING' });
  const contradictions = [];
  if (state.evidence.length >= 2) {
    const groupedByPublisher = {};
    for (const ev of state.evidence) {
      const key = ev.publisher || 'unknown';
      if (!groupedByPublisher[key]) groupedByPublisher[key] = [];
      groupedByPublisher[key].push(ev);
    }
    const publisherKeys = Object.keys(groupedByPublisher);
    const pairsToCheck = [];
    for (let i = 0; i < publisherKeys.length; i++) {
      for (let j = i + 1; j < publisherKeys.length; j++) {
        for (const evA of groupedByPublisher[publisherKeys[i]]) {
          for (const evB of groupedByPublisher[publisherKeys[j]]) {
            pairsToCheck.push({ evA, evB, pubA: publisherKeys[i], pubB: publisherKeys[j] });
            if (pairsToCheck.length >= 6) break;
          } if (pairsToCheck.length >= 6) break;
        } if (pairsToCheck.length >= 6) break;
      }
    }
    const systemInstruction = `You are a contradiction detection auditor. Given two evidence items from DIFFERENT publishers, determine if they genuinely conflict on factual claims.

Return ONLY a raw JSON object:
{
  "isContradiction": true/false,
  "reason": "Explanation of the relationship between the two sources",
  "differenceType": "date" | "definition" | "dataset" | "methodology" | "numeric disagreement" | "genuine contradiction" | "no contradiction",
  "confidence": 85.5,
  "evidenceIds": ["ev-x", "ev-y"]
}
If no contradiction, return { "isContradiction": false, "reason": "...", "differenceType": "no contradiction", "confidence": 0, "evidenceIds": [] }`;

    for (const pair of pairsToCheck) {
      const pairText = `[${pair.evA.id}] Publisher: ${pair.pubA}, Title: ${pair.evA.sourceTitle}, Content: ${pair.evA.snippet}\n[${pair.evB.id}] Publisher: ${pair.pubB}, Title: ${pair.evB.sourceTitle}, Content: ${pair.evB.snippet}`;
      const prompt = `Compare these two evidence items for factual contradictions:\n${pairText}`;
      try {
        const cached = await getCachedLLM(prompt, systemInstruction, 'contradiction');
        const response = cached || await executeLlmInference(prompt, systemInstruction);
        if (!cached && response) await setCachedLLM(prompt, systemInstruction, 'contradiction', response, 600);
        const cleanResponse = (response || '').replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanResponse);
        if (parsed && parsed.isContradiction === true && Array.isArray(parsed.evidenceIds) && parsed.evidenceIds.length >= 2) {
          const alreadyExists = contradictions.some(c => (c.evidenceIds || []).some(id => parsed.evidenceIds.includes(id)));
          if (!alreadyExists) {
            const evA = state.evidence.find(e => e.id === parsed.evidenceIds[0]);
            const evB = state.evidence.find(e => e.id === parsed.evidenceIds[1]);
            const diffType = typeof parsed.differenceType === 'string' ? parsed.differenceType : 'genuine contradiction';
            contradictions.push(await db.contradiction.create({
              jobId: state.jobId, claimText: `Contradiction between ${evA?.publisher || 'source A'} and ${evB?.publisher || 'source B'}`,
              sourceA: `${evA?.publisher || 'Source A'}: "${evA?.snippet?.substring(0, 150) || ''}"`,
              sourceB: `${evB?.publisher || 'Source B'}: "${evB?.snippet?.substring(0, 150) || ''}"`,
              isContradiction: true, differenceType: diffType,
              contradictionConfidence: parsed.confidence || 50.0, explanation: typeof parsed.reason === 'string' ? parsed.reason : JSON.stringify(parsed.reason || 'Sources present conflicting information.'),
              likelyReason: `Difference type: ${diffType}`, evidenceIds: parsed.evidenceIds
            }));
          }
        }
      } catch (err) { logger.warn(`[Contradiction Node] Pair parse failed: ${err.message}`); }
    }

    if (contradictions.length === 0) {
      const genericNumberRegex = /\d+[\.\d]*/g;
      for (let i = 0; i < state.evidence.length; i++) {
        for (let j = i + 1; j < state.evidence.length; j++) {
          const a = state.evidence[i], b = state.evidence[j];
          if (a.publisher === b.publisher) continue;
          const numsA = (a.snippet.match(genericNumberRegex) || []).map(n => parseFloat(n)).filter(n => !isNaN(n) && n > 0);
          const numsB = (b.snippet.match(genericNumberRegex) || []).map(n => parseFloat(n)).filter(n => !isNaN(n) && n > 0);
          for (const na of numsA) {
            for (const nb of numsB) {
              if (Math.min(na, nb) > 0) {
                const ratio = Math.max(na, nb) / Math.min(na, nb);
                if (ratio > 1.5 && ratio < 100) {
                  if (!contradictions.some(c => (c.evidenceIds || []).includes(a.id) || (c.evidenceIds || []).includes(b.id))) {
                    contradictions.push(await db.contradiction.create({
                      jobId: state.jobId, claimText: `Conflicting numerical values between sources`,
                      sourceA: `${a.publisher}: "${a.snippet.substring(0, 120)}"`, sourceB: `${b.publisher}: "${b.snippet.substring(0, 120)}"`,
                      isContradiction: true, differenceType: 'numeric disagreement',
                      contradictionConfidence: Math.min(90, 30 + (ratio - 1) * 20),
                      explanation: `Value ${na} from ${a.publisher} differs from value ${nb} from ${b.publisher} by factor of ${ratio.toFixed(1)}x. This could indicate different measurement dates, methodologies, or data sources.`,
                      likelyReason: 'Different measurement dates or methodologies', evidenceIds: [a.id, b.id]
                    }));
                  }
                  break;
                }
              }
            } if (contradictions.length > 0) break;
          } if (contradictions.length > 0) break;
        } if (contradictions.length > 0) break;
      }
    }
  }

  const contradictionSummary = contradictions.map(c => ({
    claimA: c.claimText,
    sourceA: c.sourceA ? c.sourceA.substring(0, 100) : '',
    sourceB: c.sourceB ? c.sourceB.substring(0, 100) : '',
    differenceType: c.differenceType,
    confidence: c.contradictionConfidence,
    explanation: c.explanation ? c.explanation.substring(0, 150) : ''
  }));

  broadcastNodeEvent({
    node: 'Contradiction Detection', status: 'COMPLETED',
    contradictionsFound: contradictions.length,
    contradictions: contradictionSummary.length > 0 ? contradictionSummary : [{ note: 'No contradictions detected among the sources reviewed.' }]
  });
  return { contradictions };
}

async function hallucinationCheckNode(state) {
  broadcastNodeEvent({ node: 'Hallucination Check', status: 'RUNNING' });
  let hallucinationScore = 0.0;
  if (state.claims.length === 0 || state.evidence.length === 0) {
    hallucinationScore = state.evidence.length === 0 ? 100.0 : 0.0;
  } else {
    const totalClaims = state.claims.length;
    const evidenceLinkedClaims = state.claims.filter(c => (c.evidenceIds || []).length > 0).length;
    const citationSupportAvg = state.citations.length > 0 ? state.citations.reduce((a, c) => a + (c.supportConfidence || 0), 0) / state.citations.length : 0;
    const unsupportedStatuses = ['UNSUPPORTED', 'INSUFFICIENT_EVIDENCE'];
    const unsupportedByStatus = state.claims.filter(c => unsupportedStatuses.includes(c.status)).length;
    const unsupportedByCitation = state.claims.filter(c => {
      const claimCitations = state.citations.filter(cit => cit.claimId === c.id);
      return claimCitations.length === 0 || claimCitations.every(cit => cit.supportStatus === 'UNSUPPORTED');
    }).length;
    const unsupportedCount = Math.max(unsupportedByStatus, unsupportedByCitation);
    const uncoveredClaims = totalClaims - evidenceLinkedClaims;
    const contradictedClaims = state.claims.filter(c => c.status === 'CONTRADICTED').length;
    const score = (unsupportedCount / totalClaims) * 50 + (uncoveredClaims / totalClaims) * 25 + Math.max(0, (1 - citationSupportAvg / 100) * 15) + (contradictedClaims / totalClaims) * 10;
    hallucinationScore = Math.min(100, Math.max(0, +score.toFixed(1)));
  }
  broadcastNodeEvent({
    node: 'Hallucination Check', status: 'COMPLETED',
    hallucinationScore,
    interpretation: hallucinationScore <= 20 ? 'Low hallucination risk' : hallucinationScore <= 50 ? 'Moderate hallucination risk' : 'High hallucination risk — verification recommended',
    factors: {
      unsupportedClaims: state.claims.filter(c => ['UNSUPPORTED', 'INSUFFICIENT_EVIDENCE'].includes(c.status)).length,
      totalClaims: state.claims.length,
      averageCitationConfidence: state.citations.length > 0 ? +(state.citations.reduce((a, c) => a + (c.supportConfidence || 0), 0) / state.citations.length).toFixed(1) : 0,
      contradictedClaims: state.claims.filter(c => c.status === 'CONTRADICTED').length
    }
  });
  return { hallucinationScore };
}

async function consensusConfidenceNode(state) {
  broadcastNodeEvent({ node: 'Consensus & Confidence', status: 'RUNNING' });
  let overallConfidence = 50.0;
  let breakdown = {};
  if (state.claims.length > 0 && state.evidence.length > 0) {
    const totalEv = state.evidence.length;
    const totalClaims = state.claims.length;
    const uniquePublishers = new Set(state.evidence.map(e => e.publisher)).size;
    const verifiedScores = state.claims.map(c => c.confidenceScore || 50.0);
    const avgClaimScore = verifiedScores.reduce((acc, v) => acc + v, 0) / totalClaims;
    const supportedClaims = state.claims.filter(c => state.citations.some(cit => cit.claimId === c.id && cit.supportStatus === 'SUPPORTED')).length;
    const citationSupportRatio = supportedClaims / totalClaims;
    const fullyVerified = state.claims.filter(c => c.status === 'VERIFIED').length;
    const partiallyVerified = state.claims.filter(c => c.status === 'PARTIALLY_VERIFIED').length;
    const contradicted = state.claims.filter(c => c.status === 'CONTRADICTED').length;
    const unsupported = state.claims.filter(c => c.status === 'UNSUPPORTED' || c.status === 'INSUFFICIENT_EVIDENCE').length;
    const avgAuthority = state.evidence.reduce((acc, e) => acc + (e.domainAuthorityScore || 0.55), 0) / totalEv;
    const evidenceCoverageRatio = state.claims.filter(c => (c.evidenceIds || []).length > 0).length / totalClaims;

    const evidenceQualityScore = Math.round(Math.min(100, avgAuthority * 100 + evidenceCoverageRatio * 10));
    const sourceReliabilityScore = Math.round(Math.min(100, avgAuthority * 80 + Math.min(20, uniquePublishers * 4)));
    const verificationScore = Math.round(Math.min(100, citationSupportRatio * 60 + (fullyVerified / totalClaims) * 40));
    const freshnessScore = Math.round(Math.min(100, totalEv > 0 ? 70 + Math.min(30, totalEv * 3) : 0));
    const agreementScore = Math.round(Math.min(100, 100 - (contradicted / totalClaims) * 50 - (unsupported / totalClaims) * 30));

    breakdown = { evidenceQualityScore, sourceReliabilityScore, verificationScore, freshnessScore, agreementScore };
    const componentValues = [evidenceQualityScore, sourceReliabilityScore, verificationScore, freshnessScore, agreementScore];
    const weights = [0.25, 0.20, 0.25, 0.10, 0.20];
    overallConfidence = +Math.min(99.0, Math.max(5.0, componentValues.reduce((a, v, i) => a + v * weights[i], 0))).toFixed(1);
  } else {
    breakdown = { evidenceQualityScore: 0, sourceReliabilityScore: 0, verificationScore: 0, freshnessScore: 0, agreementScore: 0 };
    overallConfidence = 5.0;
  }
  broadcastNodeEvent({
    node: 'Consensus & Confidence', status: 'COMPLETED',
    confidenceBreakdown: breakdown,
    overallConfidence,
    formula: 'Final = Evidence(25%) + SourceReliability(20%) + Verification(25%) + Freshness(10%) + Agreement(20%)',
    interpretation: overallConfidence >= 80 ? 'High confidence — most claims verified across reliable sources' : overallConfidence >= 50 ? 'Moderate confidence — some claims verified, some sources reliable' : 'Low confidence — insufficient verification or conflicting evidence'
  });
  return { overallConfidence, confidenceBreakdown: breakdown };
}

async function reportGenerationNode(state) {
  broadcastNodeEvent({ node: 'Report Generator', status: 'RUNNING' });
  const systemInstruction = `You are a research synthesis agent. Generate a concise, objective, evidence-backed Executive Summary that directly answers the user's research question. Base your summary ONLY on the provided claims, contradictions, evidence, and confidence metrics. Do not invent any facts not in the context. Structure the summary to:
1. Directly answer the research question
2. Reference key verified findings
3. Note any contradictions or caveats
4. State the overall confidence level
Format in clear paragraphs. No placeholder text.`;

  const context = {
    query: state.query, overallConfidence: state.overallConfidence, hallucinationScore: state.hallucinationScore,
    evidence: state.evidence.map(e => ({ title: e.sourceTitle, snippet: e.snippet, publisher: e.publisher })),
    claims: state.claims.map(c => ({ text: c.claimText, status: c.status, confidenceScore: c.confidenceScore, explanation: c.explanation })),
    contradictions: state.contradictions.map(c => ({ claimText: c.claimText, sourceA: c.sourceA, sourceB: c.sourceB, isContradiction: c.isContradiction, differenceType: c.differenceType, contradictionConfidence: c.contradictionConfidence, explanation: c.explanation }))
  };

  let summaryText = '';
  try {
    const cached = await getCachedLLM(JSON.stringify(context), systemInstruction, 'report');
    summaryText = cached || await executeLlmInference(JSON.stringify(context), systemInstruction);
    if (!cached && summaryText) await setCachedLLM(JSON.stringify(context), systemInstruction, 'report', summaryText, 600);
  } catch (err) { logger.warn(`[Report Gen] LLM failed: ${err.message}`); }

  const verifiedCount = state.claims.filter(c => c.status === 'VERIFIED').length;
  const partialCount = state.claims.filter(c => c.status === 'PARTIALLY_VERIFIED' || c.status === 'SUPPORTED').length;
  const failedCount = state.claims.filter(c => c.status === 'CONTRADICTED' || c.status === 'UNSUPPORTED' || c.status === 'INSUFFICIENT_EVIDENCE').length;

  const fallbackSummary = `Based on analysis of ${state.evidence.length} evidence sources regarding the research question "${state.query}", ${state.claims.length} key claims were extracted and verified. Of these, ${verifiedCount} were fully verified, ${partialCount} were partially verified, and ${failedCount} could not be confirmed. ${state.contradictions.length > 0 ? state.contradictions.length + ' contradiction(s) were identified between sources.' : 'No major contradictions were detected among the sources reviewed.'} Overall research confidence is estimated at ${state.overallConfidence}% with a hallucination index of ${state.hallucinationScore}%.`;

  const cb = state.confidenceBreakdown || {};
  const sourceRankingRows = state.evidence
    .map(e => ({
      title: e.sourceTitle,
      publisher: e.publisher,
      url: e.sourceUrl,
      authority: Math.round((e.domainAuthorityScore || 0.55) * 100),
      recency: e.createdAt ? 70 : 50,
      crossRefCount: state.citations.filter(c => c.evidenceId === e.id || c.url === e.sourceUrl).length
    }))
    .sort((a, b) => b.authority - a.authority)
    .slice(0, 15);

  const sourceRankingTable = sourceRankingRows.map((s, i) =>
    `| ${i + 1} | [${s.title}](${s.url}) | ${s.publisher} | ${s.authority}/100 | ${s.crossRefCount} |`
  ).join('\n');

  const claimsTable = state.claims.map((c, i) => {
    const cit = state.citations.find(cit => cit.claimId === c.id);
    return `| ${i + 1} | ${c.claimText} | ${c.status} | ${c.confidenceScore || 0}% | ${cit ? `[${cit.title || 'Source'}](${cit.url || '#'})` : 'No citation'} |`;
  }).join('\n');

  const contradictionsSection = state.contradictions.length === 0
    ? '*No contradictions were detected among the sources reviewed.*'
    : state.contradictions.map((con, i) =>
        `### Contradiction ${i + 1}: ${con.claimText}\n- **Source A:** ${con.sourceA}\n- **Source B:** ${con.sourceB}\n- **Type:** ${con.differenceType || 'genuine contradiction'} (Confidence: ${con.contradictionConfidence || 50}%)\n- **Analysis:** ${con.explanation}`
      ).join('\n\n');

  const evidenceTimeline = state.evidence.slice(0, 10).map((e, i) =>
    `| ${i + 1} | [${e.sourceTitle}](${e.sourceUrl}) | ${e.publisher} | ${(e.domainAuthorityScore * 100).toFixed(0)}% |`
  ).join('\n');

  const auditEntries = [
    `**Research Query:** "${state.query}"`,
    `**Research Plan:**`,
    ...(state.researchPlan?.objectives || []).map(o => `  - ${o}`),
    `**Search Queries Executed:**`,
    ...(state.tasks || []).map(t => `  - "${t.objective}"`),
    `**Sources Discovered:** ${state.evidence.length}`,
    `**Claims Extracted:** ${state.claims.length}`,
    `**Citations Created:** ${state.citations.length} (${state.citations.filter(c => c.supportStatus === 'SUPPORTED').length} supported, ${state.citations.filter(c => c.supportStatus === 'PARTIALLY_SUPPORTED').length} partial, ${state.citations.filter(c => c.supportStatus === 'UNSUPPORTED').length} unsupported)`,
    `**Contradictions Found:** ${state.contradictions.length}`,
    `**Confidence Calculation:**`,
    `  - Evidence Quality: ${cb.evidenceQualityScore || 0}/100`,
    `  - Source Reliability: ${cb.sourceReliabilityScore || 0}/100`,
    `  - Verification Score: ${cb.verificationScore || 0}/100`,
    `  - Freshness: ${cb.freshnessScore || 0}/100`,
    `  - Agreement: ${cb.agreementScore || 0}/100`,
    `  - **Final Confidence: ${state.overallConfidence || 0}%**`,
    `**Hallucination Score:** ${state.hallucinationScore || 0}%`,
    `**Generated:** ${new Date().toISOString()}`
  ];

  const markdown = `# InnoGen Verified Research Report

**Query:** "${state.query}"
**Final Confidence:** ${state.overallConfidence || 0}% | **Hallucination Index:** ${state.hallucinationScore || 0}%
**Date:** ${new Date().toLocaleString()}

---

## 1. Executive Summary

${summaryText || fallbackSummary}

---

## 2. Key Findings

### Verified Claims
${state.claims.filter(c => c.status === 'VERIFIED').map(c => `- ✅ **${c.claimText}** (${c.confidenceScore}% confidence)`).join('\n') || '*No claims fully verified.*'}

### Partially Verified Claims
${state.claims.filter(c => c.status === 'PARTIALLY_VERIFIED' || c.status === 'SUPPORTED').map(c => `- ⚠️ **${c.claimText}** (${c.confidenceScore}% confidence)`).join('\n') || '*No partially verified claims.*'}

### Unverified / Unsupported Claims
${state.claims.filter(c => c.status === 'UNSUPPORTED' || c.status === 'INSUFFICIENT_EVIDENCE').map(c => `- ❌ **${c.claimText}** (${c.confidenceScore}% confidence) — ${c.explanation || 'Insufficient evidence'}`).join('\n') || '*All claims have some degree of verification.*'}

### Contradicted Claims
${state.claims.filter(c => c.status === 'CONTRADICTED').map(c => `- 🔄 **${c.claimText}** — ${c.explanation || 'Contradicting evidence found'}`).join('\n') || '*No contradicted claims.*'}

---

## 3. Verified Claims Detail

| # | Claim | Status | Confidence | Source |
|---|-------|--------|------------|--------|
${claimsTable || '| - | No claims extracted | - | - | - |'}

---

## 4. Detected Contradictions

${contradictionsSection}

---

## 5. Evidence Timeline

| # | Source | Publisher | Authority |
|---|--------|-----------|-----------|
${evidenceTimeline || '| - | No evidence collected | - | - |'}

---

## 6. Confidence Analysis

| Component | Score | Weight | Contribution |
|-----------|-------|--------|-------------|
| Evidence Quality | ${cb.evidenceQualityScore || 0}/100 | 25% | ${((cb.evidenceQualityScore || 0) * 0.25).toFixed(1)} |
| Source Reliability | ${cb.sourceReliabilityScore || 0}/100 | 20% | ${((cb.sourceReliabilityScore || 0) * 0.20).toFixed(1)} |
| Cross Verification | ${cb.verificationScore || 0}/100 | 25% | ${((cb.verificationScore || 0) * 0.25).toFixed(1)} |
| Freshness | ${cb.freshnessScore || 0}/100 | 10% | ${((cb.freshnessScore || 0) * 0.10).toFixed(1)} |
| Agreement | ${cb.agreementScore || 0}/100 | 20% | ${((cb.agreementScore || 0) * 0.20).toFixed(1)} |
| **Final Confidence** | **${state.overallConfidence || 0}%** | **100%** | **${state.overallConfidence || 0}** |

${state.overallConfidence < 50 ? '> ⚠️ **Low confidence warning:** The confidence score is below 50%. This means insufficient evidence was available to reliably verify the research findings. Treat the output with caution.' : ''}

${state.hallucinationScore > 50 ? '> ⚠️ **High hallucination risk:** A significant portion of the output could not be grounded in retrieved evidence. Independent verification is strongly recommended.' : ''}

---

## 7. Source Ranking

| Rank | Source | Publisher | Authority | Cross-References |
|------|--------|-----------|-----------|-----------------|
${sourceRankingTable || '| - | No sources available | - | - | - |'}

---

## 8. Complete Source References

${state.evidence.map((e, i) => `${i + 1}. **[${e.sourceTitle}](${e.sourceUrl})** — ${e.publisher}${e.createdAt ? ` (Retrieved: ${new Date(e.createdAt).toLocaleDateString()})` : ''}`).join('\n') || '*No sources were retrieved. This may indicate search service unavailability.*'}

---

## 9. Audit Trail

${auditEntries.join('\n')}

---

*Report generated by **InnoGen Autonomous Multi-Agent Research Engine** | Job ID: ${state.jobId} | Timestamp: ${new Date().toISOString()}*
*Confidence: ${state.overallConfidence || 0}% | Hallucination: ${state.hallucinationScore || 0}%*
*This report is automatically generated. Every claim should be independently verified against the cited sources.*`;

  await db.report.create({ jobId: state.jobId, summaryMarkdown: markdown, confidenceScore: state.overallConfidence, auditTrail: { objectives: state.researchPlan?.objectives || [], claimCount: state.claims.length, contradictionCount: state.contradictions.length, confidenceBreakdown: state.confidenceBreakdown } });
  broadcastNodeEvent({
    node: 'Report Generator', status: 'COMPLETED',
    reportLength: markdown.length,
    sections: ['Executive Summary', 'Key Findings', 'Verified Claims', 'Contradictions', 'Evidence Timeline', 'Confidence Analysis', 'Source Ranking', 'References', 'Audit Trail']
  });
  return { reportMarkdown: markdown };
}

const workflow = new StateGraph(ResearchState)
  .addNode("planner", plannerNode)
  .addNode("decomposer", decompositionNode)
  .addNode("researcher", parallelResearchNode)
  .addNode("evidence_collector", evidenceCollectionNode)
  .addNode("claim_extractor", claimExtractionNode)
  .addNode("citation_verifier", citationVerificationNode)
  .addNode("fact_verifier", factVerificationNode)
  .addNode("contradiction_detector", contradictionDetectionNode)
  .addNode("hallucination_checker", hallucinationCheckNode)
  .addNode("confidence_scorer", consensusConfidenceNode)
  .addNode("report_generator", reportGenerationNode)
  .addEdge(START, "planner")
  .addEdge("planner", "decomposer")
  .addEdge("decomposer", "researcher")
  .addEdge("researcher", "evidence_collector")
  .addEdge("evidence_collector", "claim_extractor")
  .addEdge("claim_extractor", "citation_verifier")
  .addEdge("citation_verifier", "fact_verifier")
  .addEdge("fact_verifier", "contradiction_detector")
  .addEdge("contradiction_detector", "hallucination_checker")
  .addEdge("hallucination_checker", "confidence_scorer")
  .addEdge("confidence_scorer", "report_generator")
  .addEdge("report_generator", END);

const app = workflow.compile();

let graphInitialized = false;

export async function executeResearchGraph(jobId) {
  const timer = startTimer('graph');
  if (!graphInitialized) {
    logger.info('[LangGraph] StateGraph compiled and ready.');
    graphInitialized = true;
  }
  let job = await db.job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const initialState = {
    jobId, query: job.query, depth: job.depth || 'standard', academicOnly: !!job.academicOnly,
    researchPlan: null,
    tasks: [], evidence: [], rawSearchResults: [],
    claims: [], citations: [], contradictions: [],
    overallConfidence: 0.0, confidenceBreakdown: null, hallucinationScore: 0.0, sourceRankings: [], reportMarkdown: ''
  };

  try {
    await setGraphState(jobId, { status: 'PROCESSING', ...initialState });
    const finalState = await app.invoke(initialState);
    await db.job.update(jobId, { status: 'COMPLETED', overallConfidence: finalState.overallConfidence, hallucinationScore: finalState.hallucinationScore, completedAt: new Date().toISOString() });
    await db.auditLog.create({ action: 'RESEARCH_JOB_COMPLETED', details: `Completed research job "${finalState.query}" with confidence ${finalState.overallConfidence}%`, agent: 'Consensus Agent' });
    await setGraphState(jobId, { status: 'COMPLETED', ...finalState });
    const dur = endTimer('graph');
    logger.info(`[LangGraph] Job ${jobId} completed in ${dur}ms`);
    incrementMetric('graphExecutions');
    return finalState;
  } catch (err) {
    logError(`[LangGraph] Execution failed for job ${jobId}`, err);
    try { await db.job.update(jobId, { status: 'FAILED' }); } catch {}
    broadcastNodeEvent({ node: 'Pipeline', status: 'FAILED', message: err.message });
    await setGraphState(jobId, { status: 'FAILED', error: err.message });
    throw err;
  }
}
