// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseJsonlEvents, ReplayStore } from '@muesli/replay';

import { DslEditor } from './DslEditor';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..', '..');

interface RenderHarness {
  root: Root;
  container: HTMLDivElement;
  replay: ReplayStore;
}

function loadReplayFixture(): ReplayStore {
  const raw = readFileSync(path.join(rootDir, 'tools', 'fixtures', 'minimal_run.jsonl'), 'utf8');
  const parsed = parseJsonlEvents(raw);
  expect(parsed.errors).toHaveLength(0);

  const replay = new ReplayStore();
  replay.appendMany(parsed.events);
  return replay;
}

function renderEditor(
  onApplyCompiled: Parameters<typeof DslEditor>[0]['onApplyCompiled'] = () => {},
  onResetCompiled: Parameters<typeof DslEditor>[0]['onResetCompiled'] = () => {},
): RenderHarness {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const replay = loadReplayFixture();

  act(() => {
    root.render(<DslEditor replay={replay} onApplyCompiled={onApplyCompiled} onResetCompiled={onResetCompiled} />);
  });

  return { root, container, replay };
}

let rendered: RenderHarness[] = [];

beforeEach(() => {
  rendered = [];
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const view of rendered) {
    act(() => {
      view.root.unmount();
    });
    view.container.remove();
  }
  rendered = [];
});

describe('DslEditor', () => {
  it('supports apply and revert interactions', () => {
    const onApplyCompiled = vi.fn();
    const onResetCompiled = vi.fn();
    const view = renderEditor(onApplyCompiled, onResetCompiled);
    rendered.push(view);

    const textarea = view.container.querySelector('textarea');
    expect(textarea).toBeTruthy();
    let buttons = Array.from(view.container.querySelectorAll('button'));
    expect(buttons[0]).toBeTruthy();
    expect(buttons[1]).toBeTruthy();

    act(() => {
      if (!textarea) {
        return;
      }
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      valueSetter?.call(textarea, '(bt (sel (act recover) (act fallback)))');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    buttons = Array.from(view.container.querySelectorAll('button'));
    const applyButton = buttons[0];
    const revertButton = buttons[1];
    expect(applyButton?.hasAttribute('disabled')).toBe(false);

    act(() => {
      applyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onApplyCompiled).toHaveBeenCalledTimes(1);
    expect(onApplyCompiled.mock.calls[0]?.[0].dsl).toBe('(bt (sel (act recover) (act fallback)))');
    expect(view.container.textContent).toContain('Applied 3 node(s), 2 edge(s).');

    act(() => {
      revertButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onResetCompiled).toHaveBeenCalledTimes(1);
    expect(textarea?.value).toBe('(bt (seq (cond always-true) (act always-success)))');
    expect(view.container.textContent).toContain('Reverted to runtime definition.');
  });

  it('saves via browser save picker when available', async () => {
    const createWritable = vi.fn().mockResolvedValue({
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    });
    const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable });
    Object.defineProperty(window, 'showSaveFilePicker', {
      value: showSaveFilePicker,
      configurable: true,
      writable: true,
    });

    const view = renderEditor();
    rendered.push(view);
    const saveButton = Array.from(view.container.querySelectorAll('button'))[2];
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(createWritable).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain('Saved DSL to selected file.');
  });

  it('falls back to browser download when save picker is unavailable', async () => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const createObjectUrl = vi.fn().mockReturnValue('blob:test-dsl');
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectUrl, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectUrl, configurable: true, writable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const view = renderEditor();
    rendered.push(view);
    const saveButton = Array.from(view.container.querySelectorAll('button'))[2];
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain('Downloaded DSL file');
  });
});
