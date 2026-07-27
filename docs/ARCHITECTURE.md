# InnoGen — Autonomous Multi-Agent Research & Fact Verification Operating System

## Architecture Document

**Classification:** Internal — Engineering Review
**Target Audience:** OpenAI, Anthropic, Google DeepMind, Microsoft Research
**Version:** 1.0
**Status:** Draft for Review

---

## Table of Contents

1. System Overview
2. Core Research Pipeline
3. Agent Architecture
4. Agent Orchestration
5. Agent Communication
6. Frontend Architecture
7. Backend Architecture
8. Database Design
9. Knowledge & Retrieval
10. Report Generation
11. Memory Architecture
12. Security
13. Observability
14. Deployment
15. Scalability Roadmap
16. Monorepo Structure
17. Final Technology Decisions
18. Future Evolution

---

## 1. System Overview

### 1.1 Overall Architecture

InnoGen is an autonomous multi-agent research operating system. Unlike chatbot architectures that statelessly generate responses from a single LLM call, InnoGen operates as a directed acyclic graph (DAG) of specialised AI agents, each responsible for one phase of the research lifecycle. Every agent writes its outputs to PostgreSQL, creating a fully auditable reasoning trail. There is no single point of generation; every claim is verified, every citation is validated, every contradiction is surfaced, and every output carries a computed confidence score.

```
┌──────────────────────────────────────────────────────────┐
│                        Client Layer                       │
│  ┌──────────────────┐  ┌──────────────────────────────┐  │
│  │  React SPA (Vite) │  │  WebSocket (real-time events)│  │
│  └────────┬─────────┘  └──────────────┬───────────────┘  │
└───────────┼──────────────────────────┼───────────────────┘
            │ HTTP REST                 │ WS
            ▼                          ▼
┌──────────────────────────────────────────────────────────┐
│                     API Gateway Layer                     │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Fastify HTTP Server                                 ││
│  │  • REST endpoints (/api/v1/research/*)              ││
│  │  • WebSocket server (/ws/agent)                     ││
│  │  • Request validation (Zod)                          ││
│  │  • Rate limiting                                     ││
│  │  • Authentication (JWT)                              ││
│  └──────────┬───────────────────────────────────────────┘│
└─────────────┼───────────────────────────────────────────┘
              │ HTTP
              ▼
┌──────────────────────────────────────────────────────────┐
│                    Orchestration Layer                    │
│  ┌──────────────────────────────────────────────────────┐│
│  │  LangGraph StateGraph                                ││
│  │  • DAG execution engine                              ││
│  │  • State persistence in PostgreSQL                   ││
│  │  • Parallel node execution                           ││
│  │  • Conditional routing                               ││
│  │  • Retry with exponential backoff                    ││
│  │  • Timeout enforcement                               ││
│  └──────────┬───────────────────────────────────────────┘│
└─────────────┼───────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────┐
│                     Agent Layer                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Planner  │ │Research  │ │Evidence  │ │Claim     │   │
│  │ Agent    │ │Agent     │ │Agent     │ │Extractor │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │Citation  │ │Fact      │ │Contradict│ │Consensus │   │
│  │Verifier  │ │Verifier  │ │Detector  │ │Engine    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │Confidence│ │Report    │ │Audit     │ │Memory    │   │
│  │Scorer    │ │Writer    │ │Agent     │ │Manager   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
└──────────┬──────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│                    Data Layer                             │
│  ┌──────────────────────────────────────────────────────┐│
│  │  PostgreSQL (Primary)                                ││
│  │  • ResearchJobs, Tasks, Evidence, Claims            ││
│  │  • Citations, Contradictions, Reports, AuditLogs    ││
│  │  • Prisma ORM with type-safe queries                ││
│  │  • Connection pooling via pgBouncer                  ││
│  └──────────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────┐│
│  │  LLM Providers (External)                            ││
│  │  • Groq (primary) — llama-3.1-8b-instant            ││
│  │  • Gemini (fallback) — gemini-2.0-flash             ││
│  │  • Extensible registry for additional providers     ││
│  └──────────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────┐│
│  │  Search Providers (External)                         ││
│  │  • Serper (primary)                                  ││
│  │  • Tavily (fallback)                                 ││
│  │  • Extensible connector interface                   ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### 1.2 Request Lifecycle

Every research request follows a deterministic lifecycle. Each phase is represented as a node in the LangGraph StateGraph, with clearly defined inputs, outputs, and success criteria.

```
    ┌──────────┐
    │  Submit  │  POST /api/v1/research { query, depth, academicOnly }
    │  Request │
    └────┬─────┘
         │ HTTP 202 Accepted — immediate jobId returned
         ▼
    ┌──────────┐
    │  Create  │  db.job.create(id, query, status: PROCESSING)
    │   Job    │
    └────┬─────┘
         │ process.nextTick / background worker
         ▼
    ┌──────────┐
    │ Execute  │  executeResearchGraph(jobId)
    │  Graph   │
    └────┬─────┘
         │
         ├──→ plannerNode ──→ decompositionNode ──→ parallelResearchNode
         │                   (fallback: generic    (fallback: generic
         │                    templates, no         templates, no
         │                    hardcoded topics)     hardcoded topics)
         │
         ├──→ evidenceCollectionNode ──→ claimExtractionNode
         │    (LLM-driven summary,       (LLM extraction, no
         │     no hardcoded filters)     hardcoded categories)
         │
         ├──→ citationVerificationNode ──→ factVerificationNode
         │    (LLM semantic compare,      (LLM fact check,
         │     fallback: term overlap)    fallback: rule-based)
         │
         ├──→ contradictionDetectionNode ──→ hallucinationCheckNode
         │    (LLM pairwise compare,       (LLM hallucination
         │     fallback: rule-based)       assessment)
         │
         ├──→ consensusConfidenceNode ──→ reportGenerationNode
         │    (weighted aggregation,       (LLM report synthesis,
         │     no hardcoded weights)       markdown output)
         │
         └──→ [COMPLETED / FAILED]
              │
              ▼
         ┌──────────┐
         │   Job    │  Polling frontend detects COMPLETED
         │ Complete │  → fetches /report endpoint
         └──────────┘
```

### 1.3 State Transitions

Every research job follows these transitions:

```
PENDING ──→ PROCESSING ──→ COMPLETED
                │
                └──→ FAILED
```

The `PROCESSING` state is subdivided into the agent node phases. Each node records its status in `AgentRun` records:

```
PROCESSING ──→ node_1:RUNNING ──→ node_1:COMPLETED ──→ node_2:RUNNING ──→ ...
                                                           │
                                                           └──→ node_N:FAILED ──→ FAILED
```

Each transition is recorded in the `AuditLog` table with a timestamp, the node name, the input hash, the output summary, and the LLM provider used. This creates a complete chain of custody for every research output.

### 1.4 Failure Recovery

The system employs three layers of failure recovery:

**Layer 1 — Node-level retry:** Each agent node retries LLM calls up to 2 times with exponential backoff (200ms, 400ms). If the LLM provider returns an error, the node attempts the fallback provider. If both fail, the node falls back to a rule-based heuristic.

**Layer 2 — Node-level fallback:** If an agent node's LLM output fails to parse or validate, the node substitutes a generic fallback template. Templates contain no topic-specific language — they use the user's query as a variable:
```
taskObjs = [
  `Search authoritative reference sources and latest data for: ${state.query}`,
  `Search independent expert analysis and commentary for: ${state.query}`,
  `Search for supporting evidence and related findings for: ${state.query}`
];
```

**Layer 3 — Job-level recovery:** If a node throws a non-recoverable error, the job transitions to `FAILED` with the error message recorded. The frontend displays the failure state. Users can resubmit the query.

### 1.5 Data Flow

Data flows through the system as structured objects, not raw strings:

```
User Input (query string)
  │
  ▼
ResearchJob { id, query, depth, status, reasoningHistory[] }
  │
  ▼
Objective[] (string array — LLM-generated, not hardcoded)
  │
  ▼
Task[] { id, objective, status, evidenceItems[], results[] }
  │
  ▼
EvidenceItem[] { id, sourceTitle, sourceUrl, publisher, snippet, authorityScore }
  │
  ▼
Claim[] { id, claimText, status, confidenceScore, evidenceIds[] }
  │
  ▼
Citation[] { claimId, supportStatus, supportConfidence, reasoning, explanation, quotedEvidence }
  │
  ▼
Contradiction[] { textA, textB, isContradiction, differenceType, contradictionConfidence, explanation }
  │
  ▼
Report { summaryMarkdown, overallConfidence, hallucinationScore }
  │
  ▼
