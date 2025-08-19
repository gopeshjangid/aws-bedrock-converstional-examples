import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../amplify/data/resource";

/**
 * RealtimeTranscriber
 * --------------------
 * A React (TypeScript) component that streams microphone audio to AssemblyAI Realtime over WebSocket
 * directly from the browser and renders live transcripts. It also lets the user download a WAV of
 * what was sent to the server.
 *
 * Notes:
 * - Browsers cannot set custom WebSocket headers. AssemblyAI supports ephemeral tokens via a `token`
 *   query param. Provide that token by implementing a backend that returns one. This component will
 *   call an Amplify Gen 2 Data query named `generateToken` by default.
 * - The mic stream is captured via Web Audio API and downsampled to 16kHz PCM int16 before sending.
 * - Tested with Vite/React (ESM). No Node-only modules used.
 */

// -----------------------------
// Types
// -----------------------------
export type RealtimeTranscriberProps = {
  /**
   * Optional: provide your own function to fetch the AssemblyAI ephemeral token.
   * If omitted, we'll call Amplify Data `client.queries.generateToken()`.
   */
  getToken?: () => Promise<string | undefined>;
  /**
   * WebSocket base URL. Defaults to AssemblyAI realtime endpoint.
   */
  wsBaseUrl?: string;
  /**
   * Target sample rate for AssemblyAI (defaults to 16000).
   */
  outputSampleRate?: number;
  /**
   * Whether to auto-start on mount (default false).
   */
  autoStart?: boolean;
  /**
   * Optional callback for receiving final/partial transcript messages.
   */
  onTranscript?: (text: string, isFinal: boolean) => void;
  /** Enable debug logging to console */
  debug?: boolean;
  /** Additionally log every audio processing chunk (very verbose) */
  verboseAudio?: boolean;
  /**
   * Optional className for container
   */
  className?: string;
};

