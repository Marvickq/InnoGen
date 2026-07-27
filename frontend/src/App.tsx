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
import Workspace from './components/Workspace';
import ProgressSummary from './components/ProgressSummary';
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
                  {/* Report Actions — only show at 100% completion */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                    className="w-full max-w-4xl mx-auto flex items-center gap-3"
                  >
                    <button
                      onClick={() => {
                        const text = research.currentJob?.report?.summaryMarkdown || '';
                        const blob = new Blob([text], { type: 'text/markdown' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `InnoGen-Report-${research.currentJob?.id || 'research'}.md`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="px-5 py-2.5 rounded-xl bg-white/[0.06] border border-innogen-border text-sm font-medium text-innogen-primary/80 hover:text-innogen-primary hover:bg-white/[0.1] transition-all duration-300 flex items-center gap-2"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Download Report
                    </button>
                    <button
                      onClick={() => {
                        const job = research.currentJob;
                        if (!job) return;
                        const parts: string[] = [];
                        if (job.report?.summaryMarkdown) parts.push(job.report.summaryMarkdown);
                        if (job.claims?.length) {
                          parts.push('\n## Verified Claims\n');
                          job.claims.forEach(c => parts.push(`- ${c.claimText} [${c.status || 'UNKNOWN'}] (Confidence: ${c.confidenceScore != null ? c.confidenceScore.toFixed(0) : 'N/A'}%)`));
                        }
                        if (job.citations?.length) {
                          parts.push('\n## Citations\n');
                          job.citations.forEach(c => parts.push(`- "${c.quotedEvidence || ''}" — ${c.supportStatus || 'UNKNOWN'} (${c.supportConfidence != null ? c.supportConfidence.toFixed(0) : 'N/A'}%)${c.reasoning ? `\n  Reasoning: ${c.reasoning}` : ''}`));
                        }
                        if (job.overallConfidence != null) parts.push(`\n## Overall Confidence\n${Number(job.overallConfidence).toFixed(0)}%`);
                        if (job.hallucinationScore != null) parts.push(`\n## Hallucination Score\n${Number(job.hallucinationScore).toFixed(0)}%`);
                        if (job.contradictions?.length) {
                          parts.push('\n## Contradictions\n');
                          job.contradictions.forEach(c => parts.push(`- ${c.textA || ''} vs ${c.textB || ''} [${c.differenceType || ''}]`));
                        }
                        navigator.clipboard.writeText(parts.join('\n\n')).catch(() => {});
                      }}
                      className="px-5 py-2.5 rounded-xl bg-white/[0.06] border border-innogen-border text-sm font-medium text-innogen-primary/80 hover:text-innogen-primary hover:bg-white/[0.1] transition-all duration-300 flex items-center gap-2"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      Copy Report
                    </button>
                  </motion.div>

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

                  {/* Progress Summary */}
                  <ProgressSummary
                    job={research.currentJob}
                    totalCompletedJobs={research.jobs.filter(j => j.status === 'COMPLETED').length}
                  />
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

          {activeView === 'workspace' && (
            <motion.div
              key="workspace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="pt-28 pb-12 px-6"
            >
              <Workspace
                jobs={research.jobs}
                onViewJob={handleLoadJob}
              />
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