User UI (React components render structured data)
```

## 2. Core Research Pipeline

### 2.1 Why Each Stage Exists

| Stage | Purpose | Why It Exists |
|-------|---------|---------------|
| Planner | Define research objectives | Without objectives, research is unfocused. The planner converts a user's broad query into 3 specific, measurable objectives. |
| Task Decomposer | Break objectives into search queries | A single objective may require multiple search angles. This stage generates 3 search queries per objective set. |
| Parallel Research | Execute web searches concurrently | Search is I/O-bound. Parallel execution reduces wall-clock time. Each task runs independently. |
| Evidence Collection | Summarise and rank search results | Raw search results contain noise. This stage extracts relevant snippets and assigns authority scores. |
| Claim Extraction | Identify factual statements | Raw evidence contains opinions, speculation, and facts. Only factual claims should proceed to verification. |
| Citation Verification | Match claims to supporting evidence | Without verification, claims are unsupported assertions. Each claim must be matched to specific evidence. |
| Fact Verification | Confirm factual accuracy | A claim may cite evidence that doesn't actually support it. This stage checks semantic consistency. |
| Contradiction Detection | Find conflicting evidence | Sources may disagree. Users must see conflicts to form their own judgment. |
| Hallucination Check | Identify unsupported statements | LLMs hallucinate. This stage measures how much of the output is grounded in evidence vs. generated. |
| Consensus Engine | Aggregate verification results | Multiple citations per claim may disagree. This stage computes the net position. |
| Confidence Scoring | Assign numerical confidence | Users need a quantitative measure of trustworthiness, not just qualitative labels. |
| Report Writer | Synthesise human-readable output | Structured data is machine-readable but not user-friendly. This stage produces markdown. |
| Audit Agent | Record complete reasoning chain | Every output must be reproducible. The audit trail captures every decision, input, and output. |

### 2.2 Stage Inputs, Outputs, and Dependencies

```
┌─────────────────────┬──────────────────────┬──────────────────────┬──────────────────┐
│ Stage               │ Input                │ Output               │ Depends On        │
├─────────────────────┼──────────────────────┼──────────────────────┼──────────────────┤
│ Planner             │ userQuery            │ objectives[]         │ None              │
│ Task Decomposer     │ objectives[]         │ tasks[]              │ Planner           │
│ Parallel Research   │ tasks[]              │ tasks[].results[]    │ Task Decomposer   │
│ Evidence Collection │ tasks[].results[]    │ evidenceItems[]      │ Parallel Research │
│ Claim Extraction    │ evidenceItems[]      │ claims[]             │ Evidence          │
│ Citation Verify     │ claims[], evidence[] │ citations[]          │ Claims, Evidence  │
│ Fact Verify         │ claims[], citations[]│ claims[].status      │ Citations         │
│ Contradiction Detect│ evidence[], claims[] │ contradictions[]     │ Evidence, Claims  │
│ Hallucination Check │ claims[], citations[]│ hallucinationScore   │ Citations         │
│ Consensus           │ citations[]          │ aggregatedScores     │ All verification  │
│ Confidence          │ all scores           │ overallConfidence    │ Consensus         │
│ Report Writer       │ all data             │ summaryMarkdown      │ All prior stages  │
│ Audit Agent         │ all data             │ auditLog records     │ All prior stages  │
└─────────────────────┴──────────────────────┴──────────────────────┴──────────────────┘
```

### 2.3 Retry Strategy

Each agent node follows a uniform retry contract:

```typescript
interface RetryStrategy {
  maxAttempts: 2;               // Two LLM calls per node
  backoffMs: [200, 400];        // Exponential backoff
  providerFallback: true;       // Try secondary LLM on failure
  parseFallback: true;          // Use rule-based fallback if LLM output unparseable
  timeoutMs: 30000;             // Per-LLM-call timeout
}
```

A node succeeds if:
- The LLM returns valid, parseable output matching the expected schema, OR
- The LLM returns unparseable output AND the rule-based fallback produces valid output

A node fails if:
- Both LLM providers return errors after 2 retries each, AND
- No rule-based fallback exists for this node, OR
- A database write fails irrecoverably

### 2.4 Success Criteria

A research job is considered successful when:

1. **All mandatory nodes completed:** planner, decomposition, research, evidence, claims, citations, contradictions, confidence, report
2. **At least one claim extracted** (otherwise the query yielded no factual content)
3. **At least one citation created** (otherwise no evidence was found)
4. **Report generated** (markdown of at least 500 characters)
5. **Confidence score computed** (0-100%)
6. **Hallucination score computed** (0-100%)
7. **Audit trail recorded** (every node's reasoning stored)

A job may be "partially successful" — nodes may use fallback heuristics instead of LLM — but the job still completes with reduced confidence.

## 3. Agent Architecture

### 3.1 Agent Contract

Every agent in the system conforms to a uniform interface:

```typescript
interface AgentInput {
  jobId: string;
  state: ResearchState;        // Current job state from PostgreSQL
  config: AgentConfig;         // Dynamic configuration (no hardcoded values)
  context: AgentContext;       // Provider clients, DB client, logger
}

interface AgentOutput {
  state: Partial<ResearchState>;  // State updates merged by orchestrator
  events: AgentEvent[];           // WebSocket events for frontend
  audit: AuditRecord;             // Reasoning audit entry
  metrics: AgentMetrics;          // Performance metrics
}

interface AgentConfig {
  modelPreferences: string[];      // [groq/llama-3.1-8b-instant, gemini/gemini-2.0-flash]
  retryStrategy: RetryStrategy;
  timeoutMs: number;
  fallbackTemplates: Record<string, string>;  // Dynamic, query-injectable templates
}

