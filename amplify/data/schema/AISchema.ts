import {a} from '@aws-amplify/backend';
export const AIConversion = a
  .conversation({
    aiModel: a.ai.model('Claude 3.5 Haiku'),
    systemPrompt: 'You are a helpful assistant',
  })
  .authorization(allow => allow.owner());

export const DeepCompatibility = a
  .generation({
    aiModel: a.ai.model('Claude 3 Haiku'),
    systemPrompt: `
You are a dating-app compatibility engine. You will receive a single JSON string containing two users’ full profiles, Pronouns as You and [Their Name].  
• Identify their core values, communication style, shared interests, and many more preferences, lifestyle all data.
• Compute:
  – compatibilityScore: overall % match (0–100)  
  – sharedInterestsCount: number of exact common interests  
  – valuesAlignmentScore: 0–1 float for value overlap  
  – communicationMatchScore: 0–1 float for communication style fit
• Give:
  – recommendation: one of “Excellent match: suggest a date”, “Good match: recommend casual chat”, “Low match: proceed with caution”  
  – alignmentAreas: 2–3 bullet points of their biggest shared strengths, values, or interests 
• Finish with a 1-sentence summary.  
Output **only** a JSON object matching the return schema.
    `.trim(),
    inferenceConfiguration: {
      temperature: 0.2,
      topP: 0.2,
      maxTokens: 320,
    },
  })
  .arguments({
    pairedMatchData: a.string().required(), // the JSON string of both users
  })
  .returns(
    a.customType({
      compatibilityScore: a.float().required(), // 0–100
      sharedInterestsCount: a.integer().required(), // exact matches
      valuesAlignmentScore: a.float().required(), // 0–1
      communicationMatchScore: a.float().required(), // 0–1
      recommendation: a.string().required(),
      alignmentAreas: a.string().array().required(),
      summary: a.string().required(),
    })
  )
  .authorization(allow => allow.authenticated());
