import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import IntelligenceRing from './components/IntelligenceRing';
import LiveActivity from './components/LiveActivity';
import ExecutiveSummary from './components/ExecutiveSummary';
import KeyClaims from './components/KeyClaims';
import Contradictions from './components/Contradictions';
import ConfidenceGauge from './components/ConfidenceGauge';
import HallucinationBar from './components/HallucinationBar';
import EvidenceExplorer from './components/EvidenceExplorer';
import ResearchHistory from './components/ResearchHistory';
import { useWebSocket } from './hooks/useWebSocket';
import { useResearch } from './hooks/useResearch';

const SEGMENT_LABELS = ['Plan', 'Search', 'Evidence', 'Claims', 'Verify', 'Compare', 'Consensus', 'Summary'];

export default function App() {
  const [activeView, setActiveView] = useState('research');
  const ws = useWebSocket();
  const research = useResearch();

  // Fetch history on mount
  useEffect(() => {
    research.fetchJobs();
  }, []);

  // Calculate progress from completed segments
  const progress = (ws.completedSegments.size / SEGMENT_LABELS.length) * 100;

  const handleSearch = useCallback(async (query: string) => {
    ws.resetState();
    await research.startResearch(query);
  }, [ws, research]);

  const handleLoadJob = useCallback(async (jobId: string) => {
    await research.loadJob(jobId);
    setActiveView('research');
  }, [research]);

  // Determine what to show
  const hasReport = research.currentJob?.report?.summaryMarkdown;
  const showRing = research.isResearching;
  const showOutput = !!hasReport && !research.isResearching;

  return (
    <div className="min-h-screen bg-innogen-bg">
      {/* Navbar */}
      <Navbar
        activeView={activeView}
        onViewChange={setActiveView}
        connected={ws.connected}
      />

      {/* Content */}
      <main className="relative">
        <AnimatePresence mode="wait">
          {activeView === 'research' && (
            <motion.div
              key="research"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Hero + Search */}
              <Hero onSearch={handleSearch} isResearching={research.isResearching} />

              {/* Intelligence Ring (while researching) */}
              {showRing && (
                <motion.section
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-8 px-6"
                >
                  <IntelligenceRing
                    isActive={true}
                    completedSegments={ws.completedSegments}
                    activeSegment={ws.activeSegment}
                    progress={progress}
                  />
                  <LiveActivity items={ws.activityLog} isActive={true} />
                </motion.section>
              )}

              {/* Output Section (after research completes) */}
              {showOutput && research.currentJob && (
                <motion.section
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="py-8 px-6 space-y-10"
                >
                  {/* Executive Summary */}
                  <ExecutiveSummary markdown={research.currentJob.report?.summaryMarkdown} />

                  {/* Key Claims */}
                  {research.currentJob.claims && (
                    <KeyClaims
                      claims={research.currentJob.claims}
                      citations={research.currentJob.citations}
                    />
                  )}

                  {/* Confidence + Hallucination Row */}
                  <div className="w-full max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-innogen-card rounded-2xl border border-innogen-border p-6 flex items-center justify-center">
                      <ConfidenceGauge
                        value={Number(research.currentJob.overallConfidence) || 0}
                      />
                    </div>
                    <HallucinationBar
                      value={Number(research.currentJob.hallucinationScore) || 0}
                    />
                  </div>

                  {/* Contradictions */}
                  <Contradictions contradictions={research.currentJob.contradictions} />

                  {/* Evidence Explorer */}
                  {research.currentJob.evidenceItems && (
                    <EvidenceExplorer evidence={research.currentJob.evidenceItems} />
                  )}
                </motion.section>
              )}

              {/* Empty state when no research is running and no report */}
              {!showRing && !showOutput && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2 }}
                  className="flex flex-col items-center py-16 px-6"
                >
                  <div className="w-16 h-16 rounded-full border border-innogen-border flex items-center justify-center mb-4">
                    <div className="w-6 h-6 rounded-full bg-innogen-primary/[0.06] animate-pulse-slow" />
                  </div>
                  <p className="text-sm text-innogen-primary/20 text-center max-w-sm">
                    Enter a research question above to start an autonomous investigation.
                  </p>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeView === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="pt-28 pb-12 px-6"
            >
              <ResearchHistory jobs={research.jobs} onLoadJob={handleLoadJob} />
            </motion.div>
          )}

          {activeView === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="pt-28 pb-12 px-6"
            >
              <div className="w-full max-w-4xl mx-auto">
                <h2 className="font-serif text-2xl text-innogen-primary mb-6">Analytics</h2>
                <div className="bg-innogen-card rounded-2xl border border-innogen-border p-12 text-center">
                  <p className="text-sm text-innogen-primary/30">Analytics dashboard coming soon.</p>
                </div>
              </div>
            </motion.div>
          )}

          {activeView === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="pt-28 pb-12 px-6"
            >
              <div className="w-full max-w-4xl mx-auto">
                <h2 className="font-serif text-2xl text-innogen-primary mb-6">Settings</h2>
                <div className="space-y-3">
                  {[
                    { name: 'Research Pipeline', desc: 'Autonomous Multi-Agent System', online: true },
                    { name: 'Primary LLM', desc: 'Groq (llama-3.1-8b-instant)', online: true },
                    { name: 'Fallback LLM', desc: 'Gemini', online: true },
                    { name: 'Primary Search', desc: 'Serper', online: true },
                    { name: 'Fallback Search', desc: 'Tavily', online: true },
                  ].map((item) => (
                    <div
                      key={item.name}
                      className="bg-innogen-card rounded-xl border border-innogen-border p-4 flex items-center justify-between hover:bg-innogen-card-hover transition-colors duration-300"
                    >
                      <div>
                        <p className="text-sm font-medium text-innogen-primary/70">{item.name}</p>
                        <p className="text-xs text-innogen-primary/25 mt-0.5">{item.desc}</p>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${item.online ? 'bg-innogen-success animate-pulse-slow' : 'bg-innogen-danger'}`} />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Toast container */}
      <div id="toast-container" className="fixed bottom-6 right-6 z-50 space-y-2" />
    </div>
  );
}
