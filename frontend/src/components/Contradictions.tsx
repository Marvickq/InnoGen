import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import type { Contradiction } from '../hooks/useResearch';

interface ContradictionsProps {
  contradictions?: Contradiction[];
}

export default function Contradictions({ contradictions }: ContradictionsProps) {
  const hasContradictions = contradictions && contradictions.length > 0 && contradictions.some(c => c.isContradiction);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="w-full max-w-4xl mx-auto"
    >
      <h2 className="font-serif text-2xl text-innogen-primary mb-6">Contradictions</h2>

      {!hasContradictions ? (
        /* Beautiful empty state with green glow */
        <div className="bg-innogen-card rounded-2xl border border-innogen-success/10 p-10 flex flex-col items-center justify-center glow-success">
          <div className="w-14 h-14 rounded-2xl bg-innogen-success/[0.08] flex items-center justify-center mb-4">
            <ShieldCheck size={28} className="text-innogen-success/70" />
          </div>
          <p className="text-innogen-primary/50 text-center text-sm">
            No conflicting evidence detected.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {contradictions!.filter(c => c.isContradiction).map((c, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * i }}
              className="bg-innogen-card rounded-xl border border-innogen-danger/15 p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider bg-innogen-danger/10 border border-innogen-danger/20 text-innogen-danger">
                  CONTRADICTION
                </span>
                <span className="text-xs text-innogen-primary/30 tabular-nums">
                  {c.contradictionConfidence?.toFixed(0)}% confidence
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className="bg-white/[0.02] rounded-lg p-3">
                  <span className="text-[10px] text-innogen-primary/30 font-medium tracking-wider block mb-1">
                    {c.publisherA || 'Source A'}
                  </span>
                  <p className="text-sm text-innogen-primary/60 line-clamp-3">{c.textA}</p>
                </div>
                <div className="bg-white/[0.02] rounded-lg p-3">
                  <span className="text-[10px] text-innogen-primary/30 font-medium tracking-wider block mb-1">
                    {c.publisherB || 'Source B'}
                  </span>
                  <p className="text-sm text-innogen-primary/60 line-clamp-3">{c.textB}</p>
                </div>
              </div>
              {c.explanation && (
                <p className="text-xs text-innogen-primary/40 italic">{c.explanation}</p>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
