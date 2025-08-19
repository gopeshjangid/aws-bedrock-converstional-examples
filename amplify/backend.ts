import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import {  chatHandler,queryAIHandler, data } from './data/resource';
import { askAIHandler } from './functions/askAI/resource'; // Import the askAI function handler
import { Fn, Stack } from 'aws-cdk-lib';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { CfnFunction } from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { cloneVoiceHandler } from './functions/voiceClone/resource';
import { speechHandler } from './functions/synthesizeSpeech/resource';
import { humeAIHandler } from './functions/humeAI/resource'; // Add this import
import { aws_cloudfront } from 'aws-cdk-lib';
import { WebSocketApi, WebSocketStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { elevenLabHandler } from './functions/elevenlab/resource';
import { aiToolHandler } from './functions/aiTool/resource';
import { novaAIHandler } from './functions/novaAI/resource';
import * as cdk from 'aws-cdk-lib';
import { submitPromptFunction } from './functions/submit-prompt/resource';
import { assemblyaiToken } from './functions/assemblyToken/resource';
import { replySuggester } from './functions/chatSuggestion/resource';


/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
  askAIHandler,
  cloneVoiceHandler,
  speechHandler,
  humeAIHandler,// Add the Hume AI handler to backend
  chatHandler,
  queryAIHandler,
  elevenLabHandler,
  aiToolHandler,
  novaAIHandler,
  submitPromptFunction,
  assemblyaiToken,
  replySuggester
});

// const UserTable = backend.data.resources.tables['User'];
// const MessageTable = backend.data.resources.tables['Message'];

// function getTableOrThrow(name: string) {
//   const tables = backend.data.resources.tables;
//   const t = (tables as any)?.[name];
//   if (!t) {
//     throw new Error(
//       `Table "${name}" not found. Available: ${
//         tables ? Object.keys(tables).join(', ') : '(no tables on backend.data)'
//       }. Check your model name and that "data" is included in defineBackend().`
//     );
//   }
//   return t;
// }

// const UserTable = getTableOrThrow('User');                // must match your model name exactly
// const MessageTable = getTableOrThrow('Message');

// backend.replySuggester.addEnvironment('USER_TABLE_NAME', UserTable.tableName);
// backend.replySuggester.addEnvironment('MESSAGE_TABLE_NAME', MessageTable.tableName);


const askAIHandlerFn = backend.askAIHandler.resources.lambda;
const speechHandlerfn = backend.speechHandler.resources.lambda;
const humeAIHandlerFn = backend.humeAIHandler.resources.lambda; // Get the Hume AI Lambda function
const chatHandlerFn= backend.chatHandler.resources.lambda;
const queryAIHandlerFn= backend.queryAIHandler.resources.lambda;
const elevenLabHandlerfn=backend.elevenLabHandler.resources.lambda
const aiToolfn=backend.aiToolHandler.resources.lambda
const novaaifn= backend.novaAIHandler.resources.lambda

const dynamoDbReadPolicy = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: [
    'dynamodb:GetItem', // Allows reading a single item
    'dynamodb:Query'
  ],
  // Replace 'YOUR_DYNAMODB_STORY_TABLE_NAME' with the actual name of your DynamoDB table
  // You can also reference the table if it's defined within your backend.ts
  resources: [
    "*"]
});

const policies=new PolicyStatement({
  effect: Effect.ALLOW,
  actions: [
    'dynamodb:GetItem', // Allows reading a single item
    'bedrock:InvokeModel',
    'dynamodb:Query'
  ],
  // Replace 'YOUR_DYNAMODB_STORY_TABLE_NAME' with the actual name of your DynamoDB table
  // You can also reference the table if it's defined within your backend.ts
  resources: [
    "*"]
});
// 2. Bedrock Invoke Model Policy
const bedrockInvokePolicy = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: [
    'bedrock:InvokeModelWithResponseStream', // Allows invoking Bedrock models
    'bedrock:InvokeModel',
    'bedrock:DescribeKnowledgeBase',
    'bedrock:ListKnowledgeBases',
    'bedrock:Retrieve',
    'bedrock:RetrieveAndGenerate',
    'bedrock:RetrieveAndGenerateCommand',
    'logs:CreateLogGroup',
    'logs:CreateLogStream',
    'logs:PutLogEvents'
  ],
  resources: ['*'], // Bedrock model invocation typically uses a wildcard resource
});


// Attach policies to the Lambda's execution role

