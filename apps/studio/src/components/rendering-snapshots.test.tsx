import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { parseJsonlEvents, ReplayStore } from '@muesli/replay';

import { BlackboardDiff } from './BlackboardDiff';
import { NodeInspector } from './NodeInspector';
import { TreeView } from './TreeView';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..', '..');

function loadReplayFixture(): ReplayStore {
  const raw = readFileSync(path.join(rootDir, 'tools', 'fixtures', 'minimal_run.jsonl'), 'utf8');
  const parsed = parseJsonlEvents(raw);
  expect(parsed.errors).toHaveLength(0);

  const replay = new ReplayStore();
  replay.appendMany(parsed.events);
  return replay;
}

describe('studio rendering snapshots', () => {
  it('keeps tree, inspector, and blackboard panels stable for fixture replay ticks', () => {
    const replay = loadReplayFixture();

    const snapshots = {
      treeTick1: renderToStaticMarkup(
        <TreeView replay={replay} selectedTick={1} selectedNodeId="1" onSelectNode={() => {}} />,
      ),
      treeTick2: renderToStaticMarkup(
        <TreeView replay={replay} selectedTick={2} selectedNodeId="3" onSelectNode={() => {}} />,
      ),
      inspectorTick2: renderToStaticMarkup(<NodeInspector replay={replay} selectedNodeId="3" tick={2} />),
      blackboardTick1: renderToStaticMarkup(<BlackboardDiff replay={replay} tick={1} />),
      blackboardTick2: renderToStaticMarkup(<BlackboardDiff replay={replay} tick={2} />),
    };

    expect(snapshots).toMatchSnapshot();
  });
});
