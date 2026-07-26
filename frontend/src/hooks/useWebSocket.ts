import { useEffect, useRef, useState, useCallback } from 'react';

export interface WsMessage {
  node: string;
  status: string;
  message?: string;
}

// Map backend node names → friendly ring segment labels
const NODE_LABEL_MAP: Record<string, string> = {
  'System': 'System',
  'Planner': 'Plan',
  'Task Decomposer': 'Search',
  'Parallel Research Agents': 'Search',
  'Parallel Research': 'Search',
  'Evidence Collection': 'Evidence',
  'Claim Extraction': 'Claims',
  'Citation Verification': 'Verify',
  'Fact Verification': 'Verify',
  'Contradiction Detection': 'Compare',
  'Hallucination Check': 'Consensus',
  'Consensus & Confidence': 'Consensus',
  'Report Generator': 'Summary',
};

// Friendly activity messages
const NODE_ACTIVITY_MAP: Record<string, string> = {
  'Planner': 'Research plan created',
  'Task Decomposer': 'Tasks decomposed',
  'Parallel Research Agents': 'Sources indexed',
  'Parallel Research': 'Sources indexed',
  'Evidence Collection': 'Evidence collected',
  'Claim Extraction': 'Claims extracted',
  'Citation Verification': 'Citations verified',
  'Fact Verification': 'Facts verified',
  'Contradiction Detection': 'Contradictions analysed',
  'Hallucination Check': 'Confidence updated',
  'Consensus & Confidence': 'Consensus reached',
  'Report Generator': 'Report generated',
};

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [completedSegments, setCompletedSegments] = useState<Set<string>>(new Set());
  const [activeSegment, setActiveSegment] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<{ id: number; text: string }[]>([]);
  const activityIdRef = useRef(0);

  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/agent`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data: WsMessage = JSON.parse(event.data);
          setMessages((prev) => [...prev, data]);

          if (data.node && data.node !== 'System') {
            const label = NODE_LABEL_MAP[data.node] || data.node;

            if (data.status === 'RUNNING') {
              setActiveSegment(label);
            }

            if (data.status === 'COMPLETED') {
              setCompletedSegments((prev) => new Set([...prev, label]));
              setActiveSegment(null);

              // Add to activity log
              const activityText = NODE_ACTIVITY_MAP[data.node] || `${label} completed`;
              activityIdRef.current += 1;
              setActivityLog((prev) => {
                const next = [...prev, { id: activityIdRef.current, text: activityText }];
                return next.slice(-10); // keep max 10
              });
            }
          }
        } catch {
          // silent
        }
      };

      ws.onclose = () => {
        setConnected(false);
        // Reconnect after 3s
        setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      setConnected(false);
    }
  }, []);

  const resetState = useCallback(() => {
    setMessages([]);
    setCompletedSegments(new Set());
    setActiveSegment(null);
    setActivityLog([]);
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    connected,
    messages,
    completedSegments,
    activeSegment,
    activityLog,
    resetState,
  };
}