interface AgentContext {
  llm: LlmProvider;               // Abstract LLM client
  search: SearchProvider;         // Abstract search client
  db: PrismaClient;
  cache: CacheProvider;           // In-memory cache
  logger: Logger;
}
```

This contract ensures every agent is:
- **Testable**: inputs and outputs are plain objects
- **Replaceable**: swap any agent implementation without changing the orchestrator
- **Observable**: every call produces metrics and audit records
- **Configurable**: no hardcoded values — all parameters come from config

### 3.2 Agent Specifications

#### 3.2.1 Research Orchestrator

**Purpose:** Entry point for the research pipeline. Validates the request, creates the job, and initiates the graph execution.

**Responsibilities:**
- Validate user input (query length, rate limits, authentication)
- Create ResearchJob record in PostgreSQL
- Initialize research state
- Submit job to background worker
- Return jobId immediately (HTTP 202)

**Inputs:** `{ query: string, depth: 'quick' | 'standard' | 'deep', academicOnly: boolean }`

**Outputs:** `{ jobId: string, status: 'PROCESSING' }`

**State:** None (stateless entry point)

**Failure cases:** Database connection failure, validation error, rate limit exceeded

**Retry logic:** None — errors return HTTP 4xx/5xx to the client

**Dependencies:** Database, Worker

**Metrics:** Request latency, validation pass/fail rate, reject rate

**Extensibility:** Add new depth levels or parameters without changing the orchestrator logic

#### 3.2.2 Planning Agent

**Purpose:** Converts a user's broad research query into 3 specific, measurable research objectives. This prevents the system from wandering aimlessly through search results.

**Responsibilities:**
- Analyse the user's query for intent, scope, and implicit sub-questions
- Generate exactly 3 research objectives as concise strings
- Each objective must be independently searchable and verifiable

**Inputs:** `{ query: string }`

**Outputs:** `{ objectives: string[] }` — exactly 3 strings

**State:** None

**Failure cases:**
- LLM returns fewer or more than 3 objectives → truncate or pad with generic templates
- LLM returns unparseable JSON → use query-injected generic templates
- LLM timeout → use generic templates

**Retry logic:** 2 attempts with Groq, then fallback to Gemini, then use generic templates

**Dependencies:** LLM provider, Cache (for deduplication of identical queries)

**Metrics:** LLM call count, parse success rate, fallback rate, latency

**Extensibility:** Increase/decrease objective count via config. Add domain-specific planning via system prompt modification.

#### 3.2.3 Task Decomposer

**Purpose:** Breaks each research objective into specific, targeted web search queries. Ensures comprehensive coverage of every objective from multiple angles.

**Responsibilities:**
- Generate 3 search queries from the objective list
- Queries must be diverse (different angles, sources, perspectives)
- Each query must be independently executable by a search provider

**Inputs:** `{ objectives: string[], query: string }`

**Outputs:** `{ tasks: Task[] }` — each Task has `{ objective, status, evidenceItems[], results[] }`

**State:** Tasks are persisted to PostgreSQL via `db.task.createMany()`

**Failure cases:**
- LLM returns unparseable output → use query-injected generic search templates
- LLM returns fewer than 3 queries → pad with generic queries
- Database write fails → retry once, then fail the node

**Retry logic:** 2 LLM attempts with provider fallback, then generic templates

**Dependencies:** LLM provider, Database

**Metrics:** Task count, parse success rate, template fallback rate

**Extensibility:** Add new search angles by modifying the system prompt. The generic fallback templates contain no topic-specific language — they inject the user's query as a variable.

```
// Dynamic fallback — no hardcoded topics, no renewable energy references
taskObjs = [
  `Search authoritative reference sources and latest official data for: ${state.query}`,
  `Search independent expert analysis, reviews and commentary for: ${state.query}`,
  `Search for supporting evidence, counterarguments and related findings for: ${state.query}`
];
```

#### 3.2.4 Research Agent (Parallel)

**Purpose:** Executes web searches concurrently across all tasks. Each task runs independently in parallel.

**Responsibilities:**
- For each task, call the search provider with the task's objective
- Try primary search provider (Serper), fallback to secondary (Tavily)
- Collect raw search results (title, URL, snippet, publisher)
- Return results attached to the task

**Inputs:** `{ tasks: Task[] }`

**Outputs:** `{ tasks: Task[] }` — each task now has `results[]` populated

**State:** Results cached in memory to avoid repeated searches for identical queries

**Failure cases:**
- Search provider returns 401/403 → log warning, try fallback provider
- Search provider returns empty results → continue with empty results (no hallucination)
- All providers fail → tasks proceed with empty evidence arrays

**Retry logic:** Per-provider: 1 attempt primary, fallback to secondary immediately. No retry on empty results.

**Dependencies:** Search providers (Serper, Tavily), Cache

**Metrics:** Search latency per provider, result count, provider failover rate, cache hit rate

**Extensibility:** Add new search providers by implementing the `SearchProvider` interface. No code changes needed in the agent.

#### 3.2.5 Evidence Agent

**Purpose:** Transforms raw search results into structured evidence items with relevance scores and authority rankings. This is the quality gate — low-quality sources are de-prioritised.

**Responsibilities:**
- For each search result, extract the most relevant snippet
- Score source authority based on domain reputation (no hardcoded domain lists)
- Assign a content type tag
- Filter out low-quality results (authority < threshold)
- Return deduplicated, ranked evidence items

**Inputs:** `{ tasks: Task[] }` — tasks with raw search results

**Outputs:** `{ evidenceItems: EvidenceItem[] }`

**State:** Evidence items are persisted to PostgreSQL

**Failure cases:**
- LLM summaries fail → use raw snippet as-is
- Authority scoring fails → default to neutral score (50)
- Database write fails → retry once

**Retry logic:** No LLM retries for evidence summarisation (snippets are small). DB writes retry once.

**Dependencies:** LLM provider (for snippet relevance scoring), Database

**Metrics:** Evidence count, average authority score, filter rate, dedup rate

**Extensibility:** Authority scoring is a pluggable function. Replace with learned models or curated lists without changing the agent.

#### 3.2.6 Claim Extraction Agent

**Purpose:** Identifies factual, verifiable statements from evidence. Separates facts from opinions, speculation, and narrative.

**Responsibilities:**
- Analyse all evidence items
- Extract standalone factual claims
- Each claim must be verifiable against evidence
- Assign preliminary confidence to each claim
- Link each claim to its source evidence IDs

**Inputs:** `{ evidenceItems: EvidenceItem[] }`

**Outputs:** `{ claims: Claim[] }` — each Claim has `{ claimText, confidenceScore, evidenceIds[] }`

**State:** Claims persisted to PostgreSQL

**Failure cases:**
- LLM returns no claims → job still succeeds but with 0 claims (query may not be fact-oriented)
- LLM returns unparseable output → split evidence by sentence boundaries as fallback
- LLM generates duplicate claims → deduplicate by semantic similarity

**Retry logic:** 2 LLM attempts with provider fallback, then sentence-split fallback

**Dependencies:** LLM provider, Database

**Metrics:** Claim count, extraction latency, dedup rate, fallback rate

**Extensibility:** Adjust extraction granularity via system prompt. Add domain-specific claim schemas.

#### 3.2.7 Citation Verification Agent

**Purpose:** For every claim-evidence pair, determine whether the evidence actually supports the claim. This is the core verification step.

**Responsibilities:**
- For each claim, examine all linked evidence items
- Use LLM to semantically compare claim vs. evidence
- Return `SUPPORTED`, `PARTIALLY_SUPPORTED`, or `UNSUPPORTED`
- Assign a confidence percentage to the verdict
- Provide a natural language explanation of the reasoning
- Quote the specific evidence passage that supports or contradicts

**Inputs:** `{ claims: Claim[], evidenceItems: EvidenceItem[] }`

**Outputs:** `{ citations: Citation[] }` — each Citation has `{ claimId, supportStatus, supportConfidence, reasoning, explanation, quotedEvidence }`

**State:** Citations persisted to PostgreSQL

**Failure cases:**
- LLM returns array where string expected → stringify with `JSON.stringify()`
- LLM times out → fallback to term-overlap scoring
- All LLM attempts fail → use term-overlap with 67% threshold

**Retry logic:** 2 LLM attempts per citation. For a job with 10 claims × 2 evidence items = 20 citations, this is 40 LLM calls at worst. Term-overlap fallback prevents pipeline stall.

**Dependencies:** LLM provider, Database

**Metrics:** Citation count, LLM vs. fallback ratio, support distribution, average confidence, latency per citation

**Extensibility:** Add multi-evidence aggregation (one claim, multiple evidence sources → aggregated verdict).

#### 3.2.8 Fact Verification Agent

**Purpose:** Broadly assesses whether each claim is factually consistent with the broader evidence base, beyond individual citation checks.

**Responsibilities:**
- Review all citations for a claim
- Determine overall claim status: VERIFIED, PARTIALLY_VERIFIED, UNSUPPORTED
- Identify gaps where evidence is missing
- Flag claims that contradict established knowledge

**Inputs:** `{ claims: Claim[], citations: Citation[] }`

**Outputs:** `{ claims: Claim[] }` — claims updated with `{ status, confidenceScore }`

**State:** Claims updated in PostgreSQL

**Failure cases:**
- LLM fails → aggregate citation statuses as fallback (e.g., 2 SUPPORTED + 1 UNSUPPORTED = PARTIALLY_VERIFIED)

**Retry logic:** 2 LLM attempts, then rule-based aggregation

**Dependencies:** LLM provider, Database

**Metrics:** Verification distribution, aggregation fallback rate

**Extensibility:** Adjust verification thresholds dynamically per query domain.

#### 3.2.9 Contradiction Detection Agent

**Purpose:** Finds pairs of evidence that contradict each other, flagging genuine conflicts for the user.

**Responsibilities:**
- Compare evidence items pairwise (or cluster by topic first)
- Use LLM to determine if two evidence snippets contradict
- Classify the contradiction type (factual, numerical, temporal, interpretive)
- Assign confidence to the contradiction detection
- Explain why they contradict

**Inputs:** `{ evidenceItems: EvidenceItem[], claims: Claim[] }`

**Outputs:** `{ contradictions: Contradiction[] }`

**State:** Contradictions persisted to PostgreSQL

**Failure cases:**
- LLM fails per pair → skip that pair
- No contradictions found → return empty array
- LLM returns unparseable output → mark as non-contradiction

**Retry logic:** No retries per pair (O(n²) scaling makes retries expensive). Skip unparseable pairs.

**Dependencies:** LLM provider, Database

**Metrics:** Contradiction count, pairs evaluated, false positive rate, latency

**Extensibility:** Cluster-based comparison (group evidence by topic first, then compare within clusters) to reduce O(n²) cost.

#### 3.2.10 Hallucination Detection Agent

**Purpose:** Quantifies how much of the research output is grounded in retrieved evidence vs. generated by the LLM without support.

**Responsibilities:**
- For each claim, check if it has at least one SUPPORTED citation
- Calculate ratio of unsupported claims to total claims
- Consider citation confidence scores as weights
- Return a hallucination score (0% = fully grounded, 100% = fully hallucinated)

**Inputs:** `{ claims: Claim[], citations: Citation[] }`

**Outputs:** `{ hallucinationScore: number }`

**State:** Score stored on the ResearchJob record

**Failure cases:** No claims → hallucination score = 0 (nothing to evaluate)

**Retry logic:** None — this is a mathematical computation, not an LLM call

**Dependencies:** None (deterministic computation)

**Metrics:** Hallucination score, grounded claim ratio

**Extensibility:** Add LLM-based hallucination detection for fine-grained analysis.

#### 3.2.11 Consensus Agent

**Purpose:** Aggregates multiple citation verdicts for each claim into a single position. When different evidence sources give different answers, this agent determines the net consensus.

**Responsibilities:**
- Group citations by claim ID
- Weight each citation by its support confidence
- Compute aggregate score per claim
- Identify minority positions (evidence that disagrees with the consensus)

**Inputs:** `{ citations: Citation[] }`

**Outputs:** `{ claimConsensus: Record<string, { score: number, agreementLevel: string, minorityPositions: Citation[] }> }`

**State:** Written to claim records in PostgreSQL

**Failure cases:** None — deterministic weighted aggregation

**Retry logic:** None

**Dependencies:** Database

**Metrics:** Agreement distribution, minority position count

**Extensibility:** Replace weighting function without changing the agent interface.

#### 3.2.12 Confidence Scoring Agent

**Purpose:** Computes a single overall confidence score for the entire research output, synthesising all verification metrics.

**Responsibilities:**
- Weighted combination of: citation support ratio, claim verification ratio, evidence authority scores, contradiction penalty, independent source count
- No hardcoded weights — weights are configurable parameters
- Return 0-100% score with breakdown

**Formula (dynamic weights from config):**
```
confidence = w1 * citationSupportRate 
           + w2 * claimVerificationRate 
           + w3 * avgAuthorityScore 
           - w4 * contradictionPenalty 
           + w5 * sourceDiversityBonus
