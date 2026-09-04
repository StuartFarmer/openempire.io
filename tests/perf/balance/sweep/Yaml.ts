/**
 * A deliberately small, strict YAML subset — enough for sweep configs, and
 * nothing more. Written by hand so the balance tooling stays dependency-free
 * (adding a parser to package.json would evict the unsaved `canvas` /
 * `playwright` dev deps the map and screenshot tooling rely on).
 *
 * Supported:
 *   - block maps by indentation      key: value
 *   - block sequences                - item
 *   - flow maps and sequences        {a: 1, b: [2, 3]}
 *   - scalars                        numbers, true/false, null, bare and
 *                                    single/double-quoted strings
 *   - `#` comments and blank lines
 *
 * Deliberately NOT supported (rejected with a line number rather than
 * silently misparsed): anchors/aliases, multi-document streams, block
 * scalars (| and >), multi-line flow collections, tabs for indentation,
 * complex keys, duplicate keys.
 */

export type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | { [key: string]: YamlValue };

export class YamlError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly source?: string,
  ) {
    const where = source === undefined ? `line ${line}` : `${source}:${line}`;
    super(`${where}: ${message}`);
    this.name = "YamlError";
  }
}

interface Line {
  /** 1-based, for error messages. */
  no: number;
  indent: number;
  text: string;
}

/** Strip a trailing `#` comment, honouring quotes. */
function stripComment(raw: string): string {
  let quote: string | null = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quote !== null) {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "#" && (i === 0 || /\s/.test(raw[i - 1]))) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

function scan(text: string, source?: string): Line[] {
  const lines: Line[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const no = i + 1;
    if (raw.includes("\t") && /^\s*\t/.test(raw)) {
      throw new YamlError("tabs are not allowed for indentation", no, source);
    }
    const stripped = stripComment(raw);
    const trimmed = stripped.trim();
    if (trimmed === "") return;
    if (trimmed === "---" || trimmed === "...") {
      throw new YamlError(
        "multi-document streams are not supported",
        no,
        source,
      );
    }
    lines.push({
      no,
      indent: stripped.length - stripped.trimStart().length,
      text: trimmed,
    });
  });
  return lines;
}

// ── Scalars and flow collections ──

function parseScalar(raw: string, no: number, source?: string): YamlValue {
  const s = raw.trim();
  if (s === "") return null;
  if (s === "null" || s === "~") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "|" || s === ">") {
    throw new YamlError(
      "block scalars (| and >) are not supported",
      no,
      source,
    );
  }
  if (s.startsWith("*") || s.startsWith("&")) {
    throw new YamlError("anchors and aliases are not supported", no, source);
  }
  if (s.startsWith('"')) {
    if (!s.endsWith('"') || s.length < 2) {
      throw new YamlError(
        `unterminated double-quoted string: ${s}`,
        no,
        source,
      );
    }
    return s
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  if (s.startsWith("'")) {
    if (!s.endsWith("'") || s.length < 2) {
      throw new YamlError(
        `unterminated single-quoted string: ${s}`,
        no,
        source,
      );
    }
    return s.slice(1, -1).replace(/''/g, "'");
  }
  // Numbers: only the unambiguous forms, so "1e" or "0x" stay strings.
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return Number(s);
  return s;
}

/** Parse a `{...}` or `[...]` flow collection occupying a single line. */
function parseFlow(raw: string, no: number, source?: string): YamlValue {
  let i = 0;
  const s = raw;

  const skipWs = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };

  const readUntil = (stops: string): string => {
    const start = i;
    let quote: string | null = null;
    while (i < s.length) {
      const c = s[i];
      if (quote !== null) {
        if (c === "\\" && quote === '"') i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (stops.includes(c)) {
        break;
      }
      i++;
    }
    return s.slice(start, i);
  };

  const parseNode = (): YamlValue => {
    skipWs();
    if (s[i] === "{") {
      i++;
      const obj: Record<string, YamlValue> = {};
      skipWs();
      if (s[i] === "}") {
        i++;
        return obj;
      }
      for (;;) {
        skipWs();
        const key = readUntil(":,}").trim();
        if (s[i] !== ":") {
          throw new YamlError(
            `expected ':' in flow map near "${key}"`,
            no,
            source,
          );
        }
        i++;
        const value = parseNode();
        const k = String(parseScalar(key, no, source));
        if (k in obj) {
          throw new YamlError(`duplicate key "${k}" in flow map`, no, source);
        }
        obj[k] = value;
        skipWs();
        if (s[i] === ",") {
          i++;
          continue;
        }
        if (s[i] === "}") {
          i++;
          return obj;
        }
        throw new YamlError("unterminated flow map", no, source);
      }
    }
    if (s[i] === "[") {
      i++;
      const arr: YamlValue[] = [];
      skipWs();
      if (s[i] === "]") {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(parseNode());
        skipWs();
        if (s[i] === ",") {
          i++;
          continue;
        }
        if (s[i] === "]") {
          i++;
          return arr;
        }
        throw new YamlError("unterminated flow sequence", no, source);
      }
    }
    const token = readUntil(",}]");
    return parseScalar(token, no, source);
  };

  const value = parseNode();
  skipWs();
  if (i < s.length) {
    throw new YamlError(
      `trailing characters after flow value: "${s.slice(i)}"`,
      no,
      source,
    );
  }
  return value;
}

