import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { Claim, Citation } from '../hooks/useResearch';

interface KeyClaimsProps {
  claims: Claim[];
  citations?: Citation[];
}

function getStatusConfig(status?: string) {
  switch (status?.toUpperCase()) {
    case 'VERIFIED':
    case 'SUPPORTED':
      return { icon: CheckCircle2, label: 'VERIFIED', color: 'text-innogen-success', bg: 'bg-innogen-success/10', border: 'border-innogen-success/20' };
    case 'PARTIALLY_SUPPORTED':
    case 'PARTIALLY_VERIFIED':
      return { icon: AlertTriangle, label: 'PARTIAL', color: 'text-innogen-warning', bg: 'bg-innogen-warning/10', border: 'border-innogen-warning/20' };
    case 'UNSUPPORTED':
    case 'REFUTED':
      return { icon: XCircle, label: 'UNSUPPORTED', color: 'text-innogen-danger', bg: 'bg-innogen-danger/10', border: 'border-innogen-danger/20' };
    default:
      return { icon: CheckCircle2, label: 'VERIFIED', color: 'text-innogen-success', bg: 'bg-innogen-success/10', border: 'border-innogen-success/20' };
  }
}

export default function KeyClaims({ claims, citations = [] }: KeyClaimsProps) {
  if (!claims || claims.length === 0) return null;

  // Map citations by claimId
  const citationsByClaimId: Record<string, Citation[]> = {};
  citations.forEach((c) => {
    if (!citationsByClaimId[c.claimId]) citationsByClaimId[c.claimId] = [];
    citationsByClaimId[c.claimId].push(c);
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="w-full max-w-4xl mx-auto"
    >
      <h2 className="font-serif text-2xl text-innogen-primary mb-6">Key Claims</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {claims.map((claim, i) => {
          const cfg = getStatusConfig(claim.status);
          const Icon = cfg.icon;
          const claimCitations = citationsByClaimId[claim.id] || [];
          const sourceCount = claimCitations.length || (claim.evidenceIds?.length || 0);

          return (
            <motion.div
              key={claim.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.05, type: 'spring', stiffness: 400, damping: 30 }}
              whileHover={{ y: -2, transition: { duration: 0.2 } }}
              className="bg-innogen-card rounded-xl border border-innogen-border p-5 hover:bg-innogen-card-hover transition-colors duration-300 group cursor-default"
            >
              {/* Status Badge */}
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider ${cfg.bg} ${cfg.border} border mb-3`}>
                <Icon size={11} className={cfg.color} />
                <span className={cfg.color}>{cfg.label}</span>
              </div>

              {/* Claim Text */}
              <p className="text-sm text-innogen-primary/75 leading-relaxed mb-4 line-clamp-3">
                {claim.claimText}
              </p>

              {/* Footer */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-innogen-primary/30">
                  {sourceCount} source{sourceCount !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${claim.confidenceScore || 0}%` }}
                      transition={{ delay: 0.4 + i * 0.05, duration: 0.8 }}
                      className="h-full rounded-full bg-innogen-primary/40"
                    />
                  </div>
                  <span className="text-xs font-medium text-innogen-primary/50 tabular-nums">
                    {claim.confidenceScore || 0}%
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