```

**Inputs:** `{ citations: Citation[], claims: Claim[], evidenceItems: EvidenceItem[], contradictions: Contradiction[] }`

**Outputs:** `{ overallConfidence: number, confidenceBreakdown: ConfidenceFactor[] }`

**State:** Score stored on the ResearchJob record

**Failure cases:** Missing data → default to weighted average of available factors

**Retry logic:** None — deterministic computation

**Dependencies:** Database

**Metrics:** Confidence distribution, factor contribution rates

**Extensibility:** Add new factors (e.g., source recency, author credentials) by adding a config entry.

#### 3.2.13 Report Writer Agent

**Purpose:** Synthesises the complete research output into a human-readable markdown report.

**Responsibilities:**
- Structure content: Executive Summary → Key Claims → Evidence → Contradictions → Confidence → Limitations → Sources
- Render claims with their verification status and citations
- Embed contradiction explanations
- Include confidence and hallucination scores with explanations
- Generate valid markdown

**Inputs:** All research data

**Outputs:** `{ report: { summaryMarkdown: string } }`

**State:** Report stored in PostgreSQL via the Report model

**Failure cases:**
- LLM returns malformed markdown → wrap in code block to preserve
- LLM fails → template-based report assembly from structured data

**Retry logic:** 2 LLM attempts, then template assembly

**Dependencies:** LLM provider, Database

**Metrics:** Report length, generation latency, fallback rate

**Extensibility:** Add new report sections without changing the agent. Add PDF export as a post-processing step.

#### 3.2.14 Audit Agent

**Purpose:** Records every decision, input, output, and error across all agents into an immutable audit trail.

**Responsibilities:**
- For each agent run, record: node name, input summary, output summary, LLM provider, latency, success/failure, error message
- Timestamp every entry
- Store in AuditLog table
- Never modify or delete audit records

**Inputs:** All agent outputs and metrics

**Outputs:** `AuditLog[]` records

**State:** Written to PostgreSQL AuditLog table

**Failure cases:** Database write failure → log to stdout (ephemeral but recoverable)

**Retry logic:** 1 retry for DB write

**Dependencies:** Database

**Metrics:** Audit record count, write latency

**Extensibility:** Add new audit event types without schema changes (use JSON metadata field).

#### 3.2.15 Memory Manager

**Purpose:** Manages in-memory and persistent caching to avoid redundant LLM calls and search requests.

**Responsibilities:**
- Cache LLM responses keyed by `(prompt_hash + system_instruction + model)`
- Cache search results keyed by `(query_hash + provider)`
- Apply TTL-based expiry (LLM: 10 min, Search: 5 min)
- Clear cache on system events
- Track cache hit/miss rates

**Inputs:** Cache key, value, TTL

**Outputs:** Cached value or null

**State:** Concurrent Map in memory, no Redis dependency

**Failure cases:** Cache miss → return null (caller recomputes)

**Retry logic:** None

**Dependencies:** None

**Metrics:** Hit rate, memory usage, eviction count

**Extensibility:** Swap in-memory cache for Redis later without changing agent code, by implementing the same `CacheProvider` interface.

## 4. Agent Orchestration

### 4.1 LangGraph vs. Custom State Machine

**Recommendation:** LangGraph StateGraph

**Justification:**

LangGraph was chosen over a custom state machine for the following reasons:

| Criteria | LangGraph | Custom State Machine |
|----------|-----------|---------------------|
| State persistence | Built-in (Checkpointer interface) | Must build from scratch |
| Parallel execution | Native `send()` API for fan-out | Must implement thread pool |
| Conditional routing | Built-in `conditional_edges` | Must implement switch logic |
| Retry per node | Node-level try/catch + retry | Must implement retry wrapper |
| Timeout per node | Node-level timeout configuration | Must implement timeout decorator |
| Progress tracking | State snapshots at every step | Must implement manually |
| Testing | Node isolation + state injection | Requires full mock setup |
| Learning curve | Moderate | Steep (bespoke system) |
| Production readiness | Proven in multi-agent deployments | Unproven without extensive testing |
| Extensibility | Add/remove nodes without refactoring | Graph changes require code changes |

The primary reason not to build a custom state machine is that LangGraph already solves every orchestration problem we have, with no additional infrastructure. A custom state machine would take 4-6 weeks to build and test to the same reliability level. LangGraph works today.

The decision is not driven by hype — it is driven by the concrete requirements of the system:

1. **State persistence:** LangGraph's Checkpointer can use PostgreSQL directly (no Redis needed), which aligns with our architecture goal of minimizing infrastructure
2. **Parallel execution:** The `Parallel Research Agents` and `Evidence Collection` phases require fan-out to N parallel workers. LangGraph's `send()` handles this natively
3. **Conditional routing:** If the Planning Agent returns 0 objectives, we should skip to an error state. LangGraph's conditional edges handle this
4. **Observability:** LangGraph's state snapshots provide free progress tracking — we broadcast these via WebSocket without additional instrumentation

### 4.2 Graph Structure

The LangGraph StateGraph is defined with typed state:

```typescript
interface ResearchState {
  jobId: string;
  query: string;
  depth: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  objectives: string[];
  tasks: Task[];
  evidenceItems: EvidenceItem[];
  claims: Claim[];
  citations: Citation[];
  contradictions: Contradiction[];
  hallucinationScore: number;
  overallConfidence: number;
  confidenceBreakdown: ConfidenceFactor[];
  report: ReportOutput;
  errors: GraphError[];
  completedNodes: string[];
}
```

### 4.3 Execution Flow

The graph executes as follows:

```
plannerNode ──→ decompositionNode ──→ parallelResearchNode (fan-out)
                                               │
                                               ▼
                                        evidenceCollectionNode
                                               │
                                               ▼
                                        claimExtractionNode
                                               │
                                               ├──────────────────┐
                                               ▼                  ▼
                                   citationVerificationNode  contradictionDetectionNode
                                               │                  │
                                               ▼                  ▼
                                        factVerificationNode     │
                                               │                  │
                                               ▼                  ▼
                                        hallucinationCheckNode   │
                                               │                  │
                                               ▼                  ▼
                                        consensusConfidenceNode  │
                                               │                  │
                                               └──────┬───────────┘
                                                      ▼
                                             reportGenerationNode
                                                      │
                                                      ▼
                                                 [COMPLETED]
```

### 4.4 Parallel Fan-Out

The `parallelResearchNode` uses LangGraph's `Command` primitive to fan out:

```
parallelResearchNode
  │
  ├──→ researchWorker(task[0])  ──→ task[0].results[]
  ├──→ researchWorker(task[1])  ──→ task[1].results[]
  └──→ researchWorker(task[2])  ──→ task[2].results[]
  │
  ▼
  All tasks complete → merge results → proceed to evidenceCollectionNode
```

Each `researchWorker` is a stateless function. Task objects are passed by reference through the shared PostgreSQL state. Workers execute independently and write results back to the task record.

### 4.5 Timeout Enforcement

Every node enforces a wall-clock timeout:

| Node | Timeout |
|------|---------|
| plannerNode | 30s |
| decompositionNode | 30s |
| parallelResearchNode | 60s (aggregate) |
| evidenceCollectionNode | 45s |
| claimExtractionNode | 60s |
| citationVerificationNode | 120s (per-claim LLM calls) |
| factVerificationNode | 60s |
| contradictionDetectionNode | 90s |
| hallucinationCheckNode | 15s |
| consensusConfidenceNode | 15s |
| reportGenerationNode | 60s |

On timeout, the node transitions to fallback mode. If no fallback exists, the node fails and the job transitions to FAILED.

## 5. Agent Communication

### 5.1 Communication Protocol Without Redis

Agents communicate exclusively through PostgreSQL-backed state. There is no message broker, no event bus, no Redis pub/sub.

The pattern is:

1. **Orchestrator** creates the initial `ResearchJob` record with status `PROCESSING`
2. **Orchestrator** invokes the first node (`plannerNode`), passing the `jobId`
3. **Node** reads its input from the job's state (e.g., `state.query` for planner)
4. **Node** writes its output to the job state via the LangGraph state update mechanism
5. **Node** creates `AgentRun` records for intermediate state (e.g., one `AgentRun` per citation)
6. **Node** broadcasts real-time progress to connected WebSocket clients (fire-and-forget, non-blocking)
7. **Orchestrator** picks up the updated state and routes to the next node based on conditional edges

### 5.2 Task Scheduling

Tasks are scheduled by the LangGraph execution engine. The flow:

```
Orchestrator
  │
  ├── Reads job state from PostgreSQL
  ├── Determines next node(s) based on graph edges
  ├── Invokes node function with current state
  │
  ▼
Node Function
  │
  ├── Reads required inputs from state
  ├── Executes LLM call / search / computation
  ├── Writes outputs to state update
  ├── Writes AgentRun records to PostgreSQL
  ├── Writes AuditLog records to PostgreSQL
  └── Broadcasts WebSocket event (non-blocking)
  │
  ▼
LangGraph Engine
  │
  ├── Merges state updates
  ├── Persists snapshot via Checkpointer
  └── Routes to next node based on edges
