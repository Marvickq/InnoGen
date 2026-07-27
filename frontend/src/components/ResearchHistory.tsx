import { motion } from 'framer-motion';
import type { ResearchJob } from '../hooks/useResearch';

interface ResearchHistoryProps {
  jobs: ResearchJob[];
  onLoadJob: (jobId: string) => void;
}

function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} at ${time}`;
}

export default function ResearchHistory({ jobs, onLoadJob }: ResearchHistoryProps) {
  const completed = jobs.filter(j => j.status === 'COMPLETED');

  if (completed.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-4xl mx-auto">
        <h2 className="font-serif text-2xl text-innogen-primary mb-6">Research History</h2>
        <div className="bg-innogen-card rounded-2xl border border-innogen-border p-12 text-center">
          <div className="w-8 h-8 rounded-full border border-innogen-border mx-auto mb-4 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-innogen-primary/[0.06]" />
          </div>
          <p className="text-sm text-innogen-primary/30">No saved reports yet.</p>
          <p className="text-xs text-innogen-primary/15 mt-1">Completed research reports will appear here.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="w-full max-w-4xl mx-auto">
      <h2 className="font-serif text-2xl text-innogen-primary mb-6">Research History</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {completed.map((job, i) => (
          <motion.button
            key={job.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, type: 'spring', stiffness: 400, damping: 30 }}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            onClick={() => onLoadJob(job.id)}
            className="bg-innogen-card rounded-xl border border-innogen-border p-5 text-left hover:bg-innogen-card-hover transition-colors duration-300 group"
          >
            <p className="text-sm font-medium text-innogen-primary/70 leading-snug mb-3 line-clamp-2 group-hover:text-innogen-primary transition-colors">
              {job.query}
            </p>
            <div className="text-[11px] text-innogen-primary/25 space-y-1">
              <p>{formatLocalTime(job.createdAt)}</p>
              <div className="flex items-center gap-3">
                <span className="tabular-nums font-medium text-innogen-primary/40">{Number(job.overallConfidence || 0).toFixed(0)}%</span>
                <span className="text-innogen-primary/15">·</span>
                <span>{job._count?.evidenceItems || 0} sources</span>
                <span className="text-innogen-primary/15">·</span>
                <span className="text-innogen-primary/20 font-mono">#{job.id.slice(0, 8)}</span>
                <span className="text-innogen-primary/15">·</span>
                <span className="text-innogen-success/60">{job.status}</span>
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
