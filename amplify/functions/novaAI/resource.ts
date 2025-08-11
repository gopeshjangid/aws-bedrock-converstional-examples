import {defineFunction} from '@aws-amplify/backend';

export const novaAIHandler = defineFunction({
  entry: './handler.ts',
  name: 'novaAI',
  memoryMB: 128,
  timeoutSeconds: 900,
//   runtime: 20,
  // layers: {
  //   pg: 'arn:aws:lambda:ap-south-1:137086856717:layer:pg:1'
  // },
});