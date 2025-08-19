import { useEffect, useRef, useState } from "react";
import ReplySuggesterPanel from "./ReplySuggesterPanel";
// If you want to derive currentUserId from Amplify Auth:
// import { getCurrentUser } from "aws-amplify/auth";

type Props = {
  chatId: string;
  /** Your app’s internal user id (maps to Message.senderId / User.userId) */
  currentUserId: string;
  /** Hook this to your own mutation / Data API to send a message */
  onSend?: (text: string) => Promise<void> | void;
};

export default function ChatComposerWithSuggestions({
  chatId,
  currentUserId,
  onSend,
}: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Example: if you prefer to auto-get current user id
  // useEffect(() => {
  //   (async () => {
  //     const user = await getCurrentUser();
  //     console.log("signed-in:", user);
  //   })();
  // }, []);

  const handlePick = (s: string) => {
    setText(s);
    // focus input for quick edits
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      setSending(true);
      await onSend?.(trimmed);
      setText("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <ReplySuggesterPanel
        chatId={chatId}
        currentUserId={currentUserId}
        count={3}
        onPick={handlePick}
      />

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          className="flex-1 rounded-lg border px-3 py-2"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
