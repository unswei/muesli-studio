import { useEffect, useMemo, useState } from 'react';

import type { ReplayStore } from '@muesli/replay';

import { compileBtDsl, type CompiledBtDefinition } from '../dsl-compiler';

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
      types: [{ description: 'Behaviour tree DSL', accept: { 'text/plain': ['.dsl', '.bt', '.txt'] } }],
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraftDsl(sourceDsl);
    setStatusMessage(null);
    setErrorMessage(null);
  }, [sourceDsl]);

  const isDirty = draftDsl !== sourceDsl;
  const lineCount = useMemo(() => (draftDsl.length === 0 ? 0 : draftDsl.split(/\r?\n/).length), [draftDsl]);

  const onApply = () => {
    try {
      const compiled = compileBtDsl(draftDsl);
      onApplyCompiled(compiled);
      setStatusMessage(`Applied ${compiled.nodes.length} node(s), ${compiled.edges.length} edge(s).`);
      setErrorMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DSL compile failed';
      setErrorMessage(message);
      setStatusMessage(null);
    }
  };

  const onRevert = () => {
    setDraftDsl(sourceDsl);
    onResetCompiled();
    setStatusMessage('Reverted to runtime definition.');
    setErrorMessage(null);
  };

  const onSave = async () => {
    try {
      setIsSaving(true);
      const saveMode = await saveDslToDisk(draftDsl, runId);
      setStatusMessage(
        saveMode === 'picker' ? 'Saved DSL to selected file.' : 'Downloaded DSL file (browser save picker unavailable).',
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
    <div id="dsl-editor-panel" className="panel split-panel detail-panel detail-panel--editor">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">tree authoring</p>
          <h2>bt dsl</h2>
        </div>
        <span className="status-badge status-badge--subtle">{runId}</span>
      </div>
      <p className="panel-copy muted">Apply and revert DSL changes without losing the runtime definition you started from.</p>

      {sourceDsl.length === 0 ? (
        <p className="panel-empty-copy muted">No `bt_def.dsl` payload is available in this run.</p>
      ) : (
        <>
          <div className="dsl-toolbar">
            <button type="button" onClick={onApply} disabled={!isDirty || draftDsl.trim().length === 0}>
              apply
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

          {errorMessage ? <p className="dsl-error notice-inline notice-inline--error">{errorMessage}</p> : null}
          {statusMessage ? <p className="dsl-status notice-inline notice-inline--success">{statusMessage}</p> : null}

          <textarea
            className="dsl-editor"
            value={draftDsl}
            onChange={(event) => setDraftDsl(event.target.value)}
            aria-label="bt dsl text"
            spellCheck={false}
          />
        </>
      )}
    </div>
  );
}