// -----------------------------
// Helpers: WAV encoding
// -----------------------------
function encodeWavFromInt16(pcm: Int16Array, sampleRate: number, channels = 1) {
  const bytesPerSample = 2; // 16-bit
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(wavBuffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16 bits per sample

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, pcm.byteLength, true);

  // PCM data
  new Int16Array(wavBuffer, 44).set(pcm);

  return new Blob([wavBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

// -----------------------------
// Helpers: Int16 concat
// -----------------------------
function concatInt16(chunks: Int16Array[]): Int16Array {
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Int16Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// -----------------------------
// PCM Resampler (very small, nearest-neighbor)
// -----------------------------
class PCMResampler {
  private readonly ratio: number;
  private tail: Float32Array = new Float32Array(0);

  constructor(private readonly inputRate: number, private readonly outputRate: number) {
    this.ratio = inputRate / outputRate;
  }

  reset() {
    this.tail = new Float32Array(0);
  }

  process(chunk: Float32Array): Int16Array {
    // Merge tail from previous call
    const input = new Float32Array(this.tail.length + chunk.length);
    input.set(this.tail, 0);
    input.set(chunk, this.tail.length);

    // Determine output length
    const outLen = Math.floor(input.length / this.ratio);
    const out = new Int16Array(outLen);

    let i = 0; // float index in input space
    for (let o = 0; o < outLen; o++) {
      const idx = Math.floor(i);
      let sample = input[idx] ?? 0;
      // clamp and convert to int16
      if (sample > 1) sample = 1;
      else if (sample < -1) sample = -1;
      out[o] = (sample * 0x7fff) | 0;
      i += this.ratio;
    }

    // Keep remaining unconsumed input as tail
    const consumed = Math.floor(outLen * this.ratio);
    this.tail = input.slice(consumed);

    return out;
  }
}

// -----------------------------
// Amplify client (default token fetcher)
// -----------------------------
const amplifyClient = generateClient<Schema>();

async function defaultGetToken(): Promise<string | undefined> {
  try {
    const res: any = await amplifyClient.queries.generateToken({});
    if (typeof res === "string") return res;
    if (res?.data && typeof res.data === "string") return res.data;
    if (res?.data?.token && typeof res.data.token === "string") return res.data.token;
    if (res?.token && typeof res.token === "string") return res.token;
  } catch (e) {
    console.error("[RT] Failed to get token from Amplify Data:", e);
  }
  return undefined;
}

// -----------------------------
// Component
// -----------------------------
export default function RealtimeTranscriber({
  getToken = defaultGetToken,
  wsBaseUrl = "wss://streaming.assemblyai.com/v3/ws",
  outputSampleRate = 16000,
  autoStart = false,
  onTranscript,
  debug = false,
  verboseAudio = false,
  className,
}: RealtimeTranscriberProps) {
  const [connected, setConnected] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expiresAtIso, setExpiresAtIso] = useState<string | null>(null);
  const [finalLines, setFinalLines] = useState<string[]>([]);
  const [partial, setPartial] = useState<string>("");
  const [wavUrl, setWavUrl] = useState<string | null>(null);

  // Refs for resources that should persist without triggering re-renders
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const resamplerRef = useRef<PCMResampler | null>(null);
  const sentPcmChunksRef = useRef<Int16Array[]>([]);
  const bytesSentRef = useRef(0);
  const lastThroughputLogRef = useRef(0);

  // Logger helpers (prefix + gating)
  const log = useCallback((...args: any[]) => {
    if (debug) console.log("[RT]", ...args);
  }, [debug]);
  const warn = useCallback((...args: any[]) => {
    if (debug) console.warn("[RT]", ...args);
  }, [debug]);
  const err = useCallback((...args: any[]) => {
    console.error("[RT]", ...args);
  }, []);

  // Cleanup WAV URL when remounted
  useEffect(() => {
    return () => {
      if (wavUrl) URL.revokeObjectURL(wavUrl);
    };
  }, [wavUrl]);

  const buildWsUrl = useCallback(
    (token?: string) => {
      const params = new URLSearchParams({
        sample_rate: String(outputSampleRate),
        format_turns: "true",
      });
      if (token) {
        const masked = token.length > 8 ? token.slice(0, 4) + "…" + token.slice(-4) : "(short)";
        log("Attaching token to WS URL:", masked);
        params.set("token", token);
      } else {
        warn("No token provided; attempting anonymous (likely to fail)");
      }
      const full = `${wsBaseUrl}?${params.toString()}`;
      log("Built WS URL:", full.replace(/token=[^&]+/i, "token=***"));
      return full;
    },
    [log, warn, outputSampleRate, wsBaseUrl]
  );

  // --- define BEFORE users ---
  const stopAudioPipeline = useCallback(() => {
    log("Stopping audio pipeline…");
    try {
      processorRef.current?.disconnect();
    } catch (e) {
      warn("processor.disconnect error", e);
    }
    try {
      sourceRef.current?.disconnect();
    } catch (e) {
      warn("source.disconnect error", e);
    }
    try {
      audioCtxRef.current?.close();
    } catch (e) {
      warn("audioCtx.close error", e);
    }
    processorRef.current = null;
    sourceRef.current = null;
    audioCtxRef.current = null;
    resamplerRef.current?.reset();
  }, [log, warn]);

  const finalizeWav = useCallback(() => {
    if (sentPcmChunksRef.current.length === 0) {
      warn("No PCM chunks to finalize");
      return null;
    }
    log("Finalizing WAV…", { chunks: sentPcmChunksRef.current.length });
    const pcm = concatInt16(sentPcmChunksRef.current);
    const blob = encodeWavFromInt16(pcm, outputSampleRate, 1);
    const durationSec = pcm.length / outputSampleRate;
    log("WAV ready:", { samples: pcm.length, durationSec: +durationSec.toFixed(2), size: blob.size });
    sentPcmChunksRef.current = [];
    return blob;
  }, [log, warn, outputSampleRate]);

  const stop = useCallback(() => {
    log("Stop requested");
    const wav = finalizeWav();
    if (wav) {
      if (wavUrl) URL.revokeObjectURL(wavUrl);
      const url = URL.createObjectURL(wav);
      setWavUrl(url);
      log("WAV URL created:", url);
    }

    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "Terminate" }));
        log("Terminate message sent");
      }
    } catch (e) {
      warn("Terminate send error", e);
    }

    try {
      wsRef.current?.close();
      log("WebSocket close requested");
    } catch (e) {
      warn("ws.close error", e);
    }
    wsRef.current = null;

    stopAudioPipeline();

    setRecording(false);
    setConnected(false);
  }, [finalizeWav, stopAudioPipeline, wavUrl, log, warn]);

  const openWebSocket = useCallback(async () => {
    setError(null);
    setSessionId(null);
    setExpiresAtIso(null);

    log("Opening WebSocket…");

    let token: string | undefined;
    try {
      token = await getToken();
      log("Token fetch complete:", token ? "(received)" : "(none)");
    } catch (e) {
      warn("getToken threw:", e);
    }

    const url = buildWsUrl(token);
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      wsRef.current = ws;
      setConnected(true);
      log("WebSocket opened");
    };

    ws.onerror = (evt) => {
      err("WebSocket error", evt);
      setError("WebSocket error. See console for details.");
    };

    ws.onclose = (evt) => {
      log("WebSocket closed:", { code: evt.code, reason: evt.reason });
      setConnected(false);
      wsRef.current = null;
      if (recording) stopAudioPipeline();
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(typeof evt.data === "string" ? evt.data : "{}");
        const type = data?.type as string | undefined;
        if (!type) return;
        log("WS message type:", type);

        if (type === "Begin") {
          const id = data.id as string | undefined;
          const exp = data.expires_at as number | undefined; // seconds
          if (id) setSessionId(id);
          if (typeof exp === "number") setExpiresAtIso(new Date(exp * 1000).toISOString());
          log("Session began:", { id, expiresAt: exp });
        } else if (type === "Turn") {
          const t = (data.transcript as string) ?? "";
          const formatted = Boolean(data.turn_is_formatted);
          const preview = t.length > 120 ? t.slice(0, 120) + "…" : t;
          if (formatted) {
            setPartial("");
            setFinalLines((prev) => [...prev, t]);
            onTranscript?.(t, true);
            log("Turn FINAL:", preview);
          } else {
            setPartial(t);
            onTranscript?.(t, false);
            log("Turn PARTIAL:", preview);
          }
        } else if (type === "Termination") {
          log("Session termination message:", {
            audioDuration: data.audio_duration_seconds,
            sessionDuration: data.session_duration_seconds,
          });
        }
      } catch (e) {
        err("Failed to parse ws message", e);
      }
    };

    return ws;
  }, [buildWsUrl, getToken, log, warn, err, onTranscript, recording, stopAudioPipeline]);

  const start = useCallback(async () => {
    try {
      log("Start requested");
      const ws = await openWebSocket();

      const constraints: MediaStreamConstraints = {
        audio: {
          channelCount: 1,
          sampleRate: { ideal: 48000 },
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      };
      log("Requesting getUserMedia with:", constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      log("getUserMedia OK");

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      log("AudioContext created:", { inputRate: audioCtx.sampleRate, outputSampleRate });

      resamplerRef.current = new PCMResampler(audioCtx.sampleRate, outputSampleRate);
      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      log("ScriptProcessor created (bufferSize=4096)");

      bytesSentRef.current = 0;
      lastThroughputLogRef.current = performance.now();

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const resampler = resamplerRef.current;
        const socket = wsRef.current;
        if (!resampler || !socket || socket.readyState !== WebSocket.OPEN) return;

        const int16 = resampler.process(input);
        if (int16.length > 0) {
          sentPcmChunksRef.current.push(int16);
          socket.send(int16.buffer);

          // Throughput logging
          const bytes = int16.byteLength; // 2 bytes per sample
          bytesSentRef.current += bytes;
          const now = performance.now();
          const elapsed = now - lastThroughputLogRef.current;
          if (verboseAudio || elapsed > 1000) {
            const seconds = bytesSentRef.current / (outputSampleRate * 2);
            log(
              `Audio streaming: sent=${bytesSentRef.current} bytes (~${seconds.toFixed(2)}s at ${outputSampleRate}Hz)`
            );
            lastThroughputLogRef.current = now;
            if (verboseAudio) log("Chunk:", { samples: int16.length, bytes });
          }
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination); // keep node alive in some browsers

      setRecording(true);
      log("Recording started");
    } catch (e: any) {
      err("Start failed", e);
      setError(e?.message || "Failed to start microphone session");
      // ensure cleanup
      stop();
    }
  }, [openWebSocket, outputSampleRate, log, err, stop, verboseAudio]);

  // Cleanup on unmount
  useEffect(() => {
    if (autoStart) {
      log("autoStart enabled; starting on mount");
      start();
    }
    return () => {
      log("Unmount: ensuring stop/cleanup");
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusLine = useMemo(() => {
    if (error) return `Error: ${error}`;
    if (recording && connected) return "Connected and recording";
    if (connected) return "Connected";
    return "Idle";
  }, [connected, recording, error]);

  return (
    <div className={"w-full max-w-2xl space-y-4 " + (className ?? "")}> 
      <div className="flex items-center gap-2">
        {!recording ? (
          <button
            className="px-4 py-2 rounded-2xl shadow border"
            onClick={start}
          >
            Start
          </button>
        ) : (
          <button
            className="px-4 py-2 rounded-2xl shadow border"
            onClick={stop}
          >
            Stop
          </button>
        )}
        <span className="text-sm opacity-70">{statusLine}</span>
      </div>

      <div className="rounded-2xl border p-3 bg-white/40">
        <div className="text-xs opacity-70">Session</div>
        <div className="text-sm">ID: {sessionId ?? "—"}</div>
        <div className="text-sm">Expires: {expiresAtIso ?? "—"}</div>
      </div>

      <div className="rounded-2xl border p-3 bg-white/40">
        <div className="text-xs opacity-70 mb-2">Transcript</div>
        <div className="space-y-1">
          {finalLines.map((line, i) => (
            <div key={i} className="text-sm">
              {line}
            </div>
          ))}
          {partial && (
            <div className="text-sm opacity-70 italic">{partial}</div>
          )}
        </div>
      </div>

      {wavUrl && (
        <div className="rounded-2xl border p-3 bg-white/40">
          <a
            href={wavUrl}
            download={`realtime-${Date.now()}.wav`}
            className="underline"
          >
            Download WAV
          </a>
        </div>
      )}
    </div>
  );
}
