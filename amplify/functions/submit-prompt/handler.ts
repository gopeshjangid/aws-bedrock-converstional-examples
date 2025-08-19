//amplify/function/submit-prompt/handler.ts
import { PromptService } from '../../custom/src/lambda/prompt/service';
import { Schema } from '../../data/resource';
//import { env } from '$amplify/env/devSubmitPrompt'; // the import is '$amplify/env/<function name>'

type Handler = Schema['submitPrompt']['functionHandler'];

export const handler: Handler = async event => {
  const { userId, prompt, messageId, sessionId } = event.arguments;

  if (!userId) {
    console.log('userId not found');
    throw new Error('User id not found');
  }

  // if (!env.BEDROCK_KNOWLEDGE_BASE_ID || !env.BEDROCK_MODEL_NAME) {
  //   console.log('envVars not found');
  //   throw new Error('BEDROCK environment vars not found');
  // }

  const promptService = PromptService({
    bedrockKnowledgeBaseId: 'EQSQRSNAQM',
    bedrockModelName: 'amazon.nova-lite-v1:0',
    region: 'ap-southeast-2'
  });

  const response = await promptService.submitPrompt({
    userId,
    prompt: prompt || undefined,
    messageId: messageId || undefined,
    sessionId: sessionId || undefined
  });

  console.log(`response: ${JSON.stringify(response)}`);

  return response;
};