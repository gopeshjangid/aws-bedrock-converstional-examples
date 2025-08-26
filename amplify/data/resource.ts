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
import { submitPromptFunction } from "../functions/submit-prompt/resource";
import { assemblyaiToken } from "../functions/assemblyToken/resource";
import { replySuggester } from "../functions/chatSuggestion/resource";
import { CallLog, chatMediaAttachment, MessageModel } from './schema/chatSchema';
import {
  Activity,
  Favorite,
  ProfileImage,
  ReportUser,
  UserBlock,
  UserLocation,
  userModel,
  UserTermsConditions,
} from './schema/userSchema';


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

export const getWeather = defineFunction({
  name: 'getWeather',
  entry: './weatherHandler.ts',
  // If you use a paid API, put base URL & key here as env/secrets.
  // environment: { WEATHER_API_BASE: 'https://api.openweathermap.org/data/2.5', WEATHER_API_KEY: secret('WEATHER_API_KEY') }
});

export const browseWeb = defineFunction({
  name: "browseWeb",
  entry: "./webCrawler.ts",
  // environment: {
  //   // Provide exactly one (or both). The handler picks whichever is present.
  //   BRAVE_API_KEY: secret("BRAVE_API_KEY"),     // https://api.search.brave.com/
  //   SERPER_API_KEY: secret("SERPER_API_KEY"),   // https://serper.dev/
  //   ALLOWLIST: '["docs.","developer.","dev.","support.","help.","learn.","api."]', // substring allow hints
  //   BLOCKLIST: '["pinterest.","quora.com","reddit.com","facebook.com","x.com"]',   // basic block list
  // },
});

export const combinedHandler = defineFunction({
  name: 'combinedfunction',
  entry: './dataHandler.ts',
  // If you use a paid API, put base URL & key here as env/secrets.
  // environment: { WEATHER_API_BASE: 'https://api.openweathermap.org/data/2.5', WEATHER_API_KEY: secret('WEATHER_API_KEY') }

  environment: {
    // Required
    // KB_ID: "SB77W32JWL",                    // <-- Your KB ID
    // SERPER_API_KEY: secret("SERPER_API_KEY"),
    // Optional tuning
    ALLOWLIST: '["docs.","developer.","dev.","support.","help.","learn.","api."]',
    BLOCKLIST: '["pinterest.","quora.com","reddit.com","facebook.com","x.com"]',
    MAX_CHARS: "4000",
    FETCH_TIMEOUT_MS: "8000",
    // Keep region default (Lambda gets region automatically); override if needed:
    // AWS_REGION: "ap-south-1",
  },
});


export const AppFeedback = a
  .model({
    id: a.id().required(), // unique feedback record
    userId: a.string().required(), // who submitted it
    submittedAt: a.datetime().default(new Date().toISOString()), // ISO timestamp of submission
    // quantitative ratings
    ratingOverall: a.integer().required(), // e.g. 1–5 stars
    ratingUsability: a.integer(), // optional sub-rating
    ratingPerformance: a.integer(), // optional sub-rating
    comments: a.string(), // user’s text feedback
    category: a.enum(['BUG', 'FEATURE', 'UX', 'OTHER']),
    appVersion: a.string(), // e.g. "1.2.3"
    deviceInfo: a.json(), // JSON blob: OS, device model, screen size, etc.
  })
  .authorization(allow => [
    allow.owner(),
    allow.authenticated().to(['create', 'list', 'get']), // users can submit & view their own
  ]);

export const Support = a
  .model({
    id: a.id().required(), // unique feedback record
    userId: a.string().required(), // who submitted it
    createdAt: a.datetime().default(new Date().toISOString()), // ISO timestamp of submission
    subject: a.string().required(), // subject of the support request
    description: a.string().required(), // detailed description of the issue
    status: a.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']), // current status of the support request
    attachments: a.string().array(), // array of attachment URLs (e.g., screenshots, logs)
    alternativeEmail: a.email(),
    alternativePhone: a.string(), // optional alternative contact methods
  })
  .authorization(allow => [
    allow.authenticated().to(['create', 'list', 'get', 'update']), // users can submit & view their own
  ]);

