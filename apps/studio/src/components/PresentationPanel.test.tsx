import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { PresentationPanel } from './PresentationPanel';

describe('PresentationPanel', () => {
  it('renders layout actions and bundle export state', () => {
    const markup = renderToStaticMarkup(
      <PresentationPanel
        currentLayout="summary"
        selectedTick={3}
        selectedNodeId="4"
        busy={false}
        statusMessage="bundle ready"
        errorMessage={null}
        onOpenLayout={vi.fn()}
        onExportBundle={vi.fn()}
      />,
    );

    expect(markup).toContain('exports');
    expect(markup).toContain('overview');
    expect(markup).toContain('tick 3');
    expect(markup).toContain('node 4');
    expect(markup).toContain('export publication bundle');
    expect(markup).toContain('bundle ready');
  });
});
