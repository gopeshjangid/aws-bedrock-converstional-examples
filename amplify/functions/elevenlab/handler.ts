import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { AppSyncResolverEvent } from 'aws-lambda';
import fetch from 'node-fetch';

const ELEVENLABS_API_KEY = "sk_4787ce6d923c10ead6cd831592f6aa5351698457bd44840f";

// Define the type for the AppSync event with our arguments
// interface GetConversationTokenArgs {
//   agentId: string;
// }

const region = process.env.AWS_REGION || 'ap-south-1';
const dynamodbClient = new DynamoDBClient({ region });
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'story-x5jlpv5xmbdjbpdrn326rfu7he-NONE';
export const handler = async (event: any): Promise<{ token: string, story:string }> => {
    // The agentId is now found in event.arguments
    const agentId = "agent_5201k1z5qv74ewe91m1ea9x7rd2y";
    
    console.log("lamda triggred")
    if (!ELEVENLABS_API_KEY) {
        throw new Error('ElevenLabs API key is not configured.');
    }

    try {
        const response = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
            {
                method: 'GET',
                headers: {
                    'xi-api-key': ELEVENLABS_API_KEY,
                },
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('ElevenLabs API Error:', errorText);
            throw new Error(`Failed to get conversation token: ${errorText}`);
        }

        const body = await response.json();

        console.log("eleven lab response",body)

         const targetStoryId = "12345";
         const getItemCommand = new GetItemCommand({
              TableName: DYNAMODB_TABLE_NAME,
              Key: {
                id: { S: targetStoryId }
              }
            });
            const dbResponse = await dynamodbClient.send(getItemCommand);
             if (!dbResponse.Item) {
              throw new Error(`no story found`);
            }
            const storyItem = unmarshall(dbResponse.Item);
            const storyContent = storyItem.storyContent;
        
        // Return the token as an object matching our GraphQL schema
        //@ts-ignore
        return  {token:body.token,
            story:storyContent
        } 
        
    } catch (error) {
        console.error('Handler error:', error);
        throw new Error('Internal server error.');
    }
};