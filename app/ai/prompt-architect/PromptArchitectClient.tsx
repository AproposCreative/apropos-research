'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useStore,
  useReactFlow,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { composeSystemPrompt } from '@/lib/ai-chat/compose-prompt';
import type { PromptSegment } from '@/lib/ai-chat/prompt-segment-types';
import { PROMPT_ARCHITECT_CONTEXT_KEY } from '@/lib/prompt-architect-constants';
import { loadPromptModuleToggles, savePromptModuleToggles } from '@/lib/prompt-architect-storage';

type PreviewPayload = {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: {
      labelDa: string;
      included: boolean;
      locked?: boolean;
      kind: 'system' | 'web-append';
      charCount: number;
      excerpt: string;
    };
  }>;
  edges: Array<{ id: string; source: string; target: string }>;
  segments: Array<{
    id: string;
    labelDa: string;
    kind: 'system' | 'web-append';
    included: boolean;
    locked?: boolean;
    charCount: number;
  }>;
  segmentContents: Record<string, string>;
  webContent: string | null;
  hasResearchContext: boolean;
  totalCharCount: number;
  effectiveCharCount: number;
};

function PromptModuleNode({ data, id }: NodeProps) {
  const locked = Boolean(data.locked);
  const included = Boolean(data.included);
  const on = Boolean(data.moduleOn);
  const inactive = !included || (!locked && !on);
  const hovered = Boolean(data._hovered);
  const charN = typeof data.charCount === 'number' ? data.charCount : 0;

  return (
    <div
      className={`rounded-xl border w-[260px] overflow-hidden shadow-[0_8px_28px_rgba(0,0,0,0.35)] transition-[border-color,box-shadow,opacity] duration-150 ${
        inactive
          ? 'opacity-[0.72] border-white/[0.06] bg-[#0e0e0e]'
          : hovered
            ? 'opacity-100 border-white/28 bg-[#141414] shadow-[0_0_0_1px_rgba(255,255,255,0.06)]'
            : 'opacity-100 border-white/[0.10] bg-[#121212]'
      }`}
      onMouseEnter={() => {
        const fn = (data as { onHover?: (id: string | null) => void }).onHover;
        fn?.(id);
      }}
      onMouseLeave={() => {
        const fn = (data as { onHover?: (id: string | null) => void }).onHover;
        fn?.(null);
      }}
    >
      <Handle type="target" position={Position.Top} className="!border !border-white/20 !bg-[#1f1f1f] !w-2 !h-2" />
      {/* Ét samlet kort: titel + meta + toggle — fuld tekst kun i højre panel ved hover */}
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[9px] font-medium text-white/45">
            {String(data.kind) === 'web-append' ? 'W' : 'S'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-white/90 leading-snug">{String(data.labelDa)}</p>
            <p className="text-[10px] text-white/38 mt-1 leading-relaxed">
              {String(data.kind) === 'web-append' ? 'Web' : 'System'}
              {included ? ` · ${charN.toLocaleString('da-DK')} tegn` : ' · ikke aktiv for denne artikel'}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
          <span className="text-[10px] text-white/32">{locked ? 'Altid med i prompt' : 'Medtag modul'}</span>
          <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
            <span className="text-[10px] text-white/38">Til</span>
            <input
              type="checkbox"
              checked={on}
              disabled={locked || !included}
              onChange={(e) => {
                const fn = (data as { onToggle?: (nodeId: string, next: boolean) => void }).onToggle;
                fn?.(id, e.target.checked);
              }}
              className="rounded border-white/28 bg-black/60"
            />
          </label>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!border !border-white/20 !bg-[#1f1f1f] !w-2 !h-2" />
    </div>
  );
}

function ArchitectBottomToolbar() {
  const zoom = useStore((s) => Math.round(s.transform[2] * 100));
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <Panel position="bottom-center" className="m-4">
      <div className="flex items-center gap-1 rounded-xl border border-white/12 bg-[#141414]/95 backdrop-blur-md px-1.5 py-1 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
        <button
          type="button"
          title="Zoom ind"
          onClick={() => zoomIn()}
          className="flex size-8 items-center justify-center rounded-lg text-white/65 hover:bg-white/[0.08] hover:text-white transition-colors"
        >
          <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          title="Zoom ud"
          onClick={() => zoomOut()}
          className="flex size-8 items-center justify-center rounded-lg text-white/65 hover:bg-white/[0.08] hover:text-white transition-colors"
        >
          <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
          </svg>
        </button>
        <div className="w-px h-5 bg-white/10 mx-0.5" aria-hidden />
        <span className="tabular-nums text-[11px] text-white/55 px-2 min-w-[3.25rem] text-center">{zoom}%</span>
        <div className="w-px h-5 bg-white/10 mx-0.5" aria-hidden />
        <button
          type="button"
          title="Tilpas til skærm"
          onClick={() => fitView({ padding: 0.2 })}
          className="px-2.5 py-1.5 rounded-lg text-[11px] text-white/65 hover:bg-white/[0.08] hover:text-white transition-colors"
        >
          Tilpas
        </button>
      </div>
    </Panel>
  );
}

const nodeTypes = { promptModule: PromptModuleNode };

/** Kalder fitView når data er klar — vigtigt når noder først kommer fra API (ellers zoom på tomt layout). */
function FitViewWhenReady({ ready, nodeCount }: { ready: boolean; nodeCount: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!ready || nodeCount === 0) return;
    const id = requestAnimationFrame(() => {
      fitView({ padding: 0.4, duration: 280, maxZoom: 1.15 });
    });
    return () => cancelAnimationFrame(id);
  }, [ready, nodeCount, fitView]);
  return null;
}