askAIHandlerFn.addToRolePolicy(dynamoDbReadPolicy);
aiToolfn.addToRolePolicy(dynamoDbReadPolicy);
elevenLabHandlerfn.addToRolePolicy(dynamoDbReadPolicy)
askAIHandlerFn.addToRolePolicy(bedrockInvokePolicy);
chatHandlerFn.addToRolePolicy(bedrockInvokePolicy);
chatHandlerFn.addToRolePolicy(dynamoDbReadPolicy);
queryAIHandlerFn.addToRolePolicy(bedrockInvokePolicy);
queryAIHandlerFn.addToRolePolicy(dynamoDbReadPolicy);
novaaifn.addToRolePolicy(bedrockInvokePolicy)
backend.submitPromptFunction.resources.lambda.addToRolePolicy(bedrockInvokePolicy)
backend.replySuggester.resources.lambda.addToRolePolicy(policies)

// backend.replySuggester.addEnvironment('USER_TABLE_NAME', UserTable.tableName);
// backend.replySuggester.addEnvironment('MESSAGE_TABLE_NAME', MessageTable.tableName);
// Add internet access policy for Hume AI WebSocket connections
const internetAccessPolicy = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: [
    'ec2:CreateNetworkInterface',
    'ec2:DescribeNetworkInterfaces',
    'ec2:DeleteNetworkInterface',
    'ec2:AttachNetworkInterface',
    'ec2:DetachNetworkInterface'
  ],
  resources: ['*']
});

humeAIHandlerFn.addToRolePolicy(internetAccessPolicy);

const appsyncServiceRole = backend.data.resources.graphqlApi;

const apiStack = Stack.of(askAIHandlerFn); // Use the Lambda's stack for consistency
const apiStack2 = Stack.of(speechHandlerfn); // Use the Lambda's stack for consistency
const apiStack3 = Stack.of(humeAIHandlerFn); // Stack for Hume AI handler
const aiApiStack=Stack.of(aiToolfn)
const novaStack= Stack.of(novaaifn)


const streamingAudioApi = new RestApi(apiStack, 'StreamingAudioApi', {
  restApiName: 'StreamingAudioApi',
  description: 'API Gateway for streaming audio responses from askAIHandler Lambda.',
  deployOptions: {
    stageName: 'prod', // Or 'dev', or use projectInfo.env.name
  },
  // This is important for CORS, allowing your frontend to call this API
  defaultCorsPreflightOptions: {
    allowOrigins: ['*'], // Adjust this to your frontend's domain in production
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
    allowCredentials: true,
  },
});

const aiApi = new RestApi(aiApiStack, 'aiToolApi', {
  restApiName: 'aiTool',
  description: 'API Gateway for streaming audio responses from askAIHandler Lambda.',
  deployOptions: {
    stageName: 'prod', // Or 'dev', or use projectInfo.env.name
  },
  // This is important for CORS, allowing your frontend to call this API
  defaultCorsPreflightOptions: {
    allowOrigins: ['*'], // Adjust this to your frontend's domain in production
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
    allowCredentials: true,
  },
});

const novaApi = new RestApi(novaStack, 'novaapi', {
  restApiName: 'novaAI',
  description: 'API Gateway for streaming audio responses from askAIHandler Lambda.',
  deployOptions: {
    stageName: 'prod', // Or 'dev', or use projectInfo.env.name
  },
  // This is important for CORS, allowing your frontend to call this API
  // defaultCorsPreflightOptions: {
  //   allowOrigins: ['http://localhost:5173'], // Adjust this to your frontend's domain in production
  //   allowMethods: ['POST', 'GET'],
  //   allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
  //   // allowCredentials: true,
  // },
});

const novaspeech = novaApi.root.addResource('nova');

novaspeech.addCorsPreflight({
  allowOrigins: ['http://localhost:5173'],
  allowMethods: ['OPTIONS', 'POST'],
  allowHeaders: ['*'],
  // allowCredentials: true,
});
novaspeech.addMethod(
  'POST',
  new LambdaIntegration(novaaifn), // Integrate with your askAIHandler Lambda
  {
    // No specific method options needed here for basic proxy integration
  }
);

const streamingSpeechApi = new RestApi(apiStack2, 'StreamingSpeechApi', {
  restApiName: 'StreamingSpeechApi',
  description: 'API Gateway for streaming audio responses from askAIHandler Lambda.',
  deployOptions: {
    stageName: 'prod', // Or 'dev', or use projectInfo.env.name
  },
  // This is important for CORS, allowing your frontend to call this API
  defaultCorsPreflightOptions: {
    allowOrigins: ['*'], // Adjust this to your frontend's domain in production
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
    allowCredentials: true,
  },
});

