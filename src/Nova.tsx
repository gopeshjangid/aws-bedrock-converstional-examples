// src/components/NovaSonicOneShot.tsx
import React, { useEffect, useRef, useState } from "react";

type Props = {
  endpoint: string;                 // e.g. https://abc123.execute-api.ap-south-1.amazonaws.com/prod/speech
  systemPrompt?: string;            // optional system prompt string
  requestHeaders?: Record<string, string>; // e.g. { Authorization: `Bearer ${token}` }
};

export default function NovaSonicOneShot({ endpoint, systemPrompt, requestHeaders }: Props) {
  const [status, setStatus] = useState<"idle" | "recording" | "processing" | "playing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [replyUrl, setReplyUrl] = useState<string | null>(null); // downloadable WAV of reply

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const buffersRef = useRef<Float32Array[]>([]);
  const inputSampleRateRef = useRef<number>(48000);

  useEffect(() => {
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Recording control ---
  const start = async () => {
    try {
      setError(null);
      setStatus("recording");
      buffersRef.current = [];

      // mic @ typically 48k
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true } });
      sourceStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = ctx;
      inputSampleRateRef.current = ctx.sampleRate;

      const src = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0);
        // clone the buffer (AudioBuffer memory is reused)
        buffersRef.current.push(new Float32Array(ch));
      };

      src.connect(processor);
      processor.connect(ctx.destination); // keep node alive (no audible sound)
    } catch (e: any) {
      setError(e?.message || String(e));
      setStatus("idle");
      cleanup();
    }
  };

  const stop = async () => {
    try {
      if (status !== "recording") return;
      setStatus("processing");

      // stop nodes
      processorRef.current?.disconnect();
      processorRef.current = null;
      sourceStreamRef.current?.getTracks().forEach((t) => t.stop());
      sourceStreamRef.current = null;

      const ctx = audioCtxRef.current!;
      // combine chunks -> one big Float32
      const float48k = concatFloat32(buffersRef.current);
      buffersRef.current = [];

      // resample to 16k
      const float16k = await resampleFloat(float48k, inputSampleRateRef.current, 16000);

      // convert to 16-bit PCM
      const pcm16 = float32ToInt16(float16k);
      const base64 = base64FromArrayBuffer(pcm16.buffer);

      // call your Lambda
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(requestHeaders || {}),
        },
        body: JSON.stringify({
          audio: base64,
          systemPrompt: systemPrompt || undefined,
        }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Lambda error: ${res.status} ${t}`);
      }

     const json = await res.json();
const replyBase64: string = json.audio || "";
const replyRate: number = json.sampleRateHertz || 24000;

if (!replyBase64) {
  console.warn("No audio returned:", json.diagnostics || json.message);
  setError("No audio returned from model. Try a longer utterance.");
  setStatus("idle");
  return;
}

      // decode to PCM16 and play
      const arrBuf = arrayBufferFromBase64(replyBase64);
      const int16 = new Int16Array(arrBuf);
      await playPcm16Mono(int16, replyRate);

      // also generate a WAV for download
      const wav = encodeWavPcm16Mono(int16, replyRate);
      const blobUrl = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      setReplyUrl(blobUrl);

      setStatus("idle");
    } catch (e: any) {
      setError(e?.message || String(e));
      setStatus("idle");
    } finally {
      // keep ctx around for playback; don’t close here
    }
  };

  const cleanup = () => {
    try { processorRef.current?.disconnect(); } catch {}
    try { sourceStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { audioCtxRef.current?.close(); } catch {}
    processorRef.current = null;
    sourceStreamRef.current = null;
    audioCtxRef.current = null;
  };

  return (
    <div className="p-3 border rounded max-w-xl">
      <h3 className="text-lg font-semibold mb-2">Nova Sonic — One-Shot Speech ↔ Speech</h3>

      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={start}
          disabled={status === "recording" || status === "processing"}
          className="px-3 py-1 rounded border"
        >
          {status === "recording" ? "Recording…" : "Start"}
        </button>
        <button
          onClick={stop}
          disabled={status !== "recording"}
          className="px-3 py-1 rounded border"
        >
          Stop & Send
        </button>
        <span className="text-sm opacity-70">Status: {status}</span>
      </div>

      {error && <div className="text-red-600 text-sm mb-2">Error: {error}</div>}
      {replyUrl && (
        <a className="text-blue-600 underline text-sm" href={replyUrl} download="nova-reply.wav">
          Download last reply (.wav)
        </a>
      )}
    </div>
  );
}

/* --------------------- Helpers --------------------- */

function concatFloat32(chunks: Float32Array[]) {
  const total = chunks.reduce((n, a) => n + a.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const a of chunks) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

// High-quality resample using OfflineAudioContext when available
async function resampleFloat(input: Float32Array, fromRate: number, toRate: number) {
  if (fromRate === toRate) return input;
  try {
    const offline = new OfflineAudioContext(1, Math.ceil((input.length * toRate) / fromRate), toRate);
    const buffer = offline.createBuffer(1, input.length, fromRate);
    buffer.copyToChannel(input, 0);
    const src = offline.createBufferSource();
    src.buffer = buffer;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    const out = new Float32Array(rendered.length);
    rendered.copyFromChannel(out, 0);
    return out;
  } catch {
    // Fallback: linear interpolation
    const ratio = toRate / fromRate;
    const newLen = Math.round(input.length * ratio);
    const out = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const srcPos = i / ratio;
      const x0 = Math.floor(srcPos);
      const x1 = Math.min(x0 + 1, input.length - 1);
      const t = srcPos - x0;
      out[i] = input[x0] * (1 - t) + input[x1] * t;
    }
    return out;
  }
}

function float32ToInt16(f32: Float32Array) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function base64FromArrayBuffer(buf: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function arrayBufferFromBase64(base64: string) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function playPcm16Mono(int16: Int16Array, sampleRate: number) {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
  const float = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float[i] = int16[i] / 0x8000;
  const buffer = ctx.createBuffer(1, float.length, sampleRate);
  buffer.copyToChannel(float, 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start();
  await new Promise((r) => setTimeout(r, (float.length / sampleRate) * 1000 + 50));
  await ctx.close();
}

function encodeWavPcm16Mono(int16: Int16Array, sampleRate: number) {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = int16.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // PCM samples
  let offset = 44;
  for (let i = 0; i < int16.length; i++, offset += 2) {
    view.setInt16(offset, int16[i], true);
  }
  return buffer;
}
function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
