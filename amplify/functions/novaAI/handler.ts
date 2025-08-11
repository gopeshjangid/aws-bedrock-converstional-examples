import type {
  APIGatewayProxyStructuredResultV2,
  APIGatewayProxyWebsocketEventV2,
} from "aws-lambda";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";

const MODEL_ID = process.env.BEDROCK_MODEL_ID || "amazon.nova-sonic-v1:0";
const BEDROCK_REGION = process.env.BEDROCK_REGION || "ap-northeast-1"; // Nova Sonic region

function mgmtClientFrom(event: APIGatewayProxyWebsocketEventV2) {
  const domain = event.requestContext.domainName!;
  const stage = event.requestContext.stage!;
  return new ApiGatewayManagementApiClient({ endpoint: `https://${domain}/${stage}` });
}

async function wsSend(client: ApiGatewayManagementApiClient, connectionId: string, payload: unknown) {
  try {
    const Data = Buffer.from(JSON.stringify(payload));
    await client.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data }));
  } catch (err: any) {
    console.error(JSON.stringify({ level: "error", msg: "PostToConnection failed", connectionId, error: err?.name, message: err?.message, code: err?.$metadata?.httpStatusCode }));
    throw err;
  }
}

function toChunk(obj: unknown) {
  const enc = new TextEncoder();
  return { chunk: { bytes: enc.encode(JSON.stringify(obj)) } } as any;
}

function* chunkBase64(b64: string, size = 24_000) {
  for (let i = 0; i < b64.length; i += size) yield b64.slice(i, i + size);
}

