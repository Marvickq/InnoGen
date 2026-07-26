import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, Sparkles, ArrowRight } from 'lucide-react';

interface HeroProps {
  onSearch: (query: string) => void;
  isResearching: boolean;
}

export default function Hero({ onSearch, isResearching }: HeroProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const q = query.trim();
    if (q && !isResearching) {
      onSearch(q);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const loadExample = () => {
    const example = 'Is India on track for 500GW renewable energy by 2030?';
    setQuery(example);
    inputRef.current?.focus();
  };

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      className="relative flex flex-col items-center justify-center pt-28 pb-12 px-6"
    >
      {/* Background glow */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-innogen-glow/[0.03] rounded-full blur-[120px] pointer-events-none" />

      {/* Title */}
      <motion.h1
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="font-serif text-5xl sm:text-6xl md:text-7xl text-innogen-primary glow-text text-center"
      >
        AI Research OS
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ y: 15, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.5 }}
        className="mt-4 text-center text-innogen-primary/50 text-base sm:text-lg max-w-md leading-relaxed"
      >
        Evidence-backed intelligence.
        <br />
        Never hallucinations.
      </motion.p>

      {/* Search Bar */}
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.7, ease: [0.23, 1, 0.32, 1] }}
        className={`mt-10 w-full max-w-2xl relative transition-all duration-500 ${
          isFocused ? 'glow-box-focus' : 'glow-box'
        } rounded-2xl`}
      >
        <div className="glass rounded-2xl flex items-center gap-3 px-5 py-4 transition-all duration-300">
          <Search
            size={20}
            className={`transition-colors duration-300 flex-shrink-0 ${
              isFocused ? 'text-innogen-primary' : 'text-innogen-primary/30'
            }`}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            disabled={isResearching}
            className="flex-1 bg-transparent outline-none text-innogen-primary text-base placeholder:text-innogen-primary/25 disabled:opacity-50"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSubmit}
            disabled={isResearching || !query.trim()}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-innogen-primary/10 border border-innogen-primary/20 flex items-center justify-center text-innogen-primary/70 hover:bg-innogen-primary/20 hover:text-innogen-primary transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isResearching ? (
              <Sparkles size={16} className="animate-spin" />
            ) : (
              <ArrowRight size={16} />
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* Example */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.5 }}
        onClick={loadExample}
        className="mt-4 text-xs text-innogen-primary/25 hover:text-innogen-primary/50 transition-colors duration-300 cursor-pointer"
      >
        Try: <span className="italic">Is India on track for 500GW renewable energy by 2030?</span>
      </motion.button>
    </motion.section>
  );
}
