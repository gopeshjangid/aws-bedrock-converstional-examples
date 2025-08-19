import { defineFunction } from '@aws-amplify/backend';


const lambaEntryPrefix = 'amplify/functions';
const submitPromptName: string = 'devSubmitPrompt';

export const submitPromptFunction = defineFunction({
  name: submitPromptName,
//   environment: {
//     BEDROCK_KNOWLEDGE_BASE_ID: BACKEND_CONFIG.BEDROCK_KNOWLEDGE_BASE_ID,
//     BEDROCK_MODEL_NAME: BACKEND_CONFIG.BEDROCK_FOUNDATION_MODEL_NAME
//   },
  entry: './handler.ts',
  runtime: 18,
  timeoutSeconds: 900
});