export const handler = async (
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { routeKey, connectionId, requestId, apiId, stage } = event.requestContext as any;
  console.log(JSON.stringify({ level: "info", msg: "incoming", routeKey, connectionId, requestId, apiId, stage }));

  const mgmt = mgmtClientFrom(event);

  try {
    if (routeKey === "$connect") return { statusCode: 200, body: "Connected" };
    if (routeKey === "$disconnect") return { statusCode: 200, body: "Disconnected" };

    const raw = event.body || "";
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; }
    catch (e) { console.error(JSON.stringify({ level: "error", msg: "JSON parse fail", raw })); }

    const action = body.action || "echo";
    console.log(JSON.stringify({ level: "info", msg: "action", action }));

    if (action === "echo") {
      await wsSend(mgmt, connectionId!, { type: "echo", message: body.message ?? null });
      return { statusCode: 200, body: "ok" };
    }

    if (action === "novaTurn") {
      const startedAt = Date.now();
      const audioBase64: string = body.audioBase64 || "";
      const session = body.session || {};
      const voiceId = session.voiceId || "amy";
      const sampleRateHz = session.sampleRateHz || 16000;
      const temperature = session.temperature ?? 0.7;
      const topP = session.topP ?? 0.9;
      const maxTokens = session.maxTokens ?? 1024;
      const system = session.system as string | undefined;

      if (!audioBase64) {
        await wsSend(mgmt, connectionId!, { type: "error", error: "Missing audioBase64" });
        return { statusCode: 400, body: "missing audio" };
      }

      const approxBytes = Math.floor(audioBase64.length * 0.75); // base64 -> bytes
      const approxMs = Math.round((approxBytes / 2 /*bytes/sample*/ / sampleRateHz) * 1000);
      console.log(JSON.stringify({ level: "info", msg: "novaTurn input", voiceId, sampleRateHz, audioBase64Len: audioBase64.length, approxBytes, approxMs }));

      const bedrock = new BedrockRuntimeClient({
        region: BEDROCK_REGION,
        requestHandler: new NodeHttp2Handler({ maxConcurrentStreams: 4 }),
      });

      async function* generate() {
        yield toChunk({ event: { sessionStart: { inferenceConfiguration: { maxTokens, topP, temperature } } } });
        yield toChunk({ event: { promptStart: {
          promptName: "turn-1",
          textOutputConfiguration: { mediaType: "text/plain" },
          audioOutputConfiguration: { mediaType: "audio/lpcm", sampleRateHertz: sampleRateHz, sampleSizeBits: 16, channelCount: 1, encoding: "base64", audioType: "SPEECH", voiceId },
          toolUseOutputConfiguration: { mediaType: "application/json" },
        } } });
        if (system) {
          yield toChunk({ event: { contentStart: { promptName: "turn-1", contentName: "sys-1", type: "TEXT", interactive: false, role: "SYSTEM", textInputConfiguration: { mediaType: "text/plain" } } } });
          yield toChunk({ event: { textInput: { promptName: "turn-1", contentName: "sys-1", content: system } } });
          yield toChunk({ event: { contentEnd: { promptName: "turn-1", contentName: "sys-1" } } });
        }
        yield toChunk({ event: { contentStart: { promptName: "turn-1", contentName: "mic-1", type: "AUDIO", interactive: true, role: "USER", audioInputConfiguration: { mediaType: "audio/lpcm", sampleRateHertz: sampleRateHz, sampleSizeBits: 16, channelCount: 1, audioType: "SPEECH", encoding: "base64" } } } });
        let chunks = 0;
        for (const chunk of chunkBase64(audioBase64, 24000)) {
          yield toChunk({ event: { audioInput: { promptName: "turn-1", contentName: "mic-1", content: chunk } } });
          chunks++;
        }
        console.log(JSON.stringify({ level: "info", msg: "audio forwarded", chunks }));
        yield toChunk({ event: { contentEnd: { promptName: "turn-1", contentName: "mic-1" } } });
        yield toChunk({ event: { promptEnd: { promptName: "turn-1" } } });
        yield toChunk({ event: { sessionEnd: {} } });
      }

      try {
        const cmd = new InvokeModelWithBidirectionalStreamCommand({ modelId: MODEL_ID, body: generate() });
        const res: any = await bedrock.send(cmd);
        const dec = new TextDecoder();
        console.log(JSON.stringify({ level: "info", msg: "bedrock stream open", modelId: MODEL_ID, region: BEDROCK_REGION }));

        for await (const part of res.body) {
          const txt = dec.decode(part.chunk?.bytes ?? new Uint8Array());
          if (!txt) continue;
          let ev: any; try { ev = JSON.parse(txt); } catch { continue; }
          const k = Object.keys(ev.event || {})[0];
          if (k) console.log(JSON.stringify({ level: "debug", msg: "bedrock event", type: k }));

          if (ev.event?.textOutput) {
            const { role, content } = ev.event.textOutput;
            await wsSend(mgmt, connectionId!, { type: role === "USER" ? "asr" : "assistant_text", text: content });
          }
          if (ev.event?.audioOutput) {
            const c = ev.event.audioOutput.content as string;
            await wsSend(mgmt, connectionId!, { type: "tts", base64: c });
          }
          if (ev.event?.usageEvent) {
            await wsSend(mgmt, connectionId!, { type: "usage", ...ev.event.usageEvent });
          }
          if (ev.event?.completionEnd) {
            await wsSend(mgmt, connectionId!, { type: "done", stopReason: ev.event.completionEnd.stopReason });
            console.log(JSON.stringify({ level: "info", msg: "completion end", tookMs: Date.now() - startedAt }));
          }
        }
      } catch (err: any) {
        console.error(JSON.stringify({ level: "error", msg: "novaTurn", error: err?.name, message: err?.message }));
        await wsSend(mgmt, connectionId!, { type: "error", error: String(err?.name || "NovaError"), detail: err?.message || String(err) });
      }

      return { statusCode: 200, body: "turn processed" };
    }

    await wsSend(mgmt, connectionId!, { type: "error", error: `Unknown action: ${action}` });
    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "handler error", err: String(err) }));
    return { statusCode: 200, body: "ok" };
  }
};