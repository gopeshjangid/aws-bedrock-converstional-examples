// amplify/functions/queryAIHandler.ts
import { AppSyncResolverEvent } from 'aws-lambda';
import { InvokeModelCommand, BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { APIGatewayProxyResult } from 'aws-lambda'; // Import APIGatewayProxyResult for type safety

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
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "story-syajazsrvjg7ler3ue4nojaoyy-NONE";


export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
  console.log("event", event);
  console.log("tablename", DYNAMODB_TABLE_NAME);

  const targetStoryId = "12345";

  try {
    // --- 1. Fetch the story from DynamoDB ---
    const getItemCommand = new GetItemCommand({
      TableName: DYNAMODB_TABLE_NAME,
      Key: {
        id: { S: targetStoryId }
      }
    });

    const dbResponse = await dynamodbClient.send(getItemCommand);

    if (!dbResponse.Item) {
      // Return a 404 response if the item is not found
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ message: `Story with ID "${targetStoryId}" not found.` })
      };
    }

    const storyItem = unmarshall(dbResponse.Item);
    const storyContent = storyItem.storyContent;

    if (!storyContent || typeof storyContent !== 'string') {
      // Return a 400 response for bad data
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ message: `Story content for ID "${targetStoryId}" is missing or not a string.` })
      };
    }

    // --- Prepare the successful response ---
    const responseBody = {
      story: storyContent
    };

    const response = {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      // IMPORTANT: The body must be a string. We use JSON.stringify() to convert the object.
      body: JSON.stringify(responseBody)
    };

    console.log(response);
    return response;
  } catch (error) {
    console.error("Error fetching story:", error);
    // Return a 500 response for any unexpected errors
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ message: "Internal server error" })
    };
  }
};