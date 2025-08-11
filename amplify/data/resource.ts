import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { defineFunction } from "@aws-amplify/backend";
import { askAIHandler } from "../functions/askAI/resource"; // Adjust the import path as necessary
import { cloneVoiceHandler } from "../functions/voiceClone/resource";
import { speechHandler } from "../functions/synthesizeSpeech/resource";
import { defineConversationHandlerFunction } from '@aws-amplify/backend-ai/conversation';
import { elevenLabHandler } from "../functions/elevenlab/resource";
import { Token } from "aws-cdk-lib";
import { speechToSpeech } from "@elevenlabs/elevenlabs-js/api";
import { speechToTextHandler } from "../functions/speechToText/resource";


/*== STEP 1 ===============================================================
Fixed AWS Amplify Gen 2 schema with proper conversation authorization
=========================================================================*/

export const chatHandler = defineConversationHandlerFunction({
  entry: './chatHandler.ts',
  name: 'customChatHandler',
  models: [
    { modelId: a.ai.model("Claude 3 Haiku") }
  ]
});

export const queryAIHandler = defineFunction({
  name: 'queryHandler',
  entry: './queryAIHandler.ts',
  // environment: {
  //   API_ENDPOINT: 'MY_API_ENDPOINT',
  //   API_KEY: secret('MY_API_KEY'),
  // },
});

const schema = a.schema({
  Todo: a
    .model({
      content: a.string(),
    })
    .authorization((allow) => [allow.publicApiKey(), allow.authenticated()]),

  story: a
    .model({
      storyName: a.string(),
      storyContent: a.string(),
    })
    .authorization((allow) => [allow.publicApiKey(), allow.authenticated()]),
   
  storyResponse: a.customType({
    text: a.string(),
    audioBase64: a.string()
  }),

  askAI: a
    .query()
    .arguments({
      question: a.string()
    })
    .authorization((allow) => [allow.publicApiKey(), allow.authenticated()])
    .handler(a.handler.function(askAIHandler))
    .returns(a.string()),

  cloneVoice: a
    .mutation()
    .arguments({
      voiceName: a.string(),
      audioBase64: a.string()
    })
    .handler(a.handler.function(cloneVoiceHandler))
    .returns(a.customType({
      voiceId: a.string(),
      message: a.string()
    }))
    .authorization((allow) => [allow.publicApiKey(), allow.authenticated()]),

  synthesizeSpeech: a
    .query()
    .arguments({
      voiceId: a.string(),
      text: a.string()
    })
    .handler(a.handler.function(speechHandler))
    .returns(a.string())
    .authorization((allow) => [allow.publicApiKey(), allow.authenticated()]),
    
  Post: a.model({
    title: a.string(),
    body: a.string(),
  })
  .authorization(allow => allow.owner()),

  // Fixed conversation definition - moved outside schema and properly configured

  // Alternative conversation with custom handler (uncomment if needed)
  // customChat: a.conversation({
  //   aiModel: a.ai.model('Claude 3.5 Haiku'),
  //   systemPrompt: "You are a helpful assistant",
  //   handler: chatHandler,
  // })
  // .authorization((allow) => allow.owner()),
    queryAI: a.query()
    .arguments({
      questions:a.string()
    })
    .returns(a.customType({
      text: a.string(),
      audioBase64: a.string()
    }))
    .handler(a.handler.function(queryAIHandler))
    .authorization((allow) => allow.authenticated()),

      
  generateRecipe: a.generation({
    aiModel: a.ai.model("Claude 3.5 Haiku"),
    systemPrompt: 'You are a helpful assistant that generates recipes.',
  })
  .arguments({
    description: a.string(),
  })
  .returns(
    a.customType({
      name: a.string(),
      ingredients: a.string().array(),
      instructions: a.string(),
    })
  )
  .authorization((allow) => allow.authenticated()),

  chat: a.conversation({
    aiModel: a.ai.model("Claude 3 Haiku"),
    systemPrompt: "You are a helpful assistant that can answer questions about stories. When users ask questions, use the getInfo tool to provide detailed responses.",
    // tools: [
    //   a.ai.dataTool({
    //     name: 'getInfo',
    //     description: 'Use this tool to get detailed information and answers to user questions about stories. Pass the user question as the questions parameter.',
    //     query: a.ref('queryAI'),
    //   }),
    // ]

    handler:chatHandler
  })
  .authorization((allow) => allow.owner()),

  getToken:a
  .query()
  .returns(a.customType({
    token:a.string(),
    story:a.string()
  }))
  .authorization(allow=>[allow.publicApiKey(), allow.authenticated()])
  .handler(a.handler.function(elevenLabHandler)),

  sendAudio: a.mutation()
      .arguments({
        sessionId: a.string().required(),
        mimeType: a.string().required(),
        chunkBase64: a.string().required(),
        isFinal: a.boolean().default(false),
      })
      .returns(a.string())
      .authorization(allow => [allow.authenticated()])
      .handler(a.handler.function(speechToTextHandler)),
      
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "apiKey",
    // API Key is used for a.allow.public() rules
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});

/*== STEP 2 ===============================================================
Go to your frontend source code. From your client-side code, generate a
Data client to make CRUDL requests to your table. (THIS SNIPPET WILL ONLY
WORK IN THE FRONTEND CODE FILE.)

Using JavaScript or Next.js React Server Components, Middleware, Server 
Actions or Pages Router? Review how to generate Data clients for those use
cases: https://docs.amplify.aws/gen2/build-a-backend/data/connect-to-API/
=========================================================================*/

/*
"use client"
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>() // use this Data client for CRUDL requests
*/

/*== STEP 3 ===============================================================
Fetch records from the database and use them in your frontend component.
(THIS SNIPPET WILL ONLY WORK IN THE FRONTEND CODE FILE.)
=========================================================================*/

/* For example, in a React component, you can use this snippet in your
  function's RETURN statement */
// const { data: todos } = await client.models.Todo.list()

// return <ul>{todos.map(todo => <li key={todo.id}>{todo.content}</li>)}</ul>