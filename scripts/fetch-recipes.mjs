// Pulls the Process Cookbook repo and turns every recipe into JSON the site and the endpoint read.
// Output: src/data/recipes.json (everything), public/search-index.json (what search needs), src/data/meta.json.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import matter from 'gray-matter';

const REPO = process.env.COOKBOOK_REPO || 'https://github.com/Fibery-inc/process-cookbook.git';
const REF = process.env.COOKBOOK_REF || 'main';
const LOCAL = process.env.COOKBOOK_DIR; // a local clone, for offline work
const ROOT = resolve(new URL('..', import.meta.url).pathname);
const WORK = join(ROOT, '.cookbook');
const SECTION_ORDER = [
  'The idea',
  'How it runs',
  'What people look at',
  'The rules',
  'What must stay true',
  'Making it yours',
  'Details for building',
  'Sources',
  'Build it',
];
const HUMAN = SECTION_ORDER.slice(0, 6);

function sh(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

function checkout() {
  if (LOCAL) return resolve(LOCAL);
  if (existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  // blob:none keeps the clone small but leaves history, so per-file dates come from git log.
  sh(`git clone --quiet --filter=blob:none --branch ${REF} ${REPO} repo`, WORK);
  return join(WORK, 'repo');
}

function splitSections(body) {
  const lines = body.split('\n');
  const sections = {};
  let title = '';
  let lead = [];
  let current = null;
  let footer = [];
  let inFooter = false;
  for (const line of lines) {
    if (!title && line.startsWith('# ')) {
      title = line.slice(2).trim();
      continue;
    }
    if (line.startsWith('## ')) {
      current = line.slice(3).trim();
      sections[current] = [];
      continue;
    }
    if (current === 'Build it' && line.trim() === '---') {
      inFooter = true;
      current = null;
      continue;
    }
    if (inFooter) footer.push(line);
    else if (current) sections[current].push(line);
    else lead.push(line);
  }
  for (const k of Object.keys(sections)) sections[k] = sections[k].join('\n').trim();
  const leadText = lead.join('\n').trim();
  const paragraphs = leadText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const italic = paragraphs.find((p) => p.startsWith('*') && !p.startsWith('**')) || '';
  const promise = paragraphs.find((p) => p.startsWith('**')) || '';
  return { title, italic, promise, sections, footer: footer.join('\n').trim() };
}

function plain(md) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/[#*_>`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function fileDate(repo, path) {
  try {
    return sh(`git log -1 --format=%cs -- "${path}"`, repo) || null;
  } catch {
    return null;
  }
}

// The structured parts the recipe page draws. Every part is null when a recipe doesn't match its shape,
// and the page then renders that section's Markdown as it is.

const WORDS_PER_MINUTE = 230;
const NOT_DATABASES = new Set(['views', 'app', 'apps', 'reports', 'report', 'sample story', 'sample data']);
const ABBREVIATIONS = new Set(['e.g', 'i.e', 'vs', 'cf', 'approx', 'incl', 'mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr']);
const BEFORE_A_NUMBER = new Set(['no', 'nos', 'fig', 'vol', 'p', 'pp', 'ch', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec']);
const KEEPER = /^[*_]*(kept by|shown on|shown by|a practice)\b/i;
const YES_NO_QUESTION = /^(do|does|did|is|are|was|were|can|could|will|would|should|has|have|had|must|may)\b/i;
const MAX_LABEL = 48;

// Paragraphs, lists (with their items), tables, code and headings, in order.
function blocks(md) {
  const out = [];
  let cur = null;
  let fence = false;
  const close = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (fence) {
      cur.lines.push(raw);
      if (/^\s*```/.test(line)) {
        fence = false;
        close();
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      close();
      cur = { type: 'code', lines: [raw] };
      fence = true;
      continue;
    }
    const isList = cur && (cur.type === 'ul' || cur.type === 'ol');
    if (!line.trim()) {
      if (isList) cur.blank = true;
      else close();
      continue;
    }
    const ul = line.match(/^[-*+]\s+(.*)$/);
    const ol = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (ul || ol) {
      const type = ul ? 'ul' : 'ol';
      if (!cur || cur.type !== type) {
        close();
        cur = { type, items: [] };
      }
      cur.items.push({ n: ol ? Number(ol[1]) : null, lines: [ul ? ul[1] : ol[2]] });
      cur.blank = false;
      continue;
    }
    if (isList && (/^\s{2,}\S/.test(raw) || (!cur.blank && !/^[|#]/.test(line)))) {
      const item = cur.items[cur.items.length - 1];
      if (cur.blank) item.lines.push('');
      item.lines.push(line.trim());
      cur.blank = false;
      continue;
    }
    if (isList) close();
    if (/^#{1,6}\s/.test(line)) {
      close();
      out.push({ type: 'heading', lines: [line] });
      continue;
    }
    const type = line.startsWith('|') ? 'table' : 'para';
    if (!cur || cur.type !== type) {
      close();
      cur = { type, lines: [] };
    }
    cur.lines.push(line);
  }
  close();
  return out;
}

const joinBlocks = (bs) => bs.map((b) => b.lines.join('\n')).join('\n\n');
const flat = (s) => s.replace(/\s*\n\s*/g, ' ').trim();

// Paragraphs, one list of the given type, paragraphs: anything else doesn't match.
function frame(md, type) {
  const bs = blocks(md);
  const i = bs.findIndex((b) => b.type === type);
  if (i < 0) return null;
  const before = bs.slice(0, i);
  const after = bs.slice(i + 1);
  if (![...before, ...after].every((b) => b.type === 'para')) return null;
  const items = bs[i].items.map((it) => ({ n: it.n, text: it.lines.join('\n').trim() }));
  return { intro: joinBlocks(before), items, outro: joinBlocks(after) };
}

// Index just past the first sentence's end (its punctuation and closing marks), or -1 when the text is one sentence.
function sentenceEnd(text) {
  let code = false;
  let bracket = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '`') code = !code;
    if (code) continue;
    if (c === '[') bracket++;
    else if (c === ']') {
      bracket = Math.max(0, bracket - 1);
      if (text[i + 1] === '(') {
        const close = text.indexOf(')', i);
        if (close > 0) i = close;
      }
      continue;
    }
    if (bracket || !'.?!…'.includes(c)) continue;
    let j = i + 1;
    while (j < text.length && '.?!…'.includes(text[j])) j++;
    while (j < text.length && /["'”’)\]*_]/.test(text[j])) j++;
    if (j >= text.length) return -1;
    if (!/\s/.test(text[j])) continue;
    let k = j;
    while (k < text.length && /\s/.test(text[k])) k++;
    if (k >= text.length) return -1;
    if (!/[A-Z0-9"“'‘*_(\[]/.test(text[k])) continue;
    if (c === '.') {
      const word = (text.slice(0, i).match(/([A-Za-z.]+)$/) || [''])[0].toLowerCase();
      if (ABBREVIATIONS.has(word)) continue;
      if (BEFORE_A_NUMBER.has(word) && /\d/.test(text[k])) continue;
      if (/^[a-z]$/.test(word) && /(^|\s)[A-Z]$/.test(text.slice(0, i))) continue;
    }
    return j;
  }
  return -1;
}

function sentenceStarts(text) {
  const starts = [0];
  let at = 0;
  for (;;) {
    const end = sentenceEnd(text.slice(at));
    if (end < 0) return starts;
    at += end;
    while (at < text.length && /\s/.test(text[at])) at++;
    starts.push(at);
  }
}

function upperFirst(md) {
  return md.replace(/^([*_"“'‘(\[]*)([a-z])/, (_, pre, ch) => pre + ch.toUpperCase());
}

function cell(md) {
  return upperFirst(md.trim()).replace(/(?<!\.)\.$/, '');
}

function parseSteps(md) {
  const f = frame(md, 'ol');
  if (!f || !f.items.length) return null;
  const items = [];
  for (const it of f.items) {
    const [first, ...more] = it.text.split(/\n\s*\n/);
    const m = flat(first).match(/^\*\*(.+?)\*\*(.*)$/);
    if (!m) return null;
    const title = m[1].trim();
    // A bold that ends its sentence is the title, and the next sentence is the gist; a bold that doesn't
    // ("**The day before trap night**, the rule…") is the title, and the rest of its sentence is the gist.
    const ended = /[.?!]$/.test(title);
    const rest = ended ? m[2].trim() : m[2].replace(/^[\s,;:—–-]+/, '');
    const end = sentenceEnd(rest);
    const gist = end < 0 ? rest : rest.slice(0, end);
    const detail = [end < 0 ? '' : rest.slice(end).trim(), ...more.map((p) => p.trim())].filter(Boolean).join('\n\n');
    items.push({ n: it.n, title: title.replace(/(?<!\.)\.$/, ''), gist: ended ? gist.trim() : upperFirst(gist.trim()), detail });
  }
  return { intro: f.intro, items, outro: f.outro };
}

// "**Name**: text. **Name**, what it is: text." after the cadence's dash, each view starting a sentence.
function splitViews(rest) {
  const re = /(^|[.?!]["'”’)*_]*\s+)(?:[Tt]he\s+)?\*\*([^*]+?)\*\*(?:,\s+([^:.;*]{1,80}?))?:\s+/g;
  const marks = [];
  let m;
  while ((m = re.exec(rest))) {
    marks.push({ cut: m.index + m[1].replace(/\s+$/, '').length, start: m.index + m[1].length, end: re.lastIndex, name: m[2].trim(), what: m[3] });
  }
  if (!marks.length || marks[0].start !== 0) return null;
  const views = [];
  for (let i = 0; i < marks.length; i++) {
    const text = rest.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].cut : rest.length).trim();
    // A view this shape missed ("Then **X**: …", "The **X** report: …") would end up inside another view's text.
    if (/\*\*:/.test(text) || /(^|[.?!]\s+)(?:[Tt]he\s+)?\*\*[^*]+\*\*[^.:*]{0,40}:/.test(text)) return null;
    views.push({ name: marks[i].name, answers: marks[i].what ? `${upperFirst(marks[i].what.trim())}: ${text}` : text });
  }
  return views;
}

const VIEW_KIND = '(reports?|forms?|views?|lists?|boards?|grids?|maps?|calendars?|timelines?|apps?|documents?|pages?|charts?)';
const VIEW_NAMES = '(\\*\\*[^*]+?\\*\\*(?:(?:,\\s+and\\s+|,\\s+|\\s+and\\s+)\\*\\*[^*]+?\\*\\*)*)';
// "the **Fixed by month** report, females and males", "**Traps** for who holds which trap", "each technician's **My repairs**: …"
const VIEW_CLAUSE = new RegExp(`^(?:[A-Za-z’'-]+,?\\s+){0,4}?${VIEW_NAMES}(?:\\s+(?:again|too|also|itself))?(?:\\s+${VIEW_KIND})?(?:(:\\s+|,\\s+|\\s+for\\s+)([\\s\\S]+))?$`);
// "the four forms members use: **Join the club**, **Suggest a film** and **Send a note**"
const LEAD_CLAUSE = new RegExp(`^([^*:]{3,80}):\\s+${VIEW_NAMES}(?:\\s+${VIEW_KIND})?$`);

function viewClauses(text) {
  const out = [];
  const starts = sentenceStarts(text);
  starts.forEach((s, i) => {
    const sentence = text.slice(s, i + 1 < starts.length ? starts[i + 1] : text.length).trim();
    sentence.split(/;\s+/).forEach((part, j) => out.push({ text: part.trim(), joiner: j ? '; ' : ' ' }));
  });
  return out.filter((c) => c.text);
}

// The shapes the cookbook also uses after the dash: views in a list split by semicolons, a kind after the name,
// a few words before it. A clause that names nothing new continues the view before it.
function looseViews(rest) {
  const views = [];
  for (const { text, joiner } of viewClauses(rest)) {
    const t = text.replace(/^(?:and|then|or)\s+/i, '').replace(/\.$/, '');
    const lead = t.match(LEAD_CLAUSE);
    const m = lead ? null : t.match(VIEW_CLAUSE);
    if (lead || m) {
      const name = [...(lead ? lead[2] : m[1]).matchAll(/\*\*([^*]+?)\*\*/g)].map((x) => x[1].trim()).join(' · ');
      const kind = (lead ? lead[3] : m[2]) || '';
      const answers = lead ? lead[1] : m[4] ? (/for/.test(m[3]) ? `for ${m[4]}` : m[4]) : '';
      views.push({ name, kind, answers: answers ? upperFirst(answers.trim()) + (text.endsWith('.') ? '.' : '') : '' });
    } else if (views.length) {
      const last = views[views.length - 1];
      last.answers = last.answers ? `${last.answers}${joiner}${text}` : upperFirst(text);
    } else if (!text.includes('**')) {
      views.push({ name: '', kind: '', answers: upperFirst(text) });
    } else return null;
  }
  return views.some((v) => v.name) ? views : null;
}

function parseViews(md) {
  const f = frame(md, 'ul');
  if (!f || !f.items.length) return null;
  const items = [];
  for (const it of f.items) {
    const m = flat(it.text).match(/^\*\*([^*]+?)\*\*([^—–]*?)\s+[—–]\s+(.+)$/);
    if (!m) return null;
    const rest = m[3].trim();
    if (!m[2].trim() && !rest.includes('**')) {
      // "**How to run X** — this process on one screen": a document, not a cadence.
      items.push({ when: '', view: m[1].trim(), kind: '', answers: cell(rest) });
      continue;
    }
    const views = splitViews(rest) || looseViews(rest);
    if (!views) return null;
    const when = (m[1] + m[2]).trim();
    for (const v of views) items.push({ when, view: v.name, kind: v.kind || '', answers: v.answers ? cell(v.answers) : '' });
  }
  return { intro: f.intro, items, outro: f.outro };
}

function parseRules(md) {
  const f = frame(md, 'ul');
  if (!f || !f.items.length) return null;
  const items = [];
  for (const it of f.items) {
    const t = flat(it.text);
    const m = t.match(/^\*\*([^*]+?)\*\*\s*(?:\(((?:[^()]|\([^()]*\))*)\))?\s*:\s+(.+)$/) || t.match(/^\*\*([^*]+?):\*\*()\s+(.+)$/);
    if (!m) return null;
    // As written, since the page sets each rule the recipe's way: "**Name** (trigger): what it does".
    items.push({ name: m[1].trim(), when: (m[2] || '').trim(), does: m[3].trim() });
  }
  return { intro: f.intro, items, outro: f.outro };
}

function parsePromises(md) {
  const f = frame(md, 'ul');
  if (!f || !f.items.length) return null;
  const items = [];
  for (const it of f.items) {
    let t = flat(it.text);
    const core = t.startsWith('★');
    t = t.replace(/^★\s*/, '');
    const starts = sentenceStarts(t);
    const k = starts.findIndex((s, i) => i > 0 && KEEPER.test(t.slice(s)));
    if (k < 0) return null;
    // The first sentence is the promise itself; the sentences before the keeper explain it.
    const more = t.slice(starts[1], starts[k]).trim();
    const promise = t.slice(0, starts[1]).trim();
    items.push({ core, promise: more ? promise : cell(promise), more: more ? cell(more) : '', keptBy: cell(t.slice(starts[k])) });
  }
  return { intro: f.intro, items, outro: f.outro };
}

const plainText = (md) => md.replace(/[*_`]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();

// "No: friendly cats go to a partner rescue" → label "No", note "friendly cats go to a partner rescue".
function lead(md) {
  const m = md.match(/^(.+?)(?::|;|\.)\s+(.+)$/);
  return m ? { label: plainText(m[1]), note: m[2].trim(), explicit: true } : { label: plainText(md), note: '', explicit: false };
}

const significant = (s) => s.toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w && !['a', 'an', 'the', 'and', 'or', 'only', 'too'].includes(w));
const lowerFirst = (s) => s.replace(/^([A-Z])(?=[a-z\s'’])/, (c) => c.toLowerCase());

// The two choice buttons from the question and its Default and If-not cells: a yes/no question answers
// yes or no, an either/or question names the other option, anything else takes the If-not cell's lead.
// `change` says what the non-default answer means, for the summary line.
function choice(text, defaultCell, otherCell) {
  const startsYesNo = (s) => /^(yes|no)\b/i.test(s);
  const bare = (s) => /^(yes|no)$/i.test(s);
  const dash = /^(?:—|–|-|n\/a|none)?$/i.test(plainText(defaultCell));
  const d = dash ? { label: YES_NO_QUESTION.test(text) ? 'No' : 'Default', note: '', explicit: false } : lead(defaultCell);
  const o = lead(otherCell);
  const fits = o.explicit && o.label.length <= MAX_LABEL;
  const yesNo = YES_NO_QUESTION.test(text) && startsYesNo(d.label);
  let otherLabel = '';
  let change = '';
  if (yesNo) {
    otherLabel = fits && startsYesNo(o.label) ? o.label : /^yes/i.test(d.label) ? 'No' : 'Yes';
    change = fits && !bare(o.label) ? lowerFirst(o.label) : `${otherLabel.toLowerCase()} to “${text}”`;
  } else {
    const either = text.match(/^(.+?)(?:,\s+or|\s+or)\s+(.+?)\?$/);
    if (either && significant(d.label).every((w) => significant(either[1]).includes(w))) {
      otherLabel = upperFirst(either[2].replace(/^(do|does)\s+/i, ''));
    }
    if (!otherLabel && fits) otherLabel = o.label;
    change = otherLabel ? lowerFirst(otherLabel) : `another way for “${text}”`;
    otherLabel = otherLabel || 'Another way';
  }
  const otherNote = fits && o.label === otherLabel ? o.note : otherCell.trim();
  return { text, yesNo, defaultLabel: d.label, otherLabel, defaultNote: d.note, otherNote, change };
}

function cells(line) {
  let s = line.trim().replace(/^\|/, '');
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

// Making it yours: the questions table, and the bullets after it.
function parseYours(md) {
  const bs = blocks(md);
  const t = bs.findIndex((b) => b.type === 'table');
  if (t < 0 || !bs.slice(0, t).every((b) => b.type === 'para')) return { questions: null, adaptations: null };
  const [head, sep, ...rows] = bs[t].lines;
  if (!head || !sep || cells(head).length !== 3 || !/^\|?[\s:|-]+$/.test(sep)) return { questions: null, adaptations: null };
  const items = [];
  for (const row of rows) {
    const c = cells(row);
    if (c.length !== 3 || !c[0]) return { questions: null, adaptations: null };
    items.push(choice(c[0], c[1], c[2]));
  }
  const after = bs.slice(t + 1);
  const listAt = after.findIndex((b) => b.type === 'ul');
  const tail = after.filter((_, i) => i !== listAt);
  let adaptations = null;
  if (listAt >= 0 && tail.every((b) => b.type === 'para')) {
    adaptations = [];
    for (const it of after[listAt].items) {
      const text = it.lines.join('\n').trim();
      const m = flat(text).match(/^\*\*([^*]+?)\*\*/);
      if (!m) {
        adaptations = null;
        break;
      }
      adaptations.push({ name: m[1].trim().replace(/[:.]$/, ''), text });
    }
  }
  const outro = adaptations ? joinBlocks(tail) : joinBlocks(after);
  return { questions: items.length ? { intro: joinBlocks(bs.slice(0, t)), items, outro } : null, adaptations };
}

// Details for building: its ### parts, one per database plus Views, App, Reports and Sample story.
function modelParts(md) {
  return md
    .split(/^### /m)
    .slice(1)
    .map((p) => {
      const nl = p.indexOf('\n');
      return { name: (nl < 0 ? p : p.slice(0, nl)).trim(), body: nl < 0 ? '' : p.slice(nl + 1).trim() };
    });
}

// The databases with what one record is: the first sentence, without its naming clause.
function parseWords(md) {
  const words = [];
  for (const { name, body } of modelParts(md)) {
    if (NOT_DATABASES.has(name.toLowerCase())) continue;
    const para = flat(body.split(/\n\s*\n/)[0] || '');
    let definition = '';
    if (para && !/^[|`\-*]/.test(para)) {
      const end = sentenceEnd(para);
      definition = (end < 0 ? para : para.slice(0, end))
        .replace(/;\s.*$/, '')
        .replace(/,?\s+(?:and\s+)?named\s+(?:by|after|for)\b.*$/i, '')
        .replace(/[.;:,]$/, '')
        .trim();
      // "Only when the company doesn't track its teams already: …" says when, not what.
      if (/^only (when|if)\b/i.test(definition)) definition = '';
    }
    words.push({ name, definition });
  }
  return words.length ? words : null;
}

function parseModel(md, words) {
  const parts = modelParts(md);
  if (!parts.length) return null;
  const part = (n) => parts.find((p) => p.name.toLowerCase() === n);
  const app = part('app') ? (part('app').body.match(/^\*\*([^*]+?)\*\*/) || [])[1] || null : null;
  const reports = part('reports') ? (part('reports').body.match(/^(?:[-*]\s+)?\*\*[^*]+?\*\*\s+[—–]/gm) || []).length : 0;
  return { databases: words ? words.length : 0, views: !!part('views'), app, reports, story: !!part('sample story') };
}

function minutesOf(sections) {
  const per = {};
  for (const h of SECTION_ORDER) {
    if (!sections[h] || h === 'Sources' || h === 'Build it') continue;
    const words = plain(sections[h]).split(/\s+/).filter(Boolean).length;
    per[h] = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  }
  return { sections: per, human: HUMAN.reduce((sum, h) => sum + (per[h] || 0), 0), model: per['Details for building'] || 0 };
}

function parseParts(sections) {
  const yours = parseYours(sections['Making it yours'] || '');
  const words = parseWords(sections['Details for building'] || '');
  return {
    steps: parseSteps(sections['How it runs'] || ''),
    views: parseViews(sections['What people look at'] || ''),
    rules: parseRules(sections['The rules'] || ''),
    promises: parsePromises(sections['What must stay true'] || ''),
    questions: yours.questions,
    adaptations: yours.adaptations,
    words,
    minutes: minutesOf(sections),
    model: parseModel(sections['Details for building'] || '', words),
  };
}

const repo = checkout();
const commit = sh('git rev-parse HEAD', repo);
const recipesDir = join(repo, 'recipes');
const recipes = [];
for (const domain of readdirSync(recipesDir).sort()) {
  const dir = join(recipesDir, domain);
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.md') || file === 'README.md') continue;
    const path = `recipes/${domain}/${file}`;
    const src = readFileSync(join(dir, file), 'utf8');
    const { data, content } = matter(src);
    const parsed = splitSections(content);
    const id = file.replace(/\.md$/, '');
    const humanText = HUMAN.map((h) => parsed.sections[h] || '').join('\n');
    recipes.push({
      id,
      title: data.title || parsed.title || id,
      summary: data.summary || '',
      domain: data.domain || domain,
      for: data.for || '',
      roles: typeof data.roles === 'string' ? data.roles.trim() : '',
      needs: typeof data.needs === 'string' ? data.needs.trim() : '',
      keywords: data.keywords || [],
      version: data.version || 1,
      license: data.license || 'CC-BY-4.0',
      path,
      raw: `https://raw.githubusercontent.com/Fibery-inc/process-cookbook/${REF}/${path}`,
      github: `https://github.com/Fibery-inc/process-cookbook/blob/${REF}/${path}`,
      updated: fileDate(repo, path),
      promise: parsed.promise,
      italic: parsed.italic,
      sections: parsed.sections,
      footer: parsed.footer,
      markdown: src,
      text: plain(humanText),
      parsed: parseParts(parsed.sections),
    });
  }
}

const domains = {};
for (const r of recipes) domains[r.domain] = (domains[r.domain] || 0) + 1;

// Requested recipes are GitHub issues labelled "recipe request"; 👍 reactions are the votes.
async function fetchRequests() {
  const url = 'https://api.github.com/repos/Fibery-inc/process-cookbook/issues?labels=recipe%20request&state=open&per_page=30';
  try {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'process-cookbook-site' } });
    if (!res.ok) throw new Error(`${res.status}`);
    const issues = await res.json();
    return issues
      .filter((i) => !i.pull_request)
      .map((i) => ({
        number: i.number,
        title: i.title.replace(/^recipe request:\s*/i, ''),
        url: i.html_url,
        votes: (i.reactions && i.reactions['+1']) || 0,
        created: i.created_at.slice(0, 10),
        body: (i.body || '').split('\n').find((l) => l.trim()) || '',
      }))
      .sort((a, b) => b.votes - a.votes || (a.created < b.created ? 1 : -1));
  } catch (e) {
    console.warn(`requests: ${e.message}; keeping an empty list`);
    return [];
  }
}
const requests = await fetchRequests();
writeFileSync(join(ROOT, 'src/data/requests.json'), JSON.stringify(requests, null, 1));

mkdirSync(join(ROOT, 'src/data'), { recursive: true });
mkdirSync(join(ROOT, 'public'), { recursive: true });
writeFileSync(join(ROOT, 'src/data/recipes.json'), JSON.stringify(recipes, null, 1));
writeFileSync(
  join(ROOT, 'public/search-index.json'),
  JSON.stringify(
    recipes.map(({ id, title, summary, domain, for: f, keywords, version, promise, text, updated }) => ({
      id, title, summary, domain, for: f, keywords, version, promise: plain(promise), text, updated,
    })),
  ),
);
writeFileSync(
  join(ROOT, 'src/data/meta.json'),
  JSON.stringify({ commit, ref: REF, fetchedAt: new Date().toISOString(), domains, count: recipes.length }, null, 1),
);
console.log(`${recipes.length} recipes from ${REF} @ ${commit.slice(0, 7)}; domains: ${Object.keys(domains).join(', ')}`);
