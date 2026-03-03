export interface CompiledBtDefinition {
  dsl: string;
  nodes: Array<{ id: number; kind: string; name: string }>;
  edges: Array<{ parent: number; child: number; index: number }>;
}

type SExpr = string | SExpr[];

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < input.length) {
    const ch = input[index];
    if (!ch) {
      break;
    }

    if (/\s/.test(ch)) {
      index += 1;
      continue;
    }

    if (ch === ';') {
      while (index < input.length && input[index] !== '\n') {
        index += 1;
      }
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push(ch);
      index += 1;
      continue;
    }

    if (ch === '"') {
      let value = '"';
      index += 1;
      while (index < input.length) {
        const current = input[index];
        if (!current) {
          break;
        }
        value += current;
        index += 1;
        if (current === '"' && value[value.length - 2] !== '\\') {
          break;
        }
      }
      tokens.push(value);
      continue;
    }

    const start = index;
    while (index < input.length && !/\s/.test(input[index] ?? '') && input[index] !== '(' && input[index] !== ')') {
      index += 1;
    }
    tokens.push(input.slice(start, index));
  }

  return tokens;
}

function parseSExpr(tokens: string[]): SExpr[] {
  let cursor = 0;

  function parseOne(): SExpr {
    const token = tokens[cursor];
    if (!token) {
      throw new Error('unexpected end of input');
    }

    if (token === '(') {
      cursor += 1;
      const list: SExpr[] = [];
      while (cursor < tokens.length && tokens[cursor] !== ')') {
        list.push(parseOne());
      }
      if (tokens[cursor] !== ')') {
        throw new Error('missing closing parenthesis');
      }
      cursor += 1;
      return list;
    }

    if (token === ')') {
      throw new Error('unexpected closing parenthesis');
    }

    cursor += 1;
    return token;
  }

  const out: SExpr[] = [];
  while (cursor < tokens.length) {
    out.push(parseOne());
  }
  return out;
}

function asSymbol(value: SExpr): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  return value;
}

function resolveTreeRoot(expressions: SExpr[]): SExpr {
  if (expressions.length === 0) {
    throw new Error('DSL is empty');
  }

  const first = expressions[0];
  if (first === undefined) {
    throw new Error('DSL is empty');
  }
  if (!Array.isArray(first) || first.length === 0) {
    return first;
  }

  const firstHead = first[0];
  if (firstHead === undefined) {
    throw new Error('node head must be a symbol');
  }

  const head = asSymbol(firstHead);
  if (head === 'defbt') {
    if (first.length < 3) {
      throw new Error('defbt requires a tree expression');
    }
    const treeExpr = first[2];
    if (treeExpr === undefined) {
      throw new Error('defbt requires a tree expression');
    }
    return treeExpr;
  }

  if (head === 'bt') {
    if (first.length < 2) {
      throw new Error('bt requires a tree expression');
    }
    const treeExpr = first[1];
    if (treeExpr === undefined) {
      throw new Error('bt requires a tree expression');
    }
    return treeExpr;
  }

  return first;
}

function isAtomicNode(kind: string): boolean {
  return kind === 'act' || kind === 'cond' || kind === 'dec';
}

export function compileBtDsl(dsl: string): CompiledBtDefinition {
  const tokens = tokenize(dsl);
  const expressions = parseSExpr(tokens);
  const rootExpr = resolveTreeRoot(expressions);

  const nodes: Array<{ id: number; kind: string; name: string }> = [];
  const edges: Array<{ parent: number; child: number; index: number }> = [];
  let nextId = 1;

  const visit = (expr: SExpr, parentId: number | null, childIndex: number): number => {
    if (typeof expr === 'string') {
      const id = nextId;
      nextId += 1;
      nodes.push({ id, kind: 'sym', name: asSymbol(expr) ?? 'sym' });
      if (parentId !== null) {
        edges.push({ parent: parentId, child: id, index: childIndex });
      }
      return id;
    }

    if (expr.length === 0) {
      throw new Error('empty list is not a valid node');
    }

    const head = expr[0];
    if (head === undefined) {
      throw new Error('node head must be a symbol');
    }

    const rawKind = asSymbol(head);
    if (!rawKind) {
      throw new Error('node head must be a symbol');
    }

    const kind = rawKind;
    const id = nextId;
    nextId += 1;

    const second = expr[1];
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

    for (let index = 1; index < expr.length; index += 1) {
      const child = expr[index];
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
  };
}
