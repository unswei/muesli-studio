import { useEffect, useMemo, useState } from 'react';

import type { ReplayStore } from '@muesli/replay';

import { compileBtDsl, type CompiledBtDefinition } from '../dsl-compiler';
import {
  buildStructuralPreview,
  compiledToPreviewTreeDefinition,
  toPreviewTreeDefinition,
  type StructuralPreview,
} from '../dsl-preview';

interface DslEditorProps {
  replay: ReplayStore;
  onApplyCompiled: (compiled: CompiledBtDefinition) => void;
  onResetCompiled: () => void;
}

type SaveMode = 'picker' | 'download';

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept?: Record<string, string[]> }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

async function saveDslToDisk(dsl: string, runId: string): Promise<SaveMode> {
  const suggestedName = `${runId || 'runtime'}.dsl`;

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('save is only available in browser mode');
  }

  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (picker) {
    const handle = await picker({
      suggestedName,
      types: [{ description: 'Behaviour tree source', accept: { 'text/plain': ['.dsl', '.bt', '.txt'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(dsl);
    await writable.close();
    return 'picker';
  }

  const blob = new Blob([dsl], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    link.rel = 'noopener';
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }

  return 'download';
}

export function DslEditor({ replay, onApplyCompiled, onResetCompiled }: DslEditorProps) {
  const rawDsl = replay.btDef?.data.dsl;
  const sourceDsl = typeof rawDsl === 'string' ? rawDsl : '';
  const hasOverride = replay.hasBtDefOverride;
  const runId = replay.runStart?.run_id ?? 'runtime';

  const [draftDsl, setDraftDsl] = useState(sourceDsl);
  const [previewCompiled, setPreviewCompiled] = useState<CompiledBtDefinition | null>(null);
  const [previewSource, setPreviewSource] = useState<string | null>(null);
  const [previewSummary, setPreviewSummary] = useState<StructuralPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraftDsl(sourceDsl);
    setPreviewCompiled(null);
    setPreviewSource(null);
    setPreviewSummary(null);
    setPreviewError(null);
    setStatusMessage(null);
    setErrorMessage(null);
  }, [sourceDsl]);

  const isDirty = draftDsl !== sourceDsl;
  const lineCount = useMemo(() => (draftDsl.length === 0 ? 0 : draftDsl.split(/\r?\n/).length), [draftDsl]);
  const currentDefinition = useMemo(
    () =>
      toPreviewTreeDefinition({
        dsl: sourceDsl,
        nodes: replay.btDef?.data.nodes,
        edges: replay.btDef?.data.edges,
      }),
    [replay.btDef, sourceDsl],
  );
  const canPreview = draftDsl.trim().length > 0 && isDirty && draftDsl !== previewSource;
  const canApplyPreview = previewCompiled !== null && previewSource === draftDsl;

  const clearPreview = () => {
    setPreviewCompiled(null);
    setPreviewSource(null);
    setPreviewSummary(null);
    setPreviewError(null);
  };

  const onPreview = () => {
    try {
      const compiled = compileBtDsl(draftDsl);
      const compiledPreview = compiledToPreviewTreeDefinition(compiled);
      setPreviewCompiled(compiled);
      setPreviewSource(draftDsl);
      setPreviewSummary(currentDefinition ? buildStructuralPreview(currentDefinition, compiledPreview) : null);
      setPreviewError(null);
      setStatusMessage(null);
      setErrorMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'tree source could not be previewed';
      clearPreview();
      setPreviewError(message);
      setErrorMessage(null);
      setStatusMessage(null);
    }
  };

  const onApplyPreview = () => {
    if (!previewCompiled || previewSource !== draftDsl) {
      return;
    }
    onApplyCompiled(previewCompiled);
    setStatusMessage(`Applied preview: ${previewCompiled.nodes.length} node(s), ${previewCompiled.edges.length} edge(s).`);
    setErrorMessage(null);
    setPreviewError(null);
  };

  const onRevert = () => {
    setDraftDsl(sourceDsl);
    clearPreview();
    onResetCompiled();
    setStatusMessage('Reverted to the starting tree.');
    setErrorMessage(null);
  };

  const onSave = async () => {
    try {
      setIsSaving(true);
      const saveMode = await saveDslToDisk(draftDsl, runId);
      setStatusMessage(
        saveMode === 'picker'
          ? 'Saved tree source to the selected file.'
          : 'Downloaded the tree source file (browser save picker unavailable).',
      );
      setErrorMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'save failed';
      setErrorMessage(message);
      setStatusMessage(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div id="dsl-editor-panel" tabIndex={-1} className="panel split-panel detail-panel detail-panel--editor keyboard-panel-target">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">tree authoring</p>
          <h2>tree source</h2>
        </div>
        <span className="status-badge status-badge--subtle">{runId}</span>
      </div>
      <p className="panel-copy muted">Preview tree source changes before applying them to this replay.</p>

      {sourceDsl.length === 0 ? (
        <p className="panel-empty-copy muted">No editable tree source is available in this run.</p>
      ) : (
        <>
          <div className="dsl-toolbar">
            <button type="button" onClick={onPreview} disabled={!canPreview}>
              preview
            </button>
            <button type="button" onClick={onApplyPreview} disabled={!canApplyPreview}>
              apply preview
            </button>
            <button type="button" onClick={onRevert} disabled={!isDirty && !hasOverride}>
              revert
            </button>
            <button type="button" onClick={onSave} disabled={draftDsl.trim().length === 0 || isSaving}>
              {isSaving ? 'saving...' : 'save'}
            </button>
            <span className="dsl-meta">
              {lineCount} line(s) · {draftDsl.length} chars
            </span>
          </div>

          {previewError ? <p className="dsl-error notice-inline notice-inline--error">{previewError}</p> : null}
          {errorMessage ? <p className="dsl-error notice-inline notice-inline--error">{errorMessage}</p> : null}
          {statusMessage ? <p className="dsl-status notice-inline notice-inline--success">{statusMessage}</p> : null}
          {previewSummary ? (
            <div className="dsl-preview notice-inline notice-inline--info">
              <p className="dsl-preview-summary">
                preview: {previewSummary.nodeCount} node(s), {previewSummary.edgeCount} edge(s), {previewSummary.changedCount}{' '}
                changed
              </p>
              {previewSummary.changes.length > 0 ? (
                <ul className="dsl-preview-list">
                  {previewSummary.changes.map((change, index) => {
                    const key = `${change.type}-${change.path}-${index}`;
                    if (change.type === 'added') {
                      return (
                        <li key={key}>
                          added <code>{change.path}</code>: {change.label}
                        </li>
                      );
                    }
                    if (change.type === 'removed') {
                      return (
                        <li key={key}>
                          removed <code>{change.path}</code>: {change.label}
                        </li>
                      );
                    }
                    if (change.type === 'reordered') {
                      return (
                        <li key={key}>
                          reordered <code>{change.path}</code>: {change.before}
                          {' -> '}
                          {change.after}
                        </li>
                      );
                    }
                    return (
                      <li key={key}>
                        changed <code>{change.path}</code>: {change.before}
                        {' -> '}
                        {change.after}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="dsl-preview-empty">No structural changes from the applied tree.</p>
              )}
            </div>
          ) : null}

          <textarea
            className="dsl-editor"
            value={draftDsl}
            onChange={(event) => {
              const nextDraft = event.target.value;
              setDraftDsl(nextDraft);
              if (nextDraft !== previewSource) {
                clearPreview();
              }
              setStatusMessage(null);
            }}
            aria-label="tree source text"
            spellCheck={false}
          />
        </>
      )}
    </div>
  );
}
