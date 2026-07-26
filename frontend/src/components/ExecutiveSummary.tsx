import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface ExecutiveSummaryProps {
  markdown?: string;
}

function simpleMarkdownToHtml(md: string): string {
  if (!md) return '';
  return md
    .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold text-innogen-primary mt-4 mb-2">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold text-innogen-primary mt-5 mb-2">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold text-innogen-primary mt-6 mb-3">$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong class="text-innogen-primary font-semibold">$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/`([^`]+)`/gim, '<code class="px-1.5 py-0.5 rounded bg-white/5 text-innogen-primary/80 text-sm font-mono">$1</code>')
    .replace(/^> (.*$)/gim, '<blockquote class="border-l-2 border-innogen-primary/20 pl-4 my-2 text-innogen-primary/50 italic">$1</blockquote>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener" class="text-innogen-accent hover:underline">$1</a>')
    .replace(/\n\n/g, '</p><p class="text-innogen-primary/65 leading-relaxed mb-3">')
    .replace(/\n/g, '<br />');
}

export default function ExecutiveSummary({ markdown }: ExecutiveSummaryProps) {
  if (!markdown) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
      className="w-full max-w-4xl mx-auto"
    >
      <div className="bg-innogen-card rounded-2xl border border-innogen-border p-8 hover:bg-innogen-card-hover transition-colors duration-300">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-innogen-primary/[0.06] flex items-center justify-center">
            <Sparkles size={18} className="text-innogen-primary/60" />
          </div>
          <h2 className="font-serif text-2xl text-innogen-primary">Executive Summary</h2>
        </div>

        {/* Content */}
        <div
          className="text-innogen-primary/65 leading-relaxed text-[15px] space-y-1"
          dangerouslySetInnerHTML={{ __html: `<p class="text-innogen-primary/65 leading-relaxed mb-3">${simpleMarkdownToHtml(markdown)}</p>` }}
        />
      </div>
    </motion.div>
  );
}