export const PreferenceQuestions = a
  .model({
    question: a.string().required(), // the prompt text
    multiSelect: a.boolean().required(), // true/false
    required: a.boolean().required(), // true/false
    answers: a.hasMany('PreferenceAnswers', 'questionID'),
  })
  .authorization(allow => [
    allow.owner('userPools'),
    allow.authenticated().to(['list', 'get']),
  ]);

export const PreferenceAnswers = a
  .model({
    id: a.id().required(), // e.g. "looks", "personality", …
    questionID: a.id(), // FK back to MatchingQuestion.id
    text: a.string().required(), // the human-readable label
    vectorIcon: a.string().required(), // e.g. "face"
    vectorIconType: a.string().required(), // e.g. "MaterialIcons"
    question: a.belongsTo('PreferenceQuestions', 'questionID'),
  })
  .authorization(allow => [
    allow.owner('userPools'),
    allow.authenticated().to(['list', 'get']),
  ]);

const schema = a.schema({
chatMediaAttachment,
  Message: MessageModel,
  User: userModel,
  UserLocation,
  ProfileImage,
  UserBlock,
  Favorite,
  Activity,
  ReportUser,
  Support,
  CallLog,
  UserTermsConditions,
  PreferenceAnswers,
  PreferenceQuestions,
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
    .authorization(allow => [allow.owner(),allow.authenticated()]),

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
      questions: a.string()
    })
    .returns(a.customType({
      text: a.string(),
      audioBase64: a.string()
    }))
    .handler(a.handler.function(queryAIHandler))
    .authorization((allow) => allow.authenticated()),


  // generatechat: a.generation({
  //   aiModel: a.ai.model("Claude 3.5 Haiku"),
  //   systemPrompt: 'You are a helpful assistant that generates chat response based on provided context.',
  // })
  // .arguments({
  //   input: a.string(),
  // })
  // .returns(
  //   a.string()
  // )
  // .authorization((allow) => allow.authenticated()),

  // chat: a.conversation({
  //   aiModel: a.ai.model("Claude 3 Haiku"),
  //   systemPrompt: "You are a helpful assistant that can answer questions about stories. When users ask questions, use the getInfo tool to provide detailed responses.",
  //   // tools: [
  //   //   a.ai.dataTool({
  //   //     name: 'getInfo',
  //   //     description: 'Use this tool to get detailed information and answers to user questions about stories. Pass the user question as the questions parameter.',
  //   //     query: a.ref('queryAI'),
  //   //   }),
  //   // ]

  //   handler:chatHandler
  // })
  // .authorization((allow) => allow.owner()),

  getToken: a
    .query()
    .returns(a.customType({
      token: a.string(),
      story: a.string()
    }))
    .authorization(allow => [allow.publicApiKey(), allow.authenticated()])
    .handler(a.handler.function(elevenLabHandler)),

  sendAudio: a.mutation()
    .arguments({
      sessionId: a.string().required(),
      mimeType: a.string().required(),
      chunkBase64: a.string().required(),
      isFinal: a.boolean()
    })
    .returns(a.string())
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(speechToTextHandler)),


  knowledgeBase: a
    .query()
    .arguments({ input: a.string() })
    .handler(
      a.handler.custom({
        dataSource: "KnowledgeBaseDataSource",
        entry: "./resolvers/kbResolver.js",
      }),
    )
    .returns(a.string())
    .authorization((allow) => allow.authenticated()),


  getWeather: a.query()
    .arguments({ city: a.string() })
    .returns(a.customType({
      value: a.integer(),
      unit: a.string()
    }))
    .handler(a.handler.function(getWeather))
    .authorization((allow) => allow.authenticated()),


  BrowsePayload: a.customType({
    url: a.string(),
    title: a.string(),
    text: a.string(),
    links: a.string().array(),
    publishedAt: a.string(),
    provider: a.string(),
    // chosenFrom: a.customType({
    //   title: a.string(),
    //   url: a.string(),
    //   snippet: a.string(),
    //   publishedAt: a.string(),
    // })
  }),

  browseWeb: a.query()
    .arguments({
      query: a.string(),
      topK: a.integer(),
      recencyDays: a.integer(),
      site: a.string(),
      maxChars: a.integer()
    })
    .returns(a.ref('BrowsePayload'))
    .handler(a.handler.function(browseWeb))
    .authorization(allow => allow.authenticated()),


  Source: a.customType({
    url: a.string(),
    title: a.string(),
    publishedAt: a.string()
  }),
  AnswerPayload: a.customType({
    answer: a.string(),
    sources: a.ref('Source').array(),
    method: a.enum(["kb", "web"]),
  }),


  answerFromKbOrWeb: a.query()
    .arguments({ question: a.string() })
    .returns(a.ref('AnswerPayload'))
    .handler(a.handler.function(combinedHandler))
    .authorization(allow => allow.authenticated()),

