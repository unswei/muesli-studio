import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toBlob, toSvg } from 'html-to-image';
import JSZip from 'jszip';

import { buildTickSidecarIndex, summariseRun, type RunEventRecord } from '@muesli/replay';

import { BlackboardDiff } from './components/BlackboardDiff';
import { decodeWebSocketData, parseLivePayload } from './live';
import { DslEditor } from './components/DslEditor';
import { HeroCapture } from './components/HeroCapture';
import { NodeInspector } from './components/NodeInspector';
import { PresentationPanel } from './components/PresentationPanel';
import { PresentationToolbar } from './components/PresentationToolbar';
import { RunSummaryPanel } from './components/RunSummaryPanel';
import { TreeView } from './components/TreeView';
import { parseDemoFixtureQuery } from './demo-fixture';
import {
  buildPublicationManifest,
  buildPublicationReadme,
  captureFileName,
  publicationBundleName,
  type PresentationLayout,
  serialiseReplayEvents,
} from './publication';
import { saveBlobToDisk } from './save-file';
import { useStudioStore } from './store';

type CaptureFormat = 'png' | 'svg';

const bundleScreenshotLayouts: readonly PresentationLayout[] = ['hero', 'summary', 'diff'];

function captureTargetId(layout: PresentationLayout): string {
  if (layout === 'hero') {
    return 'readme-hero';
  }

  if (layout === 'summary') {
    return 'run-summary-panel';
  }

  if (layout === 'node') {
    return 'node-inspector-panel';
  }

  if (layout === 'diff') {
    return 'blackboard-diff';
  }

  return 'dsl-editor-panel';
}

async function waitForCaptureReady(): Promise<void> {
  if (typeof document !== 'undefined') {
    const fontSet = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    if (fontSet?.ready) {
      await fontSet.ready;
    }
  }

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error('failed to serialise SVG export');
  }

  return response.blob();
}

