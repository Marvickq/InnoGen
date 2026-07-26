import { motion } from 'framer-motion';
import { ExternalLink, Globe } from 'lucide-react';
import type { EvidenceItem } from '../hooks/useResearch';

interface EvidenceExplorerProps {
  evidence: EvidenceItem[];
}

function getAuthorityStars(score?: number): { stars: string; label: string } {
  const s = score || 0;
  if (s >= 80) return { stars: '★★★★★', label: 'Government' };
  if (s >= 65) return { stars: '★★★★☆', label: 'Trusted' };
  if (s >= 50) return { stars: '★★★☆☆', label: 'Reliable' };
  if (s >= 30) return { stars: '★★☆☆☆', label: 'Moderate' };
  return { stars: '★☆☆☆☆', label: 'Blog' };
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

export default function EvidenceExplorer({ evidence }: EvidenceExplorerProps) {
  if (!evidence || evidence.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15 }}
      className="w-full max-w-4xl mx-auto"
    >
      <h2 className="font-serif text-2xl text-innogen-primary mb-6">Evidence Explorer</h2>

      {/* Timeline */}
      <div className="relative pl-8">
        {/* Vertical line */}
        <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-innogen-primary/20 via-innogen-primary/10 to-transparent" />

        <div className="space-y-4">
          {evidence.map((item, i) => {
            const authority = getAuthorityStars(item.authorityScore);
            const domain = getDomain(item.sourceUrl);

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.06, type: 'spring', stiffness: 400, damping: 30 }}
                className="relative"
              >
                {/* Timeline dot */}
                <div className="absolute -left-5 top-5 w-2.5 h-2.5 rounded-full bg-innogen-primary/30 border-2 border-innogen-bg ring-2 ring-innogen-bg" />

                <div className="bg-innogen-card rounded-xl border border-innogen-border p-5 hover:bg-innogen-card-hover transition-all duration-300 group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Publisher + Domain */}
                      <div className="flex items-center gap-2 mb-2">
                        <Globe size={12} className="text-innogen-primary/30 flex-shrink-0" />
                        <span className="text-[11px] text-innogen-primary/40 font-medium tracking-wide uppercase truncate">
                          {item.publisher || domain}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-medium text-innogen-primary/80 leading-snug mb-2 line-clamp-2 group-hover:text-innogen-primary transition-colors">
                        {item.sourceTitle}
                      </h3>

                      {/* Authority Badge */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-innogen-warning text-xs tracking-wider">
                          {authority.stars}
                        </span>
                        <span className="text-[10px] text-innogen-primary/25 font-medium">
                          {authority.label}
                        </span>
                      </div>

                      {/* Published Date */}
                      {item.publishedDate && (
                        <span className="text-[10px] text-innogen-primary/20 block mb-2">
                          Published {item.publishedDate}
                        </span>
                      )}

                      {/* Snippet */}
                      {item.snippet && (
                        <p className="text-xs text-innogen-primary/35 leading-relaxed line-clamp-2 mt-1">
                          {item.snippet}
                        </p>
                      )}
                    </div>

                    {/* Open Source button */}
                    <motion.a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/[0.04] border border-innogen-border flex items-center justify-center text-innogen-primary/30 hover:text-innogen-primary/60 hover:bg-white/[0.08] transition-all duration-300"
                    >
                      <ExternalLink size={14} />
                    </motion.a>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
