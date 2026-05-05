export type DslDiagnosticKind = 'syntax' | 'validation' | 'unsupported-form' | 'unstable-identity' | 'run-mismatch';
export type DslDiagnosticSeverity = 'error' | 'warning';

export interface DslDiagnostic {
  kind: DslDiagnosticKind;
  severity: DslDiagnosticSeverity;
  message: string;
  expected: string;
  line?: number;
  column?: number;
  hint?: string;
}

export interface CompiledBtDefinition {
  dsl: string;
  nodes: Array<{ id: number; kind: string; name: string }>;
  edges: Array<{ parent: number; child: number; index: number }>;
  diagnostics: DslDiagnostic[];
}

interface Token {
  value: string;
  line: number;
  column: number;
}

type SExpr = AtomExpr | ListExpr;

interface AtomExpr {
  type: 'atom';
  value: string;
  line: number;
  column: number;
}

interface ListExpr {
  type: 'list';
  items: SExpr[];
  line: number;
  column: number;
}

const supportedComposites = new Set(['seq', 'sel']);
const supportedLeaves = new Set(['act', 'cond', 'dec']);
const supportedNodeHeads = new Set([...supportedComposites, ...supportedLeaves]);

export class DslCompileError extends Error {
  readonly diagnostics: DslDiagnostic[];

  constructor(diagnostics: DslDiagnostic[]) {
    super(diagnostics[0]?.message ?? 'tree source could not be previewed');
    this.name = 'DslCompileError';
    this.diagnostics = diagnostics;
  }
}

function diagnostic(input: Omit<DslDiagnostic, 'severity'> & { severity?: DslDiagnosticSeverity }): DslDiagnostic {
  return {
    severity: input.severity ?? 'error',
    ...input,
  };
}

function throwDiagnostic(input: Omit<DslDiagnostic, 'severity'> & { severity?: DslDiagnosticSeverity }): never {
  throw new DslCompileError([diagnostic(input)]);
}

function locationForIndex(input: string, index: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (input[cursor] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;

  const advance = (ch: string) => {
    index += 1;
    if (ch === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  };

  while (index < input.length) {
    const ch = input[index];
    if (!ch) {
      break;
    }

    if (/\s/.test(ch)) {
      advance(ch);
      continue;
    }

    if (ch === ';') {
      while (index < input.length && input[index] !== '\n') {
        advance(input[index] ?? '');
      }
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ value: ch, line, column });
      advance(ch);
      continue;
    }

    if (ch === '"') {
      const startLine = line;
      const startColumn = column;
      let value = '"';
      advance(ch);
      let closed = false;
      while (index < input.length) {
        const current = input[index];
        if (!current) {
          break;
        }
        value += current;
        advance(current);
        if (current === '"' && value[value.length - 2] !== '\\') {
          closed = true;
          break;
        }
      }
      if (!closed) {
        throwDiagnostic({
          kind: 'syntax',
          message: 'String literal is missing a closing quote.',
          expected: 'Close the string with `"`.',
          line: startLine,
          column: startColumn,
          hint: 'Add the missing quote, or remove the opening quote if the name should be a symbol.',
        });
      }
      tokens.push({ value, line: startLine, column: startColumn });
      continue;
    }

    const start = index;
    const startLine = line;
    const startColumn = column;
    while (index < input.length && !/\s/.test(input[index] ?? '') && input[index] !== '(' && input[index] !== ')') {
      advance(input[index] ?? '');
    }
    tokens.push({ value: input.slice(start, index), line: startLine, column: startColumn });
  }

  return tokens;
}