```

### 5.3 Reasoning History

Every decision is recorded in the `AuditLog` table:

```sql
CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "ResearchJob"("id"),
  "nodeName" TEXT NOT NULL,
  "inputSummary" TEXT,              -- Truncated input for context
  "outputSummary" TEXT,             -- Truncated output
  "provider" TEXT,                  -- 'groq', 'gemini', 'fallback'
  "latencyMs" INTEGER,
  "success" BOOLEAN NOT NULL,
  "errorMessage" TEXT,
  "llmPromptHash" TEXT,             -- Hash of full prompt sent to LLM (for reproducibility)
  "metadata" JSONB,                 -- Extensible metadata
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "AuditLog_jobId_idx" ON "AuditLog"("jobId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
```

This table serves as the complete reasoning chain. For every research output, one can replay the exact sequence of decisions, LLM calls, and fallbacks that produced it.

### 5.4 WebSocket Event Protocol

Real-time events follow a standardised format that the frontend parses without hardcoded mappings:

```json
{
  "type": "node_event",
  "node": "Citation Verification",
  "status": "COMPLETED",
  "message": "Verified 5 citations (3 SUPPORTED, 1 PARTIAL, 1 UNSUPPORTED)",
  "progress": {
    "completedNodes": ["Planner", "Search", "Evidence", "Claims", "Verify"],
    "totalNodes": 8,
    "percentage": 62.5
  },
  "timestamp": "2026-07-27T03:30:21.692Z"
}
```

The frontend uses the `node` field to map to ring segments via a dynamic label map, and the `progress.percentage` for the center counter. The `status` field drives the visual state (RUNNING = pulsing, COMPLETED = solid).

## 6. Frontend Architecture

### 6.1 Preserved Architecture

The existing frontend architecture is retained. It uses:

- **React 19** with TypeScript
- **Vite** as build tool
- **Tailwind CSS** for styling
- **Framer Motion** for animations
- **Lucide React** for icons

No migration to Next.js is proposed. The SPA architecture with Vite is sufficient for this system's needs. Server-side rendering would add complexity without corresponding benefit for an authenticated research tool.

### 6.2 Upgrade: Dynamic Component Data

The current ProgressSummary component uses hardcoded stage calculations. The upgrade makes all stages data-driven:

**Current (hardcoded):**
```typescript
const stages = [
  { label: 'Search', progress: searchPct, detail: `${evCount} sources found` },
  // ... every stage hardcoded
];
```

**Upgrade (dynamic):**
```typescript
// Stages derived from the actual ResearchJob data
const stages = deriveStages(job);
// where deriveStages reads completed agent runs from job metadata
// and computes progress dynamically based on what actually ran
```

The `deriveStages` function reads the `AgentRun` records associated with the job and generates stage entries dynamically. If new agents are added, the frontend automatically shows them without code changes.

### 6.3 Component Hierarchy

```
App
├── Navbar (fixed, always visible)
│   ├── Logo + Brand
│   ├── Navigation Tabs (Research, History, Analytics, Settings)
│   ├── Connection Indicator (WebSocket status)
│   └── Time + User Icon
│
├── Research View (activeView === 'research')
│   ├── Hero
│   │   ├── Title + Subtitle
│   │   ├── Search Bar (input + submit button)
│   │   └── Example (dynamic — loads random query from configurable pool)
│   │
│   ├── [isResearching] Intelligence Ring
│   │   ├── SVG Ring (8 dynamic segments from config)
│   │   ├── Center Percentage (animated)
│   │   └── Cycling Task Labels (from config)
│   │
│   ├── [isResearching] Live Activity
│   │   └── Activity Items (from WebSocket events)
│   │
│   ├── [hasReport] Executive Summary
│   │   └── Markdown Renderer
│   │
│   ├── [hasReport] Key Claims
│   │   └── Claim Cards (from claims[])
│   │
│   ├── [hasReport] Confidence Gauge + Hallucination Bar
│   │
│   ├── [hasReport] Contradictions
│   │   └── Contradiction Cards (from contradictions[])
│   │
│   ├── [hasReport] Evidence Explorer
│   │   └── Timeline Items (from evidenceItems[])
│   │
│   ├── [hasReport] Progress Summary (dynamic stages from data)
│   │
│   └── [empty] Empty State
│
├── History View (activeView === 'history')
│   └── ResearchHistory
│       └── Job Cards (from research.jobs[])
│
├── Analytics View (activeView === 'analytics')
│   └── Placeholder
│
└── Settings View (activeView === 'settings')
    └── Service Status (from config, not hardcoded)
```

### 6.4 Dynamic Example Queries

The current hardcoded example in Hero.tsx:
```typescript
const example = 'Is India on track for 500GW renewable energy by 2030?';
```

This is replaced with a dynamic pool:
```typescript
// Configuration — loaded from config, not hardcoded
const EXAMPLE_QUERIES = [
  'What is the capital of France?',
  'How does photosynthesis work?',
  'What are the effects of sleep deprivation?',
  // Random selection on each page load
];
const example = EXAMPLE_QUERIES[Math.floor(Math.random() * EXAMPLE_QUERIES.length)];
```

### 6.5 WebSocket Integration

The existing `useWebSocket` hook is retained with one upgrade: the `NODE_LABEL_MAP` is now a config parameter rather than a hardcoded object. This allows the backend to define the segment mapping dynamically.

```typescript
// Before (hardcoded):
const NODE_LABEL_MAP: Record<string, string> = { ... };

// After (loaded from backend config endpoint):
const NODE_LABEL_MAP = await fetch('/api/v1/config/node-labels').then(r => r.json());
```

### 6.6 Polling Strategy

The current 1.5s polling interval in `useResearch.pollJob()` is retained. Alternative strategies (WebSocket-based job completion) were considered but rejected because:

1. **Reliability:** HTTP polling is more reliable than a persistent WS connection for long-running jobs
2. **Simplicity:** No need for a separate job-completion event channel
3. **User experience:** 1.5s polling is fast enough that users perceive it as near-real-time

The polling strategy:
- On first poll: GET `/api/v1/research/{jobId}` → update `currentJob` state
- On COMPLETED: fetch `/api/v1/research/{jobId}/report` → merge report into job state
- On FAILED: clear researching state, show error
- On error: retry next interval (transient failures)

### 6.7 Error Boundaries

Each output section is wrapped in an error boundary:

```
Research View
├── ErrorBoundary(IntelligenceRing)
├── ErrorBoundary(LiveActivity)
├── ErrorBoundary(ExecutiveSummary)
├── ErrorBoundary(KeyClaims)
├── ErrorBoundary(ConfidenceGauge)
├── ErrorBoundary(HallucinationBar)
├── ErrorBoundary(Contradictions)
├── ErrorBoundary(EvidenceExplorer)
└── ErrorBoundary(ProgressSummary)
```

If any section fails to render, the error boundary catches the error, logs it, and displays a minimal fallback ("This section encountered an error"). The rest of the page continues to function.

## 7. Backend Architecture

### 7.1 Preserved Architecture

The existing backend uses:

- **Node.js** with **Fastify** HTTP server
- **Express** middleware compatibility (via `@fastify/express`)
- **Prisma ORM** for PostgreSQL access
- **LangGraph** for agent orchestration
- **WebSocket** for real-time events

No migration to NestJS is proposed. The current architecture is lightweight, modular, and production-ready. NestJS's dependency injection and module system would add complexity without proportional benefit for this system's size.

### 7.2 Folder Structure

```
src/
├── agents/
│   ├── researchGraph.js       # LangGraph StateGraph definition
│   └── agents.js              # Individual agent functions
│
├── services/
│   ├── llm.js                 # LLM provider abstraction (Groq + Gemini)
│   ├── search.js              # Search provider abstraction (Serper + Tavily)
│   ├── cache.js               # In-memory cache
│   ├── redis.js               # No-op stubs (no Redis dependency)
│   ├── worker.js              # Background worker (DB-polling, no queue)
│   └── monitor.js             # Logging, metrics, health
│
├── routes/
│   ├── research.js            # /api/v1/research/* endpoints
│   └── config.js              # /api/v1/config/* dynamic config endpoints
│
├── db/
│   └── prisma.js              # Prisma client singleton
│
├── middleware/
│   ├── auth.js                # JWT authentication (future)
│   ├── rateLimit.js           # Rate limiting (future)
│   └── validation.js          # Zod request validation
│
└── utils/
    ├── logger.js              # Structured logging
    └── errors.js              # Error classes and handling
```

### 7.3 Dynamic Configuration Endpoint

A new `/api/v1/config` endpoint serves dynamic configuration to the frontend:

```
GET /api/v1/config
{
  "nodeLabels": {
    "Planner": "Plan",
    "Task Decomposer": "Search",
    ...
  },
  "segmentLabels": ["Plan", "Search", "Evidence", "Claims", "Verify", "Compare", "Consensus", "Summary"],
  "taskLabels": ["Finding Sources", "Comparing Evidence", "Verifying Claims", "Analysing Contradictions", "Generating Report"],
  "exampleQueries": ["What is the capital of France?", ...],
  "maxQueryLength": 500,
  "supportedDepths": ["quick", "standard", "deep"],
  "llmProviders": [
    { "name": "Groq", "model": "llama-3.1-8b-instant", "status": "ONLINE" },
    { "name": "Gemini", "model": "gemini-2.0-flash", "status": "ONLINE" }
  ]
}
```

This eliminates all hardcoded values in the frontend. Adding a new agent, changing segment labels, or updating example queries requires only a backend config change — no frontend deployment.

### 7.4 API Versioning

All REST endpoints are prefixed with `/api/v1/`. Versioning is explicit in the URL path:

- `/api/v1/research` — Research endpoints
- `/api/v1/config` — Configuration endpoints
- `/api/v1/health` — Health check
- `/api/v1/auth` — Authentication (future)
- `/api/v1/admin` — Admin endpoints (future)

When breaking changes are necessary, a new version (`/api/v2/`) is added alongside the old version. Deprecated versions are maintained for at least 6 months with a `Sunset` header.

### 7.5 Request Validation

All endpoints validate input using Zod schemas:

```typescript
const ResearchRequestSchema = z.object({
  query: z.string().min(3).max(500),
  depth: z.enum(['quick', 'standard', 'deep']).default('standard'),
  academicOnly: z.boolean().default(false),
});
```

Invalid requests return a structured error response:

```json
{
  "success": false,
  "error": "Validation Error",
  "details": [
    { "field": "query", "message": "Query must be at least 3 characters" }
  ]
}
```

## 8. Database Design

### 8.1 Schema

```sql
-- Users
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT,
  "role" TEXT NOT NULL DEFAULT 'user',  -- 'user', 'admin'
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL
);

-- Research Jobs
CREATE TABLE "ResearchJob" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT REFERENCES "User"("id"),
  "query" TEXT NOT NULL,
  "depth" TEXT NOT NULL DEFAULT 'standard',
  "status" TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING, PROCESSING, COMPLETED, FAILED
  "overallConfidence" DOUBLE PRECISION,
  "hallucinationScore" DOUBLE PRECISION,
  "errorMessage" TEXT,
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE INDEX "ResearchJob_userId_idx" ON "ResearchJob"("userId");
CREATE INDEX "ResearchJob_status_idx" ON "ResearchJob"("status");
CREATE INDEX "ResearchJob_createdAt_idx" ON "ResearchJob"("createdAt");

-- Research Plans (objectives)
CREATE TABLE "ResearchPlan" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "ResearchJob"("id"),
  "objectives" JSONB NOT NULL,         -- Array of objective strings
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "ResearchPlan_jobId_idx" ON "ResearchPlan"("jobId");

-- Agent Runs (node execution records)
CREATE TABLE "AgentRun" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "ResearchJob"("id"),
  "nodeName" TEXT NOT NULL,
  "status" TEXT NOT NULL,              -- RUNNING, COMPLETED, FAILED, SKIPPED
  "input" JSONB,
  "output" JSONB,
  "provider" TEXT,                     -- LLM provider used
  "latencyMs" INTEGER,
  "error" TEXT,
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ
);

CREATE INDEX "AgentRun_jobId_idx" ON "AgentRun"("jobId");
CREATE INDEX "AgentRun_status_idx" ON "AgentRun"("status");

-- Tasks (search tasks from decomposition)
CREATE TABLE "Task" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "ResearchJob"("id"),
  "objective" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "results" JSONB,                     -- Raw search results
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE INDEX "Task_jobId_idx" ON "Task"("jobId");

-- Evidence Items
CREATE TABLE "EvidenceItem" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "ResearchJob"("id"),
  "taskId" TEXT REFERENCES "Task"("id"),
  "sourceTitle" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "publisher" TEXT,
  "snippet" TEXT,
  "authorityScore" DOUBLE PRECISION DEFAULT 0,
  "contentType" TEXT,                  -- 'article', 'report', 'news', etc.
  "publishedDate" TEXT,
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "EvidenceItem_jobId_idx" ON "EvidenceItem"("jobId");
CREATE INDEX "EvidenceItem_authorityScore_idx" ON "EvidenceItem"("authorityScore");

