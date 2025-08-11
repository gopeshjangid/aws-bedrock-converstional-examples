import { defineFunction } from '@aws-amplify/backend';

export const humeAIHandler = defineFunction({
  name: 'humeAIHandler',
  entry: './handler.ts',
//   timeout: 30, // 30 seconds timeout for WebSocket operations
//   memorySize: 512, // Increase memory for audio processing
//   environment: {
//     // Add your Hume AI API key as an environment variable
//     HUME_API_KEY: 'your_hume_api_key_here', // Replace with your actual API key
//     HUME_CONFIG_ID: 'your_hume_config_id_here', // Optional: Replace with your config ID
//   },

});