import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { PresentationToolbar } from './PresentationToolbar';

describe('PresentationToolbar', () => {
  it('renders export controls for the active layout', () => {
    const markup = renderToStaticMarkup(
      <PresentationToolbar
        currentLayout="hero"
        busy={false}
        statusMessage={null}
        errorMessage="capture target not ready"
        onSelectLayout={vi.fn()}
        onExportPng={vi.fn()}
        onExportSvg={vi.fn()}
        onExportBundle={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(markup).toContain('overview');
    expect(markup).toContain('export PNG');
    expect(markup).toContain('export SVG');
    expect(markup).toContain('export bundle');
    expect(markup).toContain('capture target not ready');
  });
});