-- Claims
CREATE TABLE "Claim" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "ResearchJob"("id"),
  "claimText" TEXT NOT NULL,
  "status" TEXT DEFAULT 'PENDING',     -- PENDING, VERIFIED, PARTIALLY_VERIFIED, UNSUPPORTED
  "confidenceScore" DOUBLE PRECISION DEFAULT 0,
  "evidenceIds" JSONB DEFAULT '[]',   -- References to EvidenceItem IDs
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE INDEX "Claim_jobId_idx" ON "Claim"("jobId");
CREATE INDEX "Claim_status_idx" ON "Claim"("status");

-- Citations (claim-evidence verification results)
CREATE TABLE "Citation" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "ResearchJob"("id"),
  "claimId" TEXT NOT NULL REFERENCES "Claim"("id"),
  "evidenceItemId" TEXT REFERENCES "EvidenceItem"("id"),
  "sourceTitle" TEXT,
  "supportStatus" TEXT NOT NULL,       -- SUPPORTED, PARTIALLY_SUPPORTED, UNSUPPORTED
  "supportConfidence" DOUBLE PRECISION DEFAULT 0,
  "reasoning" TEXT,
  "explanation" TEXT,
  "quotedEvidence" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "Citation_jobId_idx" ON "Citation"("jobId");
CREATE INDEX "Citation_claimId_idx" ON "Citation"("claimId");
CREATE INDEX "Citation_supportStatus_idx" ON "Citation"("supportStatus");

-- Contradictions
CREATE TABLE "Contradiction" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "ResearchJob"("id"),
  "textA" TEXT,
  "textB" TEXT,
  "publisherA" TEXT,
  "publisherB" TEXT,
  "isContradiction" BOOLEAN NOT NULL DEFAULT FALSE,
  "differenceType" TEXT,               -- 'factual', 'numerical', 'temporal', 'interpretive'
  "contradictionConfidence" DOUBLE PRECISION DEFAULT 0,
  "explanation" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "Contradiction_jobId_idx" ON "Contradiction"("jobId");

-- Reports
CREATE TABLE "Report" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "ResearchJob"("id"),
  "summaryMarkdown" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE INDEX "Report_jobId_idx" ON "Report"("jobId");