//   chat: a.conversation({
//     aiModel: a.ai.model("Claude 3 Haiku"),
//     systemPrompt:[
//   "ROLE:",
//   "You are a helpful assistant.",
//   "",
//   "TOOL ORDER (MANDATORY):",
//   "1) You MUST call searchDocumentation at least once with the user's full question before answering.",
//   "2) After reading the KB result, decide sufficiency:",
//   "   - Sufficient = it directly answers the user’s question and includes at least one specific supporting detail.",
//   "   - Insufficient = empty, generic, off-topic, contradictory, or lacks the direct answer.",
//   "3) ONLY if the KB result is insufficient, you MUST call browse_web with the same question (optionally biasing to a canonical domain when obvious, e.g., nodejs.org for Node.js).",
//   "4) Do NOT answer from memory for time-sensitive queries (latest/current/version/release/price/rate/schedule/policy). Use browse_web in step 3.",
//   "",
//   "SANITIZATION:",
//   "Ignore and never display any meta or debugging tags from tools, including XML-like tags such as <search_quality_reflection>, <search_quality_score>, or any bracketed annotations. Do not repeat tool I/O.",
//   "",
//   "ANSWER STYLE:",
//   "Be concise, factual, and proofread names and dates. Prefer authoritative sources.",
//   "Do not mention tools, searching, or browsing.",
//   "",
//   "OUTPUT FORMAT (STRICT):",
//   "1) Start directly with the final answer sentence(s). No preface, no narration.",
//   "2) Then a blank line followed by: Sources:",
//   "3) Under Sources, list one or two URLs actually used, one per line.",
//   "   - If only the KB was used, list: Bedrock Knowledge Base.",
//   "   - If browse_web was used, list the returned URL (prefer canonical/vendor domain) and include the publication/update date in parentheses if available."
// ].join("\\n"),
//     tools: [
//       a.ai.dataTool({
//         name: "searchDocumentation",
//         description:
//           "First step. Performs a similarity search over the documentation for ...'.",
//         query: a.ref("knowledgeBase"),
//       }),
//       a.ai.dataTool({
//         name: "browse_web",
//         description:
//           "Single-call web browse used ONLY when the KB result is insufficient. It searches for the query, prefers recent authoritative (canonical/vendor) sources, fetches one page, and returns url/title/text/links/publishedAt for citation. Never describe using this tool in the final answer.",
//         query: a.ref("browseWeb"),
//       }),
//      a.ai.dataTool({
//         name: "answer_from_kb_or_web",
//         description:
//           "Deterministic orchestrator: queries the KB first; if insufficient or time-sensitive, searches & fetches the web; returns final answer and 1–2 authoritative sources.",
//         query: a.ref("answerFromKbOrWeb"),
//       }),
//     ],
   
