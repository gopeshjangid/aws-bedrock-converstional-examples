import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import * as cheerio from "cheerio";

/** =========================
 * Types
 * ======================== */
type ToolArgs = {
  question: string;
  topK?: number;         // web search results cap (default 5)
  recencyDays?: number;  // bias to recent links (default 180)
  site?: string;         // optional site restriction (e.g., "nodejs.org")
  maxChars?: number;     // clamp extracted text (default from env or 4000)
};

type Source = { url: string; title?: string; publishedAt?: string };
type Payload = {
  answer: string;
  sources: Source[];
  method: "kb" | "web";
};

type WebSearchHit = { title: string; url: string; snippet?: string; publishedAt?: string };

/** =========================
 * Config & helpers
 * ======================== */
const REGION = process.env.AWS_REGION || "ap-south-1";
const KB_ID = "SB77W32JWL";
const SERPER_KEY = "'e5054b678ffa1ee8b3f995a0a7de52d4c9797420";

const MAX_CHARS_DEFAULT = intEnv("MAX_CHARS", 4000);
const FETCH_TIMEOUT_MS = intEnv("FETCH_TIMEOUT_MS", 8000);

const TIME_SENSITIVE = /\b(latest|current|today|version|release|lts|price|rate|schedule|policy|ranking|score|outage|deadline|updated)\b/i;

const CANONICAL_MAP: Array<[RegExp, string]> = [
  [/\bnode(\.js)?\b/i, "nodejs.org"],
  [/\breact\b/i,       "react.dev"],
  [/\bpython\b/i,      "python.org"],
  [/\baws|bedrock\b/i, "docs.aws.amazon.com"],
  // add more as needed
];

function canonicalSiteHint(q: string): string | undefined {
  const hit = CANONICAL_MAP.find(([re]) => re.test(q));
  return hit?.[1];
}

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}
function intEnv(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function nowMinus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.getTime();
}
function isHttpUrl(u: string) {
  try { const url = new URL(u); return ["http:", "https:"].includes(url.protocol); } catch { return false; }
}
function cleanUrl(u: string) { const url = new URL(u); url.hash = ""; return url.toString(); }

