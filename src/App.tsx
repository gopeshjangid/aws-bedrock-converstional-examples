import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import question from "./questions";
import Questions from "./questions";
import VoiceCloning from "./voiceClone";
import HumeSpeechToSpeech from "./humeSpeech";
import AmplifyAI from "./amplifyAI";
import ElevenLabsAgent from "./elevenlab";
import NovaMain from "./novaMain";
import WebSocketProbe from "./NovaAssist";
import NovaTurnClient from "./NovaAssist";
//import AudioCaptureToAppSync from "./speechtotext";
import AmplifyChat from "./convo";
import { Authenticator } from "@aws-amplify/ui-react";
import Convo from "./convo";
import RealtimeTranscriber from "./assemblyai";
import { Chat } from "hume/api/resources/empathicVoice/resources/chat";
import ChatPage from "./chat";
const client = generateClient<Schema>();

function App() {
  const [storyName, setStoryName] = useState('');
  const [storyContent, setStoryContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'

  /**
   * Handles saving the story data to the backend.
   * In a real Amplify project, this is where you would integrate
   * DataStore.save() or API.graphql() calls.
   */
  const handleSaveStory = async () => {
    if (!storyName.trim() || !storyContent.trim()) {
      setMessage('Story Name and Story Content cannot be empty.');
      setMessageType('error');
      return;
    }

    setLoading(true);
    setMessage('');
    setMessageType('');

    try {
      // --- Placeholder for Amplify DataStore or API call ---
      console.log('Attempting to save story:', { storyName, storyContent });

      await client.models.story.create({
        storyName,
        storyContent,
      });

      // Example with Amplify DataStore (uncomment and adapt for your project):
      /*
      await DataStore.save(
        new Story({
          name: storyName,
          content: storyContent,
        })
      );
      */

      // Example with Amplify API (GraphQL - uncomment and adapt for your project):
      /*
      import { API, graphqlOperation } from 'aws-amplify';
      import { createStory } from './graphql/mutations'; // Assuming you have createStory mutation

      await API.graphql(graphqlOperation(createStory, { input: { name: storyName, content: storyContent } }));
      */

      // Simulate a successful save after a delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      setMessage('Story saved successfully!');
      setMessageType('success');
      setStoryName(''); // Clear fields on success
      setStoryContent('');
    } catch (error) {
      console.error('Error saving story:', error);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  // return (
  //   <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-4">
  //     <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-2xl transform transition-all duration-300 hover:scale-[1.01]">
  //       <h1 className="text-4xl font-extrabold text-center text-gray-900 mb-8">
  //         Save Your Story
  //       </h1>

  //       <div className="mb-6">
  //         <label htmlFor="storyName" className="block text-gray-700 text-lg font-semibold mb-2">
  //           Story Name
  //         </label>
  //         <input
  //           type="text"
  //           id="storyName"
  //           className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-lg transition duration-200 ease-in-out"
  //           value={storyName}
  //           onChange={(e) => setStoryName(e.target.value)}
  //           placeholder="Enter the story name"
  //           disabled={loading}
  //         />
  //       </div>

  //       <div className="mb-8">
  //         <label htmlFor="storyContent" className="block text-gray-700 text-lg font-semibold mb-2">
  //           Story Content
  //         </label>
  //         <textarea
  //           id="storyContent"
  //           className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-lg resize-y transition duration-200 ease-in-out"
  //           value={storyContent}
  //           onChange={(e) => setStoryContent(e.target.value)}
  //           placeholder="Write your amazing story here..."
  //           disabled={loading}
  //         ></textarea>
  //       </div>

  //       <button
  //         onClick={handleSaveStory}
  //         disabled={loading}
  //         className={`w-full py-3 px-6 rounded-lg text-white text-xl font-bold transition duration-300 ease-in-out transform
  //           ${loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105 shadow-lg'}
  //           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
  //       >
  //         {loading ? (
  //           <span className="flex items-center justify-center">
  //             <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
  //               <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
  //               <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  //             </svg>
  //             Saving...
  //           </span>
  //         ) : (
  //           'Save Story'
  //         )}
  //       </button>

  //       {message && (
  //         <div
  //           className={`mt-6 p-4 rounded-lg text-center text-lg font-medium
  //             ${messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
  //         >
  //           {message}
  //         </div>
  //       )}
  //     </div>
  //   </div>
  // );

  return(
    // <div className="p-6">
    //   <AudioCaptureToAppSync
    //     sessionId="session-123"
    //     chunkMs={500}
    //     preferredMimeType="audio/webm;codecs=opus"
    //   />
    // </div>

     <Authenticator>
      <Convo/>
    </Authenticator>
  )
}

export default App;
