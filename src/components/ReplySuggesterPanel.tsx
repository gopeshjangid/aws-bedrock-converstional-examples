import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";

const client = generateClient<Schema>();

type ReplySuggesterPanelProps = {
  chatId: string;
  /** Your app’s internal userId (not necessarily the Cognito sub). */
  currentUserId: string;
  /** How many suggestions to request (backend default 3). */
  count?: number;
  /** Called when user taps a suggestion. */
  onPick?: (text: string) => void;
  /** Optional: auto-fetch on mount & when chatId changes. Default true. */
  auto?: boolean;
  /** Optional: className for outer wrapper. */
  className?: string;
};

type SuggestionsPayload = { suggestions: string[] };

/** Minimal pill button */
function Pill({
  children,
  onClick,
  title,
}: {
  children: string;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm hover:bg-gray-50 active:scale-[0.98] transition"
    >
      {children}
    </button>
  );
}

export default function ReplySuggesterPanel({
  chatId,
  currentUserId,
  count = 3,
  onPick,
  auto = true,
  className = "",
}: ReplySuggesterPanelProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canFetch = useMemo(
    () => Boolean(chatId && currentUserId && count > 0),
    [chatId, currentUserId, count]
  );

  const fetchSuggestions = useCallback(async () => {
    if (!canFetch || loading) return;
    setLoading(true);
    setErr(null);
    setSuggestions([]);

    // Abort any prior in-flight call
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const { data, errors } = await client.queries.recommendReplies(
        {
          chatId,
          currentUserId,
          numSuggestions: count,
        }
      );

      if (errors?.length) {
        setErr(errors[0]?.message ?? "Unknown error");
      }

      const payload = (data ?? {}) as unknown as SuggestionsPayload;
      setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setErr(e?.message || "Failed to fetch suggestions");
      }
    } finally {
      setLoading(false);
    }
  }, [chatId, currentUserId, count, canFetch, loading]);

  useEffect(() => {
    if (auto) fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, currentUserId, count, auto]);

  return (
    <div className={`w-full rounded-2xl border p-3 shadow-sm ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium text-gray-600">Reply suggestions</div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border px-2 py-1 text-sm"
            value={count}
            onChange={(e) => {
              // Trigger fetch with new count
              const next = Math.max(1, Math.min(6, Number(e.target.value) || 3));
              // Quick-n-dirty: force a re-fetch by setting state then calling fetch
              // Better UX: lift `count` state to parent.
              (e.target as HTMLSelectElement).blur();
              // We rely on parent prop `count`; for self-contained example, we refetch now:
              // You can remove this call if parent controls `count`.
              fetchSuggestions();
            }}
          >
            {[3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={fetchSuggestions}
            className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50 active:scale-[0.98] transition"
            disabled={loading || !canFetch}
            title="Regenerate"
          >
            {loading ? "Thinking…" : "Regenerate"}
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {loading && !suggestions.length ? (
          <>
            <SkeletonPill />
            <SkeletonPill />
            <SkeletonPill />
          </>
        ) : suggestions.length ? (
          suggestions.map((s, i) => (
            <Pill key={`${i}-${s.slice(0, 8)}`} onClick={() => onPick?.(s)} title="Click to use">
              {s}
            </Pill>
          ))
        ) : (
          <div className="text-sm text-gray-500">No suggestions yet.</div>
        )}
      </div>
    </div>
  );
}

function SkeletonPill() {
  return (
    <div className="h-8 w-40 animate-pulse rounded-full bg-gray-200" />
  );
}
