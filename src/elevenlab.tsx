import React, { useState } from 'react';
import { useConversation } from '@elevenlabs/react';
//import { GraphQLQuery } from '@aws-amplify/api';
import { Mic, MicOff, Loader, CheckCircle, XCircle } from 'lucide-react';// Import the auto-generated mutation
import { generateClient } from "aws-amplify/data";
import { Schema } from '../amplify/data/resource';

// Define the type for our GraphQL mutation response
interface GetConversationTokenResult {
  getConversationToken?: {
    token: string;
  };
}

interface ElevenLabsAgentProps {
  agentId: string;
}

const client = generateClient<Schema>();
const ElevenLabsAgent: React.FC<ElevenLabsAgentProps> = ({ agentId }) => {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const {
    startSession,
    endSession,
    status,
    isSpeaking,
  } = useConversation({
    onMessage: (msg) => {
      if (msg.message) {
        setMessages(prev => [...prev, msg.message]);
      }
    },
    onConnect: () => {
      setLoading(false);
      setError(null);
      setMessages(prev => [...prev, 'System: Conversation started. You can start speaking.']);
    },
    onDisconnect: () => {
      setLoading(false);
      setConversationId(null);
      setMessages(prev => [...prev, 'System: Conversation ended.']);
    },
    onError: (err) => {
      setLoading(false);
      setError(err);
      setMessages(prev => [...prev, `System Error: ${err}`]);
    }
  });

  const handleStartConversation = async () => {
    setLoading(true);
    setError(null);
    setMessages([]);

    try {
      // Request microphone access
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Make a secure GraphQL mutation call to get the conversation token
      const response = await client.queries.getToken()

      console.log("response",response)
      const conversationToken = response.data?.token;
      const story= response.data?.story

      
      if (!conversationToken) {
        throw new Error("Failed to retrieve conversation token from the server.");
      }

      // Start the conversation using the token
      if(story){
        const id = await startSession({
        conversationToken,
        connectionType: 'webrtc',
         dynamicVariables: {
            dynamicStoryPrompt:story
         }
      });
      setConversationId(id);

      }
    } catch (err) {
      console.error('Failed to start conversation:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setLoading(false);
    }
  };

  const handleEndConversation = async () => {
    setLoading(true);
    await endSession();
    setLoading(false);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto bg-gray-100 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-center">ElevenLabs Voice Assistant</h2>
      
      <div className="flex justify-center items-center mb-6">
        {status === 'disconnected' && (
          <button
            onClick={handleStartConversation}
            disabled={loading}
            className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader className="animate-spin" size={20} /> : <Mic size={20} />}
            <span>{loading ? 'Connecting...' : 'Start Conversation'}</span>
          </button>
        )}

        {status === 'connected' && (
          <button
            onClick={handleEndConversation}
            disabled={loading}
            className="flex items-center space-x-2 px-6 py-3 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader className="animate-spin" size={20} /> : <MicOff size={20} />}
            <span>End Conversation</span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-center mb-6">
        {status === 'connected' && (
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium ${isSpeaking ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
            <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-green-500' : 'bg-blue-500'}`}></div>
            <span>{isSpeaking ? 'Agent is speaking...' : 'Listening...'}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-100 text-red-800 p-3 rounded-lg flex items-center mb-4">
          <XCircle size={20} className="mr-2" />
          <span>Error: {error}</span>
        </div>
      )}

      <div className="h-64 overflow-y-auto bg-white p-4 rounded-lg border border-gray-300">
        <h3 className="font-bold text-lg mb-2">Conversation Log</h3>
        <div className="space-y-2 text-sm text-gray-700">
          {messages.length === 0 ? (
            <p className="text-center text-gray-500">Press "Start Conversation" to begin.</p>
          ) : (
            messages.map((msg, index) => (
              <p key={index} className={msg.startsWith('You:') ? 'text-right' : 'text-left'}>
                <span className={`inline-block p-2 rounded-lg ${msg.startsWith('You:') ? 'bg-blue-50 text-blue-800' : 'bg-green-50 text-green-800'}`}>
                  {msg}
                </span>
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ElevenLabsAgent;