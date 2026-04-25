import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toBlob, toSvg } from 'html-to-image';
import JSZip from 'jszip';

import { buildTickSidecarIndex, ReplayStore, summariseRun, type RunEventRecord } from '@muesli/replay';

import { BlackboardDiff } from './components/BlackboardDiff';
import { ComparePanel } from './components/ComparePanel';
import { decodeWebSocketData, parseLivePayload } from './live';
import { buildShareableSearch, parseInspectionStateQuery, parseReplayLinkQuery } from './deep-link';
import { DslEditor } from './components/DslEditor';
import { EventExplorer } from './components/EventExplorer';
import { HeroCapture } from './components/HeroCapture';
import { NodeInspector } from './components/NodeInspector';
import { PlannerSchedulerPanel } from './components/PlannerSchedulerPanel';
import { PresentationPanel } from './components/PresentationPanel';
import { PresentationToolbar } from './components/PresentationToolbar';
import { ReplayDiagnosticsPanel } from './components/ReplayDiagnosticsPanel';
import { RunSummaryPanel } from './components/RunSummaryPanel';
import { TreeView } from './components/TreeView';
import { canonicalDemoFixture, parseDemoFixtureQuery } from './demo-fixture';
import {
  buildLiveCaptureManifest,
  buildLiveCaptureReadme,
  buildPublicationManifest,
  buildPublicationReadme,
  captureFileName,
  liveCaptureBundleName,
  publicationBundleName,
  type PresentationLayout,
  serialiseReplayEvents,
} from './publication';
import { saveBlobToDisk } from './save-file';
import { useStudioStore } from './store';

type CaptureFormat = 'png' | 'svg';
type KeyboardPanelId =
  | 'timeline-panel'
  | 'event-explorer-panel'
  | 'tree-panel'
  | 'run-summary-panel'
  | 'node-inspector-panel'
  | 'blackboard-diff'
  | 'dsl-editor-panel'
  | 'live-connection-panel';

