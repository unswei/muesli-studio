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

function loadReplayFixture(fixturePath = path.join(rootDir, 'tools', 'fixtures', 'minimal_run.jsonl')): ReplayStore {
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed = parseJsonlEvents(raw);
  expect(parsed.errors).toHaveLength(0);

  const replay = new ReplayStore();
  replay.appendMany(parsed.events);
  return replay;
}

function renderEditor(
  onApplyCompiled: Parameters<typeof DslEditor>[0]['onApplyCompiled'] = () => {},
  onResetCompiled: Parameters<typeof DslEditor>[0]['onResetCompiled'] = () => {},
  replay: ReplayStore = loadReplayFixture(),
): RenderHarness {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<DslEditor replay={replay} onApplyCompiled={onApplyCompiled} onResetCompiled={onResetCompiled} />);
  });

  return { root, container, replay };
}

let rendered: RenderHarness[] = [];

function buttonsFor(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'));
}

function setTextAreaValue(textarea: HTMLTextAreaElement | null, value: string): void {
  if (!textarea) {
    return;
  }
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  valueSetter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('blob read failed')));
    reader.readAsText(blob);
  });
}

function studioDemoReplay(): ReplayStore {
  return loadReplayFixture(path.join(rootDir, 'tests', 'fixtures', 'studio_demo', 'events.jsonl'));
}

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
  it('previews changes before applying them to replay', () => {
    const onApplyCompiled = vi.fn();
    const onResetCompiled = vi.fn();
    const view = renderEditor(onApplyCompiled, onResetCompiled);
    rendered.push(view);

    const textarea = view.container.querySelector('textarea');
    expect(textarea).toBeTruthy();
    let buttons = buttonsFor(view.container);
    expect(buttons[0]?.textContent).toBe('preview');
    expect(buttons[1]?.textContent).toBe('apply preview');
    expect(buttons[1]?.hasAttribute('disabled')).toBe(true);

    act(() => {
      setTextAreaValue(textarea, '(bt (sel (act recover) (act fallback)))');
    });
    expect(onApplyCompiled).not.toHaveBeenCalled();

    buttons = buttonsFor(view.container);
    const previewButton = buttons[0];
    const applyPreviewButton = buttons[1];
    expect(previewButton?.hasAttribute('disabled')).toBe(false);
    expect(applyPreviewButton?.hasAttribute('disabled')).toBe(true);

    act(() => {
      previewButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onApplyCompiled).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain('preview: 3 node(s), 2 edge(s); 3 change(s)');
    expect(view.container.textContent).toContain('renamed 1');
    expect(view.container.textContent).toContain('changed 2');
    const diffRows = Array.from(view.container.querySelectorAll('details.dsl-diff-row'));
    expect(diffRows).toHaveLength(3);
    expect(diffRows.every((row) => !row.hasAttribute('open'))).toBe(true);

    buttons = buttonsFor(view.container);
    expect(buttons[1]?.hasAttribute('disabled')).toBe(false);

    const firstSummary = diffRows[0]?.querySelector('summary');
    act(() => {
      firstSummary?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(diffRows[0]?.hasAttribute('open')).toBe(true);
    expect(diffRows[0]?.textContent).toContain('before path');
    expect(diffRows[0]?.textContent).toContain('after path');

    act(() => {
      buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onApplyCompiled).toHaveBeenCalledTimes(1);
    expect(onApplyCompiled.mock.calls[0]?.[0].dsl).toBe('(bt (sel (act recover) (act fallback)))');
    expect(view.container.textContent).toContain('Applied preview: 3 node(s), 2 edge(s).');
  });

  it('requires a fresh preview after draft changes', () => {
    const onApplyCompiled = vi.fn();
    const view = renderEditor(onApplyCompiled);
    rendered.push(view);

    const textarea = view.container.querySelector('textarea');
    act(() => {
      setTextAreaValue(textarea, '(bt (sel (act recover) (act fallback)))');
    });

    act(() => {
      buttonsFor(view.container)[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(buttonsFor(view.container)[1]?.hasAttribute('disabled')).toBe(false);
    expect(view.container.querySelectorAll('details.dsl-diff-row')).toHaveLength(3);

    act(() => {
      setTextAreaValue(textarea, '(bt (sel (act recover) (act fallback) (act finalise)))');
    });

    expect(buttonsFor(view.container)[1]?.hasAttribute('disabled')).toBe(true);
    expect(view.container.textContent).not.toContain('preview:');
    expect(view.container.querySelectorAll('details.dsl-diff-row')).toHaveLength(0);

    act(() => {
      buttonsFor(view.container)[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onApplyCompiled).not.toHaveBeenCalled();
  });

  it('clears stale preview when draft source is invalid', () => {
    const onApplyCompiled = vi.fn();
    const view = renderEditor(onApplyCompiled);
    rendered.push(view);

    const textarea = view.container.querySelector('textarea');
    act(() => {
      setTextAreaValue(textarea, '(bt (sel (act recover) (act fallback)))');
    });
    act(() => {
      buttonsFor(view.container)[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(view.container.textContent).toContain('preview:');

    act(() => {
      setTextAreaValue(textarea, '(bt (seq (act missing)');
    });
    act(() => {
      buttonsFor(view.container)[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(view.container.textContent).toContain('syntax');
    expect(view.container.textContent).toContain('line 1, column 5');
    expect(view.container.textContent).toContain('A `)` to close this list.');
    expect(view.container.textContent).toContain('Add a matching `)` for the list that starts here.');
    expect(view.container.textContent).not.toContain('preview:');
    expect(buttonsFor(view.container)[1]?.hasAttribute('disabled')).toBe(true);
    expect(onApplyCompiled).not.toHaveBeenCalled();
  });

  it('renders unsupported forms as structured diagnostics', () => {
    const view = renderEditor();
    rendered.push(view);

    const textarea = view.container.querySelector('textarea');
    act(() => {
      setTextAreaValue(textarea, '(bt (par (act a)))');
    });
    act(() => {
      buttonsFor(view.container)[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(view.container.textContent).toContain('unsupported form');
    expect(view.container.textContent).toContain('Studio preview does not support `par` yet.');
    expect(view.container.textContent).toContain('Studio preview supports `seq`, `sel`, `act`, `cond`, and `dec` here.');
    expect(view.container.textContent).not.toContain('Error:');
  });

  it('shows unstable identity warnings alongside successful preview', () => {
    const view = renderEditor();
    rendered.push(view);

    const textarea = view.container.querySelector('textarea');
    act(() => {
      setTextAreaValue(textarea, '(bt (seq (act plan) (act plan)))');
    });
    act(() => {
      buttonsFor(view.container)[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(view.container.textContent).toContain('preview:');
    expect(view.container.textContent).toContain('unstable identity');
    expect(view.container.textContent).toContain('Sibling nodes have the same signature.');
    expect(buttonsFor(view.container)[1]?.hasAttribute('disabled')).toBe(false);
  });

  it('warns when removed runtime-history nodes no longer exist in the draft tree', () => {
    const view = renderEditor(vi.fn(), vi.fn(), studioDemoReplay());
    rendered.push(view);

    const textarea = view.container.querySelector('textarea');
    act(() => {
      setTextAreaValue(textarea, '(bt (seq (cond localisation-ready)))');
    });
    act(() => {
      buttonsFor(view.container)[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(view.container.textContent).toContain('runtime nodes no longer exist in the draft tree');
    expect(buttonsFor(view.container)[1]?.hasAttribute('disabled')).toBe(false);
  });

  it('warns when changed runtime-history nodes change kind or structure', () => {
    const view = renderEditor(vi.fn(), vi.fn(), studioDemoReplay());
    rendered.push(view);

    const textarea = view.container.querySelector('textarea');
    act(() => {
      setTextAreaValue(
        textarea,
        '(bt (seq (act localisation-ready) (seq (act plan-global-path) (act dispatch-controller-job)) (cond goal-reached)))',
      );
    });
    act(() => {
      buttonsFor(view.container)[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(view.container.textContent).toContain('1 runtime node changed kind or structure.');
    expect(buttonsFor(view.container)[1]?.hasAttribute('disabled')).toBe(false);
  });

  it('does not warn for renamed runtime-history nodes', () => {
    const view = renderEditor(vi.fn(), vi.fn(), studioDemoReplay());
    rendered.push(view);

    const textarea = view.container.querySelector('textarea');
    act(() => {
      setTextAreaValue(
        textarea,
        '(bt (seq (cond localisation-ready) (seq (act plan-route) (act dispatch-controller-job)) (cond goal-reached)))',
      );
    });
    act(() => {
      buttonsFor(view.container)[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(view.container.textContent).toContain('renamed');
    expect(view.container.textContent).not.toContain('run mismatch');
  });

  it('does not warn for reordered runtime-history nodes', () => {
    const view = renderEditor(vi.fn(), vi.fn(), studioDemoReplay());
    rendered.push(view);

    const textarea = view.container.querySelector('textarea');
    act(() => {
      setTextAreaValue(
        textarea,
        '(bt (seq (cond localisation-ready) (cond goal-reached) (seq (act plan-global-path) (act dispatch-controller-job))))',
      );
    });
    act(() => {
      buttonsFor(view.container)[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(view.container.textContent).toContain('reordered');
    expect(view.container.textContent).not.toContain('run mismatch');
  });

  it('reverts the draft and clears preview state', () => {
    const onApplyCompiled = vi.fn();
    const onResetCompiled = vi.fn();
    const view = renderEditor(onApplyCompiled, onResetCompiled);
    rendered.push(view);

    const textarea = view.container.querySelector('textarea');
    act(() => {
      setTextAreaValue(textarea, '(bt (sel (act recover) (act fallback)))');
    });
    act(() => {
      buttonsFor(view.container)[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(view.container.textContent).toContain('preview:');

    act(() => {
      buttonsFor(view.container)[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onResetCompiled).toHaveBeenCalledTimes(1);
    expect(textarea?.value).toBe('(bt (seq (cond always-true) (act always-success)))');
    expect(view.container.textContent).toContain('Reverted to the starting tree.');
    expect(view.container.textContent).not.toContain('preview:');
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
    const saveButton = buttonsFor(view.container)[3];
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(createWritable).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain('Saved tree source to the selected file.');
  });

  it('falls back to browser download for the current draft when save picker is unavailable', async () => {
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
    const textarea = view.container.querySelector('textarea');
    act(() => {
      setTextAreaValue(textarea, '(bt (seq (act saved-draft)))');
    });
    const saveButton = buttonsFor(view.container)[3];
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const savedBlob = createObjectUrl.mock.calls[0]?.[0] as Blob | undefined;
    expect(savedBlob).toBeInstanceOf(Blob);
    await expect(blobToText(savedBlob as Blob)).resolves.toBe('(bt (seq (act saved-draft)))');
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain('Downloaded the tree source file');
  });
});
