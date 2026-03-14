import { presentationLayouts, type PresentationLayout } from '../publication';

interface PresentationPanelProps {
  currentLayout: PresentationLayout | null;
  selectedTick: number;
  selectedNodeId: string | null;
  busy: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  onOpenLayout: (layout: PresentationLayout) => void;
  onExportBundle: () => void;
}

const layoutLabels: Record<PresentationLayout, string> = {
  hero: 'overview',
  summary: 'summary',
  node: 'node',
  diff: 'diff',
  dsl: 'dsl',
};

export function PresentationPanel({
  currentLayout,
  selectedTick,
  selectedNodeId,
  busy,
  statusMessage,
  errorMessage,
  onOpenLayout,
  onExportBundle,
}: PresentationPanelProps) {
  return (
    <section className="panel detail-panel presentation-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">presentation</p>
          <h2>capture</h2>
          <p className="panel-copy muted">Switch into a clean layout for screenshots, then export PNG, SVG, or a bundled supplement.</p>
        </div>
        {currentLayout ? <span className="status-badge status-badge--subtle">{layoutLabels[currentLayout]}</span> : null}
      </div>

      <div className="presentation-layout-grid">
        {presentationLayouts.map((layout) => (
          <button
            key={layout}
            type="button"
            className={currentLayout === layout ? 'button-primary presentation-chip' : 'button-ghost presentation-chip'}
            onClick={() => onOpenLayout(layout)}
            disabled={busy}
          >
            {layoutLabels[layout]}
          </button>
        ))}
      </div>

      <p className="panel-empty-copy muted">
        Current selection: tick {selectedTick}
        {selectedNodeId ? ` · node ${selectedNodeId}` : ''}
      </p>

      <button type="button" className="button-primary presentation-bundle-button" onClick={onExportBundle} disabled={busy}>
        {busy ? 'exporting…' : 'export paper bundle'}
      </button>

      {statusMessage ? <p className="notice-inline notice-inline--success">{statusMessage}</p> : null}
      {errorMessage ? <p className="notice-inline notice-inline--error">{errorMessage}</p> : null}
    </section>
  );
}