function parseSExpr(tokens: Token[], source: string): SExpr[] {
  let cursor = 0;

  function parseOne(): SExpr {
    const token = tokens[cursor];
    if (!token) {
      const loc = locationForIndex(source, source.length);
      throwDiagnostic({
        kind: 'syntax',
        message: 'Tree source ended before the expression was complete.',
        expected: 'A complete behaviour tree expression.',
        line: loc.line,
        column: loc.column,
        hint: 'Check for a missing closing parenthesis near the end of the draft.',
      });
    }

    if (token.value === '(') {
      cursor += 1;
      const list: SExpr[] = [];
      while (cursor < tokens.length && tokens[cursor]?.value !== ')') {
        list.push(parseOne());
      }
      if (tokens[cursor]?.value !== ')') {
        throwDiagnostic({
          kind: 'syntax',
          message: 'Missing closing parenthesis.',
          expected: 'A `)` to close this list.',
          line: token.line,
          column: token.column,
          hint: 'Add a matching `)` for the list that starts here.',
        });
      }
      cursor += 1;
      return { type: 'list', items: list, line: token.line, column: token.column };
    }

    if (token.value === ')') {
      throwDiagnostic({
        kind: 'syntax',
        message: 'Unexpected closing parenthesis.',
        expected: 'An opening `(` before this `)`, or remove the extra closing parenthesis.',
        line: token.line,
        column: token.column,
        hint: 'Remove this `)`, or add the missing list start before it.',
      });
    }

    cursor += 1;
    return { type: 'atom', value: token.value, line: token.line, column: token.column };
  }

  const out: SExpr[] = [];
  while (cursor < tokens.length) {
    out.push(parseOne());
  }
  return out;
}

function asSymbol(value: SExpr): string | null {
  if (value.type !== 'atom') {
    return null;
  }

  if (value.value.length >= 2 && value.value.startsWith('"') && value.value.endsWith('"')) {
    return value.value.slice(1, -1);
  }

  return value.value;
}

function resolveTreeRoot(expressions: SExpr[]): SExpr {
  if (expressions.length === 0) {
    throwDiagnostic({
      kind: 'syntax',
      message: 'Tree source is empty.',
      expected: 'A `(bt ...)`, `(defbt name ...)`, or direct tree expression.',
      line: 1,
      column: 1,
      hint: 'Start with a behaviour tree form such as `(bt (seq (act run)))`.',
    });
  }

  const first = expressions[0];
  if (!first) {
    throwDiagnostic({
      kind: 'syntax',
      message: 'Tree source is empty.',
      expected: 'A behaviour tree expression.',
      line: 1,
      column: 1,
    });
  }

  if (first.type !== 'list') {
    return first;
  }

  if (first.items.length === 0) {
    throwDiagnostic({
      kind: 'syntax',
      message: 'Empty list is not a valid tree.',
      expected: 'A node form such as `(seq ...)`, `(sel ...)`, `(act name)`, `(cond name)`, or `(dec name)`.',
      line: first.line,
      column: first.column,
      hint: 'Add a node head after the opening parenthesis.',
    });
  }

  const firstHead = first.items[0];
  if (!firstHead) {
    throwDiagnostic({
      kind: 'syntax',
      message: 'Node head is missing.',
      expected: 'A node symbol.',
      line: first.line,
      column: first.column,
    });
  }

  const head = asSymbol(firstHead);
  if (head === 'defbt') {
    if (first.items.length < 3) {
      throwDiagnostic({
        kind: 'syntax',
        message: '`defbt` requires a name and a tree expression.',
        expected: '`(defbt name (seq ...))`.',
        line: first.line,
        column: first.column,
        hint: 'Add the tree expression after the behaviour tree name.',
      });
    }
    const treeExpr = first.items[2];
    if (!treeExpr) {
      throwDiagnostic({
        kind: 'syntax',
        message: '`defbt` requires a tree expression.',
        expected: '`(defbt name (seq ...))`.',
        line: first.line,
        column: first.column,
      });
    }
    return treeExpr;
  }

  if (head === 'bt') {
    if (first.items.length < 2) {
      throwDiagnostic({
        kind: 'syntax',
        message: '`bt` requires a tree expression.',
        expected: '`(bt (seq ...))`.',
        line: first.line,
        column: first.column,
        hint: 'Add a node form inside the `bt` wrapper.',
      });
    }
    const treeExpr = first.items[1];
    if (!treeExpr) {
      throwDiagnostic({
        kind: 'syntax',
        message: '`bt` requires a tree expression.',
        expected: '`(bt (seq ...))`.',
        line: first.line,
        column: first.column,
      });
    }
    return treeExpr;
  }

  return first;
}

function isAtomicNode(kind: string): boolean {
  return supportedLeaves.has(kind);
}

function childSignature(expr: SExpr): string | null {
  if (expr.type !== 'list' || expr.items.length === 0) {
    return null;
  }

  const head = expr.items[0];
  if (!head) {
    return null;
  }
  const kind = asSymbol(head);
  if (!kind) {
    return null;
  }
  const second = expr.items[1];
  const name = isAtomicNode(kind) && second ? (asSymbol(second) ?? kind) : kind;
  return `${kind}:${name}`;
}

