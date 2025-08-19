// import React, { useCallback, useEffect, useRef, useState } from "react";
// import { generateClient } from "aws-amplify/data";
// import type { Schema } from "../amplify/data/resource";

// /**
//  * AudioCaptureToAppSync
//  *
//  * Records microphone audio in small chunks and streams each chunk
//  * to your Amplify backend via a custom AppSync mutation named `sendAudio`.
//  *
//  * Assumes your schema defines something like:
//  *   sendAudio: a.mutation()
//  *     .arguments({
//  *       sessionId: a.string(),
//  *       mimeType: a.string(),
//  *       chunkBase64: a.string(),
//  *       isFinal: a.boolean().default(false),
//  *     })
//  *     .returns(a.string())
//  *     .authorization(allow => [allow.authenticated()])
//  *
//  * On the client, Amplify will generate `client.mutations.sendAudio`.
//  */

// const client = generateClient<Schema>();

// export type AudioCaptureProps = {
//   /** Optional session / conversation id to correlate streams server-side */
//   sessionId?: string;
//   /** Timeslice (ms) for MediaRecorder; smaller = lower latency but more requests */
//   chunkMs?: number; // default 500ms
//   /** Preferred MIME type. We'll fall back if unsupported. */
//   preferredMimeType?: string; // e.g. 'audio/webm;codecs=opus'
//   /** Disable the UI and only expose imperative API via ref */
//   minimalUI?: boolean;
//   /** Called when a chunk is sent successfully */
//   onChunkSent?: (args: { size: number; isFinal: boolean }) => void;
//   /** Called when any error occurs */
//   onError?: (err: unknown) => void;
// };

// /**
//  * NOTE: This file is TypeScript/TSX. Ensure your tsconfig includes `"lib": ["ES2022", "DOM"]`
//  * so types like `MediaRecorder`/`BlobEvent` are available.
//  */

// type RecorderDataEvent = BlobEvent | (Event & { data: Blob });

// export default function AudioCaptureToAppSync({
//   sessionId,
//   chunkMs = 500,
//   preferredMimeType = "audio/webm;codecs=opus",
//   minimalUI = false,
//   onChunkSent,
//   onError,
// }: AudioCaptureProps) {
//   const [isRecording, setIsRecording] = useState(false);
//   const [mimeType, setMimeType] = useState<string>("audio/webm");
//   const [level, setLevel] = useState<number>(0); // 0..1
//   const [elapsedMs, setElapsedMs] = useState<number>(0);

//   const mediaStreamRef = useRef<MediaStream | null>(null);
//   const mediaRecorderRef = useRef<MediaRecorder | null>(null);
//   const tickTimerRef = useRef<number | null>(null);

//   // Audio level meter (AnalyserNode)
//   const audioCtxRef = useRef<AudioContext | null>(null);
//   const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
//   const analyserRef = useRef<AnalyserNode | null>(null);
//   const rafRef = useRef<number | null>(null);

//   useEffect(() => {
//     // Decide on a supported MIME type
//     const candidates = [
//       preferredMimeType,
//       "audio/webm;codecs=opus",
//       "audio/webm",
//       "audio/ogg;codecs=opus", // firefox fallback
//       "audio/ogg",
//     ].filter(Boolean) as string[];

//     const supported = candidates.find((mt) =>
//       (window as any).MediaRecorder?.isTypeSupported?.(mt)
//     );
//     setMimeType(supported ?? "audio/webm");
//   }, [preferredMimeType]);

//   const cleanupAudioGraph = () => {
//     if (rafRef.current) cancelAnimationFrame(rafRef.current);
//     rafRef.current = null;
//     try {
//       analyserRef.current?.disconnect();
//       sourceNodeRef.current?.disconnect();
//       audioCtxRef.current?.close();
//     } catch {}
//     analyserRef.current = null;
//     sourceNodeRef.current = null;
//     audioCtxRef.current = null;
//   };

//   const stopAll = useCallback(async () => {
//     try {
//       // Stop recorder first to ensure final dataavailable fires
//       mediaRecorderRef.current?.stop();
//     } catch {}

//     if (tickTimerRef.current) {
//       window.clearInterval(tickTimerRef.current);
//       tickTimerRef.current = null;
//     }

//     // Stop tracks
//     mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
//     mediaStreamRef.current = null;

//     cleanupAudioGraph();
//     setIsRecording(false);
//   }, []);

//   const blobToBase64 = (blob: Blob): Promise<string> =>
//     new Promise((resolve, reject) => {
//       const reader = new FileReader();
//       reader.onerror = () => reject(reader.error);
//       reader.onloadend = () => {
//         const res = reader.result as string; // data:*/*;base64,XXXX
//         const base64 = res.split(",")[1] ?? "";
//         resolve(base64);
//       };
//       reader.readAsDataURL(blob);
//     });