-- Audit Log (immutable reasoning trail)
CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "ResearchJob"("id"),
  "nodeName" TEXT NOT NULL,
  "inputSummary" TEXT,
  "outputSummary" TEXT,
  "provider" TEXT,
  "latencyMs" INTEGER,
  "success" BOOLEAN NOT NULL,
  "errorMessage" TEXT,
  "llmPromptHash" TEXT,
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "AuditLog_jobId_idx" ON "AuditLog"("jobId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- User Sessions
CREATE TABLE "Session" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id"),
  "token" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- API Keys
CREATE TABLE "ApiKey" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id"),
  "name" TEXT NOT NULL,
  "key" TEXT NOT NULL UNIQUE,
  "permissions" JSONB DEFAULT '{}',
  "lastUsedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- User Feedback
CREATE TABLE "Feedback" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "ResearchJob"("id"),
  "userId" TEXT REFERENCES "User"("id"),
  "rating" INTEGER,                    -- 1-5
  "comment" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "Feedback_jobId_idx" ON "Feedback"("jobId");
```

### 8.2 Entity Relationships

```
User 1──N ResearchJob
ResearchJob 1──1 ResearchPlan
ResearchJob 1──N AgentRun
ResearchJob 1──N Task
ResearchJob 1──N EvidenceItem
ResearchJob 1──N Claim
ResearchJob 1──N Citation
ResearchJob 1──N Contradiction
ResearchJob 1──1 Report
ResearchJob 1──N AuditLog
ResearchJob 1──N Feedback
Task 1──N EvidenceItem
Claim 1──N Citation
EvidenceItem 1──N Citation
User 1──N Session
User 1──N ApiKey
```

### 8.3 Migration Strategy

Database migrations use Prisma Migrate:

```bash
# Development: auto-generate migration from schema changes
npx prisma migrate dev --name add_user_api_keys

# Production: apply migrations
npx prisma migrate deploy
```

Guidelines:
- Every change starts with a migration, never direct schema edits
- Backward-compatible changes only (add columns as nullable, add tables without required FKs initially)
- Rollback via `prisma migrate resolve --rolled-back`
- Data migrations are separate PRs from schema migrations

### 8.4 Optimistic Locking

Claims, Citations, and AgentRun records use optimistic locking to prevent concurrent overwrites:

```prisma
model Claim {
  id        String   @id @default(cuid())
  version   Int      @default(1)
  // ... other fields

  @@index([jobId])
}
```

Updates increment the version number. If a write targets an outdated version, Prisma throws a `P2025` error (record not found), and the operation retries.

## 9. Knowledge & Retrieval

### 9.1 Retrieval Strategy

InnoGen uses a tiered retrieval strategy with dynamic provider selection:

```typescript
interface RetrievalStrategy {
  primary: SearchProvider;      // Serper (web + news + academic)
  fallback: SearchProvider;     // Tavily (web-focused)
  academicPrimary?: SearchProvider;  // Google Scholar API (future)
  
  maxResults: number;           // Configurable per depth level
  retryOnEmpty: boolean;        // Try fallback if primary returns 0 results
  timeoutMs: number;            // 15s per provider
}
```

Depth levels control retrieval breadth:

| Depth | Providers | Max Results | Timeout |
|-------|-----------|-------------|---------|
| quick | Serper (primary) + Tavily (fallback) | 5 per query | 15s |
| standard | Serper + Tavily | 10 per query | 20s |
| deep | Serper + Tavily + academic (future) | 20 per query | 30s |

### 9.2 Source Ranking

Sources are ranked by a composable authority scoring function:

```
authorityScore = w1 * domainAuthority 
               + w2 * citationCount 
               + w3 * recencyFactor 
               + w4 * contentTypeBonus
```

Where:
- `domainAuthority`: extracted from existing source lists or LLM-assigned by analysing the domain reputation
- `citationCount`: how many times this source is cited across all research (future)
- `recencyFactor`: exponential decay based on publish date (newer = higher)
- `contentTypeBonus`: `.gov` +15, `.edu` +10, `.org` +5, news +0, blog -5

No domain lists are hardcoded. The scoring function references a configurable source quality table that can be updated dynamically.

### 9.3 Citation Linking

Every citation links a claim to specific evidence:

```
Claim: "The capital of France is Paris."
  │
  ├── Citation 1: EvidenceItem "Paris is the capital..." → SUPPORTED (95%)
  │     └── Source: https://example.com/paris
  │
  └── Citation 2: EvidenceItem "Berlin is the capital..." → UNSUPPORTED (10%)
        └── Source: https://example.com/berlin
```

Citations carry:
- `claimId`: which claim this citation refers to
- `evidenceItemId`: which evidence was used
- `supportStatus`: verdict
- `supportConfidence`: how certain the verdict is
- `quotedEvidence`: the exact text that supports or refutes the claim
- `reasoning`: LLM's reasoning for the verdict
- `explanation`: human-readable explanation

### 9.4 Metadata

Every evidence item carries extensible metadata:

```json
{
  "id": "evt_abc123",
  "sourceTitle": "Paris - Wikipedia",
  "sourceUrl": "https://en.wikipedia.org/wiki/Paris",
  "publisher": "Wikipedia",
  "snippet": "Paris is the capital and most populous city of France.",
  "authorityScore": 75,
  "contentType": "encyclopedia",
  "publishedDate": "2026-01-15",
  "metadata": {
    "wordCount": 4523,
    "language": "en",
    "accessType": "free",
    "citationCount": 15,
    "domainAge_years": 24,
    "hasSchemaMarkup": true
  }
}
```

## 10. Report Generation

### 10.1 Report Structure

The generated report follows a standardised structure:

```markdown
# Executive Summary

[2-3 paragraph synthesis of the research findings]

---

## Key Claims

### Claim 1: [Claim text]
- **Status:** VERIFIED ✓
- **Confidence:** 92%
- **Evidence:** [source link] — "Quoted evidence text"
- **Reasoning:** [LLM explanation]

### Claim 2: [Claim text]
- **Status:** UNSUPPORTED ✗
- **Confidence:** 12%
- **Evidence:** [source link] — "Quoted evidence text"
- **Reasoning:** [LLM explanation]

---

## Evidence Summary

[Table or structured list of all evidence items with authority scores]

---

## Contradictions Detected

### Contradiction 1
- **Source A:** [Publisher A] — "Text A"
- **Source B:** [Publisher B] — "Text B"
- **Type:** Numerical discrepancy
- **Analysis:** [Explanation]

---

## Confidence Assessment

- **Overall Confidence:** 78.5%
- **Factors:**
  - Citation Support Rate: 85% (17/20 citations support)
  - Claim Verification Rate: 80% (8/10 claims verified)
  - Average Source Authority: 72/100
  - Contradiction Penalty: -5%
  - Source Diversity Bonus: +3%

## Limitations

- [Limitation 1: e.g., "Only web sources were searched, no academic databases"]
- [Limitation 2: e.g., "3 of 20 citations used term-overlap fallback instead of LLM"]

---

## Sources

1. [Title](URL) — Publisher
2. [Title](URL) — Publisher

---

*Report generated by InnoGen Autonomous Research Engine v6.0.0*
*Job ID: job-abc123*
*Timestamp: 2026-07-27T03:30:21.692Z*
*Confidence: 78.5% | Hallucination: 2.4%*
```

### 10.2 Report Assembly Pipeline

```
Raw Data (claims, citations, contradictions, scores)
  │
  ├── LLM-based synthesis:
  │   System prompt: "Write a research report from the following data..."
  │   User prompt: JSON-serialised research data
  │   Output: Markdown string
  │
  └── Template-based assembly (fallback):
      ├── Executive Summary: LLM-generated from top claims
      ├── Key Claims: iterated template with {claimText}, {status}, {confidence}
      ├── Evidence Summary: iterated table template
      ├── Contradictions: iterated template with {textA}, {textB}, {explanation}
      ├── Confidence: formatted from {overallConfidence} and {confidenceBreakdown}
      └── Sources: iterated template with {title}, {url}, {publisher}
```

### 10.3 PDF Export (Future)

PDF export is a post-processing step on the generated markdown:

```
Markdown → unified → PDF (via puppeteer or markdown-to-pdf library)
```

This keeps the PDF pipeline separate from the research pipeline. The report is always generated as markdown first. PDF is an export format, not a storage format.

## 11. Memory Architecture

### 11.1 Memory Tiers

InnoGen uses three memory tiers:

| Tier | Storage | TTL | Contents |
|------|---------|-----|----------|
| L1 — In-memory | JavaScript Map | 5-10 minutes | LLM responses, search results |
| L2 — Session | PostgreSQL (Session table) | Session lifetime | User context, conversation history |
| L3 — Persistent | PostgreSQL (ResearchJob + Report tables) | Indefinite | All completed research, reports, evidence |

### 11.2 L1 — In-memory Cache

The in-memory cache stores:
- LLM responses (keyed by prompt hash + system instruction + model)
- Search results (keyed by query hash + provider)

TTL is short (5-10 minutes) because:
1. Same query within minutes is likely a retry or duplicate
2. Memory pressure is bounded by TTL expiry
3. No persistence needed — cache miss just recomputes

Cache structure:
```typescript
interface CacheEntry<T> {
  value: T;
  expiry: number;       // Date.now() + ttlMs
  hitCount: number;     // For cache efficiency monitoring
}
```

### 11.3 L2 — Session Memory

Session memory is lightweight and job-scoped:

```typescript
interface SessionContext {
  userId: string;
  currentJobId: string | null;
  recentQueries: string[];      // Last 5 queries
  preferences: UserPreferences;  // Depth, providers, etc.
}
```

Session context is loaded on WebSocket connection and used to:
- Pre-fill user preferences in the search UI
- Track recent queries for quick re-search
- Maintain WebSocket connection state

### 11.4 L3 — Persistent Memory

All completed research jobs are stored indefinitely in PostgreSQL. This enables:

- **Research history:** Users can browse all their past research
- **Evidence reuse:** Future research can reference previously collected evidence
- **Knowledge evolution:** The same question asked months apart can be compared
- **Audit:** Complete reasoning history for every output ever generated

Retention policy:
- User data: retained until account deletion
- Anonymous jobs: retained for 30 days
- Audit logs: retained for 1 year (configurable)
- Cache entries: not retained (ephemeral by design)

## 12. Security

### 12.1 Authentication (Future)

Authentication uses OAuth 2.0 with support for multiple providers:

```typescript
interface AuthConfig {
  providers: {
    google: OAuthProvider;
    github: OAuthProvider;
    microsoft: OAuthProvider;
  };
  jwtSecret: string;           // From env, never hardcoded
  jwtExpiry: string;           // '24h'
  sessionStrategy: 'jwt' | 'database';
}
```

Flow:
1. User clicks "Sign in with Google/GitHub/Microsoft"
2. OAuth redirect → callback → JWT issued
3. JWT included in `Authorization: Bearer <token>` header
4. Backend validates JWT on every protected request
5. Optional: API keys for programmatic access

### 12.2 Defence Layers

| Threat | Defence |
|--------|---------|
| Prompt injection | System prompt isolation; input sanitisation; max length enforcement; role separation (system vs user messages) |
| SQL injection | Prisma ORM (parameterised queries by default); never raw SQL |
| XSS | React's default escaping; CSP headers; no dangerouslySetInnerHTML with user content |
| CSRF | SameSite cookies; CSRF tokens for state-changing requests |
| Rate limiting | Per-IP and per-user rate limits; configurable tiers; 429 responses with Retry-After headers |
| API key leakage | Keys stored as bcrypt hashes; never logged; never returned in API responses |
| JWT theft | Short expiry (24h); refresh tokens; IP + user-agent binding (future) |

### 12.3 Secrets Management

Secrets are stored in environment variables (`.env`), never in code:

```
# .env — never committed to version control
DATABASE_URL=postgresql://...
Groq_API_KEY=gsk_...
GEMINI_API_KEY=...
SEARCH_API_KEY=...
TAVILY_API_KEY=...
JWT_SECRET=...
```

In production, secrets are injected by the deployment platform (Render secrets, GitHub Actions secrets, Cloudflare secrets).

### 12.4 Audit Logs

Every security-relevant action is logged:

- Authentication events (login, logout, failed login)
- API key usage (creation, deletion, each request)
- Research job access (view, export, delete)
- Rate limit triggering
- Admin actions

Audit logs are append-only. No deletion or modification is permitted through the application.

## 13. Observability

### 13.1 Structured Logging

All logs are structured JSON:

```json
{
  "timestamp": "2026-07-27T03:30:21.692Z",
  "level": "info",
  "service": "innogen",
  "component": "citationVerificationNode",
  "jobId": "job-abc123",
  "message": "Citation verification complete",
  "metadata": {
    "citationsCreated": 15,
    "llmCitations": 9,
    "fallbackCitations": 6,
    "latencyMs": 45320
  }
}
```

Log levels:
- `error`: System cannot function (database down, LLM key expired)
- `warn`: Degraded but functioning (LLM fallback used, search provider failed)
- `info`: Normal operations (node completed, job finished)
- `debug`: Detailed agent reasoning (LLM prompts, raw outputs)

### 13.2 Metrics

| Category | Metrics |
|----------|---------|
| Research | Jobs created, completed, failed; average completion time; average confidence; average hallucination |
| Agent | Per-node execution count, latency, success rate, fallback rate, LLM vs rule-based ratio |
| LLM | Call count, success rate, average latency, token usage, provider distribution, cache hit rate |
| Search | Query count, result count per query, provider failover rate, cache hit rate |
| Business | Active users, queries per user, report views, export count, feedback rating |

### 13.3 Health Checks

```
GET /api/v1/health

{
  "status": "HEALTHY",
  "product": "InnoGen Autonomous Multi-Agent Research Engine",
  "version": "6.0.0",
  "timestamp": "2026-07-27T03:30:21.692Z",
  "services": {
    "apiGateway": "ONLINE",
    "researchGraphEngine": "ONLINE",
    "database": "ONLINE",
    "wsAgentStream": "ONLINE"
  },
  "uptime": 84321.5
}
```

Each service check probes a specific capability:
- `apiGateway`: HTTP server responds
- `researchGraphEngine`: LangGraph graph is compiled and ready
- `database`: Prisma can execute a simple query
- `wsAgentStream`: WebSocket server is accepting connections

## 14. Deployment

### 14.1 Deployment Architecture

```
GitHub Repository
  │
  ├── .github/workflows/
  │   ├── deploy-web.yml      → Vercel (frontend)
  │   └── deploy-api.yml      → Render (backend)
  │
  ├── apps/web/               → Frontend (Vite React SPA)
  └── apps/api/               → Backend (Fastify Node.js)
          │
          ▼                  ▼
    Vercel (CDN)        Render (Web Service)
    ┌──────────┐        ┌──────────────┐
    │  React   │        │  Fastify     │
    │  SPA     │◄──────►│  LangGraph   │
    │  (Edge)  │  REST  │  WebSocket   │
    └──────────┘        │  Worker      │
                        └──────┬───────┘
                               │
                               ▼
                        ┌──────────────┐
                        │  PostgreSQL   │
                        │  (Supabase)   │
                        └──────────────┘
```

### 14.2 Deployment Flow

1. **Developer pushes to `main` branch**
2. **GitHub Actions workflow triggers:**
   - Lint + Type-check (both frontend and backend)
   - Run tests
   - Build frontend (`vite build`)
   - Deploy frontend to Vercel
   - Deploy backend to Render
3. **Vercel:** Static files deployed to edge network. No server-side rendering.
4. **Render:** Fastify server started with:
   - `npx prisma migrate deploy` (run migrations)
   - `node server.js` (start server)
   - Health check verified before marking deployment as live
5. **Rollback:** Vercel instant rollback (previous deployment). Render redeploy previous image.

### 14.3 Why Not Kubernetes

Kubernetes is not used because:

- **Scale:** The system serves hundreds to thousands of users, not millions
- **Complexity:** K8s adds operational overhead (cluster management, monitoring, networking) that exceeds the benefit for this workload
- **Cost:** A 3-node K8s cluster costs more than a single dedicated server that handles the load
- **Stateless:** The API server is stateless (all state is in PostgreSQL), so horizontal scaling is trivial without K8s

When K8s becomes necessary (Stage 4+ in scalability roadmap), the application is already containerised with Docker and can be migrated without code changes.

## 15. Scalability Roadmap

### 15.1 Stage 1: 1,000 Users

**Architecture:** As designed in this document.

**Bottlenecks:** None. A single Node.js server handles 1,000 users generating ~10 research jobs/day each = 10,000 jobs/day. At 2 minutes per job, that's ~333 concurrent hours of compute, which a single server handles with headroom.

**Database:** Single PostgreSQL instance. No replicas needed.

**Background processing:** Current `process.nextTick` inline processing sufficient.

**Caching:** In-memory cache as designed.

### 15.2 Stage 2: 10,000 Users

**New bottlenecks:**
- Increased concurrent LLM calls (Groq rate limits hit first)
- Database connection pool exhaustion under load

**Strategy:**
- Increase LLM provider quota (paid tier)
- Add LLM response caching with longer TTL (1 hour for identical queries)
- Increase pgBouncer connection pool size
- Add read-only PostgreSQL replica for report fetches (writes go to primary)
- No code changes needed — configuration only

**Background processing:** Still synchronous inline. If LLM latency becomes an issue, extract LLM calls to a separate worker process communicating via PostgreSQL polling (no Redis needed).

### 15.3 Stage 3: 100,000 Users

**New bottlenecks:**
- Single Node.js server reaches CPU/memory limits
- PostgreSQL write throughput under concurrent research jobs
- LLM call queue becomes a bottleneck

**Strategy:**
- Horizontal scaling: 2-3 Node.js instances behind a simple HTTP router (Render auto-scaling)
- Database: Primary + 2 read replicas. Write-heavy queries (job creation, audit logging) stay on primary. Read-heavy queries (report fetching, history browsing) go to replicas.
- LLM queue: Dedicated worker process per instance. Workers communicate via PostgreSQL task queue.
- In-memory cache becomes per-instance. Add shared cache later if needed (Redis migration — see below).

**Infrastructure addition justified at this stage:**
- **Redis** (or Valkey for Redis-compatible OSS): Shared cache for LLM responses and search results across instances. Cache invalidation becomes necessary.
- **Load balancer:** Simple round-robin (Render built-in).
- Justification: At 100,000 users, caching identical LLM responses across instances reduces API costs by ~40% and improves latency by 2-3x.

### 15.4 Stage 4: 1,000,000 Users

**New bottlenecks:**
- PostgreSQL write throughput (millions of audit log rows)
- LLM cost ($50,000+/month at this scale)
- Search API costs

**Strategy:**
- Database: Shard by `userId` (PostgreSQL partitioning). Each shard handles a subset of users.
- LLM: Fine-tune smaller models for specific agent tasks (citation verification, claim extraction) to reduce cost and latency.
- Search: Build internal search index for frequently researched topics.
- Background processing: Dedicated worker fleet. Jobs dispatched via Redis pub/sub queue.
- Audit logs: Write-ahead log (WAL) to object storage (S3/R2) for archival. Recent logs in PostgreSQL.

**Infrastructure addition justified at this stage:**
- **Kubernetes:** At 1M users, auto-scaling, rolling deployments, and resource isolation become necessary. 5-10 node K8s cluster.
- Justification: Multiple backend services (API, workers, model inference), each with different scaling characteristics.

## 16. Monorepo Structure

```
innogen/
├── apps/
│   ├── web/                    # Frontend — Vite React SPA
│   │   ├── src/
│   │   │   ├── components/    # React components
│   │   │   ├── hooks/         # Custom hooks (useResearch, useWebSocket)
│   │   │   ├── lib/           # Utilities, API client
│   │   │   ├── types/         # TypeScript interfaces
│   │   │   └── config/        # Dynamic config from backend
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── api/                    # Backend — Fastify Node.js
│       ├── src/
│       │   ├── agents/        # LangGraph StateGraph + agent nodes
│       │   ├── services/      # LLM, search, cache, worker, monitor
│       │   ├── routes/        # REST API endpoints
│       │   ├── db/            # Prisma client
│       │   ├── middleware/    # Auth, rate limiting, validation
│       │   └── utils/         # Logger, errors
│       ├── prisma/
│       │   └── schema.prisma
│       ├── package.json
│       └── server.js
│
├── packages/
│   ├── agents/                 # Shared agent types and interfaces
│   │   └── src/
│   │       ├── types.ts       # AgentInput, AgentOutput, AgentConfig
│   │       └── interfaces.ts  # LlmProvider, SearchProvider, CacheProvider
│   │
│   ├── core/                   # Core types shared across the system
│   │   └── src/
│   │       └── types.ts       # ResearchJob, Task, EvidenceItem, Claim, etc.
│   │
│   ├── database/               # Database schema and migration scripts
│   │   ├── prisma/
│   │   │   └── schema.prisma  # Canonical schema
│   │   └── migrations/
│   │
│   ├── prompts/                # All LLM prompts (versioned)
│   │   ├── planner/
│   │   │   └── system.md
│   │   ├── citationVerification/
│   │   │   └── system.md
│   │   └── ...
│   │
│   ├── research/               # Research pipeline utilities
│   │   └── src/
│   │       ├── scoring.ts     # Confidence and hallucination formulas
│   │       └── dedup.ts       # Deduplication logic
│   │
│   ├── reports/                # Report generation utilities
│   │   └── src/
│   │       └── templates.ts   # Report templates (fallback)
│   │
│   ├── shared/                 # Shared utilities
│   │   └── src/
│   │       ├── hash.ts        # Query hashing
│   │       └── validation.ts  # Zod schemas
│   │
│   ├── ui/                     # Shared UI components (if needed)
│   │
│   ├── auth/                   # Authentication logic
│   │   └── src/
│   │       └── jwt.ts
│   │
│   └── config/                 # Shared configuration schemas
│       └── src/
│           └── index.ts       # Config types and defaults
│
├── docs/                       # Architecture, API, deployment docs
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── DEPLOYMENT.md
│
├── scripts/                    # Development automation
│   ├── dev.sh                  # Start both frontend + backend
│   ├── seed.ts                 # Database seeding
│   └── migrate.sh              # Migration wrapper
│
├── package.json                # Root workspace config
├── turbo.json                  # Turborepo config
└── .github/
    └── workflows/              # CI/CD pipelines
        ├── deploy-web.yml
        └── deploy-api.yml
```

## 17. Final Technology Decisions

| Layer | Technology | Justification |
|-------|------------|---------------|
| Frontend framework | React 19 + Vite | Preserved from current architecture. Fast dev server, small bundle. No SSR needed for authenticated SPA. |
| Styling | Tailwind CSS | Utility-first, rapid development, consistent design system. |
| Animation | Framer Motion | Declarative animations, layout animations, spring physics for natural UI. |
| Icons | Lucide React | Lightweight, tree-shakeable, consistent icon set. |
| HTTP server | Fastify | High throughput, schema-based validation, low overhead. Preserved from current architecture. |
| API validation | Zod | Runtime validation + TypeScript inference. No schema duplication. |
| ORM | Prisma | Type-safe queries, auto-generated client, migration system. Preserved. |
| Database | PostgreSQL (Supabase) | ACID compliance, JSONB for flexible metadata, full-text search. Managed service reduces ops burden. |
| Connection pooling | pgBouncer | Transaction pooling for serverless/worker environments. Prevents connection exhaustion. |
| Agent orchestration | LangGraph StateGraph | Built-in state persistence, parallel execution, conditional routing, progress tracking. Beats custom state machine for reliability. |
| LLM providers | Groq (primary), Gemini (fallback) | Groq for speed (llama-3.1-8b-instant), Gemini for breadth. Provider abstraction allows swapping without code changes. |
| Search providers | Serper (primary), Tavily (fallback) | Serper for structured search results. Tavily as fallback. Provider abstraction via SearchProvider interface. |
| WebSocket | ws (native implementation) | Lightweight, no framework dependency. Current architecture already uses it. |
| Auth (future) | Auth.js (Better Auth) | Open-source, multiple OAuth providers, session management, JWT support. |
| Object storage | Cloudflare R2 | S3-compatible, no egress fees, global edge network. For report PDFs and file attachments (future). |
| Frontend deployment | Vercel | Instant rollbacks, edge network, preview deployments, zero config. |
| Backend deployment | Render | Simple web service deployment, auto-scaling, custom domains, health checks. |
| CI/CD | GitHub Actions | Tight GitHub integration, matrix builds, secrets management, artifact storage. |
| Monorepo management | Turborepo | Parallel task execution, caching, dependency graph awareness. |
| Caching | In-memory Map (L1) | No external dependency. Sufficient for current scale. Redis added at Stage 3 when shared cache across instances becomes necessary. |

## 18. Future Evolution

### 18.1 Architecture Designed for Evolution

The architecture supports future capabilities without major rewrites because:

1. **Pluggable providers:** LLM and search providers implement interfaces. New providers are added by implementing the interface, not by modifying existing code.

2. **Dynamic agent graph:** The LangGraph StateGraph's node list is defined at compile time but the routing logic is data-driven. Adding a new agent means adding a node function and an edge — no structural changes.

3. **Extensible schemas:** Every database model includes a `metadata JSONB` field. New properties are added without migrations.

4. **No hardcoded values:** Configuration is served from the backend's `/api/v1/config` endpoint. The frontend adapts to whatever config it receives.

5. **Prompt versioning:** All prompts are in the `packages/prompts/` directory as versioned text files. Prompts evolve independently of code.

### 18.2 Future Capabilities

| Capability | How Architecture Supports It | What Changes |
|------------|-----------------------------|--------------|
| Private enterprise knowledge bases | SearchProvider interface supports custom connectors | New SearchProvider implementation. No pipeline changes. |
| Human-in-the-loop verification | LangGraph's `interrupt` supports human input | Add `interrupt_before` node in graph. Frontend adds approval UI. |
| Long-running autonomous research | Background worker already supports multi-hour jobs | Extend job timeout. Add periodic progress heartbeats. |
| Additional specialised agents | Graph accepts new nodes without restructuring | Add node function + edge. Frontend dynamically shows new segment. |
| Multi-model routing | LlmProvider abstraction supports routing logic | Model selection strategy in config. No code changes. |
| Enterprise collaboration / Team workspaces | User model already supports orgId (future field) | Add orgId to schema. Filter jobs by org. |
| API platform | /api/v1/ versioning already in place | Add API key authentication. Document public endpoints. |
| Fine-tuned in-house models | LlmProvider interface supports any model | Register new provider. Point to model endpoint. |

### 18.3 Non-Goals (Explicitly Out of Scope)

The following are deliberately excluded from the current architecture:

- **Real-time collaboration** (Google Docs-style): Would require operational transforms and a different state management approach
- **Multi-modal research** (image, video, audio analysis): Would require separate pipelines for each modality
- **Continuous research** (monitoring a topic over time): Would require scheduling infrastructure
- **Self-improving agents** (agents that modify their own prompts): Creates a catastrophic feedback loop without rigorous guardrails

These capabilities can be added later within the existing architecture, but they are not part of the initial design.

---

*Document prepared for internal engineering review.*
*InnoGen — Autonomous Multi-Agent Research & Fact Verification Operating System*
*Version 1.0 | July 2026*
