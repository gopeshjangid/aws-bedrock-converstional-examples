import type { AppSyncResolverEvent } from 'aws-lambda';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

type Args = {
  sessionId: string;
  mimeType: string;
  chunkBase64: string;
  isFinal?: boolean;
};

export const handler = async (event: AppSyncResolverEvent<Args>): Promise<string> => {
  try {
    const { mimeType, chunkBase64, isFinal = true } = event.arguments;
    if (!isFinal) return 'ok';
    if (!mimeType || !chunkBase64) throw new Error('Missing mimeType or chunkBase64');

    const audio = Buffer.from(chunkBase64, 'base64');
    if (!audio.byteLength) throw new Error('Empty audio payload');

    const text = await isolateThenTranscribe(audio, mimeType);
    return text;
  } catch (err: any) {
    console.error('send-audio handler error', {
      name: err?.name,
      message: err?.message ?? String(err),
      stack: err?.stack?.slice(0, 2000),
    });
    throw err;
  }
};

// ---------- helpers ----------
function bufferToBlob(buf: Buffer, type: string): Blob {
  const view = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const copy = new Uint8Array(view);
  return new Blob([copy], { type });
}

// Consume various possible return types into a Node Buffer
async function anyToBuffer(obj: any): Promise<Buffer> {
  // Blob
  if (typeof Blob !== 'undefined' && obj instanceof Blob) {
    const ab = await obj.arrayBuffer();
    return Buffer.from(ab);
  }
  // Response-like
  if (obj && typeof obj.arrayBuffer === 'function') {
    const ab = await obj.arrayBuffer();
    return Buffer.from(ab);
  }
  if (obj && typeof obj.blob === 'function') {
    const b = await obj.blob();
    const ab = await b.arrayBuffer();
    return Buffer.from(ab);
  }
  // Web ReadableStream
  if (obj && typeof obj.getReader === 'function') {
    const reader = obj.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.length; }
    return Buffer.from(merged.buffer);
  }
  // Async iterable (e.g., for await (chunk of stream))
  if (obj && typeof obj[Symbol.asyncIterator] === 'function') {
    const parts: Buffer[] = [];
    for await (const chunk of obj as AsyncIterable<Uint8Array | Buffer | string>) {
      parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any));
    }
    return Buffer.concat(parts);
  }
  // Node Readable stream
  if (obj && obj.readable && typeof obj.on === 'function') {
    const parts: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      obj.on('data', (c: Buffer) => parts.push(Buffer.from(c)));
      obj.on('end', () => resolve());
      obj.on('error', reject);
    });
    return Buffer.concat(parts);
  }
  throw new Error('Unsupported output from audioIsolation.convert');
}

async function isolateThenTranscribe(audio: Buffer, mimeType: string): Promise<string> {

  console.log("env var @@@@@@@@@@",process.env.elevenKey);
  const apiKey = 'sk_c5a770dbb5727a039d49e62ea5e26d210f412984a23eb9fd'; // set this on the function
  if (!apiKey) {
    console.error('elevenlabs error', { message: 'ELEVENLABS_API_KEY not set (env elevenKey)' });
    throw new Error('ELEVENLABS_API_KEY not set');
  }

  const client = new ElevenLabsClient({ apiKey });

  // 1) Voice isolation
  let isolatedBuf: Buffer;
  try {
    const inputBlob = bufferToBlob(audio, mimeType);
    const isolatedOut = await client.audioIsolation.convert({ audio: inputBlob });
    isolatedBuf = await anyToBuffer(isolatedOut);
  } catch (err: any) {
    console.error('elevenlabs isolation error', { name: err?.name, message: err?.message ?? String(err) });
    throw err;
  }

  // 2) Speech-to-Text on isolated audio
  try {
    const isolatedBlob = bufferToBlob(isolatedBuf, mimeType);
    const res = await client.speechToText.convert({
      file: isolatedBlob,
      modelId: 'scribe_v1',
      tagAudioEvents: false, // set null to auto-detect if you prefer,
      languageCode:'eng',
      diarize: false,
    });

    const text =
      (res as any)?.text ??
      (Array.isArray((res as any)?.transcripts)
        ? (res as any).transcripts.map((t: any) => t.text).join(' ')
        : '');

    const out = String(text ?? '').trim();
    if (!out) {
      console.error('elevenlabs stt error', { message: 'ElevenLabs STT returned no text' });
      throw new Error('ElevenLabs STT returned no text');
    }
    return out;
  } catch (err: any) {
    console.error('elevenlabs stt error', { name: err?.name, message: err?.message ?? String(err) });
    throw err;
  }
}