// Create API Gateway for Hume AI Handler
const humeAIApi = new RestApi(apiStack3, 'HumeAIApi', {
  restApiName: 'HumeAIApi',
  description: 'API Gateway for Hume AI speech-to-speech functionality.',
  deployOptions: {
    stageName: 'prod',
  },
  defaultCorsPreflightOptions: {
    allowOrigins: ['*'], // Adjust this to your frontend's domain in production
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
    allowCredentials: true,
  },
});

// Add a POST /stream-audio route
const streamAudioResource = streamingAudioApi.root.addResource('stream-audio');
const streamSpeech = streamingSpeechApi.root.addResource('speech');

// Add Hume AI routes
const humeAudioResource = humeAIApi.root.addResource('hume-speech');
const humeSessionResource = humeAIApi.root.addResource('hume-session');
const aiToolResource = aiApi.root.addResource('tool');

aiToolResource.addMethod(
  'GET',
  new LambdaIntegration(aiToolfn), // Integrate with your askAIHandler Lambda
  {
    // No specific method options needed here for basic proxy integration
  }
);

streamAudioResource.addMethod(
  'POST',
  new LambdaIntegration(askAIHandlerFn), // Integrate with your askAIHandler Lambda
  {
    // No specific method options needed here for basic proxy integration
  }
);

streamSpeech.addMethod(
  'POST',
  new LambdaIntegration(speechHandlerfn), // Integrate with your askAIHandler Lambda
  {
    // No specific method options needed here for basic proxy integration
  }
);

// Add Hume AI methods
humeAudioResource.addMethod(
  'POST',
  new LambdaIntegration(humeAIHandlerFn, {
    proxy: true, // Enable proxy integration for better request/response handling
    allowTestInvoke: true,
  }),
  // {
  //   requestParameters: {
  //     'integration.request.header.X-Amz-Invocation-Type': "'Event'", // For async processing if needed
  //   }
  // }
);

humeSessionResource.addMethod(
  'POST',
  new LambdaIntegration(humeAIHandlerFn, {
    proxy: true,
    allowTestInvoke: true,
  })
);

// OPTIONS methods are automatically added by defaultCorsPreflightOptions
// No need to add them explicitly

// --- Grant API Gateway permission to invoke the Lambda ---
// This is done via a resource-based policy on the Lambda function itself.
// This is crucial for the API Gateway to be able to call your Lambda.
askAIHandlerFn.addPermission('ApiGatewayInvokeStreamingPermission', {
  principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
  action: 'lambda:InvokeFunction',
  sourceArn: Fn.join('', [
    'arn:',
    apiStack.partition, // 'aws' or 'aws-cn'
    ':execute-api:',
    apiStack.region,
    ':',
    apiStack.account,
    ':',
    streamingAudioApi.restApiId,
    '/*' // This allows invocation from any method/path under this API
  ]),
});

speechHandlerfn.addPermission('ApiGatewayInvokeStreamingPermission', {
  principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
  action: 'lambda:InvokeFunction',
  sourceArn: Fn.join('', [
    'arn:',
    apiStack.partition, // 'aws' or 'aws-cn'
    ':execute-api:',
    apiStack.region,
    ':',
    apiStack.account,
    ':',
    streamingAudioApi.restApiId,
    '/*' // This allows invocation from any method/path under this API
  ]),
});

// Grant API Gateway permission to invoke Hume AI Lambda
humeAIHandlerFn.addPermission('ApiGatewayInvokeHumeAIPermission', {
  principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
  action: 'lambda:InvokeFunction',
  sourceArn: Fn.join('', [
    'arn:',
    apiStack3.partition,
    ':execute-api:',
    apiStack3.region,
    ':',
    apiStack3.account,
    ':',
    humeAIApi.restApiId,
    '/*'
  ]),
});

const myDistribution = aws_cloudfront.Distribution.fromDistributionAttributes(apiStack2, 'MyCloudFrontDistribution', {
  distributionId: 'E2MUIJB2C40O27', // <-- REPLACE THIS WITH YOUR CLOUDFRONT DISTRIBUTION ID
  domainName: 'd1bqqooq04dy6s.cloudfront.net', // <-- REPLACE THIS WITH YOUR CLOUDFRONT DOMAIN NAME
});

