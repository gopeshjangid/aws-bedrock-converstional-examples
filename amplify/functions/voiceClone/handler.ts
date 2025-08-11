// // amplify/backend/function/ElevenLabsVoiceCloningLambda/src/index.ts
// import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
// import { AppSyncResolverEvent } from 'aws-lambda';

// // Initialize ElevenLabs client
// const elevenlabs = new ElevenLabsClient({
//   apiKey: "sk_4787ce6d923c10ead6cd831592f6aa5351698457bd44840f", // Store your API key as an environment variable
// });

// type CloneVoiceArgs = {
//   voiceName: string;
//   audioBase64: string;
// };

// type CloneVoiceResponse = {
//   voiceId: string;
//   message: string;
// };

// export const handler = async (event: AppSyncResolverEvent<CloneVoiceArgs>): Promise<CloneVoiceResponse> => {
//   console.log('Voice cloning event received:', JSON.stringify(event, null, 2));

//   try {
//     if (!event.arguments.voiceName || !event.arguments.audioBase64) {
//       throw new Error('Voice name and audio file are required.');
//     }

//     const { voiceName, audioBase64 } = event.arguments;

//     // Convert Base64 string to a Buffer
//     const audioBuffer = Buffer.from(audioBase64, 'base64');
    
//     // The ElevenLabs SDK can accept a Buffer directly for audio data
//     // The audioIsolation.convert method also accepts a Buffer
//     const audioStream = await elevenlabs.audioIsolation.convert({
//       audio: audioBuffer,
//     });

//     console.log(`Attempting to clone voice with name: "${voiceName}"`);
    
//     const voice = await elevenlabs.voices.ivc.create({
//       name: voiceName,
//       files: [audioStream],
//     });

//     if (!voice || !voice.voiceId) {
//       throw new Error('ElevenLabs API did not return a valid voice ID.');
//     }
    
//     console.log(`Successfully created new voice clone with ID: ${voice.voiceId}`);

//     return {
//       voiceId: voice.voiceId,
//       message: `Voice "${voiceName}" successfully cloned!`,
//     };
//   } catch (error: any) {
//     console.error('Error in ElevenLabs Voice Cloning Lambda:', error);
//     // Re-throw a generic error to the client to avoid leaking implementation details
//     throw new Error(`Failed to clone voice.`);
//   }
// };