function captureDownloadName(layout: PresentationLayout, selectedTick: number, format: CaptureFormat): string {
  const baseName = captureFileName(layout, selectedTick).replace(/^screenshots\//, '');
  return format === 'png' ? baseName : baseName.replace(/\.png$/u, '.svg');
}

export function App() {
  const replay = useStudioStore((state) => state.replay);
  const eventCount = useStudioStore((state) => state.eventCount);
  const selectedTick = useStudioStore((state) => state.selectedTick);
  const selectedNodeId = useStudioStore((state) => state.selectedNodeId);
  const parseErrors = useStudioStore((state) => state.parseErrors);
  const replayLoadProgress = useStudioStore((state) => state.replayLoadProgress);
  const replayIndexed = useStudioStore((state) => state.replayIndexed);
  const replayLoadWarning = useStudioStore((state) => state.replayLoadWarning);
  const replaySourceBytes = useStudioStore((state) => state.replaySourceBytes);
  const replayMaxTick = useStudioStore((state) => state.replayMaxTick);
  const treeRevision = useStudioStore((state) => state.treeRevision);
  const mode = useStudioStore((state) => state.mode);
  const liveUrl = useStudioStore((state) => state.liveUrl);
  const liveStatus = useStudioStore((state) => state.liveStatus);
  const liveAutoFollow = useStudioStore((state) => state.liveAutoFollow);
  const liveReconnectEnabled = useStudioStore((state) => state.liveReconnectEnabled);
  const liveLastError = useStudioStore((state) => state.liveLastError);
  const liveLastEventUnixMs = useStudioStore((state) => state.liveLastEventUnixMs);
  const liveHistory = useStudioStore((state) => state.liveHistory);
  const loadJsonlFromFiles = useStudioStore((state) => state.loadJsonlFromFiles);
  const loadJsonlFromUrl = useStudioStore((state) => state.loadJsonlFromUrl);
  const appendLiveEvents = useStudioStore((state) => state.appendLiveEvents);
  const setSelectedTick = useStudioStore((state) => state.setSelectedTick);
  const setSelectedNodeId = useStudioStore((state) => state.setSelectedNodeId);
  const setLiveUrl = useStudioStore((state) => state.setLiveUrl);
  const setLiveStatus = useStudioStore((state) => state.setLiveStatus);
  const setLiveAutoFollow = useStudioStore((state) => state.setLiveAutoFollow);
  const setLiveReconnectEnabled = useStudioStore((state) => state.setLiveReconnectEnabled);
  const applyCompiledTree = useStudioStore((state) => state.applyCompiledTree);
  const resetCompiledTree = useStudioStore((state) => state.resetCompiledTree);
  const addLiveHistory = useStudioStore((state) => state.addLiveHistory);
  const clearLiveHistory = useStudioStore((state) => state.clearLiveHistory);
  const addParseError = useStudioStore((state) => state.addParseError);
  const [sidecarFile, setSidecarFile] = useState<File | null>(null);
  const [presentationLayout, setPresentationLayout] = useState<PresentationLayout | null>(null);
  const [presentationBusy, setPresentationBusy] = useState(false);
  const [presentationStatusMessage, setPresentationStatusMessage] = useState<string | null>(null);
  const [presentationErrorMessage, setPresentationErrorMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectEnabledRef = useRef(liveReconnectEnabled);
  const manualDisconnectRef = useRef(false);
  const demoLoadRef = useRef(false);
  const demoSelectionRef = useRef(false);
  const demoQuery = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return parseDemoFixtureQuery(window.location.search);
  }, []);
  const captureMode = demoQuery?.captureMode ?? null;

  const treeSummary = useMemo(() => {
    if (!replay?.btDef) {
      return null;
    }

    return {
      nodeCount: replay.btDef.data.nodes.length,
      edgeCount: replay.btDef.data.edges.length,
    };
  }, [replay, treeRevision]);
  const hasReplay = replay !== null;
  const maxTick = Math.max(replayMaxTick, 0);
  const tickCount = replayMaxTick >= 0 ? replayMaxTick + 1 : 0;
  const replayStats = useMemo(() => {
    if (!replay) {
      return [];
    }

    return [
      { label: 'run', value: replay.runStart?.run_id ?? 'unknown' },
      { label: 'mode', value: mode === 'live' ? 'live session' : 'replay' },
      { label: 'index', value: replayIndexed ? 'indexed' : 'unindexed' },
      { label: 'events', value: eventCount.toLocaleString() },
      { label: 'ticks', value: tickCount.toLocaleString() },
      {
        label: 'tree',
        value: treeSummary ? `${treeSummary.nodeCount} nodes / ${treeSummary.edgeCount} edges` : 'unavailable',
      },
    ];
  }, [eventCount, mode, replay, replayIndexed, tickCount, treeSummary]);
  const replaySummary = useMemo(() => {
    if (!replay) {
      return null;
    }

    const runStartData = replay.runStart?.data as Record<string, unknown> | undefined;
    const contractVersion =
      typeof runStartData?.contract_version === 'string' ? runStartData.contract_version : undefined;

    return summariseRun(replay.getAllEvents() as readonly RunEventRecord[], {
      contractVersion,
      schemaVersion: replay.runStart?.schema ?? replay.btDef?.schema,
    });
  }, [eventCount, replay]);
  const forcedPresentationLayout = captureMode && captureMode !== 'overview' ? captureMode : null;
  const activePresentationLayout = forcedPresentationLayout ?? presentationLayout;
  const showsPresentationToolbar = forcedPresentationLayout === null && presentationLayout !== null;

  const renderCaptureLoading = (kicker: string, message: string) => (
    <section className="panel detail-panel capture-loading-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{kicker}</p>
          <h2>loading</h2>
        </div>
      </div>
      <p className="panel-copy muted">{message}</p>
    </section>
  );

  const renderPresentationLayout = (layout: PresentationLayout) => {
    if (layout === 'hero') {
      return replay && replaySummary ? (
        <HeroCapture
          replay={replay}
          summary={replaySummary}
          selectedTick={selectedTick}
          selectedNodeId={selectedNodeId}
          maxTick={maxTick}
          tickCount={tickCount}
          replayIndexed={replayIndexed}
          onSelectNode={setSelectedNodeId}
          onSelectTick={setSelectedTick}
        />
      ) : (
        renderCaptureLoading('hero capture', 'Loading the deterministic demo fixture for the README hero capture.')
      );
    }

    if (!replay) {
      return renderCaptureLoading('capture mode', 'Loading the deterministic demo fixture for capture.');
    }

    if (layout === 'summary') {
      return replaySummary ? (
        <RunSummaryPanel replay={replay} summary={replaySummary} eventCount={eventCount} />
      ) : (
        renderCaptureLoading('capture mode', 'Summarising the replay for presentation export.')
      );
    }

    if (layout === 'node') {
      return <NodeInspector replay={replay} selectedNodeId={selectedNodeId} tick={selectedTick} />;
    }

    if (layout === 'diff') {
      return <BlackboardDiff replay={replay} tick={selectedTick} />;
    }

    return <DslEditor replay={replay} onApplyCompiled={applyCompiledTree} onResetCompiled={resetCompiledTree} />;
  };

  const setPresentationLayoutAndWait = useCallback(async (layout: PresentationLayout | null) => {
    if (typeof window === 'undefined') {
      return;
    }

    flushSync(() => {
      setPresentationLayout(layout);
    });
    await waitForCaptureReady();
  }, []);

  const captureRenderedLayoutBlob = useCallback(async (layout: PresentationLayout, format: CaptureFormat): Promise<Blob> => {
    if (typeof document === 'undefined') {
      throw new Error('capture export is only available in browser mode');
    }

    const target = document.getElementById(captureTargetId(layout));
    if (!(target instanceof HTMLElement)) {
      throw new Error(`capture target not ready for ${layout}`);
    }

    if (format === 'png') {
      const blob = await toBlob(target, {
        pixelRatio: 2,
        cacheBust: true,
      });
      if (!blob) {
        throw new Error('failed to render PNG export');
      }

      return blob;
    }

    const dataUrl = await toSvg(target, {
      cacheBust: true,
    });
    return dataUrlToBlob(dataUrl);
  }, []);

  const exportCurrentCapture = useCallback(
    async (format: CaptureFormat) => {
      if (!activePresentationLayout) {
        return;
      }

      setPresentationBusy(true);
      setPresentationErrorMessage(null);
      setPresentationStatusMessage(`exporting ${format.toUpperCase()}…`);

      try {
        await waitForCaptureReady();
        const blob = await captureRenderedLayoutBlob(activePresentationLayout, format);
        const fileName = captureDownloadName(activePresentationLayout, selectedTick, format);
        const mimeType = format === 'png' ? 'image/png' : 'image/svg+xml';
        const saveMode = await saveBlobToDisk(blob, {
          suggestedName: fileName,
          description: format === 'png' ? 'PNG image' : 'SVG image',
          mimeType,
          extensions: [format === 'png' ? '.png' : '.svg'],
        });
        setPresentationStatusMessage(
          `${format.toUpperCase()} saved as ${fileName}${saveMode === 'download' ? ' via browser download' : ''}.`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setPresentationStatusMessage(null);
        setPresentationErrorMessage(message);
      } finally {
        setPresentationBusy(false);
      }
    },
    [activePresentationLayout, captureRenderedLayoutBlob, selectedTick],
  );

  const exportPublicationBundle = useCallback(async () => {
    if (!replay || !replaySummary) {
      return;
    }

    const previousLayout = presentationLayout;
    const previousTick = useStudioStore.getState().selectedTick;
    setPresentationBusy(true);
    setPresentationErrorMessage(null);
    setPresentationStatusMessage('exporting publication bundle…');

    try {
      const initialLazyState = useStudioStore.getState().lazySidecar;
      if (initialLazyState && initialLazyState.loadedTicks.size < initialLazyState.index.tick_entries.length) {
        setPresentationStatusMessage('hydrating indexed replay…');
        useStudioStore.getState().setSelectedTick(Math.max(replayMaxTick, replay.maxTick, 0));

        const startedAt = Date.now();
        while (true) {
          const currentLazyState = useStudioStore.getState().lazySidecar;
          if (!currentLazyState || currentLazyState.loadedTicks.size >= currentLazyState.index.tick_entries.length) {
            break;
          }

          if (Date.now() - startedAt > 30_000) {
            throw new Error('timed out hydrating the full replay for bundle export');
          }

          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 40);
          });
        }

        if (previousTick !== useStudioStore.getState().selectedTick) {
          useStudioStore.getState().setSelectedTick(previousTick);
          await waitForCaptureReady();
        }
      }

      setPresentationStatusMessage('capturing publication screenshots…');
      const screenshotFiles: string[] = [];
      const screenshotBlobs: Array<{ path: string; blob: Blob }> = [];
      for (const layout of bundleScreenshotLayouts) {
        await setPresentationLayoutAndWait(layout);
        const blob = await captureRenderedLayoutBlob(layout, 'png');
        const path = captureFileName(layout, selectedTick);
        screenshotFiles.push(path);
        screenshotBlobs.push({ path, blob });
      }

      const exportedAtUtc = new Date().toISOString();
      const eventsText = serialiseReplayEvents(replay);
      const sidecarIndex = buildTickSidecarIndex(eventsText, 'events.jsonl');
      const runStartData = replay.runStart?.data as Record<string, unknown> | undefined;
      const contractVersion =
        typeof runStartData?.contract_version === 'string' ? runStartData.contract_version : undefined;
      const bundleSummary = summariseRun(replay.getAllEvents() as readonly RunEventRecord[], {
        contractVersion,
        schemaVersion: replay.runStart?.schema ?? replay.btDef?.schema,
      });
      const manifest = buildPublicationManifest(replay, bundleSummary, selectedTick, selectedNodeId, exportedAtUtc);
      const readmeText = buildPublicationReadme(replay, bundleSummary, selectedTick, selectedNodeId, screenshotFiles);
      const bundleName = publicationBundleName(replay);

      const zip = new JSZip();
      zip.file('events.jsonl', eventsText);
      zip.file('events.sidecar.tick-index.v1.json', JSON.stringify(sidecarIndex, null, 2));
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));
      zip.file('run_summary.json', JSON.stringify(bundleSummary, null, 2));
      zip.file('README.md', readmeText);
      for (const screenshot of screenshotBlobs) {
        zip.file(screenshot.path, screenshot.blob);
      }

      setPresentationStatusMessage('writing publication bundle…');
      const bundleBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      const saveMode = await saveBlobToDisk(bundleBlob, {
        suggestedName: bundleName,
        description: 'ZIP archive',
        mimeType: 'application/zip',
        extensions: ['.zip'],
      });
      setPresentationStatusMessage(
        `bundle saved as ${bundleName}${saveMode === 'download' ? ' via browser download' : ''}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPresentationStatusMessage(null);
      setPresentationErrorMessage(message);
    } finally {
      await setPresentationLayoutAndWait(previousLayout);
      setPresentationBusy(false);
    }
  }, [
    captureRenderedLayoutBlob,
    presentationLayout,
    replay,
    replaySummary,
    selectedNodeId,
    selectedTick,
    setPresentationLayoutAndWait,
  ]);

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await loadJsonlFromFiles(file, sidecarFile);
  };

  const onSidecarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSidecarFile(file);
  };

  useEffect(() => {
    reconnectEnabledRef.current = liveReconnectEnabled;
  }, [liveReconnectEnabled]);

  useEffect(() => {
    if (demoLoadRef.current || typeof window === 'undefined') {
      return;
    }

    demoLoadRef.current = true;
    if (!demoQuery) {
      return;
    }

    let cancelled = false;
    loadJsonlFromUrl(demoQuery.jsonlPath, demoQuery.sidecarPath).catch((error) => {
      if (cancelled) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      addParseError({
        line: 0,
        message: `demo load failed: ${message}`,
        raw: demoQuery.jsonlPath,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [addParseError, demoQuery, loadJsonlFromUrl]);

  useEffect(() => {
    if (!demoQuery || !replay || demoSelectionRef.current) {
      return;
    }

    if (demoQuery.selectedTick !== null) {
      setSelectedTick(demoQuery.selectedTick);
    }

    if (demoQuery.selectedNodeId !== null) {
      setSelectedNodeId(demoQuery.selectedNodeId);
    }

    demoSelectionRef.current = true;
  }, [demoQuery, replay, setSelectedNodeId, setSelectedTick]);

  const clearReconnectTimer = useCallback(() => {
    if (!reconnectTimerRef.current) {
      return;
    }

    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const disconnectLive = useCallback(() => {
    manualDisconnectRef.current = true;
    clearReconnectTimer();

    const ws = wsRef.current;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close(1000, 'manual disconnect');
      wsRef.current = null;
    }

    addLiveHistory({ level: 'info', message: 'Disconnected by user' });
    setLiveStatus('disconnected');
  }, [addLiveHistory, clearReconnectTimer, setLiveStatus]);

  const connectLive = useCallback((attempt = 0) => {
    if (!liveUrl.trim()) {
      setLiveStatus('error', 'WebSocket URL is empty');
      return;
    }

    if (attempt === 0) {
      manualDisconnectRef.current = false;
      clearReconnectTimer();
      addLiveHistory({ level: 'info', message: `Connecting to ${liveUrl.trim()}` });
    }

    const existing = wsRef.current;
    if (existing) {
      existing.onopen = null;
      existing.onmessage = null;
      existing.onerror = null;
      existing.onclose = null;
      existing.close(1000, 'reconnect');
      wsRef.current = null;
    }

    setLiveStatus('connecting');

    const ws = new WebSocket(liveUrl.trim());
    wsRef.current = ws;

    ws.onopen = () => {
      clearReconnectTimer();
      setLiveStatus('connected');
      addLiveHistory({ level: 'info', message: `Connected to ${liveUrl.trim()}` });
    };

    ws.onmessage = async (event) => {
      const payload = await decodeWebSocketData(event.data);
      const parsed = parseLivePayload(payload);

      if (parsed.events.length > 0) {
        appendLiveEvents(parsed.events);
      }

      for (const issue of parsed.issues) {
        addParseError({
          line: 0,
          message: `live payload: ${issue.message}`,
          raw: issue.raw,
        });
      }
    };

    ws.onerror = () => {
      setLiveStatus('error', 'WebSocket error');
      addLiveHistory({ level: 'error', message: 'WebSocket error' });
    };

    ws.onclose = (event) => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }

      if (event.code === 1000 || event.code === 1005) {
        setLiveStatus('disconnected');
        if (!manualDisconnectRef.current) {
          addLiveHistory({ level: 'warning', message: `Connection closed (${event.code})` });
        }
        return;
      }

      const reason = event.reason ? ` (${event.reason})` : '';
      const closeMessage = `connection closed: ${event.code}${reason}`;
      setLiveStatus('error', closeMessage);
      addLiveHistory({ level: 'warning', message: closeMessage });

      if (manualDisconnectRef.current || !reconnectEnabledRef.current) {
        return;
      }

      const nextAttempt = attempt + 1;
      const delayMs = Math.min(10_000, 500 * 2 ** Math.min(nextAttempt - 1, 6));
      addLiveHistory({ level: 'info', message: `Retry ${nextAttempt} in ${delayMs}ms` });

      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connectLive(nextAttempt);
      }, delayMs);
    };
  }, [addLiveHistory, addParseError, appendLiveEvents, clearReconnectTimer, liveUrl, setLiveStatus]);

  const connectLiveManual = useCallback(() => {
    connectLive(0);
  }, [connectLive]);

  useEffect(() => {
    return () => {
      const ws = wsRef.current;
      if (ws) {
        ws.close(1000, 'component unmount');
        wsRef.current = null;
      }

      clearReconnectTimer();
    };
  }, [clearReconnectTimer]);

  if (activePresentationLayout) {
    const shellClassName = `app-shell app-shell--capture app-shell--capture-${activePresentationLayout}${
      showsPresentationToolbar ? ' app-shell--capture-interactive' : ''
    }`;

    return (
      <main className={shellClassName}>
        {showsPresentationToolbar && activePresentationLayout ? (
          <PresentationToolbar
            currentLayout={activePresentationLayout}
            busy={presentationBusy}
            statusMessage={presentationStatusMessage}
            errorMessage={presentationErrorMessage}
            onSelectLayout={(layout) => {
              setPresentationStatusMessage(null);
              setPresentationErrorMessage(null);
              setPresentationLayout(layout);
            }}
            onExportPng={() => {
              void exportCurrentCapture('png');
            }}
            onExportSvg={() => {
              void exportCurrentCapture('svg');
            }}
            onExportBundle={() => {
              void exportPublicationBundle();
            }}
            onClose={() => {
              setPresentationStatusMessage(null);
              setPresentationErrorMessage(null);
              setPresentationLayout(null);
            }}
          />
        ) : null}

        {activePresentationLayout === 'hero' ? (
          renderPresentationLayout(activePresentationLayout)
        ) : (
          <section className="capture-panel-shell">{renderPresentationLayout(activePresentationLayout)}</section>
        )}
      </main>
    );
  }

  return (
    <main className={captureMode === 'overview' ? 'app-shell app-shell--capture app-shell--capture-overview' : 'app-shell'}>
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">replay-first run inspection</p>
          <h1>muesli-studio</h1>
          <p className="topbar-copy muted">
            Understand a run quickly, trust what changed, and capture clean figures without fighting the interface.
          </p>
        </div>

        <div className="topbar-actions">
          <label className="file-input">
            <span>open replay</span>
            <small>choose `events.jsonl`</small>
            <input type="file" accept=".jsonl,application/json,text/plain" onChange={onFileChange} />
          </label>
          <label className="file-input">
            <span>open sidecar</span>
            <small>optional tick index</small>
            <input type="file" accept=".json,application/json" onChange={onSidecarChange} />
          </label>
        </div>
      </header>

      <section className="workspace-shell">
        <div className="workspace-main">
          {hasReplay ? (
            <section className="panel instrument-panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">main instrument</p>
                  <h2>tree timeline</h2>
                  <p className="panel-copy muted">The central surface stays stable while state and tick focus update around it.</p>
                </div>
                <div className="tree-summary-badges">
                  <span className={`status-badge ${replayIndexed ? 'status-badge--indexed' : 'status-badge--subtle'}`}>
                    {replayIndexed ? 'indexed replay' : 'full scan'}
                  </span>
                  <span className="status-badge status-badge--subtle">
                    {mode === 'live' ? (liveAutoFollow ? 'live auto-follow' : 'live manual') : 'manual scrub'}
                  </span>
                </div>
              </div>

              <div className="metric-grid">
                {replayStats.map((item) => (
                  <div key={item.label} className="metric-card">
                    <span className="metric-label">{item.label}</span>
                    <span className="metric-value">{item.value}</span>
                  </div>
                ))}
              </div>

              <div className="scrubber-panel">
                <div className="scrubber-header">
                  <div>
                    <span className="metric-label">selected tick</span>
                    <div className="scrubber-tick">{selectedTick}</div>
                  </div>
                  <div className="scrubber-meta">
                    <span className="status-badge status-badge--subtle">0 → {maxTick}</span>
                    {liveLastEventUnixMs ? (
                      <span className="scrubber-note muted">last event {new Date(liveLastEventUnixMs).toLocaleTimeString()}</span>
                    ) : null}
                  </div>
                </div>

                <label className="tick-row" htmlFor="tick-scrubber">
                  <span>
                    <span>tick scrubber</span>
                    <span>{tickCount} tick(s)</span>
                  </span>
                  <input
                    id="tick-scrubber"
                    type="range"
                    min={0}
                    max={maxTick}
                    value={selectedTick}
                    onChange={(evt) => {
                      if (liveAutoFollow) {
                        setLiveAutoFollow(false);
                      }
                      setSelectedTick(Number(evt.target.value));
                    }}
                    disabled={replayMaxTick <= 0}
                  />
                </label>

                <div className="scrubber-scale">
                  <span>0</span>
                  <span>{Math.max(Math.floor(maxTick / 2), 0)}</span>
                  <span>{maxTick}</span>
                </div>
              </div>
            </section>
          ) : (
            <section className="panel instrument-panel empty-state-panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">get started</p>
                  <h2>load a run</h2>
                  <p className="panel-copy muted">Open a recorded log or connect to a live runtime. Once events arrive, the tree becomes the dominant surface.</p>
                </div>
              </div>

              <div className="empty-action-grid">
                <div className="empty-action">
                  <h3>recorded replay</h3>
                  <p>Choose `events.jsonl`, then add the optional sidecar index for larger runs.</p>
                </div>
                <div className="empty-action">
                  <h3>live monitor</h3>
                  <p>Connect a runtime over WebSocket and let new events append into the same inspection model.</p>
                </div>
                <div className="empty-action">
                  <h3>clean capture</h3>
                  <p>Use the deterministic demo fixture as the baseline for screenshots, talks, and publication polish.</p>
                </div>
              </div>
            </section>
          )}

          {replay ? (
            <TreeView replay={replay} selectedTick={selectedTick} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
          ) : (
            <div className="panel tree-panel tree-panel--empty">
              <div className="empty-tree-state">
                <p className="panel-kicker">focal surface</p>
                <h2>behaviour tree</h2>
                <p className="panel-copy muted">Load a replay log to render a stable tree layout and inspect each tick without relayout noise.</p>
              </div>
            </div>
          )}
        </div>

        <aside className="workspace-sidebar">
          {replay && replaySummary ? <RunSummaryPanel replay={replay} summary={replaySummary} eventCount={eventCount} /> : null}
          {replay && replaySummary ? (
            <PresentationPanel
              currentLayout={presentationLayout}
              selectedTick={selectedTick}
              selectedNodeId={selectedNodeId}
              busy={presentationBusy}
              statusMessage={presentationStatusMessage}
              errorMessage={presentationErrorMessage}
              onOpenLayout={(layout) => {
                setPresentationStatusMessage(null);
                setPresentationErrorMessage(null);
                setPresentationLayout(layout);
              }}
              onExportBundle={() => {
                void exportPublicationBundle();
              }}
            />
          ) : null}

          {replayLoadProgress !== null ? (
            <section className="panel notice-panel notice-panel--loading">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">loading</p>
                  <h2>replay</h2>
                </div>
                <span className="status-badge status-badge--subtle">{replayLoadProgress}%</span>
              </div>
              <div className="progress-track" aria-hidden="true">
                <div className="progress-fill" style={{ width: `${replayLoadProgress}%` }} />
              </div>
              <p className="panel-copy muted">Large logs hydrate in controlled ranges so the main tree stays responsive.</p>
            </section>
          ) : null}

          {replayLoadWarning ? (
            <section className="panel notice-panel notice-panel--warning">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">replay state</p>
                  <h2>warning</h2>
                </div>
              </div>
              <p>{replayLoadWarning}</p>
            </section>
          ) : null}

          {parseErrors.length > 0 ? (
            <section className="panel notice-panel notice-panel--error">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">ingest</p>
                  <h2>warnings</h2>
                </div>
                <span className="status-badge status-badge--error">{parseErrors.length}</span>
              </div>
              <p className="panel-copy muted">{parseErrors.length} item(s) were skipped due to parse or schema issues.</p>
              <ul className="detail-list">
                {parseErrors.slice(0, 5).map((error) => (
                  <li key={`${error.line}:${error.message}`} className="detail-list-item">
                    <span className="detail-list-primary">{error.line > 0 ? `line ${error.line}` : 'replay input'}</span>
                    <span className="detail-list-secondary">{error.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="panel detail-panel live-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">live monitor</p>
                <h2>connection</h2>
                <p className="panel-copy muted">Follow the same canonical event stream over WebSocket.</p>
              </div>
              <span className={`status-badge status-badge--${liveStatus}`}>{liveStatus}</span>
            </div>

            <div className="control-stack">
              <label className="live-url">
                <span>endpoint</span>
                <input
                  type="url"
                  value={liveUrl}
                  onChange={(event) => setLiveUrl(event.target.value)}
                  placeholder="ws://localhost:8765/events"
                />
              </label>

              <div className="button-row">
                <button
                  type="button"
                  className="button-primary"
                  onClick={connectLiveManual}
                  disabled={liveStatus === 'connecting' || liveStatus === 'connected'}
                >
                  connect
                </button>
                <button type="button" className="button-ghost" onClick={disconnectLive} disabled={liveStatus === 'disconnected'}>
                  disconnect
                </button>
                <button type="button" className="button-ghost" onClick={clearLiveHistory}>
                  clear history
                </button>
              </div>

              <div className="toggle-row">
                <label className="checkbox">
                  <input type="checkbox" checked={liveAutoFollow} onChange={(event) => setLiveAutoFollow(event.target.checked)} />
                  auto-follow
                </label>
                <label className="checkbox">
                  <input type="checkbox" checked={liveReconnectEnabled} onChange={(event) => setLiveReconnectEnabled(event.target.checked)} />
                  auto-reconnect
                </label>
              </div>
            </div>

            <p className="status-line muted">
              status <code>{liveStatus}</code>
              {liveLastError ? ` · ${liveLastError}` : ''}
              {liveLastEventUnixMs ? ` · last event ${new Date(liveLastEventUnixMs).toLocaleTimeString()}` : ''}
            </p>

            <div className="history-list compact">
              {liveHistory.length === 0 ? (
                <p className="panel-empty-copy muted">No connection history yet.</p>
              ) : (
                <ul className="detail-list">
                  {liveHistory
                    .slice(-8)
                    .reverse()
                    .map((entry) => (
                      <li key={`${entry.atUnixMs}:${entry.message}`} className="detail-list-item">
                        <div className="detail-list-row">
                          <span className="detail-list-primary">[{new Date(entry.atUnixMs).toLocaleTimeString()}]</span>
                          <span className={`status-badge status-badge--history-${entry.level}`}>{entry.level}</span>
                        </div>
                        <span className="detail-list-secondary">{entry.message}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </section>

          {replay ? (
            <>
              <NodeInspector replay={replay} selectedNodeId={selectedNodeId} tick={selectedTick} />
              <BlackboardDiff replay={replay} tick={selectedTick} />
              <DslEditor replay={replay} onApplyCompiled={applyCompiledTree} onResetCompiled={resetCompiledTree} />
            </>
          ) : (
            <section className="panel detail-panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">side panels</p>
                  <h2>details</h2>
                </div>
              </div>
              <p className="panel-copy muted">Node history, blackboard changes, and DSL editing appear here once a replay is loaded.</p>
              <p className="panel-copy muted">Until then, use the loader above or connect to a live runtime from this sidebar.</p>
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}