//   const sendChunk = async (chunk: Blob, isFinal: boolean) => {
//     if (!chunk || chunk.size === 0) return;
//     try {
//       const chunkBase64 = await blobToBase64(chunk);
//       const { errors } = await client.mutations.sendAudio({
//         sessionId: sessionId ?? "default",
//         mimeType,
//         chunkBase64,
//         isFinal,
//       } as any);
//       if (errors?.length) throw errors[0];
//       onChunkSent?.({ size: chunk.size, isFinal });
//     } catch (err) {
//       console.error("sendAudio error", err);
//       onError?.(err);
//     }
//   };

//   const start = useCallback(async () => {
//     if (isRecording) return;

//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//       mediaStreamRef.current = stream;

//       // Level meter setup
//       const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
//       audioCtxRef.current = audioCtx;
//       const sourceNode = audioCtx.createMediaStreamSource(stream);
//       sourceNodeRef.current = sourceNode;
//       const analyser = audioCtx.createAnalyser();
//       analyser.fftSize = 2048;
//       analyserRef.current = analyser;
//       sourceNode.connect(analyser);

//       const dataArray = new Uint8Array(analyser.frequencyBinCount);
//       const updateLevel = () => {
//         if (!analyserRef.current) return;
//         analyserRef.current.getByteTimeDomainData(dataArray);
//         // Compute RMS
//         let sumSquares = 0;
//         for (let i = 0; i < dataArray.length; i++) {
//           const v = (dataArray[i] - 128) / 128; // -1..1
//           sumSquares += v * v;
//         }
//         const rms = Math.sqrt(sumSquares / dataArray.length);
//         setLevel(rms); // 0..~1
//         rafRef.current = requestAnimationFrame(updateLevel);
//       };
//       rafRef.current = requestAnimationFrame(updateLevel);

//       // MediaRecorder
//       const rec = new MediaRecorder(stream, { mimeType });
//       mediaRecorderRef.current = rec;

//       rec.ondataavailable = async (ev: RecorderDataEvent) => {
//         // Called every `chunkMs` with a Blob
//         if (ev.data && ev.data.size > 0) {
//           // Stream chunk immediately
//           await sendChunk(ev.data, false);
//         }
//       };

//       rec.onerror = (e) => {
//         console.error("MediaRecorder error", e);
//         onError?.(e);
//       };

//       rec.onstop = async () => {
//         // Best-effort final chunk if the browser buffered anything
//         try {
//           // Some browsers fire a final dataavailable after stop; if not, no-op
//         } catch {}
//         // Notify finalization to backend
//         await sendChunk(new Blob([], { type: mimeType }), true);
//       };

//       rec.start(chunkMs); // emit chunks regularly
//       setElapsedMs(0);
//       tickTimerRef.current = window.setInterval(() => {
//         setElapsedMs((t) => t + 200);
//       }, 200);
//       setIsRecording(true);
//     } catch (err) {
//       console.error("getUserMedia error", err);
//       onError?.(err);
//       await stopAll();
//     }
//   }, [chunkMs, isRecording, mimeType, onError, stopAll]);

//   const stop = useCallback(async () => {
//     await stopAll();
//   }, [stopAll]);

//   // Cleanup on unmount
//   useEffect(() => {
//     return () => {
//       stopAll();
//     };
//   }, [stopAll]);

//   if (minimalUI) return null;

//   // Simple, modern UI
//   return (
//     <div className="w-full max-w-md rounded-2xl p-4 shadow-lg border bg-white">
//       <div className="flex items-center justify-between">
//         <div>
//           <div className="text-sm text-gray-500">MIME</div>
//           <div className="text-sm font-medium text-gray-900">{mimeType}</div>
//         </div>
//         <div className="text-right">
//           <div className="text-sm text-gray-500">Duration</div>
//           <div className="tabular-nums font-semibold">
//             {formatMs(elapsedMs)}
//           </div>
//         </div>
//       </div>

//       {/* Level meter */}
//       <div className="mt-4 h-2 w-full bg-gray-100 rounded-full overflow-hidden">
//         <div
//           className="h-full bg-indigo-500 transition-[width]"
//           style={{ width: `${Math.min(100, Math.round(level * 140))}%` }}
//         />
//       </div>

//       <div className="mt-4 flex gap-3">
//         {!isRecording ? (
//           <button
//             onClick={start}
//             className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[.99]"
//           >
//             Start recording
//           </button>
//         ) : (
//           <button
//             onClick={stop}
//             className="px-4 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 active:scale-[.99]"
//           >
//             Stop
//           </button>
//         )}
//       </div>

//       <p className="mt-3 text-xs text-gray-500">
//         Audio is captured in {mimeType} and streamed to your backend every {chunkMs}
//         ms via <code>client.mutations.sendAudio</code>. Adjust server expectations or
//         <code>preferredMimeType</code> if needed.
//       </p>
//     </div>
//   );
// }

// function formatMs(ms: number) {
//   const s = Math.floor(ms / 1000);
//   const mm = Math.floor(s / 60)
//     .toString()
//     .padStart(2, "0");
//   const ss = (s % 60).toString().padStart(2, "0");
//   return `${mm}:${ss}`;
// }
