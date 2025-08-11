import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { HumeClient } from 'hume';
import type { SubscribeEvent } from "hume/api/resources/empathicVoice/resources/chat";
import type { CloseEvent } from "hume/core/websocket/events";

/**
 * Interface for the message body sent from the client to the WebSocket API.
 */
interface ClientMessage {
  action: 'start_session' | 'send_audio';
  audioData?: string; // base64 encoded audio
}

/**
 * The main Lambda handler for the API Gateway WebSocket API.
 * This function handles different WebSocket events and messages.
 */
export const handler = async (event: any) => {
  console.log('Received WebSocket event:', JSON.stringify(event, null, 2));

  // Extract necessary information from the event
  const connectionId = event.requestContext.connectionId;
  const routeKey = event.requestContext.routeKey;
  const domainName = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  
  // The API Gateway Management API client is used to send data back to the client.
  const apiGatewayManagementApi = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });

  const postToConnection = async (data: any) => {
    const params = {
      ConnectionId: connectionId,
      Data: JSON.stringify(data),
    };
    try {
      await apiGatewayManagementApi.send(new PostToConnectionCommand(params));
    } catch (error: any) {
      console.error('Failed to post to connection:', error);
      if (error.statusCode === 410) {
        // Handle stale connections
        console.warn(`Connection ${connectionId} is stale or already closed.`);
      } else {
        throw error;
      }
    }
  };

  // Switch based on the routeKey to handle different events
  switch (routeKey) {
    case '$connect':
      console.log('Client connected:', connectionId);
      // For the $connect route, simply return a successful status code.
      // No need to send data back yet.
      return { statusCode: 200, body: 'Connected' };

    case '$disconnect':
      console.log('Client disconnected:', connectionId);
      // Clean up any resources associated with this connection if needed.
      return { statusCode: 200, body: 'Disconnected' };

    case '$default':
      try {
        const { action, audioData }: ClientMessage = JSON.parse(event.body || '{}');
        console.log(`Received message from ${connectionId} with action: ${action}`);

        const apiKey = "zcAQ010T7BoEkYZ13WNA4nexNUAz9El1qT0ytl2gaGJ2AGYX";
        if (!apiKey) {
          console.error('HUME_API_KEY environment variable is not set');
          await postToConnection({
            success: false,
            error: 'Hume AI API key not configured',
          });
          return { statusCode: 500, body: 'API Key not configured' };
        }

        const client = new HumeClient({ apiKey });

        if (action === 'start_session') {
          // This code initiates a Hume WebSocket connection and tests it.
          // In a real-world streaming application, you would manage this connection's
          // state in a database like DynamoDB to keep it alive across Lambda invocations.
          // For this example, we'll demonstrate a single-transaction connection.
          try {
            console.log('Attempting to connect to Hume...');
            const socket = await client.empathicVoice.chat.connect({
              //configId: process.env.HUME_CONFIG_ID,
            });

            // Clean up the socket after a short while to prevent Lambda from hanging
            // in case the on('close') event is not received.
            const timeout = setTimeout(() => {
              console.log('Hume socket connection timed out, closing...');
              socket.close();
            }, 8000);

            socket.on('open', async () => {
              console.log('Hume socket connection opened successfully');
              clearTimeout(timeout);
              await postToConnection({
                success: true,
                message: 'Session started successfully',
              });
              // This is a one-off connection, so we close it after sending the response.
              socket.close();
            });

            socket.on('error', async (error: Event | Error) => {
              console.error('Hume socket error during start:', error);
              clearTimeout(timeout);
              await postToConnection({
                success: false,
                error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              });
              socket.close();
            });

            socket.on('close', (event: CloseEvent) => {
              console.log('Hume socket closed after start session:', event);
            });
            
          } catch (error) {
            console.error('Failed to initialize session:', error);
            await postToConnection({
              success: false,
              error: 'Failed to initialize session',
              details: error instanceof Error ? error.message : 'Unknown error',
            });
          }
          // The Lambda handler must return a response immediately.
          return { statusCode: 200, body: 'Session start request received' };
        }

        if (action === 'send_audio' && audioData) {
          try {
            // Again, this is a single-transaction model. A real streaming app
            // would have a persistent connection.
            const socket = await client.empathicVoice.chat.connect({
             // configId: process.env.HUME_CONFIG_ID,
            });

            const timeout = setTimeout(() => {
              console.log('Audio processing timed out, closing socket.');
              socket.close();
            }, 30000);

            let audioChunks: string[] = [];

            socket.on('open', () => {
              console.log('Hume audio processing socket opened');
              socket.sendAudioInput({ data: audioData });
            });

            socket.on('message', async (message: SubscribeEvent) => {
              console.log('Received message type:', message.type);
              if (message.type === 'audio_output' && message.data) {
                audioChunks.push(message.data);
                // Immediately stream the audio chunk back to the client
                await postToConnection({
                  success: true,
                  audioChunk: message.data,
                });
              }
              // This is a critical point: since we can't maintain state, we must
              // assume the client will re-send audio data on a new message,
              // and the Hume socket will be re-established each time.
            });
            
            socket.on('error', async (error: Event | Error) => {
              console.error('Hume audio processing error:', error);
              clearTimeout(timeout);
              await postToConnection({
                success: false,
                error: `Audio processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              });
              socket.close();
            });

            socket.on('close', (event: CloseEvent) => {
              console.log('Hume audio processing socket closed:', event);
              clearTimeout(timeout);
              // You could send a final message to the client here, like an 'end_of_stream' signal.
            });
            
          } catch (error) {
            console.error('Audio processing initialization failed:', error);
            await postToConnection({
              success: false,
              error: 'Audio processing initialization failed',
              details: error instanceof Error ? error.message : 'Unknown error',
            });
          }
          return { statusCode: 200, body: 'Audio data sent' };
        }

        // Handle invalid actions
        await postToConnection({
          success: false,
          error: 'Invalid action or missing audio data',
          receivedAction: action,
          hasAudioData: !!audioData,
        });

      } catch (error) {
        console.error('Failed to parse WebSocket message body:', error);
        await postToConnection({
          success: false,
          error: 'Invalid JSON body',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return { statusCode: 200, body: 'Message processed' };

    default:
      console.log('Unsupported route:', routeKey);
      return { statusCode: 400, body: 'Unsupported route' };
  }
};
