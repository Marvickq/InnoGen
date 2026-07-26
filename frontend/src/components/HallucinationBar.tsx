import { motion } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';

interface HallucinationBarProps {
  value: number; // 0–100
}

function getBarColor(val: number): string {
  if (val <= 15) return 'from-green-500 to-green-400';
  if (val <= 40) return 'from-yellow-500 to-yellow-400';
  return 'from-red-500 to-red-400';
}

function getRiskLabel(val: number): string {
  if (val <= 10) return 'Very Low';
  if (val <= 25) return 'Low';
  if (val <= 50) return 'Moderate';
  if (val <= 75) return 'High';
  return 'Critical';
}

export default function HallucinationBar({ value }: HallucinationBarProps) {
  const barColor = getBarColor(value);
  const riskLabel = getRiskLabel(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.35 }}
      className="bg-innogen-card rounded-2xl border border-innogen-border p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <ShieldAlert size={16} className="text-innogen-primary/40" />
          <span className="text-xs text-innogen-primary/30 tracking-widest uppercase">
            Hallucination Risk
          </span>
        </div>
        <span className="text-sm font-medium text-innogen-primary/50">{riskLabel}</span>
      </div>

      {/* Bar */}
      <div className="relative h-2.5 rounded-full bg-white/[0.04] overflow-hidden">
        {/* Gradient background markers */}
        <div className="absolute inset-0 flex">
          <div className="flex-1 bg-gradient-to-r from-green-500/10 to-green-400/5" />
          <div className="flex-1 bg-gradient-to-r from-yellow-500/10 to-yellow-400/5" />
          <div className="flex-1 bg-gradient-to-r from-red-500/10 to-red-400/5" />
        </div>

        {/* Active bar */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: [0.23, 1, 0.32, 1], delay: 0.5 }}
          className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${barColor}`}
          style={{ boxShadow: value > 40 ? '0 0 12px rgba(239,68,68,0.3)' : value > 15 ? '0 0 12px rgba(250,204,21,0.2)' : '0 0 12px rgba(34,197,94,0.2)' }}
        />
      </div>

      {/* Value */}
      <div className="flex justify-between mt-2">
        <span className="text-[10px] text-innogen-primary/20">0%</span>
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-lg font-semibold text-innogen-primary tabular-nums"
        >
          {value.toFixed(1)}%
        </motion.span>
        <span className="text-[10px] text-innogen-primary/20">100%</span>
      </div>
    </motion.div>
  );
}
