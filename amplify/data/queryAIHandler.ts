// amplify/functions/queryAIHandler.ts
import { AppSyncResolverEvent } from 'aws-lambda';
import { InvokeModelCommand, BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

// Initialize AWS clients
const region = process.env.AWS_REGION || 'ap-south-1';
const bedrockRuntimeClient = new BedrockRuntimeClient({ region });
const dynamodbClient = new DynamoDBClient({ region });

// Initialize ElevenLabs client
const elevenlabsApiKey = process.env.ELEVEN_LABS_API_KEY || "sk_4787ce6d923c10ead6cd831592f6aa5351698457bd44840f";

// Log the API key status for debugging
if (elevenlabsApiKey) {
  console.log('ElevenLabs API Key found. Initializing client.');
} else {
  console.error('ERROR: ElevenLabs API Key is not set in environment variables.');
}

const elevenlabs = new ElevenLabsClient({
  apiKey: elevenlabsApiKey
});

// Environment variable for your DynamoDB table name
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'story-x5jlpv5xmbdjbpdrn326rfu7he-NONE';

type StoryResponse = {
  text: string;
  audioBase64: string;
};

type QueryArguments = {
  questions: string;
  storyId?: string;
};

export const handler = async (event: AppSyncResolverEvent<QueryArguments>): Promise<StoryResponse> => {
  console.log('AppSync event received:', JSON.stringify(event, null, 2));

  try {
    // Extract arguments - note the argument name is "questions" to match schema
    const { questions, storyId } = event.arguments;

    if (!questions) {
      throw new Error("Missing 'questions' in event arguments.");
    }

    console.log("[questions from event]", questions);
    console.log("[storyId from event]", storyId);

    // Default story ID if not provided
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

    if (!storyContent || typeof storyContent !== 'string') {
      throw new Error(`Story content for ID "${targetStoryId}" is missing or not a string.`);
    }

    console.log('Successfully fetched story content.');

    // --- 2. Construct a proper prompt for the Mistral model ---
    const prompt = `[INST]Given the following story, answer the question accurately and concisely and make it short.

Story:
"""
${storyContent}
"""

Question: "${questions}"

Answer:[/INST]`;

    console.log('Constructed prompt:', prompt);

    // --- 3. Invoke Bedrock (Mistral model) to generate the answer ---
    const cmd = new InvokeModelCommand({
      modelId: 'mistral.mistral-7b-instruct-v0:2',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt: prompt,
        max_tokens: 400,
        temperature: 0.7,
      })
    });

    const { body } = await bedrockRuntimeClient.send(cmd);
    const rawResponseBody = Buffer.from(body).toString('utf8');

    let modelOutputText: string;
    try {
      const parsedRaw = JSON.parse(rawResponseBody);
      modelOutputText = parsedRaw.outputs?.[0]?.text ?? rawResponseBody;
    } catch (e) {
      console.warn("Failed to parse raw Bedrock response body as JSON. Assuming raw body is the text.", e);
      modelOutputText = rawResponseBody;
    }

    console.log('Successfully retrieved answer from Bedrock:', modelOutputText);

    // --- 4. Generate audio using ElevenLabs ---
    let audioBase64 = "";
    
    try {
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
      
    } catch (audioError: any) {
      console.error('Error generating audio with ElevenLabs:', audioError);
      // Continue without audio if TTS fails
      console.log('Continuing without audio...');
    }

    // --- 5. Return the response object ---
    const response: StoryResponse = {
      text: modelOutputText.trim(),
      audioBase64: audioBase64.trim(),
    };

    console.log("backend response",response)

    return response;

  } catch (error: any) {
    console.error('Error in AppSync TypeScript Lambda:', error);
    throw new Error(`Failed to get story answer: ${error.message}`);
  }
};