// Convo.tsx
import React, { useEffect, useRef, useState } from "react";
import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../amplify/data/resource";

Amplify.configure(outputs);

// IMPORTANT: signed-in users -> userPool
const client = generateClient<Schema>({ authMode: "userPool" });

type Msg = { id: string; role: "user" | "assistant"; message: string };

export default function Convo() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);

  const chatRef = useRef<Awaited<ReturnType<typeof client.conversations.chat.create>>["data"] | null>(null);
  const subRef = useRef<{ unsubscribe?: () => void } | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);

  useEffect(() => {
    let off = false;

    (async () => {
      setUiError(null);

      // 1) Create the conversation
      const res = await client.conversations.chat.create(
    
      );

      // Guard: surface GraphQL/AppSync errors
      if (res.errors?.length) {
        setUiError(res.errors[0]?.message || "Failed to create conversation");
        console.error("createConversationChat errors:", res.errors);
        return;
      }

      const chat = res.data;
      if (!chat || !chat.id) {
        setUiError("Conversation create returned no id (Unauthorized or schema auth?).");
        console.error("createConversationChat result:", res);
        return;
      }
      if (off) return;

      chatRef.current = chat;

      // 2) Subscribe to streaming events ONLY after we have an id
      subRef.current?.unsubscribe?.();
      subRef.current = chat.onStreamEvent({
        next: (event: any) => {
          // Try common shapes for streamed text
          const delta =
            event?.delta ??
            event?.text ??
            event?.data?.delta ??
            event?.data?.text ??
            event?.assistantResponse?.output?.text ??
            "";

          if (typeof delta === "string" && delta.length) {
            const id = activeAssistantIdRef.current;
            if (!id) return;
            setMessages(prev => prev.map(m => m.id === id ? { ...m, message: m.message + delta } : m));
          }

          // Mark completion on "done/complete"
          const s = JSON.stringify(event).toLowerCase();
          if (s.includes("done") || s.includes("complete")) {
            activeAssistantIdRef.current = null;
            setBusy(false);
          }
        },
        error: (err) => {
          console.error("stream error:", err);
          const id = activeAssistantIdRef.current;
          if (id) {
            setMessages(prev => prev.map(m => m.id === id ? { ...m, message: m.message + "\n⚠️ Stream error" } : m));
          }
          activeAssistantIdRef.current = null;
          setBusy(false);
        },
      });
    })();

    return () => {
      off = true;
      subRef.current?.unsubscribe?.();
      subRef.current = null;
    };
  }, []);

  async function send(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setInput("");
    setBusy(true);
    setUiError(null);

    // Add user and empty assistant bubbles
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    activeAssistantIdRef.current = assistantId;
    setMessages(prev => [
      ...prev,
      { id: userId, role: "user", message: text },
      { id: assistantId, role: "assistant", message: "" },
    ]);

    const chat = chatRef.current;
    if (!chat || !chat.id) {
      setUiError("Conversation not ready (no id). Check auth.");
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, message: "⚠️ Conversation not ready." } : m));
      activeAssistantIdRef.current = null;
      setBusy(false);
      return;
    }

    const res = await chat.sendMessage({
  content: [{ text: text }],
  aiContext: {
    user: {
      userId: "81e3cd1a-e061-70ee-297e-5145cd4f6d78"
    }
  },
});
    if (res.errors?.length) {
      console.error("sendMessage errors:", res.errors);
      setUiError(res.errors[0]?.message || "Send failed");
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, message: "⚠️ Send failed." } : m));
      activeAssistantIdRef.current = null;
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h2 className="text-lg font-semibold mb-2">Amplify Conversations</h2>
      {uiError && <div className="text-sm text-red-600 mb-2">⚠️ {uiError}</div>}

      <div className="h-[50vh] overflow-y-auto border rounded-2xl p-3 bg-white">
        {messages.map((m) => (
          <div key={m.id} className={`my-2 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`${m.role === "user" ? "bg-indigo-600 text-white" : "bg-gray-100"} rounded-2xl px-3 py-2 max-w-[80%] whitespace-pre-wrap text-sm`}>
              {m.message}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          className="flex-1 border rounded-xl px-3 py-2"
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl disabled:opacity-50" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
