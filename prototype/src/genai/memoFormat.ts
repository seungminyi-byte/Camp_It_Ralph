import { CHECKLIST_KEYS, type ChecklistKey } from '../report/checklist';

export interface ParsedMemo {
  overall: string;
  items: Partial<Record<ChecklistKey, string>>;
  actions: string[];
  caveats: string[];
  /** upstream failure surfaced by api/generate.ts as a "## ERROR" section */
  error: string | null;
  /** every checklist row has an opinion — the model finished */
  complete: boolean;
  /** section still being written, for the streaming cursor */
  openSection: string | null;
  /** the model output with reasoning and code fences stripped, for "원문 보기" */
  visible: string;
}

const EMPTY: ParsedMemo = {
  overall: '',
  items: {},
  actions: [],
  caveats: [],
  error: null,
  complete: false,
  openSection: null,
  visible: '',
};

/** Reasoning models emit <think> blocks; while streaming the closing tag has not arrived yet. */
export function stripThinking(text: string): string {
  const closed = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const open = closed.search(/<think>/i);
  return (open === -1 ? closed : closed.slice(0, open)).trim();
}

function stripFences(text: string): string {
  return text
    .split('\n')
    .filter((l) => !/^\s*```/.test(l))
    .join('\n');
}

// Keys are camelCase (permit.landUse), so match case-insensitively and return the canonical spelling.
const KEY_BY_LOWER = new Map<string, ChecklistKey>(
  CHECKLIST_KEYS.map((k) => [k.toLowerCase(), k]),
);

function normalizeKey(raw: string): ChecklistKey | null {
  const k = raw.trim().toLowerCase().replace(/[_-]/g, '.').replace(/\s+/g, '');
  return KEY_BY_LOWER.get(k) ?? null;
}

function bullets(body: string): string[] {
  return body
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

/** Last-resort path for a model that answered with JSON despite the section instructions. */
function parseJsonShape(text: string): Partial<ParsedMemo> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const j = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const items: Partial<Record<ChecklistKey, string>> = {};
    const rawItems = (j.items ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(rawItems)) {
      const key = normalizeKey(k);
      if (key && typeof v === 'string') items[key] = v.trim();
    }
    const list = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    const overall = j.overallOpinion ?? j.overall;
    return {
      overall: typeof overall === 'string' ? overall.trim() : '',
      items,
      actions: list(j.actions),
      caveats: list(j.caveats),
    };
  } catch {
    return null;
  }
}

/**
 * Parse the "## SECTION" transcript. Called on every stream chunk, so a truncated response still
 * yields every section that has arrived — that is why the prompt asks for headers, not JSON.
 */
export function parseMemo(raw: string): ParsedMemo {
  const visible = stripFences(stripThinking(raw)).trim();
  if (!visible) return { ...EMPTY };

  const headerRe = /^[ \t]*#{1,3}[ \t]*(OVERALL|ITEM[ \t]+\S+|ACTIONS|CAVEATS|ERROR)[ \t]*$/gim;
  const marks: { name: string; start: number; end: number }[] = [];
  for (let m = headerRe.exec(visible); m !== null; m = headerRe.exec(visible)) {
    marks.push({ name: m[1].trim(), start: m.index, end: m.index + m[0].length });
  }

  if (marks.length === 0) {
    const json = parseJsonShape(visible);
    if (json) return { ...EMPTY, ...json, visible, complete: itemsComplete(json.items) };
    return { ...EMPTY, overall: visible, visible };
  }

  const out: ParsedMemo = { ...EMPTY, items: {}, actions: [], caveats: [], visible };
  let openSection: string | null = null;

  marks.forEach((mark, i) => {
    const body = visible.slice(mark.end, i + 1 < marks.length ? marks[i + 1].start : undefined).trim();
    const name = mark.name.toUpperCase();
    if (i === marks.length - 1) openSection = mark.name;

    if (name === 'OVERALL') {
      out.overall = body;
    } else if (name === 'ACTIONS') {
      out.actions = bullets(body);
    } else if (name === 'CAVEATS') {
      out.caveats = bullets(body);
    } else if (name === 'ERROR') {
      out.error = body || '생성 중 오류가 발생했습니다.';
    } else if (name.startsWith('ITEM')) {
      const key = normalizeKey(mark.name.slice(4));
      // A misspelled key still carries an opinion: drop it into the next unfilled row in order.
      const target = key ?? CHECKLIST_KEYS.find((k) => out.items[k] === undefined) ?? null;
      if (target && body) out.items[target] = body;
    }
  });

  out.openSection = openSection;
  out.complete = itemsComplete(out.items);
  return out;
}

function itemsComplete(items: Partial<Record<ChecklistKey, string>> | undefined): boolean {
  if (!items) return false;
  return CHECKLIST_KEYS.every((k) => (items[k] ?? '').length > 0);
}
