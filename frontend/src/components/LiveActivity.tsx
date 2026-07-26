import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

interface ActivityItem {
  id: number;
  text: string;
}

interface LiveActivityProps {
  items: ActivityItem[];
  isActive: boolean;
}

export default function LiveActivity({ items, isActive }: LiveActivityProps) {
  if (!isActive || items.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md mx-auto mt-8 space-y-2"
    >
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="glass rounded-xl px-4 py-2.5 flex items-center gap-3"
          >
            <CheckCircle2 size={14} className="text-innogen-success flex-shrink-0" />
            <span className="text-sm text-innogen-primary/70">{item.text}</span>
            <span className="ml-auto text-[10px] text-innogen-primary/20 tabular-nums">
              just now
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