const bundleScreenshotLayouts: readonly PresentationLayout[] = ['hero', 'summary', 'diff', 'compare'];
const keyboardPanelShortcuts: Readonly<Record<string, KeyboardPanelId>> = {
  '1': 'timeline-panel',
  '2': 'event-explorer-panel',
  '3': 'tree-panel',
  '4': 'run-summary-panel',
  '5': 'node-inspector-panel',
  '6': 'blackboard-diff',
  '7': 'dsl-editor-panel',
  '8': 'live-connection-panel',
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function focusPanelById(panelId: KeyboardPanelId): void {
  if (typeof document === 'undefined') {
    return;
  }

  const element = document.getElementById(panelId);
  if (!(element instanceof HTMLElement)) {
    return;
  }

  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
  element.focus({ preventScroll: true });
}

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

  if (layout === 'compare') {
    return 'compare-panel';
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

export function isReplayBundleFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
}

export async function readReplayBundle(file: File): Promise<{ eventsText: string; sidecarText: string | null }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const eventsEntry = zip.file('events.jsonl') ?? zip.file(/(^|\/)events\.jsonl$/u)[0] ?? null;
  if (!eventsEntry) {
    throw new Error('bundle does not contain events.jsonl');
  }

  const sidecarEntry =
    zip.file('events.sidecar.tick-index.v1.json') ?? zip.file(/(^|\/)events\.sidecar\.tick-index\.v1\.json$/u)[0] ?? null;

  return {
    eventsText: await eventsEntry.async('string'),
    sidecarText: sidecarEntry ? await sidecarEntry.async('string') : null,
  };
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
  const replaySourceKind = useStudioStore((state) => state.replaySourceKind);
  const replaySourceUrl = useStudioStore((state) => state.replaySourceUrl);
  const replaySidecarUrl = useStudioStore((state) => state.replaySidecarUrl);
  const replayLoadedBytesEstimate = useStudioStore((state) => state.replayLoadedBytesEstimate);
  const replaySeekStats = useStudioStore((state) => state.replaySeekStats);
  const replayMaxTick = useStudioStore((state) => state.replayMaxTick);
  const treeRevision = useStudioStore((state) => state.treeRevision);
  const lazySidecar = useStudioStore((state) => state.lazySidecar);
  const mode = useStudioStore((state) => state.mode);
  const liveUrl = useStudioStore((state) => state.liveUrl);
  const liveStatus = useStudioStore((state) => state.liveStatus);
  const liveAutoFollow = useStudioStore((state) => state.liveAutoFollow);
  const liveReconnectEnabled = useStudioStore((state) => state.liveReconnectEnabled);
  const liveLastError = useStudioStore((state) => state.liveLastError);
  const liveLastEventUnixMs = useStudioStore((state) => state.liveLastEventUnixMs);
  const liveHistory = useStudioStore((state) => state.liveHistory);
  const livePinned = useStudioStore((state) => state.livePinned);
  const loadJsonl = useStudioStore((state) => state.loadJsonl);
  const loadJsonlFromFiles = useStudioStore((state) => state.loadJsonlFromFiles);
  const loadJsonlFromUrl = useStudioStore((state) => state.loadJsonlFromUrl);
  const appendLiveEvents = useStudioStore((state) => state.appendLiveEvents);
  const setSelectedTick = useStudioStore((state) => state.setSelectedTick);
  const setSelectedNodeId = useStudioStore((state) => state.setSelectedNodeId);
  const setLiveUrl = useStudioStore((state) => state.setLiveUrl);
  const setLiveStatus = useStudioStore((state) => state.setLiveStatus);
  const setLiveAutoFollow = useStudioStore((state) => state.setLiveAutoFollow);
  const setLiveReconnectEnabled = useStudioStore((state) => state.setLiveReconnectEnabled);
  const pinLiveInspection = useStudioStore((state) => state.pinLiveInspection);
  const resumeLiveInspection = useStudioStore((state) => state.resumeLiveInspection);
  const applyCompiledTree = useStudioStore((state) => state.applyCompiledTree);
  const resetCompiledTree = useStudioStore((state) => state.resetCompiledTree);
  const hydrateTickWindow = useStudioStore((state) => state.hydrateTickWindow);
  const hydrateAllLazyTicks = useStudioStore((state) => state.hydrateAllLazyTicks);
  const addLiveHistory = useStudioStore((state) => state.addLiveHistory);
  const clearLiveHistory = useStudioStore((state) => state.clearLiveHistory);
  const addParseError = useStudioStore((state) => state.addParseError);
  const [sidecarFile, setSidecarFile] = useState<File | null>(null);
  const [presentationLayout, setPresentationLayout] = useState<PresentationLayout | null>(null);
  const [presentationBusy, setPresentationBusy] = useState(false);
  const [presentationStatusMessage, setPresentationStatusMessage] = useState<string | null>(null);
  const [presentationErrorMessage, setPresentationErrorMessage] = useState<string | null>(null);
  const [liveCaptureBusy, setLiveCaptureBusy] = useState(false);
  const [liveCaptureStatusMessage, setLiveCaptureStatusMessage] = useState<string | null>(null);
  const [liveCaptureErrorMessage, setLiveCaptureErrorMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectEnabledRef = useRef(liveReconnectEnabled);
  const manualDisconnectRef = useRef(false);
  const initialReplayLoadRef = useRef(false);
  const initialSelectionRef = useRef(false);
  const demoQuery = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return parseDemoFixtureQuery(window.location.search);
  }, []);
  const replayLinkQuery = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return parseReplayLinkQuery(window.location.search);
  }, []);
  const livePayloadDropCount = useMemo(
    () => parseErrors.filter((error) => error.message.startsWith('live payload:')).length,
    [parseErrors],
  );
  const liveReconnectAttempts = useMemo(
    () => liveHistory.filter((entry) => /^Retry \d+ in \d+ms$/u.test(entry.message)).length,
    [liveHistory],
  );
  const liveUnexpectedCloseCount = useMemo(
    () => liveHistory.filter((entry) => entry.level === 'warning' && entry.message.startsWith('connection closed:')).length,
    [liveHistory],
  );
  const liveLatestReconnect = useMemo(
    () => [...liveHistory].reverse().find((entry) => /^Retry \d+ in \d+ms$/u.test(entry.message))?.message ?? null,
    [liveHistory],
  );
  const liveViewModeLabel = livePinned ? 'inspect pinned tick' : liveAutoFollow ? 'follow newest tick' : 'inspect selected tick';
  const inspectionStateQuery = useMemo(() => {
    if (typeof window === 'undefined') {
      return { selectedTick: null, selectedNodeId: null, view: null };
    }

    return parseInspectionStateQuery(window.location.search);
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
      ...(mode === 'live' ? [{ label: 'live view', value: livePinned ? 'pinned' : liveAutoFollow ? 'following' : 'manual' }] : []),
      { label: 'loading', value: replayIndexed ? 'quick access' : 'standard' },
      { label: 'events', value: eventCount.toLocaleString() },
      { label: 'ticks', value: tickCount.toLocaleString() },
      {
        label: 'tree',
        value: treeSummary ? `${treeSummary.nodeCount} nodes / ${treeSummary.edgeCount} edges` : 'unavailable',
      },
    ];
  }, [eventCount, liveAutoFollow, livePinned, mode, replay, replayIndexed, tickCount, treeSummary]);
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
  const replayDiagnostics = useMemo(() => {
    if (!replay) {
      return null;
    }

    const loadedTickIds = new Set<number>();
    for (const event of replay.getAllEvents()) {
      if (typeof event.tick === 'number') {
        loadedTickIds.add(event.tick);
      }
    }

    return {
      loadedTickCount: loadedTickIds.size,
      knownTickCount: lazySidecar ? lazySidecar.index.tick_entries.length : loadedTickIds.size,
      loadedCoveragePercent:
        lazySidecar && lazySidecar.index.tick_entries.length > 0
          ? (loadedTickIds.size / lazySidecar.index.tick_entries.length) * 100
          : loadedTickIds.size > 0
            ? 100
            : 0,
      pendingTickCount: lazySidecar?.pendingTicks.size ?? 0,
      highestTick: Math.max(replayMaxTick, replay.maxTick, 0),
      lazyActive: lazySidecar !== null,
    };
  }, [eventCount, lazySidecar, replay, replayMaxTick]);
  const forcedPresentationLayout = captureMode && captureMode !== 'overview' ? captureMode : null;
  const activePresentationLayout = forcedPresentationLayout ?? presentationLayout;
  const showsPresentationToolbar = forcedPresentationLayout === null && presentationLayout !== null;
  const isCanonicalDemoReplay = replay?.runStart?.run_id === canonicalDemoFixture.runId;
  const replayLoadNotice = useMemo(() => {
    if (demoQuery) {
      return {
        kicker: 'opening sample',
        heading: 'sample run',
        message: 'Loading the sample run and opening a useful moment for first inspection.',
      };
    }

    if (replaySourceKind === 'file') {
      return {
        kicker: 'loading file',
        heading: 'replay',
        message: 'Parsing the selected log and preparing the tree, summary, and diagnostics panels.',
      };
    }

    if (replaySourceKind === 'url') {
      return {
        kicker: 'opening link',
        heading: 'replay',
        message: 'Opening the selected run and preparing faster navigation where available.',
      };
    }

    return {
      kicker: 'loading',
      heading: 'replay',
      message: 'Preparing the replay and getting the inspection view ready.',
    };
  }, [demoQuery, replaySourceKind]);

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
        renderCaptureLoading('sample view', 'Loading the sample run for this capture view.')
      );
    }

    if (!replay) {
      return renderCaptureLoading('capture mode', 'Loading the sample run for this capture view.');
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

    if (layout === 'compare') {
      return <ComparePanel replay={replay} selectedTick={selectedTick} initialBaselineTick={Math.max(0, selectedTick - 1)} />;
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
        setPresentationStatusMessage('loading the full run…');
        useStudioStore.getState().setSelectedTick(Math.max(replayMaxTick, replay.maxTick, 0));

        const startedAt = Date.now();
        while (true) {
          const currentLazyState = useStudioStore.getState().lazySidecar;
          if (!currentLazyState || currentLazyState.loadedTicks.size >= currentLazyState.index.tick_entries.length) {
            break;
          }

          if (Date.now() - startedAt > 30_000) {
            throw new Error('timed out preparing the full run for bundle export');
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

  const exportLiveCaptureBundle = useCallback(async () => {
    if (!replay) {
      return;
    }

    setLiveCaptureBusy(true);
    setLiveCaptureStatusMessage('preparing live capture bundle…');
    setLiveCaptureErrorMessage(null);

    try {
      const exportReplay = new ReplayStore();
      exportReplay.appendMany([...replay.getAllEvents()]);
      if (livePinned?.bufferedEvents.length) {
        exportReplay.appendMany(livePinned.bufferedEvents);
      }

      const exportedAtUtc = new Date().toISOString();
      const eventsText = serialiseReplayEvents(exportReplay);
      const sidecarIndex = buildTickSidecarIndex(eventsText, 'events.jsonl');
      const runStartData = exportReplay.runStart?.data as Record<string, unknown> | undefined;
      const contractVersion =
        typeof runStartData?.contract_version === 'string' ? runStartData.contract_version : undefined;
      const bundleSummary = summariseRun(exportReplay.getAllEvents() as readonly RunEventRecord[], {
        contractVersion,
        schemaVersion: exportReplay.runStart?.schema ?? exportReplay.btDef?.schema,
      });
      const manifest = buildLiveCaptureManifest(exportReplay, bundleSummary, selectedTick, selectedNodeId, exportedAtUtc);
      const readmeText = buildLiveCaptureReadme(exportReplay, bundleSummary, selectedTick, selectedNodeId);
      const bundleName = liveCaptureBundleName(exportReplay);

      const zip = new JSZip();
      zip.file('events.jsonl', eventsText);
      zip.file('events.sidecar.tick-index.v1.json', JSON.stringify(sidecarIndex, null, 2));
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));
      zip.file('run_summary.json', JSON.stringify(bundleSummary, null, 2));
      zip.file('README.md', readmeText);

      setLiveCaptureStatusMessage('writing live capture bundle…');
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
      setLiveCaptureStatusMessage(
        `live capture saved as ${bundleName}${saveMode === 'download' ? ' via browser download' : ''}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLiveCaptureStatusMessage(null);
      setLiveCaptureErrorMessage(message);
    } finally {
      setLiveCaptureBusy(false);
    }
  }, [livePinned, replay, selectedNodeId, selectedTick]);

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      if (isReplayBundleFile(file)) {
        const bundle = await readReplayBundle(file);
        loadJsonl(bundle.eventsText, bundle.sidecarText, file.size, 'file');
        return;
      }

      await loadJsonlFromFiles(file, sidecarFile);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addParseError({
        line: 0,
        message: `replay load failed: ${message}`,
        raw: file.name,
      });
    }
  };

  const onSidecarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSidecarFile(file);
  };

  useEffect(() => {
    reconnectEnabledRef.current = liveReconnectEnabled;
  }, [liveReconnectEnabled]);

  useEffect(() => {
    if (initialReplayLoadRef.current || typeof window === 'undefined') {
      return;
    }

    initialReplayLoadRef.current = true;
    const replaySource = demoQuery
      ? { jsonlPath: demoQuery.jsonlPath, sidecarPath: demoQuery.sidecarPath }
      : replayLinkQuery
        ? { jsonlPath: replayLinkQuery.jsonlUrl, sidecarPath: replayLinkQuery.sidecarUrl }
        : null;

    if (!replaySource) {
      return;
    }

    let cancelled = false;
    loadJsonlFromUrl(replaySource.jsonlPath, replaySource.sidecarPath).catch((error) => {
      if (cancelled) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      addParseError({
        line: 0,
        message: `replay load failed: ${message}`,
        raw: replaySource.jsonlPath,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [addParseError, demoQuery, loadJsonlFromUrl, replayLinkQuery]);

  useEffect(() => {
    if (!replay || initialSelectionRef.current) {
      return;
    }

    const selectedTick = inspectionStateQuery.selectedTick ?? demoQuery?.selectedTick ?? null;
    const selectedNodeId = inspectionStateQuery.selectedNodeId ?? demoQuery?.selectedNodeId ?? null;
    const nextView = inspectionStateQuery.view;

    if (selectedTick !== null) {
      setSelectedTick(selectedTick);
    }

    if (selectedNodeId !== null) {
      setSelectedNodeId(selectedNodeId);
    }

    if (nextView !== null) {
      setPresentationLayout(nextView === 'overview' ? null : nextView);
    }

    initialSelectionRef.current = true;
  }, [demoQuery, inspectionStateQuery, replay, setSelectedNodeId, setSelectedTick]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash.length <= 1) {
      return;
    }

    const targetId = window.location.hash.slice(1);
    requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: 'start', inline: 'nearest' });
    });
  }, [eventCount, replay]);

  useEffect(() => {
    if (typeof window === 'undefined' || captureMode !== null || !replay || mode !== 'replay') {
      return;
    }

    const source = demoQuery
      ? {
          kind: 'demo' as const,
          jsonlPath: demoQuery.jsonlPath,
          sidecarPath: demoQuery.sidecarPath,
        }
      : replaySourceUrl
        ? {
            kind: 'url' as const,
            jsonlUrl: replaySourceUrl,
            sidecarUrl: replaySidecarUrl,
          }
        : {
            kind: 'none' as const,
          };

    const nextSearch = buildShareableSearch(window.location.search, source, {
      selectedTick,
      selectedNodeId,
      view: presentationLayout ?? 'overview',
    });

    if (nextSearch === window.location.search) {
      return;
    }

    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [
    captureMode,
    demoQuery,
    mode,
    presentationLayout,
    replay,
    replaySidecarUrl,
    replaySourceUrl,
    selectedNodeId,
    selectedTick,
  ]);

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (activePresentationLayout) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const editableTarget = isEditableTarget(event.target);

      if (event.key === '/' && replay && !editableTarget) {
        const searchInput = document.getElementById('event-search-input');
        if (searchInput instanceof HTMLInputElement) {
          event.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      if (editableTarget || !replay) {
        return;
      }

      const tickStep = event.shiftKey ? 10 : 1;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (mode === 'live' && liveAutoFollow) {
          setLiveAutoFollow(false);
        }
        setSelectedTick(selectedTick + tickStep);
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (mode === 'live' && liveAutoFollow) {
          setLiveAutoFollow(false);
        }
        setSelectedTick(selectedTick - tickStep);
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        if (mode === 'live' && liveAutoFollow) {
          setLiveAutoFollow(false);
        }
        setSelectedTick(0);
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        if (mode === 'live' && liveAutoFollow) {
          setLiveAutoFollow(false);
        }
        setSelectedTick(maxTick);
        return;
      }

      const panelId = keyboardPanelShortcuts[event.key];
      if (panelId) {
        event.preventDefault();
        focusPanelById(panelId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activePresentationLayout, liveAutoFollow, maxTick, mode, replay, selectedTick, setLiveAutoFollow, setSelectedTick]);

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
          <p className="eyebrow">run inspection</p>
          <h1>muesli-studio</h1>
          <p className="topbar-copy muted">
            Understand a run quickly, trust what changed, and capture clean figures without fighting the interface.
          </p>
          {isCanonicalDemoReplay ? (
            <div className="brand-meta">
              <span className="status-badge status-badge--indexed">sample run loaded</span>
            </div>
          ) : null}
        </div>

        <div className="topbar-actions">
          <label className="file-input">
            <span>open replay</span>
            <small>choose JSONL or bundle</small>
            <input type="file" accept=".jsonl,.zip,application/json,application/zip,text/plain" onChange={onFileChange} />
          </label>
          <label className="file-input">
            <span>open index</span>
            <small>optional for larger runs</small>
            <input type="file" accept=".json,application/json" onChange={onSidecarChange} />
          </label>
        </div>
      </header>

      <section className="workspace-shell">
        <div className="workspace-main">
          {hasReplay ? (
            <section id="timeline-panel" tabIndex={-1} className="panel instrument-panel keyboard-panel-target">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">run</p>
                  <h2>timeline</h2>
                  <p className="panel-copy muted">Scrub the replay while keeping the tree, summary, and selection details aligned.</p>
                </div>
                <div className="tree-summary-badges">
                  <span className={`status-badge ${replayIndexed ? 'status-badge--indexed' : 'status-badge--subtle'}`}>
                    {replayIndexed ? 'quick access' : 'standard loading'}
                  </span>
                  <span className="status-badge status-badge--subtle">
                    {mode === 'live' ? (livePinned ? 'live pinned' : liveAutoFollow ? 'live auto-follow' : 'live manual') : 'manual scrub'}
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

              {isCanonicalDemoReplay ? (
                <p className="notice-inline notice-inline--info">
                  The sample run opens at a useful moment so you can start inspecting straight away.
                </p>
              ) : null}
              {mode === 'live' && livePinned ? (
                <p className="notice-inline notice-inline--info">
                  Live inspection is pinned at tick {livePinned.pinnedAtTick}. {livePinned.bufferedEvents.length.toLocaleString()} buffered event(s)
                  will join the run when you resume live.
                </p>
              ) : null}

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

              <EventExplorer
                replay={replay}
                mode={mode}
                eventCount={eventCount}
                selectedTick={selectedTick}
                lazyActive={replayDiagnostics?.lazyActive ?? false}
                onJumpToTick={(tick) => {
                  if (mode === 'live' && liveAutoFollow) {
                    setLiveAutoFollow(false);
                  }
                  setSelectedTick(tick);
                }}
                onSelectNode={setSelectedNodeId}
              />
            </section>
          ) : (
            <section className="panel instrument-panel empty-state-panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">first run</p>
                  <h2>open a replay</h2>
                  <p className="panel-copy muted">
                    Open a run or connect live to start inspecting. The tree and timeline appear as soon as the run is ready.
                  </p>
                </div>
              </div>

              <div className="empty-action-grid">
                <div className="empty-action">
                  <h3>open a run</h3>
                  <p>Load a recorded run. If you also have an index file, add it for faster movement through large runs.</p>
                </div>
                <div className="empty-action">
                  <h3>connect live</h3>
                  <p>Follow incoming activity in the same view and pause on the moments that matter.</p>
                </div>
                <div className="empty-action">
                  <h3>sample run</h3>
                  <p>Start with the included sample if you want a quick tour of the interface before loading your own run.</p>
                </div>
              </div>
            </section>
          )}

          {replay ? (
            <TreeView replay={replay} selectedTick={selectedTick} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
          ) : (
            <div className="panel tree-panel tree-panel--empty">
              <div className="empty-tree-state">
                <p className="panel-kicker">inspection tree</p>
                <h2>behaviour tree</h2>
                <p className="panel-copy muted">Load a replay to render a stable tree layout and inspect each tick without relayout noise.</p>
              </div>
            </div>
          )}
        </div>

        <aside className="workspace-sidebar">
          {replay && replaySummary ? <RunSummaryPanel replay={replay} summary={replaySummary} eventCount={eventCount} /> : null}
          {replay && mode === 'replay' ? (
            <ComparePanel replay={replay} selectedTick={selectedTick} initialBaselineTick={Math.max(0, selectedTick - 1)} />
          ) : null}
          {replay && mode === 'replay' ? <PlannerSchedulerPanel replay={replay} selectedTick={selectedTick} /> : null}
          {replay && mode === 'replay' && replayDiagnostics ? (
            <ReplayDiagnosticsPanel
              eventCount={eventCount}
              selectedTick={selectedTick}
              replayIndexed={replayIndexed}
              lazyActive={replayDiagnostics.lazyActive}
              sourceKind={replaySourceKind}
              sourceBytes={replaySourceBytes}
              loadedBytesEstimate={replayLoadedBytesEstimate}
              loadedTickCount={replayDiagnostics.loadedTickCount}
              knownTickCount={replayDiagnostics.knownTickCount}
              loadedCoveragePercent={replayDiagnostics.loadedCoveragePercent}
              highestTick={replayDiagnostics.highestTick}
              pendingTickCount={replayDiagnostics.pendingTickCount}
              loadWarning={replayLoadWarning}
              seekStats={replaySeekStats}
              onHydrateWindow={
                replayDiagnostics.lazyActive
                  ? () => {
                      void hydrateTickWindow(selectedTick);
                    }
                  : null
              }
              onHydrateAll={
                replayDiagnostics.lazyActive
                  ? () => {
                      void hydrateAllLazyTicks();
                    }
                  : null
              }
            />
          ) : null}
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
                  <p className="panel-kicker">{replayLoadNotice.kicker}</p>
                  <h2>{replayLoadNotice.heading}</h2>
                </div>
                <span className="status-badge status-badge--subtle">{replayLoadProgress}%</span>
              </div>
              <div className="progress-track" aria-hidden="true">
                <div className="progress-fill" style={{ width: `${replayLoadProgress}%` }} />
              </div>
              <p className="panel-copy muted">{replayLoadNotice.message}</p>
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
              <p className="panel-copy muted">{parseErrors.length} item(s) could not be loaded from this run.</p>
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

          <section id="live-connection-panel" tabIndex={-1} className="panel detail-panel live-panel keyboard-panel-target">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">live connection</p>
                <h2>connection</h2>
                <p className="panel-copy muted">Connect to a live event stream and inspect incoming activity in the same view.</p>
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

              <div className="live-state-grid" aria-label="live session state">
                <div className="live-state-item">
                  <span className="live-state-label">view</span>
                  <strong>{liveViewModeLabel}</strong>
                </div>
                <div className="live-state-item">
                  <span className="live-state-label">buffer</span>
                  <strong>{livePinned ? livePinned.bufferedEvents.length.toLocaleString() : '0'}</strong>
                </div>
                <div className="live-state-item">
                  <span className="live-state-label">dropped payloads</span>
                  <strong>{livePayloadDropCount.toLocaleString()}</strong>
                </div>
                <div className="live-state-item">
                  <span className="live-state-label">reconnects</span>
                  <strong>{liveReconnectAttempts.toLocaleString()}</strong>
                </div>
              </div>

              {mode === 'live' && replay ? (
                <div className="live-control-group">
                  <div>
                    <p className="control-label">inspection mode</p>
                    <p className="panel-copy muted">
                      {livePinned
                        ? `Pinned at tick ${livePinned.pinnedAtTick}; incoming events are buffered until live resumes.`
                        : liveAutoFollow
                          ? 'Following the newest tick. Moving the scrubber switches to inspect mode.'
                          : 'Inspecting a selected tick while the live run can continue.'}
                    </p>
                  </div>
                  <div className="button-row">
                    {livePinned ? (
                      <button
                        type="button"
                        className="button-primary"
                        onClick={() => {
                          resumeLiveInspection();
                          addLiveHistory({
                            level: 'info',
                            message: `Resumed live flow with ${livePinned.bufferedEvents.length.toLocaleString()} buffered event(s)`,
                          });
                        }}
                      >
                        resume live
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button-ghost"
                        onClick={() => {
                          pinLiveInspection();
                          addLiveHistory({ level: 'info', message: `Pinned live inspection at tick ${selectedTick}` });
                        }}
                        disabled={liveStatus !== 'connected'}
                      >
                        pin current tick
                      </button>
                    )}
                  </div>
                </div>
              ) : null}

              {mode === 'live' && replay ? (
                <div className="button-row live-export-row">
                  <button type="button" className="button-ghost" onClick={() => void exportLiveCaptureBundle()} disabled={liveCaptureBusy}>
                    {liveCaptureBusy ? 'saving…' : 'save capture bundle'}
                  </button>
                  <span className="button-row-note muted">Bundles reopen from the replay loader with the same panels and navigation.</span>
                </div>
              ) : null}

              <div className="toggle-row">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={liveAutoFollow}
                    disabled={livePinned !== null}
                    onChange={(event) => setLiveAutoFollow(event.target.checked)}
                  />
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
              {livePinned ? ` · pinned at tick ${livePinned.pinnedAtTick}` : ''}
              {livePinned && livePinned.bufferedEvents.length > 0
                ? ` · ${livePinned.bufferedEvents.length.toLocaleString()} buffered event(s)`
                : ''}
              {liveUnexpectedCloseCount > 0 ? ` · ${liveUnexpectedCloseCount.toLocaleString()} dropped connection(s)` : ''}
              {liveLatestReconnect ? ` · ${liveLatestReconnect}` : ''}
            </p>
            {liveCaptureStatusMessage ? <p className="notice-inline notice-inline--success">{liveCaptureStatusMessage}</p> : null}
            {liveCaptureErrorMessage ? <p className="notice-inline notice-inline--error">{liveCaptureErrorMessage}</p> : null}

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
                  <p className="panel-kicker">selection</p>
                  <h2>details</h2>
                  <p className="panel-copy muted">Node history, blackboard changes, and tree source editing appear here once a replay is loaded.</p>
                </div>
              </div>
              <p className="panel-copy muted">Until then, use the loader above or connect to a live session from this sidebar.</p>
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}
