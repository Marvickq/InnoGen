import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, Star, Clock, GitCompare, Download, Upload, FileText, Plus, MoreHorizontal, Trash2 } from 'lucide-react';
import type { ResearchJob } from '../hooks/useResearch';

const RECENT_KEY = 'innogen_recent';
const STARRED_KEY = 'innogen_starred';
const COLLECTIONS_KEY = 'innogen_collections';

interface WorkspaceProps {
  jobs: ResearchJob[];
  onViewJob: (jobId: string) => void;
}

function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} at ${time}`;
}

function useLocalStorage<T>(key: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [val, setVal] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  });
  const set = useCallback((v: T | ((prev: T) => T)) => {
    setVal(prev => {
      const next = typeof v === 'function' ? (v as (prev: T) => T)(prev) : v;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);
  return [val, set];
}

function buildFullReportText(job: ResearchJob): string {
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
  return parts.join('\n\n');
}

export default function Workspace({ jobs, onViewJob }: WorkspaceProps) {
  const [recent, setRecent] = useLocalStorage<string[]>(RECENT_KEY, []);
  const [starred, setStarred] = useLocalStorage<string[]>(STARRED_KEY, []);
  const [collections, setCollections] = useLocalStorage<Record<string, string[]>>(COLLECTIONS_KEY, {});
  const [newCollName, setNewCollName] = useState('');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');

  const completed = jobs.filter(j => j.status === 'COMPLETED');

  const trackView = useCallback((jobId: string) => {
    setRecent(prev => {
      const next = [jobId, ...prev.filter(id => id !== jobId)];
      return next.slice(0, 10);
    });
    onViewJob(jobId);
  }, [onViewJob, setRecent]);

  const toggleStar = useCallback((jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarred(prev => prev.includes(jobId) ? prev.filter(id => id !== jobId) : [...prev, jobId]);
  }, [setStarred]);

  const addCollection = useCallback(() => {
    const name = newCollName.trim();
    if (!name || collections[name]) return;
    setCollections({ ...collections, [name]: [] });
    setNewCollName('');
  }, [newCollName, collections, setCollections]);

  const removeCollection = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = { ...collections };
    delete next[name];
    setCollections(next);
  }, [collections, setCollections]);

  const addToCollection = useCallback((collName: string, jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const list = collections[collName] || [];
    if (list.includes(jobId)) return;
    setCollections({ ...collections, [collName]: [...list, jobId] });
  }, [collections, setCollections]);

  const removeFromCollection = useCallback((collName: string, jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollections({ ...collections, [collName]: (collections[collName] || []).filter(id => id !== jobId) });
  }, [collections, setCollections]);

  const starredJobs = completed.filter(j => starred.includes(j.id));
  const recentJobs = completed.filter(j => recent.includes(j.id)).sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id));
  const jobMap = Object.fromEntries(completed.map(j => [j.id, j]));

  const handleExport = useCallback((jobId: string) => {
    const job = jobMap[jobId];
    if (!job) return;
    const text = buildFullReportText(job);
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `InnoGen-Report-${jobId.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [jobMap]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.txt';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = ev.target?.result as string;
          navigator.clipboard.writeText(text).then(() => {
            const toast = document.createElement('div');
            toast.className = 'text-xs text-innogen-success';
            toast.textContent = 'Imported report content copied to clipboard.';
            document.getElementById('toast-container')?.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
          }).catch(() => {});
        } catch {}
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const sectionHeader = (icon: React.ReactNode, title: string) => (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-innogen-primary/30">{icon}</span>
      <h3 className="text-sm font-medium text-innogen-primary/50 uppercase tracking-wider">{title}</h3>
    </div>
  );

  const jobCard = (job: ResearchJob, actions?: React.ReactNode) => (
    <motion.button
      key={job.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => trackView(job.id)}
      className="w-full bg-innogen-card rounded-xl border border-innogen-border p-4 text-left hover:bg-innogen-card-hover transition-colors duration-300 group"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-innogen-primary/70 line-clamp-1 group-hover:text-innogen-primary transition-colors flex-1">
          {job.query}
        </p>
        <button
          onClick={(e) => toggleStar(job.id, e)}
          className="flex-shrink-0 p-0.5"
        >
          <Star size={13} className={starred.includes(job.id) ? 'text-amber-400 fill-amber-400' : 'text-innogen-primary/15 group-hover:text-innogen-primary/30'} />
        </button>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-innogen-primary/25 mt-2">
        <span>{formatLocalTime(job.createdAt)}</span>
        <span className="text-innogen-primary/15">·</span>
        <span>{job._count?.evidenceItems || 0} sources</span>
        <span className="text-innogen-primary/15">·</span>
        <span className="tabular-nums">{Number(job.overallConfidence || 0).toFixed(0)}%</span>
      </div>
    </motion.button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="w-full max-w-4xl mx-auto space-y-10"
    >
      <div>
        <h2 className="font-serif text-2xl text-innogen-primary mb-1">Workspace</h2>
        <p className="text-xs text-innogen-primary/30">Your research hub</p>
      </div>

      {/* Starred Reports */}
      <div>
        {sectionHeader(<Star size={14} />, 'Starred Reports')}
        {starredJobs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {starredJobs.map(job => jobCard(job))}
          </div>
        ) : (
          <div className="bg-innogen-card rounded-xl border border-innogen-border p-6 text-center">
            <Star size={18} className="text-innogen-primary/10 mx-auto mb-2" />
            <p className="text-xs text-innogen-primary/20">Star reports by clicking the star icon on any report card.</p>
          </div>
        )}
      </div>

      {/* Saved Reports */}
      <div>
        {sectionHeader(<FolderOpen size={14} />, 'Saved Reports')}
        {completed.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {completed.map(job => jobCard(job))}
          </div>
        ) : (
          <div className="bg-innogen-card rounded-xl border border-innogen-border p-6 text-center">
            <FileText size={18} className="text-innogen-primary/10 mx-auto mb-2" />
            <p className="text-xs text-innogen-primary/20">No saved reports yet.</p>
          </div>
        )}
      </div>

      {/* Recently Viewed */}
      <div>
        {sectionHeader(<Clock size={14} />, 'Recently Viewed')}
        {recentJobs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recentJobs.slice(0, 4).map(job => jobCard(job))}
          </div>
        ) : (
          <div className="bg-innogen-card rounded-xl border border-innogen-border p-6 text-center">
            <Clock size={18} className="text-innogen-primary/10 mx-auto mb-2" />
            <p className="text-xs text-innogen-primary/20">Reports you view will appear here for quick access.</p>
          </div>
        )}
      </div>

      {/* Research Collections */}
      <div>
        {sectionHeader(<FolderOpen size={14} />, 'Research Collections / Folders')}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              value={newCollName}
              onChange={e => setNewCollName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCollection()}
              placeholder="New collection name..."
              className="flex-1 bg-innogen-card rounded-lg border border-innogen-border px-3 py-1.5 text-xs text-innogen-primary/70 placeholder:text-innogen-primary/20 outline-none focus:border-innogen-primary/30 transition-colors"
            />
            <button
              onClick={addCollection}
              className="p-1.5 rounded-lg bg-white/[0.04] border border-innogen-border text-innogen-primary/40 hover:text-innogen-primary hover:bg-white/[0.08] transition-all"
            >
              <Plus size={14} />
            </button>
          </div>
          {Object.keys(collections).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(collections).map(([name, ids]) => (
                <div key={name} className="bg-innogen-card rounded-xl border border-innogen-border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-innogen-primary/70">{name}</span>
                    <button onClick={(e) => removeCollection(name, e)} className="text-innogen-primary/20 hover:text-innogen-danger/60 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {ids.length > 0 ? (
                    <div className="space-y-1.5">
                      {ids.map(id => {
                        const j = jobMap[id];
                        if (!j) return null;
                        return (
                          <div key={id} className="flex items-center justify-between group/col">
                            <button onClick={() => trackView(id)} className="text-xs text-innogen-primary/40 hover:text-innogen-primary/70 transition-colors text-left truncate flex-1">
                              {j.query}
                            </button>
                            <button onClick={(e) => removeFromCollection(name, id, e)} className="text-innogen-primary/10 hover:text-innogen-danger/60 transition-colors ml-2 flex-shrink-0">
                              <Trash2 size={10} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-innogen-primary/15">Empty collection. Click the folder icon on a report to add it.</p>
                  )}
                  {completed.length > 0 && (
                    <div className="mt-2 flex items-center gap-1">
                      {completed.filter(j => !ids.includes(j.id)).slice(0, 3).map(j => (
                        <button
                          key={j.id}
                          onClick={(e) => addToCollection(name, j.id, e)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.03] border border-innogen-border text-innogen-primary/20 hover:text-innogen-primary/50 hover:bg-white/[0.06] transition-colors truncate max-w-[120px]"
                          title={`Add "${j.query}" to ${name}`}
                        >
                          +{j.query.substring(0, 20)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-innogen-primary/15">Create collections to organize your reports.</p>
          )}
        </div>
      </div>

      {/* Compare Two Reports */}
      <div>
        {sectionHeader(<GitCompare size={14} />, 'Compare Two Reports')}
        <div className="bg-innogen-card rounded-xl border border-innogen-border p-4">
          {completed.length >= 2 ? (
            <div className="flex items-center gap-3">
              <select
                value={compareA}
                onChange={e => setCompareA(e.target.value)}
                className="flex-1 bg-innogen-bg rounded-lg border border-innogen-border px-3 py-1.5 text-xs text-innogen-primary/70 outline-none focus:border-innogen-primary/30 transition-colors"
              >
                <option value="">Select first report</option>
                {completed.map(j => <option key={j.id} value={j.id}>{j.query.substring(0, 50)}</option>)}
              </select>
              <span className="text-xs text-innogen-primary/20">vs</span>
              <select
                value={compareB}
                onChange={e => setCompareB(e.target.value)}
                className="flex-1 bg-innogen-bg rounded-lg border border-innogen-border px-3 py-1.5 text-xs text-innogen-primary/70 outline-none focus:border-innogen-primary/30 transition-colors"
              >
                <option value="">Select second report</option>
                {completed.map(j => <option key={j.id} value={j.id}>{j.query.substring(0, 50)}</option>)}
              </select>
              <button
                disabled={!compareA || !compareB || compareA === compareB}
                onClick={() => { trackView(compareA); setTimeout(() => trackView(compareB), 100); }}
                className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-innogen-border text-xs font-medium text-innogen-primary/60 hover:text-innogen-primary hover:bg-white/[0.1] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Compare
              </button>
            </div>
          ) : (
            <p className="text-xs text-innogen-primary/20">Complete at least two research reports to use compare.</p>
          )}
        </div>
      </div>

      {/* Import / Export */}
      <div>
        {sectionHeader(<Upload size={14} />, 'Import / Export Reports')}
        <div className="bg-innogen-card rounded-xl border border-innogen-border p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-innogen-border text-xs text-innogen-primary/60 hover:text-innogen-primary hover:bg-white/[0.08] transition-all duration-300"
            >
              <Upload size={12} />
              Import Report (.md)
            </button>
            {completed.length > 0 && (
              <button
                onClick={() => handleExport(completed[0].id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-innogen-border text-xs text-innogen-primary/60 hover:text-innogen-primary hover:bg-white/[0.08] transition-all duration-300"
              >
                <Download size={12} />
                Export Latest Report
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
