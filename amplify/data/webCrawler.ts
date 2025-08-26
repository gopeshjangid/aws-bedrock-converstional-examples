import * as cheerio from "cheerio";

// ---------- Types ----------
type Args = {
  query: string;
  topK?: number;        // default 5
  recencyDays?: number; // bias toward recent links
  site?: string;        // optional site restriction
  maxChars?: number;    // clamp extracted text (default 4000)
};

type Result = {
  url: string;
  title: string;
  text: string;
  links: string[];
  publishedAt?: string;
//   chosenFrom: Array<{ title: string; url: string; snippet?: string; publishedAt?: string }>;
};

// ---------- Helpers ----------
const MAX_CHARS_DEFAULT = 4000;

function nowMinus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.getTime();
}
function isHttpUrl(u: string) {
  try { const url = new URL(u); return ["http:", "https:"].includes(url.protocol); } catch { return false; }
}
function clean(u: string) { const url = new URL(u); url.hash = ""; return url.toString(); }

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


function serperTbs(recencyDays?: number) {
  if (!recencyDays || recencyDays <= 0) return undefined;
  if (recencyDays <= 7) return "qdr:w";
  if (recencyDays <= 31) return "qdr:m";
  if (recencyDays <= 365) return "qdr:y";
  return undefined;
}
async function serperSearch(q: string, topK: number, recencyDays?: number) {
  const body: any = { q, num: Math.min(topK, 10) };
  const tbs = serperTbs(recencyDays);
  if (tbs) body.tbs = tbs;
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": 'e5054b678ffa1ee8b3f995a0a7de52d4c9797420', "Content-Type": "application/json" },
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
  })).filter((r: any) => r.url);
}

function chooseBest(results: Array<{ title: string; url: string; publishedAt?: string }>, args: Args) {
  const allowHints = JSON.parse(process.env.ALLOWLIST ?? "[]") as string[];
  const block = JSON.parse(process.env.BLOCKLIST ?? "[]") as string[];

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
    .sort((a, b) => b._score - a._score);

  return scored[0];
}

async function fetchAndExtract(urlStr: string, maxChars: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(urlStr, {
      signal: controller.signal,
      headers: { "user-agent": "AmplifyChatBot/1.0 (+https://docs.amplify.aws/)" },
    });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) throw new Error(`Unsupported content-type: ${ct}`);

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
      .map(el => $(el).attr("href"))
      .filter(Boolean)
      .map(href => {
        try { return new URL(href!, urlStr).toString(); } catch { return null; }
      })
      .filter(Boolean) as string[];

    const publishedAt = extractDate($);
    return { title, text: body, links, publishedAt };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Handler ----------
export const handler = async (event: { arguments: Args }): Promise<Result> => {

    console.log("event from the model", event)
  const { query, topK = 5, recencyDays = 60, site, maxChars = MAX_CHARS_DEFAULT } = event.arguments || {};
  if (!query?.trim()) throw new Error("query is required");

  console.log("crawler triggred")
//   const provider = pickProvider();
  const q = site ? `site:${site} ${query}` : query;

  const rawResults = await serperSearch(q, topK, recencyDays)

  if (!rawResults.length) throw new Error("No search results found");

  const best = chooseBest(rawResults, { query, topK, recencyDays, site, maxChars });
  if (!best) throw new Error("No suitable result after filtering");

  const url = clean(best.url);
  const { title, text, links, publishedAt } = await fetchAndExtract(url, maxChars);

  return {
    url,
    title,
    text,
    links,
    publishedAt,
    // chosenFrom: rawResults.slice(0, topK),
  };
};