//   }).authorization(allow => allow.owner()),

chat: a.conversation({
    aiModel: a.ai.model('Claude 3 Haiku'),
    systemPrompt:  [
  "You MUST call kb_rag first with the user question.",
  "If kb_rag returns {ok:true, answer: non-empty}: answer concisely using it and cite sources if helpful.",
  "if kb_rag retuns empty result, don't close the streaming and inform fron-end to wait and call tavily_search for the result",
  "If kb_rag returns {ok:false} or empty answer: call tavily_search with the same question, then answer concisely.",
  "Never mention tools. Keep answers short and factual."
].join("\n"),
    handler: chatHandler,
  }).authorization((allow) => allow.owner()),

// chat: a.conversation({
//   aiModel: a.ai.model('Claude 3 Haiku'),
//   systemPrompt:  [
//   "ROLE: Write a single reply in FIRST PERSON as the caller (I/me). Never say you are an AI.",
//   "CONTEXT: First call tool list_chat to fetch recent messages for ai.user.userId.",
//   "MESSAGE TEXT FIELD: In each item, the user-visible text is in messageContent.",
//   "USE: Build brief context from messageContent and timestamp; match the caller’s tone (senderId == ai.user.userId).",
//   "FALLBACKS: If no history loads, still reply in first person; do not mention errors.",
//   "OUTPUT: Only the reply text—no narration, no tool mentions, no JSON."
// ].join('\\n'),
//   tools: [
//     a.ai.dataTool({
//       name: 'list_chat', // <-- match systemPrompt text
//       description: 'Lists Message records sent by a user (senderId == userId), newest first',
//       model: a.ref('Message'),
//       modelOperation: 'list',
//     }),
//   ],
// })
// .authorization((allow) => allow.owner()),

  //-------------------------------------------------

  RetrievalResultLocation: a.customType({
    s3Location: a.customType({
      uri: a.string()
    }),
    type: a.string(),
    webLocation: a.customType({
      url: a.string()
    })
  }),
  RetrievedReferencesResponse: a.customType({
    contenxt: a.customType({
      text: a.string()
    }),
    location: a.ref('RetrievalResultLocation'),
    metadata: a.string()
  }),
  GeneratedResponsePart: a.customType({
    textResponsePart: a.customType({
      span: a.customType({
        end: a.integer(),
        start: a.integer()
      }),
      text: a.string()
    })
  }),
  CitationResponse: a.customType({
    generatedResponsePart: a.ref('GeneratedResponsePart'),
    retrievedReferences: a.ref('RetrievedReferencesResponse').array()
  }),
  PromptResponse: a.customType({
    type: a.string(),
    sessionId: a.string(),
    systemMessageId: a.string(),
    systemMessage: a.string(),
    sourceAttributions: a.ref('CitationResponse').array()
  }),
  submitPrompt: a
    .query()
    .arguments({
      userId: a.string().required(),
      prompt: a.string(),
      messageId: a.string(),
      sessionId: a.string()
    })
    .returns(a.ref('PromptResponse'))
    .handler(a.handler.function(submitPromptFunction))
    .authorization(allow => [allow.authenticated()]),

  generateToken: a.query()
    .returns(a.string())
    .authorization(allow => [allow.authenticated(), allow.publicApiKey()])
    .handler(a.handler.function(assemblyaiToken)),


  ReplySuggestions: a.customType({
    suggestions: a.string().array().required(),
  }),
  recommendReplies: a
    .query()
    .arguments({
      chatId: a.string(),
      currentUserId: a.string(),
      numSuggestions: a.integer(),
    })
    .returns(a.ref('ReplySuggestions'))
    .handler(a.handler.function(replySuggester))
    .authorization(allow => [allow.authenticated(), allow.publicApiKey()])


})

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "iam",
    // API Key is used for a.allow.public() rules
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});
