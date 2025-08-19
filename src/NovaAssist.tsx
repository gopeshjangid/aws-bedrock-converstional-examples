import React, { useEffect, useRef, useState } from "react";

// IMPORTANT: no trailing slash
const LAMBDA_WS = "wss://0ajhdxpqbk.execute-api.ap-south-1.amazonaws.com/prod";
const VERBOSE = true;

// Keep the whole message safely under API Gateway’s 128 KB limit.
// 1 second @ 16 kHz, 16-bit mono ≈ 32 KB raw (≈ 43 KB base64).
// We'll cap around ~2.0 s to stay well under the limit (JSON adds overhead).
const MAX_MS = 2000; // you can tweak to 1800–2200 if needed

function now() { return new Date().toISOString(); }
function kib(n: number) { return (n / 1024).toFixed(1) + " KiB"; }

export default function NovaSonicClient() {
  const [connected, setConnected] = useState(false);
  const [recording, setRecording] = useState(false);
  const [asr, setAsr] = useState("");
  const [stats, setStats] = useState({ frames: 0, upBytes: 0, ttsBytes: 0 });

  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const micNodeRef = useRef<AudioWorkletNode | null>(null);
  const playerRef = useRef<AudioWorkletNode | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const framesRef = useRef<Int16Array[]>([]);
  const startTsRef = useRef<number>(0);

  useEffect(() => () => stopAll(), []);

  function log(...args: any[]) { if (VERBOSE) console.log(`[${now()}]`, ...args); }

  function connect() {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(LAMBDA_WS);
    wsRef.current = ws;
    ws.onopen = () => { log("WS open"); setConnected(true); };
    ws.onclose = (e) => { log("WS close", e.code, e.reason); setConnected(false); };
    ws.onerror = (e) => { console.error(`[${now()}] WS error`, e); };
    ws.onmessage = onMsg;
  }

  function disconnect() { wsRef.current?.close(); }

  async function loadWorklet(ctx: AudioContext, file: string) {
    // Try a couple of URL shapes so Vite/Next public/ root works
    const urls = [`/${file}`, `${file}`];
    let lastErr: any = null;
    for (const u of urls) {
      try { await ctx.audioWorklet.addModule(u); log("Worklet loaded:", u); return; }
      catch (e) { console.warn(`[${now()}] Worklet failed: ${u}`, e); lastErr = e; }
    }
    throw lastErr ?? new Error(`Unable to load ${file}`);
  }

  async function armAudio() {
    const ctx = new AudioContext({ sampleRate: 48000 });
    ctxRef.current = ctx;
    log("AudioContext sampleRate=", ctx.sampleRate);

    await loadWorklet(ctx, "pcm16-worklet.js");
    await loadWorklet(ctx, "pcm-player-worklet.js");

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRef.current = stream;
    log("getUserMedia ok:", stream.getAudioTracks().length, "track(s)");

    const src = ctx.createMediaStreamSource(stream);

    // Mic worklet down-samples to 16 kHz Int16
    const mic = new AudioWorkletNode(ctx, "pcm16-worklet");
    mic.port.onmessage = (e) => {
      if (e.data?.type === "stats") { log("Mic stats", e.data); return; }
      if (!recording) return;
      if (e.data?.type === "frame") {
        const i16 = new Int16Array(e.data.buffer);
        // Guard: stop collecting when we exceed MAX_MS
        const elapsed = performance.now() - startTsRef.current;
        if (elapsed > MAX_MS) return; // silently ignore extra frames
        const copy = new Int16Array(i16.length); copy.set(i16);
        framesRef.current.push(copy);
        setStats((s) => ({ ...s, frames: s.frames + 1, upBytes: s.upBytes + copy.byteLength }));
      }
    };
    src.connect(mic);
    micNodeRef.current = mic;

    // Player worklet, receives Float32 @16 kHz and upsamples to device rate
    const player = new AudioWorkletNode(ctx, "pcm-player");
    player.port.onmessage = (e) => {
      if (e.data?.type === "player-stats") log("Player stats", e.data);
    };
    player.connect(ctx.destination);
    playerRef.current = player;
  }

  async function startRec() {
    if (!ctxRef.current) await armAudio();
    framesRef.current = [];
    startTsRef.current = performance.now();
    setStats((s) => ({ ...s, frames: 0, upBytes: 0 }));
    setRecording(true);
    log("Recording started (max ~", MAX_MS, "ms)");
  }

  async function stopAndSend() {
    setRecording(false);

    // concat frames → single Int16Array
    const frames = framesRef.current;
    const total = frames.reduce((n, a) => n + a.length, 0);
    const all = new Int16Array(total);
    let off = 0; for (const f of frames) { all.set(f, off); off += f.length; }

    // Estimate duration and size
    const bytes = all.byteLength;                               // 2 bytes per sample
    const ms = Math.round((bytes / 2 /*bytes/sample*/ / 16000) * 1000);
    log(`Stop & Send — samples=${all.length}, raw=${kib(bytes)}, ~${ms}ms`);

    // Encode base64
    const u8 = new Uint8Array(all.buffer);
    let b = ""; for (let i = 0; i < u8.length; i++) b += String.fromCharCode(u8[i]);
    const b64 = btoa(b);

    // Soft safety: warn if going near 128 KB payload (JSON adds overhead)
    if (b64.length > 100_000) {
      console.warn(`[${now()}] audio is large (${(b64.length/1024).toFixed(1)} KiB base64). Consider keeping turns under ~2 seconds.`);
    }

    wsRef.current?.send(JSON.stringify({
      action: "novaTurn",
      audioBase64: b64,
      session: {
        voiceId: "amy",
        sampleRateHz: 16000,
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 1024,
        system: "You are concise and friendly. Keep replies to 1–2 sentences."
      }
    }));
  }

  function onMsg(ev: MessageEvent) {
    let data: any = ev.data; try { data = JSON.parse(ev.data); } catch {}
    if (data.type === "asr") { setAsr(data.text || ""); log("ASR:", data.text); }
    if (data.type === "assistant_text") { log("Assistant:", data.text); }
    if (data.type === "tts") {
      const bin = atob(data.base64);
      const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const i16 = new Int16Array(u8.buffer);
      const f32 = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) f32[i] = Math.max(-1, Math.min(1, i16[i] / 32767));
      setStats((s) => ({ ...s, ttsBytes: s.ttsBytes + u8.byteLength }));
      playerRef.current?.port.postMessage(f32, [f32.buffer]);
      log(`TTS chunk ${kib(u8.byteLength)}`);
    }
    if (data.type === "usage") { log("Usage", data); }
    if (data.type === "done")  { log("Done", data); }
    if (data.type === "error") { console.error(`[${now()}] Server error`, data); }
  }

  function stopAll() {
    try { wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify({ action: "echo", message: "client closing" })); } catch {}
    wsRef.current?.close(); wsRef.current = null;
    micNodeRef.current?.disconnect(); playerRef.current?.disconnect();
    mediaRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();
    log("Audio stopped");
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-3">
      <h2 className="text-xl font-semibold">Nova Sonic — Turn-based (Lambda)</h2>

      <div className="flex gap-2">
        {!connected ? (
          <button className="px-4 py-2 rounded bg-black text-white" onClick={connect}>Connect</button>
        ) : (
          <button className="px-4 py-2 rounded bg-gray-200" onClick={disconnect}>Disconnect</button>
        )}

        {!recording ? (
          <button className="px-4 py-2 rounded bg-emerald-600 text-white" onClick={startRec}>Start Recording</button>
        ) : (
          <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={stopAndSend}>Stop & Send</button>
        )}
      </div>

      <div className="text-sm space-y-1">
        <div><b>ASR:</b> {asr}</div>
        <div className="text-xs text-gray-600">
          Frames: {stats.frames} | Up: {kib(stats.upBytes)} | Down (TTS): {kib(stats.ttsBytes)}
        </div>
        <div className="text-xs text-amber-700">
          Tip: keep each turn ≤ ~2 seconds to stay under API Gateway’s WebSocket message limits.
        </div>
      </div>
    </div>
  );
}
