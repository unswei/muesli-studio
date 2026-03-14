import { presentationLayouts, type PresentationLayout } from '../publication';

interface PresentationToolbarProps {
  currentLayout: PresentationLayout;
  busy: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  onSelectLayout: (layout: PresentationLayout) => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportBundle: () => void;
  onClose: () => void;
}

const layoutLabels: Record<PresentationLayout, string> = {
  hero: 'overview',
  summary: 'summary',
  node: 'node',
  diff: 'diff',
  dsl: 'dsl',
};

export function PresentationToolbar({
  currentLayout,
  busy,
  statusMessage,
  errorMessage,
  onSelectLayout,
  onExportPng,
  onExportSvg,
  onExportBundle,
  onClose,
}: PresentationToolbarProps) {
  return (
    <div className="presentation-toolbar">
      <div className="presentation-toolbar-group">
        {presentationLayouts.map((layout) => (
          <button
            key={layout}
            type="button"
            className={currentLayout === layout ? 'button-primary presentation-chip' : 'button-ghost presentation-chip'}
            onClick={() => onSelectLayout(layout)}
            disabled={busy}
          >
            {layoutLabels[layout]}
          </button>
        ))}
      </div>

      <div className="presentation-toolbar-group">
        <button type="button" className="button-ghost" onClick={onExportPng} disabled={busy}>
          export PNG
        </button>
        <button type="button" className="button-ghost" onClick={onExportSvg} disabled={busy}>
          export SVG
        </button>
        <button type="button" className="button-primary" onClick={onExportBundle} disabled={busy}>
          export bundle
        </button>
        <button type="button" className="button-ghost" onClick={onClose} disabled={busy}>
          close
        </button>
      </div>

      {statusMessage ? <p className="presentation-toolbar-note notice-inline notice-inline--success">{statusMessage}</p> : null}
      {errorMessage ? <p className="presentation-toolbar-note notice-inline notice-inline--error">{errorMessage}</p> : null}
    </div>
  );
}
