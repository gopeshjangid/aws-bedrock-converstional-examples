
// amplify/backend/function/StoryQATypeScriptLambda/src/index.ts
import { AppSyncResolverEvent } from 'aws-lambda';
import { InvokeModelCommand, BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'; // Import DynamoDB client
import { unmarshall } from '@aws-sdk/util-dynamodb'; // For unmarshalling DynamoDB items
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'; // Import ElevenLabs client

import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';



// Initialize AWS clients
const region = process.env.AWS_REGION || 'ap-south-1'; // Ensure this matches your AWS region
const bedrockRuntimeClient = new BedrockRuntimeClient({ region });
const dynamodbClient = new DynamoDBClient({ region });
const elevenlabs = new ElevenLabsClient({
  apiKey: 'sk_4787ce6d923c10ead6cd831592f6aa5351698457bd44840f',
});


type storyReaponse = {
  text: string; 
    audioBase64: string;
};
// Environment variable for your DynamoDB table name
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'story-grrulr3c5bgi5ol42jogzaf3ua-NONE'; // Default table name, ensure it's set in Lambda env vars

/**
 * AppSync Lambda Resolver handler.
 * This Lambda is triggered by an AppSync GraphQL query/mutation.
 * It fetches a story from DynamoDB, constructs a prompt, and uses AWS Bedrock (Mistral) to generate an answer.
 *
 * @param event The event object from AppSync.
 * It contains arguments passed to the GraphQL field.
 * Example: { arguments: { storyId: "...", question: "..." } }
 * @returns The answer string or an error.
 */
export const handler = awslambda.streamifyResponse(async (event: any,responseStream) => {
  console.log('AppSync event received:', JSON.stringify(event, null, 2));

  try {
    // AppSync passes arguments in event.arguments

//     console.log(event.body)
//    const req= JSON.parse(event.body)
    const { question } = event.arguments

    console.log("[question from event]", question)
    const storyId = "b1bbc1e7-28e1-4341-92b0-0923eb762b93" // Assuming storyId is passed in the arguments
    // --- 1. Fetch the story from DynamoDB ---
    const getItemCommand = new GetItemCommand({
      TableName: DYNAMODB_TABLE_NAME,
      Key: {
        id: { S: storyId } // Assuming 'id' is the primary key (String type)
      }
    });

    const dbResponse = await dynamodbClient.send(getItemCommand);

    if (!dbResponse.Item) {
      throw new Error(`Story with ID "${storyId}" not found in table "${DYNAMODB_TABLE_NAME}".`);
    }

    // Unmarshall the DynamoDB item to a regular JavaScript object
    const storyItem = unmarshall(dbResponse.Item);
    const storyContent = storyItem.storyContent; // Assuming 'content' is the attribute storing the story text

    if (!storyContent || typeof storyContent !== 'string') {
      throw new Error(`Story content for ID "${storyId}" is missing or not a string.`);
    }

    console.log('Successfully fetched story content.');

    // --- 2. Construct a proper prompt for the Mistral model ---
    // Mistral models often perform best with a clear instruction and context.
    const prompt = `[INST]Given the following story, answer the question accurately and concisely.

Story:
"""
${storyContent}
"""

Question: "${question}"

Answer:[/INST]`;

    console.log('Constructed prompt:', prompt);

    // --- 3. Invoke Bedrock (Mistral model) to generate the answer ---
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

    console.log('Successfully retrieved answer from Bedrock:', modelOutputText);
     const audioStream = await elevenlabs.textToSpeech.stream('21m00Tcm4TlvDq8ikWAM', {
    text: modelOutputText,
    modelId: 'eleven_multilingual_v2',
  });
    responseStream.write('{ "audioBase64": "'); // Start the JSON object and the base64 string

        for await (const chunk of audioStream) {
            responseStream.write(Buffer.from(chunk).toString('base64'));
        }

        responseStream.write('" }'); // End the base64 string and the JSON object
        responseStream.end();

        console.log('Successfully streamed Base64 encoded audio to response.');

  } catch (error: any) {
    console.error('Error in AppSync TypeScript Lambda:', error);
    // AppSync expects an Error object to propagate GraphQL errors
    throw new Error(`Failed to get story answer: ${error.message}`);
  }
}
)