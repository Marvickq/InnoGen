import { motion } from 'framer-motion';
import { Copy, Download, BarChart3 } from 'lucide-react';
import type { ResearchJob } from '../hooks/useResearch';

interface ProgressSummaryProps {
  job: ResearchJob;
  totalCompletedJobs: number;
}

function copyReport(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function downloadReport(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProgressSummary({ job, totalCompletedJobs }: ProgressSummaryProps) {
  const evCount = job.evidenceItems?.length || 0;
  const claimCount = job.claims?.length || 0;
  const citCount = job.citations?.length || 0;
  const conCount = job.contradictions?.length || 0;
  const confidence = Number(job.overallConfidence) || 0;
  const hallucination = Number(job.hallucinationScore) || 0;
  const hasReport = !!job.report?.summaryMarkdown;

  const verifiedCits = job.citations?.filter(c => c.supportStatus === 'SUPPORTED').length || 0;
  const verifiedClaims = job.claims?.filter(c => c.status === 'VERIFIED').length || 0;
  const partialClaims = job.claims?.filter(c => c.status === 'PARTIALLY_VERIFIED').length || 0;

  const searchPct = evCount > 0 ? 100 : 0;
  const evPct = evCount > 0 ? 100 : 0;
  const claimPct = claimCount > 0 ? 100 : 0;
  const citPct = citCount > 0 ? Math.round((verifiedCits / citCount) * 100) : 0;
  const factPct = claimCount > 0 ? Math.round(((verifiedClaims + partialClaims) / claimCount) * 100) : 0;
  const conPct = 100;
  const summaryPct = hasReport ? 100 : 0;
  const overallPct = Math.round((searchPct + evPct + claimPct + citPct + factPct + conPct + summaryPct) / 7);

  const stages = [
    { label: 'Search', progress: searchPct, detail: `${evCount} sources found` },
    { label: 'Evidence Collection', progress: evPct, detail: `${evCount} items collected` },
    { label: 'Claim Extraction', progress: claimPct, detail: `${claimCount} claims extracted` },
    { label: 'Citation Verification', progress: citPct, detail: `${verifiedCits}/${citCount} verified` },
    { label: 'Fact Verification', progress: factPct, detail: `${verifiedClaims} verified, ${partialClaims} partial` },
    { label: 'Contradiction Detection', progress: conPct, detail: conCount > 0 ? `${conCount} found` : 'None detected' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="w-full max-w-4xl mx-auto"
    >
      <div className="bg-innogen-card rounded-2xl border border-innogen-border p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-innogen-primary/[0.06] flex items-center justify-center">
            <BarChart3 size={18} className="text-innogen-primary/60" />
          </div>
          <h2 className="font-serif text-2xl text-innogen-primary">Research Progress Summary</h2>
        </div>

        <div className="space-y-4">
          {stages.map((s, i) => (
            <div key={s.label} className="flex items-center gap-4">
              <span className="w-44 text-sm text-innogen-primary/70 flex-shrink-0">{s.label}</span>
              <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${s.progress}%` }}
                  transition={{ delay: 0.1 + i * 0.05, duration: 0.8 }}
                  className={`h-full rounded-full ${s.progress === 100 ? 'bg-innogen-success' : 'bg-innogen-warning'}`}
                />
              </div>
              <span className="w-8 text-xs text-innogen-primary/40 tabular-nums text-right">{s.progress}%</span>
              <span className="w-48 text-xs text-innogen-primary/30 text-right">{s.detail}</span>
            </div>
          ))}

          <div className="border-t border-innogen-border my-4" />

          <div className="flex items-center gap-4">
            <span className="w-44 text-sm text-innogen-primary/70 flex-shrink-0">Confidence</span>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${confidence}%` }}
                transition={{ delay: 0.5, duration: 0.8 }}
                className="h-full rounded-full bg-innogen-primary/50"
              />
            </div>
            <span className="w-8 text-xs text-innogen-primary/40 tabular-nums text-right">{confidence}%</span>
            <span className="w-48 text-xs text-innogen-primary/30 text-right">{confidence >= 70 ? 'High' : confidence >= 40 ? 'Medium' : 'Low'}</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="w-44 text-sm text-innogen-primary/70 flex-shrink-0">Hallucination</span>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${hallucination}%` }}
                transition={{ delay: 0.55, duration: 0.8 }}
                className="h-full rounded-full bg-innogen-danger/60"
              />
            </div>
            <span className="w-8 text-xs text-innogen-primary/40 tabular-nums text-right">{hallucination}%</span>
            <span className="w-48 text-xs text-innogen-primary/30 text-right">{hallucination <= 20 ? 'Low' : hallucination <= 50 ? 'Medium' : 'High'}</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="w-44 text-sm text-innogen-primary/70 flex-shrink-0">Executive Summary</span>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${summaryPct}%` }}
                transition={{ delay: 0.6, duration: 0.8 }}
                className={`h-full rounded-full ${hasReport ? 'bg-innogen-success' : 'bg-innogen-warning'}`}
              />
            </div>
            <span className="w-8 text-xs text-innogen-primary/40 tabular-nums text-right">{summaryPct}%</span>
            <span className="w-48 text-xs text-innogen-primary/30 text-right">{hasReport ? 'Generated' : 'Pending'}</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="w-44 text-sm text-innogen-primary/70 flex-shrink-0">Download / Copy</span>
            <div className="flex-1 flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => copyReport(job.report?.summaryMarkdown || '')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-innogen-border text-xs text-innogen-primary/60 hover:text-innogen-primary hover:bg-white/[0.08] transition-all duration-300"
              >
                <Copy size={12} />
                Copy
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => downloadReport(job.report?.summaryMarkdown || '', `InnoGen-Report-${job.id}.md`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-innogen-border text-xs text-innogen-primary/60 hover:text-innogen-primary hover:bg-white/[0.08] transition-all duration-300"
              >
                <Download size={12} />
                Download
              </motion.button>
            </div>
            <span className="w-8 text-xs text-innogen-primary/40 tabular-nums text-right">{hasReport ? 100 : 0}%</span>
            <span className="w-48 text-xs text-innogen-primary/30 text-right">{hasReport ? 'Ready' : 'No report'}</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="w-44 text-sm text-innogen-primary/70 flex-shrink-0">Research History</span>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${totalCompletedJobs > 0 ? 100 : 0}%` }}
                transition={{ delay: 0.65, duration: 0.8 }}
                className={`h-full rounded-full ${totalCompletedJobs > 0 ? 'bg-innogen-success' : 'bg-white/10'}`}
              />
            </div>
            <span className="w-8 text-xs text-innogen-primary/40 tabular-nums text-right">{totalCompletedJobs > 0 ? 100 : 0}%</span>
            <span className="w-48 text-xs text-innogen-primary/30 text-right">{totalCompletedJobs} completed</span>
          </div>

          <div className="border-t border-innogen-border my-4" />

          <div className="flex items-center gap-4">
            <span className="w-44 text-sm font-medium text-innogen-primary flex-shrink-0">Overall InnoGen Progress</span>
            <div className="flex-1 h-3 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${overallPct}%` }}
                transition={{ delay: 0.7, duration: 1 }}
                className="h-full rounded-full bg-gradient-to-r from-innogen-primary/40 to-innogen-success"
              />
            </div>
            <span className="w-8 text-sm font-medium text-innogen-primary tabular-nums text-right">{overallPct}%</span>
            <span className="w-48 text-xs text-innogen-primary/30 text-right">
              {overallPct === 100 ? 'Complete' : overallPct >= 70 ? 'Mostly Complete' : overallPct >= 40 ? 'In Progress' : 'Started'}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
