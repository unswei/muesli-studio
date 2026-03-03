import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { parseJsonlEvents, ReplayStore } from '@muesli/replay';

import { DslEditor } from './DslEditor';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..', '..');

describe('DslEditor', () => {
  it('renders bt_def.dsl text when present', () => {
    const raw = readFileSync(path.join(rootDir, 'tools', 'fixtures', 'minimal_run.jsonl'), 'utf8');
    const parsed = parseJsonlEvents(raw);
    expect(parsed.errors).toHaveLength(0);

    const replay = new ReplayStore();
    replay.appendMany(parsed.events);

    const markup = renderToStaticMarkup(
      <DslEditor replay={replay} onApplyCompiled={() => {}} onResetCompiled={() => {}} />,
    );
    expect(markup).toContain('(bt (seq (cond always-true) (act always-success)))');
    expect(markup).toContain('textarea');
    expect(markup).toContain('apply');
    expect(markup).toContain('save');
  });
});
