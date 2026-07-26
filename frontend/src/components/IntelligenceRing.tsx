import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SEGMENTS = [
  'Plan', 'Search', 'Evidence', 'Claims',
  'Verify', 'Compare', 'Consensus', 'Summary',
];

const TASK_LABELS = [
  'Finding Sources',
  'Comparing Evidence',
  'Verifying Claims',
  'Analysing Contradictions',
  'Generating Report',
];

interface IntelligenceRingProps {
  isActive: boolean;
  completedSegments: Set<string>;
  activeSegment: string | null;
  progress: number; // 0–100
}

export default function IntelligenceRing({
  isActive,
  completedSegments,
  activeSegment,
  progress,
}: IntelligenceRingProps) {
  const [taskIndex, setTaskIndex] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const animFrameRef = useRef<number>(0);

  // Smoothly animate percentage
  useEffect(() => {
    const target = progress;
    const animate = () => {
      setDisplayProgress((prev) => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.5) return target;
        return prev + diff * 0.08;
      });
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [progress]);

  // Cycle task labels
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setTaskIndex((prev) => (prev + 1) % TASK_LABELS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive) return null;

  const SIZE = 420;
  const CENTER = SIZE / 2;
  const RADIUS = 175;
  const STROKE_WIDTH = 4;
  const SEGMENT_COUNT = SEGMENTS.length;
  const GAP_DEG = 5;
  const SEGMENT_DEG = (360 - GAP_DEG * SEGMENT_COUNT) / SEGMENT_COUNT;
  const LABEL_RADIUS = RADIUS + 40;

  function describeArc(startAngle: number, endAngle: number, r: number) {
    const start = polarToCartesian(CENTER, CENTER, r, endAngle);
    const end = polarToCartesian(CENTER, CENTER, r, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
  }

  function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
      className="relative flex items-center justify-center mx-auto"
      style={{ width: SIZE, height: SIZE }}
    >
      {/* Outer bloom glow */}
      <div className="absolute inset-0 rounded-full bg-innogen-glow/[0.03] blur-[60px] animate-glow pointer-events-none" />

      {/* SVG Ring */}
      <svg width={SIZE} height={SIZE} className="absolute inset-0">
        <defs>
          <filter id="glow-filter">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-strong">
            <feGaussianBlur stdDeviation="6" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {SEGMENTS.map((label, i) => {
          const startAngle = i * (SEGMENT_DEG + GAP_DEG);
          const endAngle = startAngle + SEGMENT_DEG;
          const isCompleted = completedSegments.has(label);
          const isRunning = activeSegment === label;

          let strokeColor = 'rgba(248,242,216,0.08)';
          let filterAttr = undefined;
          let strokeW = STROKE_WIDTH;

          if (isCompleted) {
            strokeColor = '#F8F2D8';
            filterAttr = 'url(#glow-filter)';
            strokeW = 4.5;
          } else if (isRunning) {
            strokeColor = 'rgba(248,242,216,0.5)';
            filterAttr = 'url(#glow-strong)';
            strokeW = 5;
          }

          return (
            <g key={label}>
              <path
                d={describeArc(startAngle, endAngle, RADIUS)}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeW}
                strokeLinecap="round"
                filter={filterAttr}
                className={isRunning ? 'animate-pulse-slow' : ''}
              />
            </g>
          );
        })}
      </svg>

      {/* Segment Labels */}
      {SEGMENTS.map((label, i) => {
        const midAngle = i * (SEGMENT_DEG + GAP_DEG) + SEGMENT_DEG / 2;
        const pos = polarToCartesian(CENTER, CENTER, LABEL_RADIUS, midAngle);
        const isCompleted = completedSegments.has(label);
        const isRunning = activeSegment === label;

        function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
          const rad = ((angleDeg - 90) * Math.PI) / 180;
          return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
        }

        return (
          <motion.span
            key={label}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 + i * 0.08 }}
            className={`absolute text-[11px] font-medium tracking-wide select-none transition-all duration-500 ${
              isCompleted
                ? 'text-innogen-primary glow-text'
                : isRunning
                  ? 'text-innogen-primary/70'
                  : 'text-innogen-primary/20'
            }`}
            style={{
              left: pos.x,
              top: pos.y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {label}
          </motion.span>
        );
      })}

      {/* Center Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
        {/* Percentage */}
        <motion.span
          key="progress"
          className="text-5xl font-semibold text-innogen-primary tabular-nums glow-text"
        >
          {Math.round(displayProgress)}
          <span className="text-2xl text-innogen-primary/50">%</span>
        </motion.span>

        {/* Animated task label */}
        <div className="h-6 mt-2 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.span
              key={taskIndex}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="block text-sm text-innogen-primary/40"
            >
              {TASK_LABELS[taskIndex]}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
