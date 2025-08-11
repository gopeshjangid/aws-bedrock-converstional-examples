// import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';


// // Ensure the ElevenLabs API key is present in environment variables.
// const elevenlabsApiKey = process.env.ELEVEN_LABS_API_KEY || "sk_4787ce6d923c10ead6cd831592f6aa5351698457bd44840f";

// // Log the API key status for debugging
// if (elevenlabsApiKey) {
//   console.log('ElevenLabs API Key found. Initializing client.');
// } else {
//   console.error('ERROR: ElevenLabs API Key is not set in environment variables.');
// }

// const elevenlabs = new ElevenLabsClient({
//   apiKey: elevenlabsApiKey
// });

// export const handler = awslambda.streamifyResponse(async (event: any, responseStream: any) => {
//   console.log('--- Lambda Handler Invoked ---');
//   console.log('Event received:', JSON.stringify(event, null, 2));

//   try {
//     const { voiceId, text } = JSON.parse(event.body);
    
//     // Log parsed input parameters
//     console.log(`Parsed input - Voice ID: "${voiceId}", Text: "${text.substring(0, 50)}..."`);
    
//     if (!voiceId || !text) {
//       console.error('Input validation failed: Voice ID or text is missing.');
//       throw new Error('Voice ID and text are required.');
//     }

//     console.log(`Starting streaming synthesis for voice ID: ${voiceId}`);

//     // Set response headers for streaming audio
//     const metadata = {
//       statusCode: 200,
//       headers: {
//         'Content-Type': 'audio/mpeg',
//         'Transfer-Encoding': 'chunked',
//         'Cache-Control': 'no-cache',
//         'Connection': 'keep-alive',
//         // 'Access-Control-Allow-Origin': '*', // Adjust for your domain
//         // 'Access-Control-Allow-Headers': 'Content-Type',
//         'Access-Control-Allow-Methods': 'POST, OPTIONS'
//       }
//     };

//     responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
//     console.log('Response stream headers set. Calling ElevenLabs API.');

//     // Get audio stream from ElevenLabs
//     const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
//       modelId: 'eleven_multilingual_v2',
//       text,
//       outputFormat: 'mp3_44100_128',
//       voiceSettings: {
//         stability: 0,
//         similarityBoost: 0,
//         useSpeakerBoost: true,
//         speed: 1.0,
//       },
//     });

//     // Stream the audio data chunks as they arrive
//     const reader = audioStream.getReader();
//     let done = false;
//     let chunkCount = 0;

//     console.log('ElevenLabs API call successful. Starting to read from audio stream.');

//     while (!done) {
//       const { done: readerDone, value } = await reader.read();
//       done = readerDone;

//       if (value) {
//         chunkCount++;
//         // Log each chunk being received and written
//         console.log(`Received chunk ${chunkCount} from ElevenLabs. Size: ${value.length} bytes. Writing to response stream.`);
//         responseStream.write(value);
//       }
//     }

//     responseStream.end();
//     console.log(`Streaming finished. Total chunks streamed: ${chunkCount}.`);

//   } catch (error: any) {
//     // Log the full error object for detailed debugging
//     console.error('--- ERROR in streaming Lambda ---');
//     console.error('Error details:', error);
    
//     const errorMetadata = {
//       statusCode: 500,
//       headers: {
//         'Content-Type': 'application/json',
//         // 'Access-Control-Allow-Origin': '*'
//       }
//     };

//     responseStream = awslambda.HttpResponseStream.from(responseStream, errorMetadata);
//     responseStream.write(JSON.stringify({
//       error: `Failed to synthesize speech: ${error.message}`
//     }));
//     responseStream.end();
//     console.error('Sent error response to client.');
//   } finally {
//     console.log('--- Lambda Handler Finished ---');
//   }
// });
