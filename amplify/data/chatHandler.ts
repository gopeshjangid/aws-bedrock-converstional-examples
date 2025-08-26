import {
  ConversationTurnEvent,
  createExecutableTool,
  handleConversationTurnEvent,
  type ToolResultContentBlock,
} from '@aws-amplify/backend-ai/conversation/runtime';
import { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand } from '@aws-sdk/client-bedrock-agent-runtime';

type TavilyInput = {
  query: string;
  topK?: number;                          // default 6, max 50
  depth?: 'basic' | 'advanced';           // Tavily search depth (default basic)
  includeDomains?: string[];              // e.g. ["docs.aws.amazon.com","aws.amazon.com"]
  excludeDomains?: string[];              // e.g. ["reddit.com"]
};

const KB_REGION = 'ap-southeast-2';
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID!||'SB77W32JWL';
// const INFERENCE_PROFILE_ARN = process.env.INFERENCE_PROFILE_ARN;
const MODEL_ID = "amazon.nova-lite-v1:0";

const bedrockAgentRt = new BedrockAgentRuntimeClient({ region: KB_REGION });

const kbRagTool = createExecutableTool(
  'kb_rag',
  'Answers a question using the Knowledge Base with citations. Input: { query: string, topK?: number }',
  {
    json: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string' },
        topK: { type: 'number', minimum: 1, maximum: 50 },
      },
    } as const,
  },
  async (input): Promise<ToolResultContentBlock> => {

    console.log("knowledgebase triggred")
    // if (!KNOWLEDGE_BASE_ID) {
    //   return { text: 'ERROR: KNOWLEDGE_BASE_ID not configured' };
    // }

     const modelArn = `arn:aws:bedrock:${KB_REGION}::foundation-model/${MODEL_ID}`;
    const knowledgeBaseConfiguration: any = {
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      modelArn: modelArn,
      retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: input.topK ?? 6 } },
    };
    //if (INFERENCE_PROFILE_ARN) knowledgeBaseConfiguration.modelArn = INFERENCE_PROFILE_ARN;

   
    //  if (MODEL_ID) knowledgeBaseConfiguration.modelArn = modelArn;
  try{
    const out = await bedrockAgentRt.send(
      new RetrieveAndGenerateCommand({
        input: { text: input.query },
        
        retrieveAndGenerateConfiguration: {
          type: 'KNOWLEDGE_BASE',
          
          knowledgeBaseConfiguration,
        },
      })
    );
 
    console.log("KB out----->>",out)
    const answer = out.output?.text ?? '';


    console.log("KB_Citations---->",out.citations)
    const citations =
      out.citations?.flatMap((c) =>
        c.retrievedReferences?.map((r) => (
          r.location?.s3Location?.uri ??
          r.location?.webLocation?.url ??
          r.location?.type ??
          'source'
        )) ?? []
      ) ?? [];

    // const citationsList = citations.map((s, i) => `[${i + 1}] ${s}`).join('\n');
    return  { json: { ok: true, source: 'kb', answer, citations } };
  }
  catch(err){
    console.log("error from KB---->",err)
    return{ json: { ok: false, source: 'kb', error:String(err) } };
  }
  }

    
);


export const tavilySearchTool = createExecutableTool(
  'tavily_search',
  'Web search via Tavily. Input: { query, topK?, depth?, includeDomains?, excludeDomains? }',
  {
    json: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Search query string' },
        topK: { type: 'number', minimum: 1, maximum: 50, description: 'Number of results (default 6)' },
        depth: { type: 'string', enum: ['basic', 'advanced'], description: 'Search depth (default basic)' },
        includeDomains: { type: 'array', items: { type: 'string' } },
        excludeDomains: { type: 'array', items: { type: 'string' } },
      },
    } as const,
  },
  async (input: TavilyInput): Promise<ToolResultContentBlock> => {
    try {
      const API_KEY = process.env.TAVILY_API_KEY || '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';
      if (!API_KEY) return { text: 'TAVILY error: TAVILY_API_KEY not set' };

      const query = (input.query ?? '').trim();
      if (!query) return { text: 'TAVILY error: empty query' };

      const maxResultsEnv = Number(process.env.TAVILY_MAX_RESULTS ?? 6);
      const maxResults = Math.max(1, Math.min(input.topK ?? maxResultsEnv, 50));
      const timeoutMs = Number(process.env.TAVILY_TIMEOUT_MS ?? 8000);

      const body = {
        api_key: API_KEY,
        query,
        max_results: maxResults,
        search_depth: input.depth ?? 'basic',
        include_answer: true,
        include_domains: input.includeDomains,
        exclude_domains: input.excludeDomains,
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(
        process.env.TAVILY_BASE_URL ?? 'https://api.tavily.com/search',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        }
      );
      
      console.log("Response from tavily",resp)
      clearTimeout(timer);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.log({ text: `TAVILY error: HTTP ${resp.status} ${errText.slice(0, 200)}` })
        return { text: `TAVILY error: HTTP ${resp.status} ${errText.slice(0, 200)}` };
      }

      const data = await resp.json() as {
        answer?: string;
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };
   
      console.log("parsed data",data)
      const results = (data.results ?? []).map(r => ({
        title: r.title ?? '(no title)',
        url: r.url ?? '',
        snippet: r.content ?? '',
      }));
         

      // Return structured JSON so the model can use it easily
      return {
        json: {
          ok: true,
          provider: 'tavily',
          query,
          answer: data.answer ?? '',
          results,
        },
      } as ToolResultContentBlock;
    } catch (e: any) {
      console.log("tavily error",e)
      return{ json: { ok: false, source: 'tavily', error: e?.message ?? String(e) } };
    }
  }
);
export const handler = async (event: ConversationTurnEvent) => {
  await handleConversationTurnEvent(event, { tools: [kbRagTool,tavilySearchTool] });
};
