// amplify/functions/send-audio/handler.ts
import type { AppSyncResolverEvent, AppSyncIdentityCognito } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { InvokeModelCommand,BedrockRuntimeClient} from '@aws-sdk/client-bedrock-runtime';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';


type Args = {
  sessionId: string;
  mimeType: string;
  chunkBase64: string;   // For isFinal=true, this must be the FULL audio
  isFinal?: boolean;
};

const ddb = new DynamoDBClient({});
const USERS_TABLE = process.env.USERS_TABLE!;
// const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;
// const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY!;

export const handler = async (
  event: AppSyncResolverEvent<Args>
): Promise<string> => {
  const { sessionId, mimeType, chunkBase64, isFinal = false } = event.arguments;

  // Stateless: ignore partial chunks. We only process when final payload arrives.
  if (!isFinal) return 'ok';

  // Decode full audio from final call
  const audio = Buffer.from(chunkBase64, 'base64');
  const ext =
    mimeType.includes('ogg') ? 'ogg' :
    mimeType.includes('wav') ? 'wav' : 'webm';

  // 1) STT with ElevenLabs
  const transcript = await transcribeWithElevenLabs(audio, ext, mimeType);

  // 2) Refine with Mistral
  const refined = await refineWithMistral(transcript);

  // 3) Persist to DynamoDB
//   const userId = getUserIdFromIdentity(event.identity);
//   if (!userId) throw new Error('Missing authenticated user identity');

//   await ddb.send(new UpdateCommand({
//     TableName: USERS_TABLE,
//     Key: { userId }, // adjust if your PK is different
//     UpdateExpression: 'SET profilePreference = :p, profilePreferenceUpdatedAt = :t',
//     ExpressionAttributeValues: {
//       ':p': refined,
//       ':t': new Date().toISOString(),
//     },
//   }));

  return refined;
};

// ---------- helpers ----------

async function transcribeWithElevenLabs(
  audio: Buffer,
  ext: string,
  mimeType: string
): Promise<string> {
  // Node 18/20: Blob available globally
  const audioBlob = new Blob([audio], { type: mimeType });
  const ELEVENLABS_API_KEY = "sk_4787ce6d923c10ead6cd831592f6aa5351698457bd44840f";
  const client= new ElevenLabsClient();

  const res = await client.speechToText.convert({
    file: audioBlob,
    modelId: 'scribe_v1',
    tagAudioEvents: true,
    languageCode: 'eng', // set to null for auto-detect if you prefer
    diarize: true,
  });

  // SDK returns a rich object; normalize to a single string
  const text =
    (res as any)?.text ??
    (Array.isArray((res as any)?.transcripts)
      ? (res as any).transcripts.map((t: any) => t.text).join(' ')
      : '');

  if (!text || !String(text).trim()) {
    throw new Error('ElevenLabs STT returned no text');
  }
  return String(text).trim();
}

async function refineWithMistral(raw: string): Promise<string> {
  const system =
    'You are a data cleaner that turns raw speech into concise user profile preferences for a single DB field.';
  const user =
    `Extract only stable preference-like info (interests, likes/dislikes, styles, constraints). `
    + `Remove filler. Output one short paragraph (<= 500 chars).\n\nRAW:\n${raw}`;

    const prompt= system+user
 const cmd = new InvokeModelCommand({
      modelId: 'mistral.mistral-7b-instruct-v0:2', // Or 'mistral.mixtral-8x7b-instruct-v0:1' if you're using Mixtral
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt: prompt,
        max_tokens: 400, // Max tokens for the generated answer
        temperature: 0.7, // Controls randomness (0.0-1.0)
        // Add other Mistral-specific parameters if needed, e.g., 'top_p', 'top_k', 'stop'
      })
    });
    const region="ap-south-1"
  const bedrockRuntimeClient = new BedrockRuntimeClient({ region });
   const { body } = await bedrockRuntimeClient.send(cmd);
    const rawResponseBody = Buffer.from(body).toString('utf8');

    let modelOutputText: string;
    try {
      const parsedRaw = JSON.parse(rawResponseBody);
      // Mistral models typically return output in outputs[0].text
      modelOutputText = parsedRaw.outputs?.[0]?.text ?? rawResponseBody;
    } catch (e) {
      console.warn("Failed to parse raw Bedrock response body as JSON. Assuming raw body is the text.", e);
      modelOutputText = rawResponseBody;
    }
    return modelOutputText
}

function getUserIdFromIdentity(identity: AppSyncResolverEvent<Args>['identity']): string | null {
  const cog = identity as AppSyncIdentityCognito | undefined;
  return cog?.sub ?? cog?.username ?? null;
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return '<no body>'; }
}
