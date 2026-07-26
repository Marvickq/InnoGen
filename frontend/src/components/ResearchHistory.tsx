import { motion } from 'framer-motion';
import { Clock, FileText, BarChart2 } from 'lucide-react';
import type { ResearchJob } from '../hooks/useResearch';

interface ResearchHistoryProps {
  jobs: ResearchJob[];
  onLoadJob: (jobId: string) => void;
}

function timeSince(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ResearchHistory({ jobs, onLoadJob }: ResearchHistoryProps) {
  const completed = jobs.filter((j) => j.status === 'COMPLETED').reverse();

  if (completed.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-4xl mx-auto"
      >
        <h2 className="font-serif text-2xl text-innogen-primary mb-6">Research History</h2>
        <div className="bg-innogen-card rounded-2xl border border-innogen-border p-12 text-center">
          <FileText size={32} className="text-innogen-primary/15 mx-auto mb-4" />
          <p className="text-sm text-innogen-primary/30">No completed research yet.</p>
          <p className="text-xs text-innogen-primary/15 mt-1">Your research reports will appear here.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="w-full max-w-4xl mx-auto"
    >
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
            {/* Question */}
            <p className="text-sm font-medium text-innogen-primary/70 leading-snug mb-4 line-clamp-2 group-hover:text-innogen-primary transition-colors">
              {job.query}
            </p>

            {/* Meta row */}
            <div className="flex items-center gap-4 text-[11px] text-innogen-primary/25">
              <div className="flex items-center gap-1">
                <Clock size={11} />
                <span>{timeSince(job.createdAt)}</span>
              </div>

              {job.evidenceItems && (
                <div className="flex items-center gap-1">
                  <FileText size={11} />
                  <span>{job.evidenceItems.length} sources</span>
                </div>
              )}

              {job.overallConfidence !== undefined && job.overallConfidence !== null && (
                <div className="flex items-center gap-1 ml-auto">
                  <BarChart2 size={11} />
                  <span className="text-innogen-primary/40 font-medium tabular-nums">
                    {Number(job.overallConfidence).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
