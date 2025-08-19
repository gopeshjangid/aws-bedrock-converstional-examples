// amplify/functions/replySuggester/resource.ts
import { defineFunction } from '@aws-amplify/backend';

export const replySuggester = defineFunction({
  name: 'replySuggester',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 512,
//   environment: {
//     AWS_REGION: 'ap-south-1',
//     MESSAGE_TABLE_NAME: '<YOUR_Message_table_name>',
//     MESSAGE_CHATID_INDEX_NAME: 'getChatMessagesList',
//     USER_TABLE_NAME: '<YOUR_User_table_name>',
//     USER_PK_NAME: 'userId',
//     MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
//     // BEDROCK_INFERENCE_PROFILE_ARN: '<optional-arn>',
//   },
});
