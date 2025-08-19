import type { AppSyncResolverEvent } from 'aws-lambda';
import {
  DynamoDBClient,
  QueryCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

type Args = {
  chatId: string;
  currentUserId: string;
  numSuggestions?: number;
};

type Result = { suggestions: string[]; debug?: any };

// -------- env & clients --------
const REGION = process.env.AWS_REGION || 'ap-south-1';

console.log("user table name",process.env.USER_TABLE_NAME);
console.log('message table name', process.env.MESSAGE_TABLE_NAME)
const MESSAGE_TABLE_NAME =process.env.MESSAGE_TABLE_NAME|| 'Message-gbfhdgyfavaqvkvisn7wp7hwey-NONE'               // Message table name
const MESSAGE_CHATID_INDEX_NAME = 'getChatMessagesList'  // getChatMessagesList

const USER_TABLE_NAME =process.env.USER_TABLE_NAME|| 'User-ljnisxoiwffzll6pfv7dx6bjri-NONE'                      // User table name
const USER_PK_NAME = process.env.USER_PK_NAME || 'userId';            // PK field (your model uses userId)

const MODEL_ID =
  process.env.MODEL_ID || 'apac.amazon.nova-pro-v1:0';

const ddb = new DynamoDBClient({ region: REGION });
const bedrock = new BedrockRuntimeClient({ region: REGION });

// -------- handler (AppSync) --------
export const handler = async (
  event: AppSyncResolverEvent<Args>
): Promise<Result> => {
  const rid = `rid_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const tStart = Date.now();
  try {
    const { chatId, currentUserId, numSuggestions = 3 } = readArgs(event);

    // 1) history: newest first, then reverse for prompt
    const tHist = Date.now();
    const history = await fetchRecentMessages(chatId, 30);

    if (!history.length) {
      console.warn(`[replySuggester][${rid}] history.empty`);
      return { suggestions: [], debug: { reason: 'no_messages', rid } };
    }

    const latestIncoming = [...history].reverse().find(m => m.senderId && m.senderId !== currentUserId);
    const senderId: string | undefined = latestIncoming?.senderId;

    const senderProfile = senderId ? await fetchSenderProfile(senderId) : undefined;

    // build prompt
    const prompt = buildPrompt({
      messages: history,
      currentUserId,
      senderProfile,
      numSuggestions,
    });

    // 5) invoke Bedrock (JSON-only suggestions)
    const tBedrock = Date.now();
    const suggestions = await getSuggestions(prompt, numSuggestions);
    return { suggestions, debug: { rid } };
  } catch (err: any) {
    console.error(`[replySuggester][${rid}] invoke.error`, {
      message: err?.message,
      stack: err?.stack,
      totalElapsedMs: Date.now() - tStart,
    });
    // AppSync resolver returns plain object (no statusCode)
    const chatId = event.arguments?.chatId || 'unknown';
    return { suggestions: [], debug: { error: err?.message || 'INTERNAL_ERROR', rid } };
  }
};

// -------- data helpers --------
async function fetchRecentMessages(chatId: string, limit: number) {

  const t0 = Date.now();
  const res = await ddb.send(new QueryCommand({
    TableName: MESSAGE_TABLE_NAME,
    IndexName: MESSAGE_CHATID_INDEX_NAME,
    KeyConditionExpression: '#chatId = :chatId',
    ExpressionAttributeNames: { '#chatId': 'chatId' },
    ExpressionAttributeValues: { ':chatId': { S: chatId } },
    ScanIndexForward: false,
    Limit: limit,
    ReturnConsumedCapacity: 'TOTAL',
  }));

  const items = (res.Items || []).map(i => unmarshall(i));
  return items.reverse();
}

async function fetchSenderProfile(userId: string) {

  const t0 = Date.now();
  const res = await ddb.send(new GetItemCommand({
    TableName: USER_TABLE_NAME,
    Key: { [USER_PK_NAME]: { S: userId } },
   ProjectionExpression: [
      '#pk',
      '#fullName',
      '#gender',
      '#dateOfBirth',
      '#bio',
      '#interests',
      '#lookingFor',
      '#availabilityList',
      '#communicationStyle',
      '#city',
      '#state',     
      '#country',
      '#location',
    ].join(', '),
    ExpressionAttributeNames: {
      '#pk': USER_PK_NAME,
      '#fullName': 'fullName',
      '#gender': 'gender',
      '#dateOfBirth': 'dateOfBirth',
      '#bio': 'bio',
      '#interests': 'interests',
      '#lookingFor': 'lookingFor',
      '#availabilityList': 'availabilityList',
      '#communicationStyle': 'communicationStyle',
      '#city': 'city',
      '#state': 'state',        
      '#country': 'country',
      '#location': 'location',
    },
    ReturnConsumedCapacity: 'TOTAL',
  }));
  if (!res.Item) return undefined;
  const raw = unmarshall(res.Item);

  const city = raw.location?.city ?? raw.city;
  const state = raw.location?.state ?? raw.state;
  const country = raw.location?.country ?? raw.country;

  const age = calcAge(raw.dateOfBirth);

  const compact = compactSenderProfile({
    fullName: raw.fullName,
    gender: raw.gender,
    age,
    city,
    state,
    country,
    bio: raw.bio,
    interests: raw.interests,
    lookingFor: raw.lookingFor,
    availabilityList: raw.availabilityList,
    communicationStyle: raw.communicationStyle,
  });

  return compact;
}

function compactSenderProfile(p: any) {
  const keep = [
    'fullName',
    'gender',
    'age',
    'city',
    'state',
    'country',
    'bio',
    'interests',
    'lookingFor',
    'availabilityList',
    'communicationStyle',
  ];
  const out: Record<string, any> = {};
  for (const k of keep) if (p[k] !== undefined && p[k] !== null) out[k] = p[k];
  return out;
}

function calcAge(dob?: string): number | undefined {
  if (!dob) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return undefined;
  const [_, y, mo, d] = m.map(Number);
  const birth = new Date(y, mo - 1, d);
  if (isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const mOff = today.getMonth() - birth.getMonth();
  if (mOff < 0 || (mOff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// -------- prompt & model --------
function buildPrompt(args: {
  messages: Array<any>;
  currentUserId: string;
  senderProfile?: any;
  numSuggestions: number;
}) {
  const { messages, currentUserId, senderProfile, numSuggestions } = args;

  const lines = messages.map(m => {
    const who = m.senderId === currentUserId ? 'You' : 'Sender';
    const content = String(m.messageContent ?? '').replace(/\s+/g, ' ').trim();
    const ts = String(m.timestamp ?? '').replace('T', ' ').replace('Z', '');
    return `[${ts}] ${who}: ${content}`;
  });

  const senderCtx = senderProfile
    ? `Sender profile: ${JSON.stringify(senderProfile)}`
    : `Sender profile: unavailable`;

  return [
    `You generate short, natural reply suggestions for a dating chat.`,
    `Rules:`,
    `- Be warm, respectful, and specific to the conversation.`,
    `- Reflect the sender's profile (interests, tone) when helpful.`,
    `- Avoid clichés and pickup lines. No emojis unless the tone suggests it.`,
    `- 1–2 sentences max. Do NOT ask multiple questions in one suggestion.`,
    `- Output STRICT JSON only: {"suggestions": ["...","..."]} with ${numSuggestions} items.`,
    ``,
    senderCtx,
    ``,
    `Conversation (oldest → newest):`,
    lines.join('\n'),
    ``,
    `Now return ${numSuggestions} reply suggestions as strict JSON only.`,
  ].join('\n');
}