// Add the resource-based permission to the speechHandlerfn Lambda
// This is the programmatic equivalent of the `aws lambda add-permission` CLI command
speechHandlerfn.addPermission('AllowCloudFrontServicePrincipal', {
  principal: new iam.ServicePrincipal('cloudfront.amazonaws.com'),
  action: 'lambda:InvokeFunctionUrl',
  sourceArn: `arn:aws:cloudfront::${Stack.of(speechHandlerfn).account}:distribution/${myDistribution.distributionId}`,
});

// Export the API Gateway URLs for easy access in your frontend
// These values will be available in your amplify_outputs.json file

// const humeWebSocketApi = new WebSocketApi(apiStack3, 'HumeWebSocketApi', {
//   apiName: 'HumeWebSocketApi',
//   // Use the same Lambda for all routes ($connect, $disconnect, and $default)
//   // This is a common pattern for serverless WebSocket applications.
//   // The Lambda will need to inspect the event to determine the action.
//   connectRouteOptions: {
//     integration: new WebSocketLambdaIntegration('ConnectIntegration', humeAIHandlerFn),
//   },
//   disconnectRouteOptions: {
//     integration: new WebSocketLambdaIntegration('DisconnectIntegration', humeAIHandlerFn),
//   },
//   defaultRouteOptions: {
//     integration: new WebSocketLambdaIntegration('DefaultIntegration', humeAIHandlerFn),
//   },
// });

// // Create a deployment stage for the WebSocket API
// const humeWebSocketStage = new WebSocketStage(apiStack3, 'HumeWebSocketStage', {
//   webSocketApi: humeWebSocketApi,
//   stageName: 'prod',
//   autoDeploy: true, // Automatically deploy new changes
// });

// // Grant the WebSocket API permission to invoke the Lambda function
// humeAIHandlerFn.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));
// // --- END: WebSocket API Configuration for humeAIHandlerFn ---
// backend.addOutput({
//   custom: {
//     HumeAIApiUrl: humeAIApi.url,
//     HumeAIApiId: humeAIApi.restApiId,
//     HumeAISpeechEndpoint: `${humeAIApi.url}hume-speech`,
//     HumeAISessionEndpoint: `${humeAIApi.url}hume-session`,
//   }
// });

const novaAIsocket = new WebSocketApi(novaStack, 'novaWebSocketApi', {
  apiName: 'novaSocketApi',
  // Use the same Lambda for all routes ($connect, $disconnect, and $default)
  // This is a common pattern for serverless WebSocket applications.
  // The Lambda will need to inspect the event to determine the action.
  connectRouteOptions: {
    integration: new WebSocketLambdaIntegration('ConnectIntegration', novaaifn),
  },
  disconnectRouteOptions: {
    integration: new WebSocketLambdaIntegration('DisconnectIntegration', novaaifn),
  },
  defaultRouteOptions: {
    integration: new WebSocketLambdaIntegration('DefaultIntegration', novaaifn),
  },
});

const novaWebSocketStage = new WebSocketStage(novaaifn, 'HumeWebSocketStage', {
  webSocketApi:novaAIsocket,
  stageName: 'prod',
  autoDeploy: true, // Automatically deploy new changes
});

// Grant the WebSocket API permission to invoke the Lambda function
novaaifn.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));
// --- END: WebSocket API Configuration for humeAIHandlerFn ---
backend.addOutput({
  custom: {
    novaApiUrl: novaApi.url,
    novaApiId: novaApi.restApiId,
    novaEndpoint: `${novaApi.url}nova-talk`,
    novaSessionEndpoint: `${novaApi.url}nova-session`,
  }
});

novaaifn.addToRolePolicy(new iam.PolicyStatement({
  actions: ["execute-api:ManageConnections"],
  resources: [
    `arn:aws:execute-api:${Stack.of(novaStack).region}:${Stack.of(novaStack).account}:${novaAIsocket.apiId}/*/@connections/*`
  ],
}));

const KnowledgeBaseDataSource =
  backend.data.resources.graphqlApi.addHttpDataSource(
    "KnowledgeBaseDataSource",
    `https://bedrock-agent-runtime.ap-southeast-2.amazonaws.com`,
    {
      authorizationConfig: {
        signingRegion: "ap-southeast-2",       // sign for KB region
        signingServiceName: "bedrock",
      },
    },
  );

KnowledgeBaseDataSource.grantPrincipal.addToPrincipalPolicy(
  new PolicyStatement({
    resources: [
      `arn:aws:bedrock:ap-southeast-2:137086856717:knowledge-base/EQSQRSNAQM`
    ],
    actions: ["bedrock:Retrieve"],
  }),
);