function parseInline(raw: string, no: number, source?: string): YamlValue {
  const s = raw.trim();
  if (s.startsWith("{") || s.startsWith("[")) return parseFlow(s, no, source);
  return parseScalar(s, no, source);
}

// ── Block structure ──

/** Split `key: rest`, respecting quotes. Returns null when there is no key. */
function splitKey(text: string): { key: string; rest: string } | null {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote !== null) {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "{" || c === "[") return null; // a flow value, not a key
    if (c === ":" && (i + 1 === text.length || /\s/.test(text[i + 1]))) {
      return { key: text.slice(0, i).trim(), rest: text.slice(i + 1).trim() };
    }
  }
  return null;
}

function parseBlock(
  lines: Line[],
  start: number,
  indent: number,
  source: string | undefined,
): { value: YamlValue; next: number } {
  const first = lines[start];
  if (first.text.startsWith("- ") || first.text === "-") {
    const arr: YamlValue[] = [];
    let i = start;
    while (i < lines.length && lines[i].indent === indent) {
      const line = lines[i];
      if (!line.text.startsWith("- ") && line.text !== "-") break;
      const inner = line.text === "-" ? "" : line.text.slice(2).trim();
      if (inner === "") {
        // Value lives on the following, more-indented lines.
        if (i + 1 >= lines.length || lines[i + 1].indent <= indent) {
          arr.push(null);
          i++;
          continue;
        }
        const nested = parseBlock(lines, i + 1, lines[i + 1].indent, source);
        arr.push(nested.value);
        i = nested.next;
        continue;
      }
      const kv = splitKey(inner);
      if (kv === null) {
        arr.push(parseInline(inner, line.no, source));
        i++;
        continue;
      }
      // `- key: value` starts a map whose sibling keys are indented to the
      // column the key itself starts at.
      const keyIndent = indent + 2;
      const synthetic: Line[] = [
        { no: line.no, indent: keyIndent, text: inner },
        ...lines.slice(i + 1),
      ];
      const nested = parseBlock(synthetic, 0, keyIndent, source);
      arr.push(nested.value);
      i = i + nested.next;
    }
    return { value: arr, next: i };
  }

  const obj: Record<string, YamlValue> = {};
  let i = start;
  while (i < lines.length && lines[i].indent === indent) {
    const line = lines[i];
    if (line.text.startsWith("- ")) {
      throw new YamlError(
        "unexpected sequence item inside a map",
        line.no,
        source,
      );
    }
    const kv = splitKey(line.text);
    if (kv === null) {
      throw new YamlError(
        `expected "key: value", got "${line.text}"`,
        line.no,
        source,
      );
    }
    const key = String(parseScalar(kv.key, line.no, source));
    if (key in obj) {
      throw new YamlError(`duplicate key "${key}"`, line.no, source);
    }
    if (kv.rest !== "") {
      obj[key] = parseInline(kv.rest, line.no, source);
      i++;
      continue;
    }
    // Value on following lines, or an explicit empty value.
    if (i + 1 >= lines.length || lines[i + 1].indent <= indent) {
      obj[key] = null;
      i++;
      continue;
    }
    const nested = parseBlock(lines, i + 1, lines[i + 1].indent, source);
    obj[key] = nested.value;
    i = nested.next;
  }
  if (i < lines.length && lines[i].indent > indent) {
    throw new YamlError(
      `unexpected indentation (expected ${indent}, got ${lines[i].indent})`,
      lines[i].no,
      source,
    );
  }
  return { value: obj, next: i };
}

export function parseYaml(text: string, source?: string): YamlValue {
  const lines = scan(text, source);
  if (lines.length === 0) return {};
  const { value, next } = parseBlock(lines, 0, lines[0].indent, source);
  if (next !== lines.length) {
    throw new YamlError(
      "could not parse to end of document",
      lines[next].no,
      source,
    );
  }
  return value;
}
