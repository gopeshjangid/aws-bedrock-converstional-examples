// amplify/functions/ChatDefaultConversationHandler/src/index.ts
import {
  ConversationTurnEvent,
  createExecutableTool,
  handleConversationTurnEvent
} from '@aws-amplify/backend-ai/conversation/runtime';

// Import necessary dependencies
import { InvokeModelCommand, BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

// Initialize AWS clients
const region = process.env.AWS_REGION || 'ap-south-1';
const bedrockRuntimeClient = new BedrockRuntimeClient({ region });
const dynamodbClient = new DynamoDBClient({ region });
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'story-x5jlpv5xmbdjbpdrn326rfu7he-NONE';
const elevenlabsApiKey = process.env.ELEVEN_LABS_API_KEY;

const elevenlabs = new ElevenLabsClient({
  apiKey: "sk_4787ce6d923c10ead6cd831592f6aa5351698457bd44840f"
});

// 1. Define the JSON schema for your new tool.
// This describes the input the AI will generate to call your tool.
const getInfoSchema = {
  json: {
    type: 'object',
    properties: {
      questions: {
        type: 'string',
        description: 'The question to ask about the story.'
      },
      storyId: {
        type: 'string',
        description: 'The ID of the story to query. Use the default ID "12345" if not specified.'
      },
    },
    required: ['questions']
  }
} as const;

// 2. Create the executable tool.
const getInfoTool = createExecutableTool(
  'getInfo',
  'Answers questions about a specific story by searching its content.',
  getInfoSchema,
  async (input) => {
    // This is the core logic from your old queryAIHandler.ts file.

    console.log("input chathandler",input)
    const { questions, storyId } = input;
    const targetStoryId = storyId || "12345";

    // --- 1. Fetch the story from DynamoDB ---
    const getItemCommand = new GetItemCommand({
      TableName: DYNAMODB_TABLE_NAME,
      Key: {
        id: { S: targetStoryId }
      }
    });
    const dbResponse = await dynamodbClient.send(getItemCommand);
     if (!dbResponse.Item) {
      throw new Error(`Story with ID "${targetStoryId}" not found in table "${DYNAMODB_TABLE_NAME}".`);
    }
    const storyItem = unmarshall(dbResponse.Item);
    const storyContent = storyItem.storyContent;

    // --- 2. Construct prompt for Mistral ---
    const prompt = `[INST]Given the following story, answer the question accurately and concisely.
    Story:"""${storyContent}"""
    Question: "${questions}"
    Answer:[/INST]`;

    // --- 3. Invoke Bedrock (Mistral model) to generate the answer ---
    const cmd = new InvokeModelCommand({
      modelId: 'mistral.mistral-7b-instruct-v0:2',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({ prompt: prompt, max_tokens: 400, temperature: 0.7 })
    });
    const { body } = await bedrockRuntimeClient.send(cmd);
    const rawResponseBody = Buffer.from(body).toString('utf8');
    const parsedRaw = JSON.parse(rawResponseBody);
    const modelOutputText = parsedRaw.outputs?.[0]?.text ?? rawResponseBody;
    
    // --- 4. Return ONLY the text ---
    // THIS IS THE CRITICAL CHANGE! We return a simple text object.
    // The massive Base64 string is NOT included here.

     let audioBase64 = "";
    
    
      console.log('Starting ElevenLabs TTS conversion...');
      
      // Use a default voice ID (Rachel - a popular English voice)
      const voiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel voice
      
      const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
        modelId: 'eleven_multilingual_v2',
        text: modelOutputText,
        outputFormat: 'mp3_44100_128',
        voiceSettings: {
          stability: 0.5,
          similarityBoost: 0.5,
          useSpeakerBoost: true,
          speed: 1.0,
        },
      });

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);
      audioBase64 = audioBuffer.toString('base64');
      
      console.log('Successfully generated Base64 encoded audio. Length:', audioBase64.length);
    return Promise.resolve({ text: modelOutputText });
  },
);

// 3. Update the main handler function to use the new tool.
export const handler = async (event: ConversationTurnEvent) => {
  await handleConversationTurnEvent(event, {
    tools: [getInfoTool], // Add your custom tool here
  });
};