async function getSuggestions(prompt: string, n: number) {
  const system = 'Return ONLY valid JSON with a "suggestions" array of strings. No preface, no markdown.';

  // Converse API request for Nova
  const t0 = Date.now();
  const cmd = new ConverseCommand({
    // You can also pass an inference profile ARN here instead of the model ID.
    modelId: MODEL_ID,
    system: [{ text: system }],
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 256,
      temperature: 0.6,
      topP: 0.95,
    },
  });

  const resp = await bedrock.send(cmd);

  // Extract plain text from Converse response
  const content = resp.output?.message?.content ?? [];
  const text = content
    .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
    .join('')
    .trim();

  try {
    const parsed = JSON.parse(text);
    const arr: string[] = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
    return arr.slice(0, n);
  } catch (e: any) {
    console.warn(`[replySuggester] bedrock.parse.fallback`, {
      message: e?.message,
      sample: text.slice(0, 300) + (text.length > 300 ? `…[+${text.length - 300}]` : ''),
    });
    // Fallback: best-effort split

    return String(text).split('\n').map(s => s.trim()).filter(Boolean).slice(0, n);
  }
}

function readArgs(event: AppSyncResolverEvent<Args>): Args {
  const { chatId, currentUserId, numSuggestions } = event.arguments as Args;
  if (!chatId) throw new Error('chatId is required');
  if (!currentUserId) throw new Error('currentUserId is required');
  return { chatId, currentUserId, numSuggestions };
}
