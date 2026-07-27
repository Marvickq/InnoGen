import { useState, useCallback } from 'react';

export interface EvidenceItem {
  id: string;
  sourceTitle: string;
  sourceUrl: string;
  publisher?: string;
  snippet?: string;
  authorityScore?: number;
  publishedDate?: string;
  contentType?: string;
}

export interface Claim {
  id: string;
  claimText: string;
  status?: string;
  confidenceScore?: number;
  evidenceIds?: string[];
}

export interface Citation {
  claimId: string;
  sourceTitle?: string;
  supportStatus?: string;
  supportConfidence?: number;
  quotedEvidence?: string;
  reasoning?: string;
}

export interface Contradiction {
  id?: string;
  textA?: string;
  textB?: string;
  publisherA?: string;
  publisherB?: string;
  isContradiction?: boolean;
  differenceType?: string;
  contradictionConfidence?: number;
  explanation?: string;
}

export interface ResearchJob {
  id: string;
  query: string;
  status: string;
  depth?: string;
  createdAt: string;
  updatedAt?: string;
  overallConfidence?: number;
  hallucinationScore?: number;
  claims?: Claim[];
  evidenceItems?: EvidenceItem[];
  citations?: Citation[];
  contradictions?: Contradiction[];
  report?: {
    summaryMarkdown?: string;
  };
  _count?: {
    evidenceItems: number;
    claims: number;
    contradictions: number;
  };
}

export interface ResearchState {
  isResearching: boolean;
  currentJobId: string | null;
  currentJob: ResearchJob | null;
  jobs: ResearchJob[];
  error: string | null;
}

export function useResearch() {
  const [state, setState] = useState<ResearchState>({
    isResearching: false,
    currentJobId: null,
    currentJob: null,
    jobs: [],
    error: null,
  });

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/research');
      const data = await res.json();
      if (data.success && Array.isArray(data.jobs)) {
        setState((prev) => ({ ...prev, jobs: data.jobs }));
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
  }, []);

  const startResearch = useCallback(async (query: string, depth = 'standard', academicOnly = false) => {
    setState((prev) => ({ ...prev, isResearching: true, error: null, currentJob: null }));
    try {
      const res = await fetch('/api/v1/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, depth, academicOnly }),
      });
      const data = await res.json();
      if (data.success) {
        setState((prev) => ({ ...prev, currentJobId: data.jobId }));
        pollJob(data.jobId);
        return data.jobId;
      } else {
        setState((prev) => ({ ...prev, isResearching: false, error: data.error }));
        return null;
      }
    } catch (err) {
      setState((prev) => ({ ...prev, isResearching: false, error: 'Failed to connect to API' }));
      return null;
    }
  }, []);

  const pollJob = useCallback(async (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/research/${jobId}`);
        const data = await res.json();
        if (data.success && data.job) {
          setState((prev) => ({ ...prev, currentJob: data.job }));

          if (data.job.status === 'COMPLETED') {
            clearInterval(interval);
            // Fetch the full report
            try {
              const reportRes = await fetch(`/api/v1/research/${jobId}/report`);
              const reportData = await reportRes.json();
              if (reportData.success && reportData.report) {
                setState((prev) => ({
                  ...prev,
                  isResearching: false,
                  currentJob: prev.currentJob
                    ? { ...prev.currentJob, report: reportData.report }
                    : prev.currentJob,
                }));
              } else {
                setState((prev) => ({ ...prev, isResearching: false }));
              }
            } catch {
              setState((prev) => ({ ...prev, isResearching: false }));
            }
            // Refresh history
            fetchJobs();
          }
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 1500);
  }, [fetchJobs]);

  const loadJob = useCallback(async (jobId: string) => {
    try {
      const [jobRes, reportRes] = await Promise.all([
        fetch(`/api/v1/research/${jobId}`),
        fetch(`/api/v1/research/${jobId}/report`),
      ]);
      const jobData = await jobRes.json();
      const reportData = await reportRes.json();

      if (jobData.success && jobData.job) {
        const job = jobData.job;
        if (reportData.success && reportData.report) {
          job.report = reportData.report;
        }
        setState((prev) => ({ ...prev, currentJob: job, currentJobId: jobId, isResearching: false }));
      }
    } catch (err) {
      console.error('Load job error:', err);
    }
  }, []);

  return {
    ...state,
    fetchJobs,
    startResearch,
    loadJob,
  };
}
