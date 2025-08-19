import {defineFunction} from '@aws-amplify/backend';

export const assemblyaiToken = defineFunction({
  entry: './handler.ts',
  name: 'assemblyaiToken',
  memoryMB: 128,
  timeoutSeconds: 400,
  runtime: 20,
  // layers: {
  //   pg: 'arn:aws:lambda:ap-south-1:137086856717:layer:pg:1'
  // },
});