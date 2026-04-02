import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ReplayDiagnosticsPanel } from './ReplayDiagnosticsPanel';

describe('ReplayDiagnosticsPanel', () => {
  it('renders replay mode, seek timing, and rough footprint details', () => {
    const markup = renderToStaticMarkup(
      <ReplayDiagnosticsPanel
        eventCount={2048}
        selectedTick={512}
        replayIndexed={true}
        lazyActive={true}
        sourceKind="file"
        sourceBytes={8 * 1024 * 1024}
        loadedBytesEstimate={2 * 1024 * 1024}
        loadedTickCount={64}
        knownTickCount={512}
        loadedCoveragePercent={12.5}
        highestTick={511}
        pendingTickCount={3}
        loadWarning="This large run loads nearby parts as needed so you can start inspecting sooner."
        seekStats={{
          count: 7,
          last_duration_ms: 3.6,
          mean_duration_ms: 2.4,
          max_duration_ms: 8.8,
          last_tick: 512,
          last_mode: 'hydrated',
          last_hydrated_ticks: 2,
        }}
        onHydrateWindow={() => {}}
        onHydrateAll={() => {}}
      />,
    );

    expect(markup).toContain('replay diagnostics');
    expect(markup).toContain('on-demand loading');
    expect(markup).toContain('local file');
    expect(markup).toContain('13%');
    expect(markup).toContain('rough memory use');
    expect(markup).toContain('load nearby');
    expect(markup).toContain('load all');
    expect(markup).toContain('loaded now');
    expect(markup).toContain('start inspecting sooner');
  });
});
