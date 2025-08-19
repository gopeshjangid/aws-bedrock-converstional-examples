import { generateClient } from 'aws-amplify/api';
import { Schema } from '../amplify/data/resource'; // Adjust the import path as necessary
import React, { useState } from 'react';
// You will need to generate your GraphQL queries.ts file after `amplify push`
// import { getStoryAnswer } from './graphql/queries'; // Make sure this path is correct
const client = generateClient<Schema>();


function Questions() {
  const [storyId, setStoryId] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'

  /**
   * Handles asking a question about a story by invoking the AppSync GraphQL API.
   * This calls your 'askAIHandler' Lambda via the 'getStoryAnswer' query.
   */
  const handleAskQuestion = async () => {
    if (!storyId.trim() || !question.trim()) {
      setMessage('Please enter both a Story ID and a Question.');
      setMessageType('error');
      return;
    }

    setLoading(true);
    setAnswer('');
    setMessage('');
    setMessageType('');

    try {
      // Assuming 'getStoryAnswer' is the name of your GraphQL query
      // and it expects 'storyId' and 'question' as arguments.
      // This query is defined in your schema.graphql and implemented by your askAIHandler Lambda.
    //   const result = await API.graphql(graphqlOperation(getStoryAnswer, {
    //     storyId: storyId,
    //     question: question
    //   }));
    const result = await client.queries.askAI({

        question: question
      });
      // AppSync GraphQL responses are typically nested under data.<queryName>
      const aiAnswer = result.data

      if (aiAnswer) {
        setAnswer(aiAnswer);
        setMessage('Answer retrieved successfully!');
        setMessageType('success');
      } else {
        setMessage('Could not get an answer. Unexpected API response.');
        setMessageType('error');
        console.error('Unexpected GraphQL response:', result);
      }
    } catch (error) {
      console.error('Error calling AppSync GraphQL API:', error);
      setMessage(`Failed to get answer: ${error || 'Unknown error'}`);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-teal-600 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-2xl transform transition-all duration-300 hover:scale-[1.01]">
        <h1 className="text-4xl font-extrabold text-center text-gray-900 mb-8">
          Ask AI About Your Story
        </h1>

        <div className="mb-6">
          <label htmlFor="storyId" className="block text-gray-700 text-lg font-semibold mb-2">
            Story ID
          </label>
          <input
            type="text"
            id="storyId"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg transition duration-200 ease-in-out"
            value={storyId}
            onChange={(e) => setStoryId(e.target.value)}
            placeholder="Enter the ID of the story"
            disabled={loading}
          />
        </div>

        <div className="mb-8">
          <label htmlFor="question" className="block text-gray-700 text-lg font-semibold mb-2">
            Your Question
          </label>
          <textarea
            id="question"
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg resize-y transition duration-200 ease-in-out"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What would you like to know about this story?"
            disabled={loading}
          ></textarea>
        </div>

        <button
          onClick={handleAskQuestion}
          disabled={loading || !storyId.trim() || !question.trim()}
          className={`w-full py-3 px-6 rounded-lg text-white text-xl font-bold transition duration-300 ease-in-out transform
            ${loading || !storyId.trim() || !question.trim() ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:scale-105 shadow-lg'}
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Getting Answer...
            </span>
          ) : (
            'Get AI Answer'
          )}
        </button>

        {message && (
          <div
            className={`mt-6 p-4 rounded-lg text-center text-lg font-medium
              ${messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
          >
            {message}
          </div>
        )}

        {answer && (
          <div className="mt-8 p-6 bg-indigo-50 rounded-xl border border-indigo-200 shadow-md">
            <h2 className="text-xl font-bold text-indigo-800 mb-3">AI Answer:</h2>
            <p className="text-indigo-700 text-lg leading-relaxed whitespace-pre-wrap">{answer}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Questions;
