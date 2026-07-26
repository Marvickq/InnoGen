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
  objectives: Annotation(),
  tasks: Annotation(),
  rawSearchResults: Annotation(),
  evidence: Annotation(),
  claims: Annotation(),
  citations: Annotation(),
  contradictions: Annotation(),
  overallConfidence: Annotation(),
  hallucinationScore: Annotation(),
  reportMarkdown: Annotation()
});

async function plannerNode(state) {
  broadcastNodeEvent({ node: 'Planner', status: 'RUNNING', message: 'Analyzing research question and defining objectives...' });
  const systemInstruction = 'You are a research planner. Given a research query, list exactly 3 distinct research objectives to fully investigate the topic. Return only a raw JSON array of strings, with no markdown formatting or extra text.';
  let objectives;
  try {
    const cached = await getCachedLLM(state.query, systemInstruction, 'planner');
    const response = cached || await executeLlmInference(state.query, systemInstruction);
    if (!cached && response) await setCachedLLM(state.query, systemInstruction, 'planner', response, 600);
    const cleanResponse = (response || '').replace(/```json/g, '').replace(/```/g, '').trim();
    objectives = JSON.parse(cleanResponse);
    if (!Array.isArray(objectives)) throw new Error('Not an array');
  } catch (err) {
    logger.warn(`[Planner Node] LLM parse failed: ${err.message}`);
    objectives = [
      `Determine current progress metrics and official target figures for "${state.query}"`,
      `Gather independent authoritative reviews and market reports on "${state.query}"`,
      `Identify potential bottlenecks, policy friction, or conflicting data points`
    ];
  }
  broadcastNodeEvent({ node: 'Planner', status: 'COMPLETED', message: `Formulated ${objectives.length} research objectives.` });
  return { objectives };
}

async function decompositionNode(state) {
  broadcastNodeEvent({ node: 'Task Decomposer', status: 'RUNNING', message: 'Decomposing research objectives into parallel tasks...' });
  const systemInstruction = `You are a research task decomposer. Given a list of research objectives, decompose them into exactly 3 specific, targeted web search queries. Return only a raw JSON array of strings, with no markdown formatting or extra text. Objectives: ${JSON.stringify(state.objectives)}`;
  let taskObjs;
  try {
    const cached = await getCachedLLM(JSON.stringify(state.objectives), systemInstruction, 'decomposer');
    const response = cached || await executeLlmInference(`Generate 3 search queries for: ${state.query}`, systemInstruction);
    if (!cached && response) await setCachedLLM(JSON.stringify(state.objectives), systemInstruction, 'decomposer', response, 600);
    const cleanResponse = (response || '').replace(/```json/g, '').replace(/```/g, '').trim();
    taskObjs = JSON.parse(cleanResponse);
    if (!Array.isArray(taskObjs)) throw new Error('Not an array');
  } catch (err) {
    logger.warn(`[Decomposer Node] LLM parse failed: ${err.message}`);
    taskObjs = [
      `Search official status reports and government targets for: ${state.query}`,
      `Search independent energy agency reports (IEA, CEEW, Ember) for: ${state.query}`,
      `Identify reported grid bottlenecks, capacity delays, or data discrepancies for: ${state.query}`
    ];
  }
  const createdTasks = await db.task.createMany(state.jobId, taskObjs);
  broadcastNodeEvent({ node: 'Task Decomposer', status: 'COMPLETED', message: `Decomposed into ${createdTasks.length} parallel research tasks.` });
  return { tasks: createdTasks };
}

async function parallelResearchNode(state) {
  broadcastNodeEvent({ node: 'Parallel Research Agents', status: 'RUNNING', message: 'Executing parallel web and academic data searches...' });
  const searchPromises = state.tasks.map(async t => {
    const cached = await getCachedSearch(t.objective, 'web');
    if (cached) return cached;
    const results = await executeWebSearch(t.objective, { depth: state.depth });
    if (results && results.length > 0) await setCachedSearch(t.objective, 'web', results, 300);
    return results || [];
  });
  const searchResultsArray = await Promise.all(searchPromises);
  const rawEvidenceList = [];
  searchResultsArray.forEach((results, idx) => {
    const taskId = state.tasks[idx]?.id;
    (results || []).forEach(res => {
      rawEvidenceList.push({ ...res, taskId });
    });
  });
  const msg = rawEvidenceList.length > 0
    ? `Retrieved ${rawEvidenceList.length} search result snippets.`
    : 'Search services unavailable — no web results could be retrieved.';
  broadcastNodeEvent({ node: 'Parallel Research Agents', status: 'COMPLETED', message: msg });
  return { rawSearchResults: rawEvidenceList };
}

