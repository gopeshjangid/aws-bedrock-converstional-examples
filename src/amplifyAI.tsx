import React, { useEffect, useRef } from 'react';
import { Amplify } from 'aws-amplify';
import { generateClient } from "aws-amplify/api";
import { Authenticator } from "@aws-amplify/ui-react";
import { AIConversation, createAIHooks } from '@aws-amplify/ui-react-ai';
import '@aws-amplify/ui-react/styles.css';
import outputs from "../amplify_outputs.json";
import { Schema } from "../amplify/data/resource";


import { ElevenLabsClient, play, stream } from '@elevenlabs/elevenlabs-js';

const elevenlabs = new ElevenLabsClient({
  apiKey: 'sk_4787ce6d923c10ead6cd831592f6aa5351698457bd44840f', // Defaults to process.env.ELEVENLABS_API_KEY
});



Amplify.configure(outputs);

const client = generateClient<Schema>({ authMode: "userPool" });
const { useAIConversation } = createAIHooks(client);

// Custom hook to handle audio playback

const handleplay = async () => {
  // 1. Generate the audio from ElevenLabs
  const audioResponse = await elevenlabs.textToSpeech.convert('JBFqnCBsd6RMkjVDRZzb', {
    text: 'The first move is what sets everything in motion.',
    modelId: 'eleven_multilingual_v2',
  });

  
  // audioResponse may have { audioBase64 }, or { audioUrl }, or binary blob, depending on SDK version
  // Let's assume it's base64 (as your useAudioPlayer expects)

  if (audioResponse) {
    // Play via your player
    playAudioFromBase64(audioResponse.getReader());
  }
  
};

const useAudioPlayer = () => {
  const audioRef = useRef<HTMLAudioElement>(null);

  const playAudioFromBase64 = (base64Audio: string) => {
    if (!base64Audio) return;

    try {
      // Create audio blob from base64
      const byteCharacters = atob(base64Audio);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const audioBlob = new Blob([byteArray], { type: 'audio/mp3' });
      
      // Create URL and play
      const audioUrl = URL.createObjectURL(audioBlob);
      
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.play().catch(error => {
          console.error('Error playing audio:', error);
        });
        
        // Clean up URL after playing
        audioRef.current.onended = () => {
          URL.revokeObjectURL(audioUrl);
        };
      }
    } catch (error) {
      console.error('Error processing audio:', error);
    }
  };

  return { audioRef, playAudioFromBase64 };
};

// Custom message component with audio support
const MessageWithAudio = ({ message, onAudioPlay }: { 
  message: any, 
  onAudioPlay: (base64: string) => void 
}) => {
  useEffect(() => {
    // Check if this is a tool response with audio

    console.log("response message",message)
    if (message.content?.[0]?.json) {

      console.log("inside if")
      const toolResult = message.content[0].json;
      if (toolResult.text && toolResult.text.length > 0) {
        // Auto-play audio when message arrives
        setTimeout(() => {
          onAudioPlay(toolResult.audioBase64);
        }, 500); // Small delay to ensure message is rendered
      }
    }
  }, [message, onAudioPlay]);

  return null; // This component doesn't render anything visible
};

export default function AmpifyAI() {
  const [
    {
      data: { messages },
      isLoading,
    },
    handleSendMessage,
  ] = useAIConversation('chat');

  const { audioRef, playAudioFromBase64 } = useAudioPlayer();

  return (
    <Authenticator>
      <div style={{ position: 'relative' }}>
        {/* Hidden audio element */}
        <audio 
          ref={audioRef} 
          controls={false} 
          style={{ display: 'none' }}
          preload="none"
        />
        
        {/* AI Conversation */}
        <AIConversation
          messages={messages}
          isLoading={isLoading}
          handleSendMessage={handleSendMessage}
        />
        
        {/* Audio handler for messages */}
        {messages.map((message, index) => (
          <MessageWithAudio 
            key={message.id || index} 
            message={message} 
            onAudioPlay={playAudioFromBase64}
          />
        ))}
        {<div onClick={handleplay} style={{height:"200px", width:"200px", backgroundColor:"black"}}>
          </div>}
        {/* Audio controls overlay - visible controls for user */}
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '10px',
          borderRadius: '8px',
          fontSize: '12px',
          display: audioRef.current?.src ? 'block' : 'none'
        }}>
          🔊 Audio Response Playing
        </div>
      </div>
    </Authenticator>
  );
}

function playAudioFromBase64(arg0: any) {
    throw new Error('Function not implemented.');
  }