function scoreDomain(url: string, allowHints: string[]) {
  const h = new URL(url).hostname.toLowerCase();
  const preferredTlds = [".gov", ".edu"];
  if (preferredTlds.some(t => h.endsWith(t))) return 3;
  if (allowHints.some(s => h.startsWith(s) || h.includes(`.${s}`))) return 2;
  if (h.endsWith(".org")) return 1.5;
  return 1;
}
function extractDate($: cheerio.CheerioAPI): string | undefined {
  const meta =
    $('meta[property="article:published_time"]').attr("content") ||
    $('meta[name="pubdate"]').attr("content") ||
    $('meta[name="date"]').attr("content") ||
    $("time[datetime]").attr("datetime");
  if (!meta) return undefined;
  const t = Date.parse(meta);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

/** =========================
 * KB: Retrieve
 * ======================== */
const bedrock = new BedrockAgentRuntimeClient({ region: "ap-southeast-2" });

async function kbRetrieve(question: string): Promise<{ text: string; sources: Source[] } | null> {
  const cmd = new RetrieveCommand({
    knowledgeBaseId: KB_ID,
    retrievalQuery: { text: question },
    // You may add retrievalConfiguration here if you wish to tweak vector search
  });
  const res = await bedrock.send(cmd);
  const results = res?.retrievalResults || [];
  if (!results.length) return null;

  // Concatenate top chunks; keep it small/deterministic
  const pieces: string[] = [];
  const sources: Source[] = [];
  for (const r of results.slice(0, 3)) {
    const txt = (r?.content?.text ?? "").toString();
    if (txt) pieces.push(txt);
    // KB may not always include a URL; keep a generic label if not available
    if (r?.location?.s3Location?.uri) {
      sources.push({ url: r.location.s3Location.uri });
    }
  }
  const text = pieces.join(" ").replace(/\s+/g, " ").trim();
  return { text, sources: sources.length ? sources : [{ url: "Bedrock Knowledge Base" }] };
}

function kbSufficient(question: string, kbText: string | null): boolean {
  if (!kbText || !kbText.trim()) return false;
  if (TIME_SENSITIVE.test(question)) {
    // For time-sensitive, require a recent-looking date in text (very lightweight heuristic)
    const hasDate =
      /\b20\d{2}[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/.test(kbText) ||
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+20\d{2}\b/i.test(kbText);
    if (!hasDate) return false;
  }
  // Otherwise consider sufficient if we have non-empty text
  return true;
}

/** =========================
 * Web: Search (Serper) + Fetch
 * ======================== */
function serperTbs(recencyDays?: number) {
  if (!recencyDays || recencyDays <= 0) return undefined;
  if (recencyDays <= 7) return "qdr:w";
  if (recencyDays <= 31) return "qdr:m";
  if (recencyDays <= 365) return "qdr:y";
  return undefined;
}

async function serperSearch(q: string, topK: number, recencyDays?: number): Promise<WebSearchHit[]> {
  const body: any = { q, num: Math.min(topK, 10) };
  const tbs = serperTbs(recencyDays);
  if (tbs) body.tbs = tbs;

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Serper search failed: ${res.status}`);
  const data = await res.json() as any;
  const items = (data?.organic ?? []) as any[];
  return items.map((it: any) => ({
    title: it?.title ?? "",
    url: it?.link ?? "",
    snippet: it?.snippet ?? "",
    publishedAt: it?.date ?? undefined,
  })).filter(r => !!r.url);
}

function chooseBest(results: WebSearchHit[], args: { recencyDays?: number }): WebSearchHit | undefined {
  const allowHints = safeJson<string[]>(process.env.ALLOWLIST, []);
  const block = safeJson<string[]>(process.env.BLOCKLIST, []);
  const recentCutoff = args.recencyDays ? nowMinus(args.recencyDays) : 0;

  const scored = results
    .filter(r => isHttpUrl(r.url))
    .filter(r => !block.some(b => r.url.includes(b)))
    .map(r => {
      const dateScore = r.publishedAt ? Math.max(0, (Date.parse(r.publishedAt) - recentCutoff) / (1000 * 60 * 60 * 24)) : 0;
      const domainScore = scoreDomain(r.url, allowHints);
      const total = domainScore * 2 + (dateScore > 0 ? 1 : 0);
      return { ...r, _score: total };
    })
    .sort((a, b) => (b as any)._score - (a as any)._score);

  return scored[0];
}

async function fetchAndExtract(urlStr: string, maxChars: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(urlStr, {
      signal: ctrl.signal,
      headers: { "user-agent": "AmplifyChatBot/1.0 (+https://docs.amplify.aws/)" },
    });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/html")) {
      // Skip non-HTML (PDF etc.). You can swap in a PDF extractor here if desired.
      throw new Error(`Unsupported content-type: ${ct}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const title = ($("title").first().text() || "").trim();

    let body =
      $("main").text() ||
      $('[role="main"]').text() ||
      $(".article, .content, .post, .docMainContainer, .markdown").text() ||
      $("body").text();

    body = body.replace(/\s+/g, " ").trim();
    if (body.length > maxChars) body = body.slice(0, maxChars) + "…";

    const links = Array.from(new Set($("a[href]")))
      .slice(0, 20)
      .map((el) => ($(el).attr("href") || ""))
      .filter(Boolean)
      .map(href => {
        try { return new URL(href, urlStr).toString(); } catch { return ""; }
      })
      .filter(Boolean);

    const publishedAt = extractDate($);
    return { title, text: body, links, publishedAt };
  } finally {
    clearTimeout(t);
  }
}

function safeJson<T>(raw: string | undefined, fallback: T): T {
  try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

/** =========================
 * Orchestrator Handler
 * ======================== */
export const handler = async (event: { arguments?: ToolArgs }): Promise<Payload> => {
  const { question, topK = 5, recencyDays = 180, site, maxChars = MAX_CHARS_DEFAULT } = event.arguments || ({} as ToolArgs);

  console.log("data handler triggred", event)
  if (!question?.trim()) {
    return { answer: "question is required", sources: [], method: "kb" };
  }

  // 0) KB first (server-enforced)
  const kb = await kbRetrieve(question);
  const kbOk = kbSufficient(question, kb?.text ?? null);
  if (kbOk && kb) {
    return {
      answer: kb.text,
      sources: kb.sources.length ? kb.sources.slice(0, 2) : [{ url: "Bedrock Knowledge Base" }],
      method: "kb",
    };
  }

  // 1) Web browse: search -> choose -> fetch (with one retry if first choice fails quality checks)
  const siteHint = site || canonicalSiteHint(question);
  const query = siteHint ? `site:${siteHint} ${question}` : question;

  const hits = await serperSearch(query, topK, recencyDays);
  if (!hits.length) {
    return { answer: "No search results found.", sources: [], method: "web" };
  }

  const tryOrder: WebSearchHit[] = [];
  const primary = chooseBest(hits, { recencyDays }) || hits[0];
  tryOrder.push(primary);

  // simple retry: if the best isn't canonical/recent we try the next best once
  const fallback = hits.find(h => h.url !== primary.url);
  if (fallback) tryOrder.push(fallback);

  for (const h of tryOrder) {
    try {
      const url = cleanUrl(h.url);
      const page = await fetchAndExtract(url, maxChars);

      // Basic quality gate: ensure we actually got content; for time-sensitive, prefer having a date
      const okLen = (page.text || "").length > 200;
      const okDate = !TIME_SENSITIVE.test(question) || !!page.publishedAt;
      if (!okLen || !okDate) continue;

      return {
        answer: page.text.slice(0, 400), // concise; your chat can format this further
        sources: [{ url, title: page.title, publishedAt: page.publishedAt }],
        method: "web",
      };
    } catch {
      // try next
      continue;
    }
  }

  // If both attempts failed:
  return { answer: "No authoritative recent source found.", sources: [], method: "web" };
};
