import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface ConfidenceGaugeProps {
  value: number; // 0–100
}

export default function ConfidenceGauge({ value }: ConfidenceGaugeProps) {
  const [animValue, setAnimValue] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => setAnimValue(value), 300);
    return () => clearTimeout(timeout);
  }, [value]);

  const SIZE = 220;
  const CENTER = SIZE / 2;
  const RADIUS = 85;
  const STROKE = 8;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  // 270 degree arc (3/4 circle, open at bottom)
  const ARC_LENGTH = CIRCUMFERENCE * 0.75;
  const offset = ARC_LENGTH - (ARC_LENGTH * animValue) / 100;

  // Needle angle: -135deg (start) to +135deg (end), mapping 0-100
  const needleAngle = -135 + (animValue / 100) * 270;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className="flex flex-col items-center"
    >
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="absolute inset-0">
          {/* Background arc */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
            transform={`rotate(135 ${CENTER} ${CENTER})`}
          />

          {/* Value arc */}
          <motion.circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="#F8F2D8"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
            initial={{ strokeDashoffset: ARC_LENGTH }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1], delay: 0.5 }}
            transform={`rotate(135 ${CENTER} ${CENTER})`}
            filter="url(#gauge-glow)"
            style={{ opacity: 0.8 }}
          />

          <defs>
            <filter id="gauge-glow">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Needle */}
          <motion.line
            x1={CENTER}
            y1={CENTER}
            x2={CENTER}
            y2={CENTER - RADIUS + 20}
            stroke="#F8F2D8"
            strokeWidth={2}
            strokeLinecap="round"
            initial={{ rotate: -135 }}
            animate={{ rotate: needleAngle }}
            transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1], delay: 0.5 }}
            style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
          />

          {/* Center dot */}
          <circle cx={CENTER} cy={CENTER} r={4} fill="#F8F2D8" opacity={0.6} />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-innogen-primary/30 tracking-widest uppercase mb-1">
            Confidence
          </span>
          <motion.span
            className="text-4xl font-semibold text-innogen-primary tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            {Math.round(animValue)}
            <span className="text-xl text-innogen-primary/40">%</span>
          </motion.span>
        </div>
      </div>
    </motion.div>
  );
}
