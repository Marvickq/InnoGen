import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, History, LayoutDashboard, Settings, Wifi, WifiOff, User } from 'lucide-react';

interface NavbarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  connected: boolean;
}

const navItems = [
  { id: 'research', label: 'Research', icon: Search },
  { id: 'workspace', label: 'Workspace', icon: LayoutDashboard },
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Navbar({ activeView, onViewChange, connected }: NavbarProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-[900px]"
    >
      <div className="glass-strong rounded-full px-3 py-2 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2 pl-3">
          <div className="w-2 h-2 rounded-full bg-innogen-glow animate-pulse-slow" />
          <span className="font-serif text-lg text-innogen-primary tracking-wide">
            InnoGen
          </span>
        </div>

        {/* Navigation Links */}
        <div className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`relative px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
                  isActive
                    ? 'text-innogen-primary'
                    : 'text-innogen-primary/40 hover:text-innogen-primary/70'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="navbar-indicator"
                    className="absolute inset-0 rounded-full bg-white/[0.06]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon size={15} className="relative z-10" />
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-4 pr-3">
          <span className="hidden sm:block text-xs text-innogen-primary/40 font-mono tabular-nums">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>

          <div className="flex items-center gap-1.5">
            {connected ? (
              <Wifi size={13} className="text-innogen-success" />
            ) : (
              <WifiOff size={13} className="text-innogen-danger" />
            )}
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-innogen-success' : 'bg-innogen-danger'} ${connected ? 'animate-pulse-slow' : ''}`} />
          </div>

          <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-innogen-border flex items-center justify-center">
            <User size={14} className="text-innogen-primary/50" />
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
