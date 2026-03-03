import type { ReplayStore } from '@muesli/replay';

interface DslEditorProps {
  replay: ReplayStore;
}

export function DslEditor({ replay }: DslEditorProps) {
  const rawDsl = replay.btDef?.data.dsl;
  const dsl = typeof rawDsl === 'string' ? rawDsl : '';

  return (
    <div className="panel split-panel">
      <h2>bt dsl</h2>
      {dsl.length === 0 ? (
        <p className="muted">No `bt_def.dsl` payload is available in this run.</p>
      ) : (
        <textarea className="dsl-editor" value={dsl} readOnly aria-label="bt dsl text" />
      )}
    </div>
  );
}