export default function PromptArchitectClient() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [effectiveLen, setEffectiveLen] = useState(0);
  const [inspectId, setInspectId] = useState<string | null>(null);

  const togglesRef = useRef<Record<string, boolean>>({});

  const previewRef = useRef<{
    segments: PreviewPayload['segments'];
    segmentContents: Record<string, string>;
    webContent: string | null;
  } | null>(null);

  const recomputeLength = (
    segs: PreviewPayload['segments'],
    contents: Record<string, string>,
    webContent: string | null,
    t: Record<string, boolean>
  ) => {
    const full: PromptSegment[] = segs.map((s) => ({
      id: s.id,
      labelDa: s.labelDa,
      kind: s.kind,
      content: contents[s.id] || '',
      included: s.included,
      locked: s.locked,
    }));
    const webSeg: PromptSegment | null =
      webContent && webContent.length > 0
        ? { id: 'web-facts', labelDa: 'Web-søgning (fakta)', kind: 'web-append', content: webContent, included: true }
        : null;
    setEffectiveLen(composeSystemPrompt(full, t, webSeg).length);
  };

  const handleHover = useCallback(
    (hoveredId: string | null) => {
      setInspectId(hoveredId);
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: { ...n.data, _hovered: n.id === hoveredId },
        }))
      );
    },
    [setNodes]
  );
  const handleHoverRef = useRef(handleHover);
  handleHoverRef.current = handleHover;

  const handleToggle = useCallback(
    (nodeId: string, next: boolean) => {
      const merged = { ...togglesRef.current, [nodeId]: next };
      togglesRef.current = merged;
      savePromptModuleToggles(merged);
      const p = previewRef.current;
      if (p) recomputeLength(p.segments, p.segmentContents, p.webContent, merged);
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, moduleOn: next } } : n))
      );
    },
    [setNodes]
  );
  const handleToggleRef = useRef(handleToggle);
  handleToggleRef.current = handleToggle;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      let body: Record<string, unknown> = { articleData: {}, notes: '', authorTOV: '', authorName: '' };
      try {
        const raw = sessionStorage.getItem(PROMPT_ARCHITECT_CONTEXT_KEY);
        if (raw) {
          const ctx = JSON.parse(raw) as typeof body;
          if (ctx && typeof ctx === 'object') {
            body = {
              articleData: ctx.articleData ?? {},
              notes: typeof ctx.notes === 'string' ? ctx.notes : '',
              authorTOV: typeof ctx.authorTOV === 'string' ? ctx.authorTOV : '',
              authorName: typeof ctx.authorName === 'string' ? ctx.authorName : '',
            };
          }
        }
      } catch { /* ignore */ }

      const stored = loadPromptModuleToggles();
      if (!cancelled) togglesRef.current = stored;

      try {
        const res = await fetch('/api/ai-chat/prompt-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, promptModuleToggles: stored }),
        });
        const data = (await res.json()) as PreviewPayload & { error?: string };
        if (!res.ok) throw new Error(data.error || res.statusText);
        if (cancelled) return;

        previewRef.current = {
          segments: data.segments,
          segmentContents: data.segmentContents,
          webContent: data.webContent,
        };

        const mergedToggles = { ...stored };
        const flowNodes: Node[] = data.nodes.map((n) => {
          const locked = Boolean(n.data.locked);
          const included = Boolean(n.data.included);
          const defOn = included && mergedToggles[n.id] !== false;
          const moduleOn = locked ? true : defOn;
          if (locked) mergedToggles[n.id] = true;
          return {
            ...n,
            type: 'promptModule',
            data: {
              ...n.data,
              moduleOn,
              _hovered: false,
              onToggle: (id: string, v: boolean) => handleToggleRef.current(id, v),
              onHover: (id: string | null) => handleHoverRef.current(id),
            },
          };
        });
        togglesRef.current = mergedToggles;
        setNodes(flowNodes);
        setEdges(
          data.edges.map((e) => ({
            ...e,
            type: 'smoothstep',
            style: {
              stroke: 'rgba(255,255,255,0.22)',
              strokeWidth: 1.25,
            },
          }))
        );
        recomputeLength(data.segments, data.segmentContents, data.webContent, mergedToggles);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ukendt fejl');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [setEdges, setNodes]);

  const inspected = inspectId ? previewRef.current : null;
  const inspectSeg = inspected?.segments.find((s) => s.id === inspectId);
  const inspectContent = inspectId
    ? inspected?.segmentContents[inspectId] ?? null
    : null;

  const drawerOpen = inspectId !== null && inspectContent !== null;

  return (
    <div className="flex flex-col h-[100dvh] bg-[#080808] text-white font-poppins">
      {/* Top bar — AI Writer style */}
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/[0.06] bg-[#0c0c0c] shrink-0">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight">Prompt Architect</h1>
          <p className="text-[11px] text-white/40 mt-0.5">
            Ét modul pr. kort · hover åbner fuld tekst til højre · «Til» styrer næste besked til AI Chat
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs shrink-0">
          <span className="text-white/45 tabular-nums hidden sm:inline">
            Systemprompt: <span className="text-white/85 font-medium">{effectiveLen.toLocaleString('da-DK')}</span> tegn
          </span>
          <Link
            href="/ai"
            className="px-3 py-1.5 rounded-lg border border-white/15 text-white/75 hover:bg-white/5 transition-colors"
          >
            ← AI Writer
          </Link>
        </div>
      </header>

      {/* Main area: canvas + inspector drawer */}
      <div className="flex-1 min-h-0 flex relative">
        {/* Flow canvas */}
        <div className="flex-1 min-w-0 relative bg-[#080808]">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">
              <div className="flex flex-col items-center gap-3">
                <div className="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
                <span className="text-sm text-white/50">Indlæser flow…</span>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/85 text-red-400 text-sm px-4 text-center">
              {error}
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnScroll
            zoomOnScroll
            fitView
            fitViewOptions={{ padding: 0.4, maxZoom: 1.1 }}
            minZoom={0.25}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: 'smoothstep' }}
            connectionLineStyle={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1.25 }}
            className="bg-[#080808]"
          >
            <FitViewWhenReady ready={!loading && !error} nodeCount={nodes.length} />
            <Background
              id="dots"
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="rgba(255,255,255,0.055)"
            />
            <ArchitectBottomToolbar />
            <MiniMap
              className="hidden xl:block !bg-[#171717] !border-white/10 !rounded-lg !bottom-[4.75rem] !right-4 !w-28 !h-20 opacity-80"
              nodeColor={() => '#52525b'}
              maskColor="rgba(0,0,0,0.75)"
              pannable
              zoomable
            />
          </ReactFlow>
        </div>

        {/* Inspector side-panel — slides in on hover */}
        <div
          className={`absolute top-0 bottom-0 right-0 z-30 md:relative md:z-auto transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            drawerOpen
              ? 'w-[min(420px,85vw)] md:w-[380px] opacity-100 translate-x-0'
              : 'w-0 opacity-0 translate-x-4 pointer-events-none'
          }`}
        >
          <div className="h-full flex flex-col border-l border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
            {inspectSeg && inspectContent !== null && (
              <>
                <div className="px-4 py-3 border-b border-white/[0.06] shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] text-white/35 uppercase tracking-wider">Modul-indhold</p>
                      <h2 className="text-sm font-medium text-white/90 mt-0.5 truncate">{inspectSeg.labelDa}</h2>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {inspectSeg.locked && (
                        <span className="text-[9px] uppercase tracking-wider text-amber-400/70 bg-amber-400/10 px-1.5 py-0.5 rounded">Låst</span>
                      )}
                      <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        inspectSeg.included ? 'text-emerald-400/80 bg-emerald-400/10' : 'text-white/30 bg-white/5'
                      }`}>
                        {inspectSeg.included ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-white/35 mt-1 tabular-nums">
                    {inspectSeg.charCount.toLocaleString('da-DK')} tegn
                    {inspectSeg.kind === 'web-append' ? ' · web-append' : ' · system'}
                  </p>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4 no-scrollbar">
                  <pre className="text-[12px] leading-[1.55] text-white/75 whitespace-pre-wrap break-words font-[inherit]">
                    {inspectContent}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-5 py-2 border-t border-white/[0.06] text-[11px] text-white/35 shrink-0 bg-[#0a0a0a]">
        Toggles gemmes i denne browser og bruges ved næste besked til AI Chat.
      </footer>
    </div>
  );
}