function duplicateSiblingDiagnostics(expr: ListExpr): DslDiagnostic[] {
  const seen = new Map<string, SExpr>();
  const diagnostics: DslDiagnostic[] = [];
  for (let index = 1; index < expr.items.length; index += 1) {
    const child = expr.items[index];
    if (!child) {
      continue;
    }
    const signature = childSignature(child);
    if (!signature) {
      continue;
    }
    const first = seen.get(signature);
    if (first) {
      diagnostics.push(
        diagnostic({
          kind: 'unstable-identity',
          severity: 'warning',
          message: 'Sibling nodes have the same signature.',
          expected: 'Unique sibling node names where practical.',
          line: child.line,
          column: child.column,
          hint: 'Rename one sibling so preview diff matching can stay precise.',
        }),
      );
    } else {
      seen.set(signature, child);
    }
  }
  return diagnostics;
}

export function compileBtDsl(dsl: string): CompiledBtDefinition {
  const tokens = tokenize(dsl);
  const expressions = parseSExpr(tokens, dsl);
  const rootExpr = resolveTreeRoot(expressions);
  const diagnostics: DslDiagnostic[] = [];

  const nodes: Array<{ id: number; kind: string; name: string }> = [];
  const edges: Array<{ parent: number; child: number; index: number }> = [];
  let nextId = 1;

  const visit = (expr: SExpr, parentId: number | null, childIndex: number): number => {
    if (expr.type === 'atom') {
      if (parentId === null) {
        throwDiagnostic({
          kind: 'validation',
          message: 'Tree root must be a node form.',
          expected: 'A node form such as `(seq ...)`, `(sel ...)`, `(act name)`, `(cond name)`, or `(dec name)`.',
          line: expr.line,
          column: expr.column,
          hint: 'Wrap the root in a supported behaviour tree node form.',
        });
      }
      const id = nextId;
      nextId += 1;
      nodes.push({ id, kind: 'sym', name: asSymbol(expr) ?? 'sym' });
      if (parentId !== null) {
        edges.push({ parent: parentId, child: id, index: childIndex });
      }
      return id;
    }

    if (expr.items.length === 0) {
      throwDiagnostic({
        kind: 'syntax',
        message: 'Empty list is not a valid node.',
        expected: 'A node form such as `(seq ...)`, `(sel ...)`, `(act name)`, `(cond name)`, or `(dec name)`.',
        line: expr.line,
        column: expr.column,
        hint: 'Add a supported node head after the opening parenthesis.',
      });
    }

    const head = expr.items[0];
    if (!head) {
      throwDiagnostic({
        kind: 'syntax',
        message: 'Node head is missing.',
        expected: 'A node symbol.',
        line: expr.line,
        column: expr.column,
      });
    }

    const rawKind = asSymbol(head);
    if (!rawKind) {
      throwDiagnostic({
        kind: 'syntax',
        message: 'Node head must be a symbol.',
        expected: '`seq`, `sel`, `act`, `cond`, or `dec`.',
        line: head.line,
        column: head.column,
        hint: 'Use a symbol as the first value in the node list.',
      });
    }

    if (!supportedNodeHeads.has(rawKind)) {
      throwDiagnostic({
        kind: 'unsupported-form',
        message: `Studio preview does not support \`${rawKind}\` yet.`,
        expected: 'Studio preview supports `seq`, `sel`, `act`, `cond`, and `dec` here.',
        line: head.line,
        column: head.column,
        hint: 'Use a supported tree node form for preview, or keep this edit outside Studio for now.',
      });
    }

    const kind = rawKind;
    const id = nextId;
    nextId += 1;

    const second = expr.items[1];
    const displayName = isAtomicNode(kind) && second !== undefined ? (asSymbol(second) ?? kind) : kind;

    nodes.push({
      id,
      kind,
      name: displayName,
    });

    if (parentId !== null) {
      edges.push({ parent: parentId, child: id, index: childIndex });
    }

    if (isAtomicNode(kind)) {
      return id;
    }

    diagnostics.push(...duplicateSiblingDiagnostics(expr));

    for (let index = 1; index < expr.items.length; index += 1) {
      const child = expr.items[index];
      if (child === undefined) {
        continue;
      }

      visit(child, id, index - 1);
    }

    return id;
  };

  visit(rootExpr, null, 0);

  return {
    dsl,
    nodes,
    edges,
    diagnostics,
  };
}