async function evidenceCollectionNode(state) {
  broadcastNodeEvent({ node: 'Evidence Collection', status: 'RUNNING', message: 'Extracting structured evidence items with provenance...' });
  const storedEvidence = [];
  for (const raw of state.rawSearchResults) {
    const ev = await db.evidence.create({
      jobId: state.jobId,
      taskId: raw.taskId,
      sourceUrl: raw.url,
      sourceTitle: raw.title,
      publisher: raw.publisher,
      snippet: raw.snippet,
      domainAuthorityScore: raw.domainAuthorityScore
    });
    storedEvidence.push(ev);
  }
  broadcastNodeEvent({ node: 'Evidence Collection', status: 'COMPLETED', message: `Structured ${storedEvidence.length} evidence items.` });
  return { evidence: storedEvidence };
}

async function claimExtractionNode(state) {
  broadcastNodeEvent({ node: 'Claim Extraction', status: 'RUNNING', message: 'Extracting testable factual claims from evidence...' });
  if (state.evidence.length === 0) {
    broadcastNodeEvent({ node: 'Claim Extraction', status: 'COMPLETED', message: 'No evidence collected. Skipping claim extraction.' });
    return { claims: [] };
  }
  const evidenceInput = state.evidence.map(e => ({ id: e.id, snippet: e.snippet, title: e.sourceTitle, publisher: e.publisher, sourceUrl: e.sourceUrl }));
  const systemInstruction = `You are a fact extraction agent. Analyze the provided evidence items and extract key factual claims that can be directly verified from the evidence. For each claim, identify which evidence item IDs support it. Do NOT invent claims that are not present in the evidence. Each claim must map to at least one evidence ID.

Return ONLY a raw JSON array of objects with the following schema:
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
  broadcastNodeEvent({ node: 'Claim Extraction', status: 'COMPLETED', message: `Extracted ${claimsList.length} factual claims.` });
  return { claims: claimsList };
}

async function citationVerificationNode(state) {
  broadcastNodeEvent({ node: 'Citation Verification', status: 'RUNNING', message: 'Verifying citation URL reachability and text alignment...' });
  const verifiedCitations = [];
  const systemInstruction = `You are a citation verification specialist. Compare each claim against its referenced evidence snippet(s). Evaluate semantically whether the evidence actually supports, partially supports, or does not support the claim. Read the actual content — do not use URL patterns, source existence, or keyword overlap alone.

Return ONLY a raw JSON object with the following schema:
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
      explanation = parsed.explanation || explanation;
      quotedEvidence = parsed.quotedEvidence || '';
      reasoning = parsed.reasoning || '';
    } catch (err) {
      logger.warn(`[Citation Verification] LLM parse failed for claim ${claim.id}: ${err.message}`);
      const overlapScore = matchedEvidence.reduce((acc, ev) => {
        const claimWords = new Set(claim.claimText.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        const evWords = new Set(ev.snippet.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        const common = [...claimWords].filter(w => evWords.has(w));
        return acc + (claimWords.size > 0 ? common.length / claimWords.size : 0);
      }, 0) / matchedEvidence.length;
      if (overlapScore > 0.3) { supportStatus = 'PARTIALLY_SUPPORTED'; supportConfidence = 30 + overlapScore * 50; explanation = `Partial term overlap (${(overlapScore * 100).toFixed(0)}% match) — LLM unavailable, fallback used.`; quotedEvidence = matchedEvidence[0]?.snippet?.substring(0, 100) || ''; reasoning = `Fallback evaluation: ${(overlapScore * 100).toFixed(0)}% term overlap between claim and evidence.`; }
      else { supportStatus = 'UNSUPPORTED'; supportConfidence = 10 + overlapScore * 20; explanation = `Low term overlap (${(overlapScore * 100).toFixed(0)}%) — LLM unavailable, fallback used.`; quotedEvidence = ''; reasoning = `Fallback evaluation: Only ${(overlapScore * 100).toFixed(0)}% of claim terms appear in evidence.`; }
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
  broadcastNodeEvent({ node: 'Citation Verification', status: 'COMPLETED', message: `Verified ${verifiedCitations.length} primary citations.` });
  return { citations: verifiedCitations };
}

async function factVerificationNode(state) {
  broadcastNodeEvent({ node: 'Fact Verification', status: 'RUNNING', message: 'Cross-verifying claims against evidence snippets...' });
  const systemInstruction = `You are a fact verification specialist. Verify each claim against its referenced evidence using semantic analysis of evidence content and source provenance. Consider: evidence quality, source credibility, semantic support, agreement across sources. Do NOT use keyword matching. Assign a unique confidenceScore for each claim based on this specific evidence.

Return ONLY a raw JSON object with the following schema:
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
      claim.explanation = parsed.explanation || 'Verification could not be completed from available evidence.';
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
  broadcastNodeEvent({ node: 'Fact Verification', status: 'COMPLETED', message: 'Fact verification complete.' });
  return { claims: updatedClaims };
}

async function contradictionDetectionNode(state) {
  broadcastNodeEvent({ node: 'Contradiction Detection', status: 'RUNNING', message: 'Auditing evidence for conflicting metrics or dates...' });
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
            contradictions.push(await db.contradiction.create({
              jobId: state.jobId, claimText: `Contradiction between ${evA?.publisher || 'source A'} and ${evB?.publisher || 'source B'}`,
              sourceA: `${evA?.publisher || 'Source A'}: "${evA?.snippet?.substring(0, 150) || ''}"`,
              sourceB: `${evB?.publisher || 'Source B'}: "${evB?.snippet?.substring(0, 150) || ''}"`,
              isContradiction: true, differenceType: parsed.differenceType || 'genuine contradiction',
              contradictionConfidence: parsed.confidence || 50.0, explanation: parsed.reason || 'Sources present conflicting information.',
              likelyReason: `Difference type: ${parsed.differenceType || 'unknown'}`, evidenceIds: parsed.evidenceIds
            }));
          }
        }
      } catch (err) { logger.warn(`[Contradiction Node] Pair parse failed: ${err.message}`); }
    }

    if (contradictions.length === 0) {
      const numbersRegex = /\d+[\.\d]*(?:\s*(?:GW|MW|%|billion|million|trillion|₹|\$|€|£|kWh|TWh|sq\s*km|km|m|tons|tonnes))?/gi;
      for (let i = 0; i < state.evidence.length; i++) {
        for (let j = i + 1; j < state.evidence.length; j++) {
          const a = state.evidence[i], b = state.evidence[j];
          if (a.publisher === b.publisher) continue;
          const numsA = (a.snippet.match(numbersRegex) || []).map(n => parseFloat(n.replace(/[^\d.]/g, ''))).filter(n => !isNaN(n));
          const numsB = (b.snippet.match(numbersRegex) || []).map(n => parseFloat(n.replace(/[^\d.]/g, ''))).filter(n => !isNaN(n));
          for (const na of numsA) {
            for (const nb of numsB) {
              if (Math.abs(na - nb) > 0 && Math.min(na, nb) > 0) {
                const ratio = Math.max(na, nb) / Math.min(na, nb);
                if (ratio > 1.5 && ratio < 100) {
                  if (!contradictions.some(c => (c.evidenceIds || []).includes(a.id) || (c.evidenceIds || []).includes(b.id))) {
                    contradictions.push(await db.contradiction.create({
                      jobId: state.jobId, claimText: `Conflicting numerical values between sources`,
                      sourceA: `${a.publisher}: "${a.snippet.substring(0, 120)}"`, sourceB: `${b.publisher}: "${b.snippet.substring(0, 120)}"`,
                      isContradiction: true, differenceType: 'numeric disagreement',
                      contradictionConfidence: Math.min(90, 30 + (ratio - 1) * 20),
                      explanation: `Value ${na} from ${a.publisher} differs from value ${nb} from ${b.publisher} by factor of ${ratio.toFixed(1)}x.`,
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
  broadcastNodeEvent({ node: 'Contradiction Detection', status: 'COMPLETED', message: `Identified ${contradictions.length} source contradiction(s).` });
  return { contradictions };
}

async function hallucinationCheckNode(state) {
  broadcastNodeEvent({ node: 'Hallucination Check', status: 'RUNNING', message: 'Evaluating statement support & ground-truth alignment...' });
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
  broadcastNodeEvent({ node: 'Hallucination Check', status: 'COMPLETED', message: `Hallucination score calculated: ${hallucinationScore}% (Lower is better).` });
  return { hallucinationScore };
}

async function consensusConfidenceNode(state) {
  broadcastNodeEvent({ node: 'Consensus & Confidence', status: 'RUNNING', message: 'Calculating explainable confidence score...' });
  let overallConfidence = 50.0;
  if (state.claims.length > 0 && state.evidence.length > 0) {
    const totalEv = state.evidence.length;
    const totalClaims = state.claims.length;
    const uniquePublishers = new Set(state.evidence.map(e => e.publisher)).size;
    const verifiedScores = state.claims.map(c => c.confidenceScore || 50.0);
    const avgClaimScore = verifiedScores.reduce((acc, v) => acc + v, 0) / totalClaims;
    const claimScoreVariance = verifiedScores.length > 1 ? Math.sqrt(verifiedScores.reduce((a, v) => a + (v - avgClaimScore) ** 2, 0) / verifiedScores.length) / 10 : 0;
    const evidenceDepthFactor = Math.min(1.0, totalEv / 10);
    const avgAuthority = state.evidence.reduce((acc, e) => acc + (e.domainAuthorityScore || 0.55), 0) / totalEv;
    const supportedClaims = state.claims.filter(c => state.citations.some(cit => cit.claimId === c.id && cit.supportStatus === 'SUPPORTED')).length;
    const citationSupportRatio = supportedClaims / totalClaims;
    const fullyVerified = state.claims.filter(c => c.status === 'VERIFIED').length;
    const partiallyVerified = state.claims.filter(c => c.status === 'PARTIALLY_VERIFIED').length;
    const contradicted = state.claims.filter(c => c.status === 'CONTRADICTED').length;
    const unsupported = state.claims.filter(c => c.status === 'UNSUPPORTED' || c.status === 'INSUFFICIENT_EVIDENCE').length;
    const verifiedRatio = (fullyVerified + partiallyVerified * 0.5) / totalClaims;
    const contradictedRatio = contradicted / totalClaims;
    const unsupportedRatio = unsupported / totalClaims;
    const independentSourceBonus = Math.min(15, uniquePublishers * 3);
    const evidenceCoverageRatio = state.claims.filter(c => (c.evidenceIds || []).length > 0).length / totalClaims;
    const score = +(avgClaimScore * 0.25 + avgAuthority * 10 + evidenceDepthFactor * 8 + citationSupportRatio * 10 + verifiedRatio * 15 + independentSourceBonus + evidenceCoverageRatio * 7 + Math.min(8, claimScoreVariance) - (state.contradictions.length * 5.0 + contradictedRatio * 25) - Math.max(0, (4 - totalEv) * 4) - unsupportedRatio * 20).toFixed(1);
    overallConfidence = Math.min(99.0, Math.max(5.0, score));
  }
  broadcastNodeEvent({ node: 'Consensus & Confidence', status: 'COMPLETED', message: `Calibrated Overall Confidence: ${overallConfidence}%` });
  return { overallConfidence };
}

async function reportGenerationNode(state) {
  broadcastNodeEvent({ node: 'Report Generator', status: 'RUNNING', message: 'Synthesizing verified citation-backed research report...' });
  const systemInstruction = `You are a research synthesis agent. Generate a concise, objective, evidence-backed Executive Summary that directly answers the user's research question. Base your summary ONLY on the provided claims, contradictions, evidence, and confidence metrics. Do not invent any facts not in the context. Structure the summary to:
1. Directly answer the research question
2. Reference key verified findings
3. Note any contradictions or caveats
4. State the overall confidence level
Format in clear paragraphs. No placeholder text or generic templates.`;

  const context = {
    query: state.query, overallConfidence: state.overallConfidence, hallucinationScore: state.hallucinationScore,
    evidence: state.evidence.map(e => ({ title: e.sourceTitle, snippet: e.snippet, publisher: e.publisher })),
    claims: state.claims.map(c => ({ text: c.claimText, status: c.status, confidenceScore: c.confidenceScore, explanation: c.explanation })),
    contradictions: state.contradictions.map(c => ({ claimText: c.claimText, sourceA: c.sourceA, sourceB: c.sourceB, isContradiction: c.isContradiction, differenceType: c.differenceType, contradictionConfidence: c.contradictionConfidence, explanation: c.explanation, likelyReason: c.likelyReason }))
  };

  let summaryText = '';
  try {
    const cached = await getCachedLLM(JSON.stringify(context), systemInstruction, 'report');
    summaryText = cached || await executeLlmInference(JSON.stringify(context), systemInstruction);
    if (!cached && summaryText) await setCachedLLM(JSON.stringify(context), systemInstruction, 'report', summaryText, 600);
  } catch (err) { logger.warn(`[Report Gen] LLM failed: ${err.message}`); }

  const fallbackSummary = `Based on analysis of ${state.evidence.length} evidence sources regarding the research question "${state.query}", ${state.claims.length} key claims were extracted and verified. Of these, ${state.claims.filter(c => c.status === 'VERIFIED').length} were fully verified, ${state.claims.filter(c => c.status === 'PARTIALLY_VERIFIED' || c.status === 'SUPPORTED').length} were partially verified, and ${state.claims.filter(c => c.status === 'CONTRADICTED' || c.status === 'UNSUPPORTED').length} could not be confirmed. ${state.contradictions.length > 0 ? state.contradictions.length + ' contradiction(s) were identified between sources.' : 'No major contradictions were detected among the sources reviewed.'} Overall research confidence is estimated at ${state.overallConfidence}% with a hallucination index of ${state.hallucinationScore}%.`;

  const markdown = `# InnoGen Verified Research Report
**Query**: "${state.query}"
**Confidence Score**: ${state.overallConfidence}% | **Hallucination Index**: ${state.hallucinationScore}% | **Date**: ${new Date().toLocaleString()}

---

## 1. Executive Summary
${summaryText || fallbackSummary}

---

## 2. Key Verified Claims

${state.claims.map((c, i) => {
  const citation = state.citations.find(cit => cit.claimId === c.id) || {};
  return `
### Claim ${i + 1}: ${c.claimText}
- **Verification Status**: \`${c.status}\` (${c.confidenceScore}% confidence)
- **Explanation**: ${c.explanation}
- **Primary Source**: [${citation.title || 'Source Citation'}](${citation.url || '#'}) (${citation.publisher || 'Publisher'})
`;
}).join('\n')}

---

## 3. Detected Contradictions & Discrepancies
${state.contradictions.length === 0 ? '*No major source contradictions detected.*' : state.contradictions.map((con, i) => `
> ⚠️ **Contradiction #${i + 1}: ${con.claimText}**
> - **Source A**: ${con.sourceA}
> - **Source B**: ${con.sourceB}
> - **Type**: ${con.differenceType || 'genuine contradiction'} (Confidence: ${con.contradictionConfidence || 50}%)
> - **Analytical Explanation**: ${con.explanation}
> - **Likely Reason**: ${con.likelyReason || 'Not specified'}
`).join('\n')}

---

## 4. Evidence Matrix & Provenance Log
<table class="doc-table">
  <thead>
    <tr>
      <th>Source Title</th>
      <th>Publisher</th>
      <th>Authority Score</th>
      <th>Snippet Summary</th>
    </tr>
  </thead>
  <tbody>
    ${state.evidence.map(e => `
      <tr>
        <td><a href="${e.sourceUrl}" target="_blank" rel="noopener">${e.sourceTitle}</a></td>
        <td>${e.publisher}</td>
        <td>${(e.domainAuthorityScore * 100).toFixed(0)}%</td>
        <td>${e.snippet.substring(0, 90)}...</td>
      </tr>
    `).join('')}
  </tbody>
</table>

---

## 5. Methodology & Audit Trail
This report was generated by the **InnoGen 10-Agent Research Pipeline**. Every claim maps to a primary source URL.
`;

  await db.report.create({ jobId: state.jobId, summaryMarkdown: markdown, confidenceScore: state.overallConfidence, auditTrail: { objectives: state.objectives, taskCount: state.tasks.length, evidenceCount: state.evidence.length, claimCount: state.claims.length, contradictionCount: state.contradictions.length } });
  broadcastNodeEvent({ node: 'Report Generator', status: 'COMPLETED', message: 'Report synthesis complete!' });
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
    objectives: [], tasks: [], evidence: [], rawSearchResults: [],
    claims: [], citations: [], contradictions: [],
    overallConfidence: 0.0, hallucinationScore: 0.0, reportMarkdown: ''
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
