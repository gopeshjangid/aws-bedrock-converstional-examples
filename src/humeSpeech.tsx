import React, { useState, useRef, useCallback, useEffect } from 'react';
// These imports are assumed to be available in the Canvas environment
import {
  ensureSingleValidAudioTrack,
  getAudioStream,
  getBrowserSupportedMimeType,
  MimeType,
} from 'hume';
import outputs from '../amplify_outputs.json';

// Define a type for the incoming audio messages from the WebSocket
interface WebSocketAudioMessage {
  success: boolean;
  audioChunk?: string; // base64 encoded audio chunk
  error?: string;
  details?: string;
}

// Main App component for the Hume AI Speech-to-Speech application
export default function HumeSpeechToSpeech() {
  const [state, setState] = useState({
    isRecording: false,
    isProcessing: false,
    isPlaying: false,
    error: null as string | null,
    status: 'Disconnected',
  });

  // Refs for managing WebSocket, MediaRecorder, and audio playback state
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize audio context and WebSocket connection on component mount
  useEffect(() => {
    // Initialize Web Audio API context
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      setState(s => ({ ...s, error: 'Web Audio API is not supported in this browser.' }));
    }

    // Get the WebSocket URL from the configuration file
    const wsUrl = outputs.custom?.HumeWebSocketApiUrl;
    if (!wsUrl) {
      setState(s => ({ ...s, error: 'WebSocket URL not found in amplify_outputs.json' }));
      return;
    }

    // A better practice is to use the wss:// protocol for secure connections
    const fullWsUrl = wsUrl.startsWith('wss://') ? wsUrl : `wss://${wsUrl.replace(/^https?:\/\//, '')}`;
    const ws = new WebSocket(fullWsUrl);
    wsRef.current = ws;

    // WebSocket event handlers
    ws.onopen = () => {
      console.log('WebSocket connected successfully');
      setState(s => ({ ...s, status: 'Connected', error: null }));
    };

    ws.onmessage = async (event) => {
      try {
        const message: WebSocketAudioMessage = JSON.parse(event.data);
        if (message.success && message.audioChunk) {
          audioQueueRef.current.push(message.audioChunk);
          if (!isPlayingRef.current) {
            playNextAudioChunk();
          }
        } else if (message.error) {
          console.error('WebSocket Error:', message.error, message.details);
          // Update the state with the error message
          setState(s => ({ ...s, error: `Hume AI Error: ${message.error}` }));
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
        setState(s => ({ ...s, error: 'Failed to process server message.' }));
      }
    };

    ws.onclose = (event) => {
      console.log('WebSocket disconnected:', event);
      setState(s => ({ ...s, status: 'Disconnected', isRecording: false, isProcessing: false, isPlaying: false }));
    };

    ws.onerror = (error) => {
      console.error('WebSocket connection error:', error);
      setState(s => ({ ...s, error: 'WebSocket connection failed. Check the URL and backend status.' }));
    };

    // Clean up the WebSocket connection on component unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Function to play the next audio chunk from the queue
  const playNextAudioChunk = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setState(s => ({ ...s, isPlaying: false, isProcessing: false }));
      return;
    }

    isPlayingRef.current = true;
    setState(s => ({ ...s, isPlaying: true, isProcessing: false }));

    const base64Audio = audioQueueRef.current.shift();
    if (!base64Audio || !audioContextRef.current) {
      isPlayingRef.current = false;
      playNextAudioChunk();
      return;
    }

    try {
      // Decode the base64 audio and play it
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const audioBuffer = await audioContextRef.current.decodeAudioData(bytes.buffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);

      source.onended = () => {
        playNextAudioChunk();
      };
      
      source.start();
    } catch (error) {
      console.error('Error playing audio chunk:', error);
      isPlayingRef.current = false;
      playNextAudioChunk();
    }
  }, []);

  // Function to start recording and streaming audio
  const startRecording = useCallback(async () => {
    // Only proceed if the WebSocket is open and we aren't already recording
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      setState(s => ({ ...s, error: 'WebSocket is not connected.' }));
      return;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      console.warn('Attempted to start recording, but one is already in progress.');
      return;
    }
    
    // Set processing state to indicate the app is getting ready
    setState(s => ({ ...s, error: null, isProcessing: true }));

    try {
      const stream = await getAudioStream();
      ensureSingleValidAudioTrack(stream);
      streamRef.current = stream;

      const mimeTypeResult = getBrowserSupportedMimeType();
      const mimeType = mimeTypeResult.success ? mimeTypeResult.mimeType : MimeType.WEBM;
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      // Event handler for when audio data becomes available
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          const base64Audio = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(event.data);
          });
          const base64Data = base64Audio.split(',')[1];
          // ** NEW CODE: Check if base64Data is a valid string before sending **
          if (base64Data) {
            wsRef.current?.send(JSON.stringify({ action: 'send_audio', audioData: base64Data }));
          } else {
            console.warn('Failed to convert audio chunk to base64, skipping.');
          }
        }
      };

      // The state is now only updated here, after the MediaRecorder has officially stopped.
      mediaRecorder.onstop = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        setState(s => ({ ...s, isRecording: false, isProcessing: false }));
      };

      mediaRecorder.onerror = (e) => {
        console.error("MediaRecorder error:", e);
        setState(s => ({ ...s, error: 'Recording error occurred', isRecording: false }));
      };
      
      mediaRecorder.start(100); // Send chunks every 100ms
      // Now that recording has successfully started, update the state
      setState(s => ({ ...s, isRecording: true, isProcessing: false }));
    } catch (error) {
      console.error('Error starting recording:', error);
      setState(s => ({ ...s, error: 'Failed to start recording. Check microphone permissions.' }));
    }
  }, []);

  // Function to stop recording
  const stopRecording = useCallback(() => {
    // Check if the recorder is in a state that can be stopped.
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      // Crucial: send a message to the backend to signal the end of the audio stream
      wsRef.current?.send(JSON.stringify({ action: 'end_of_audio' }));
    } else {
      console.warn("Attempted to stop recording, but no active recorder found.");
    }
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 font-sans">
      <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-xl transition-all duration-300 transform hover:scale-105">
        <h2 className="text-3xl font-extrabold text-center mb-6 text-gray-900 leading-tight tracking-wide">
          Hume AI Speech Chat
        </h2>
        <div className="text-center mb-4">
          <p className={`text-sm font-semibold tracking-wide ${state.status === 'Connected' ? 'text-green-600' : 'text-red-600'}`}>
            Status: {state.status}
          </p>
        </div>

        {state.error && (
          <div className="mb-4 p-4 bg-red-50 rounded-lg border border-red-200 text-red-800 font-medium text-sm">
            {state.error}
          </div>
        )}
        
        <div className="flex flex-col items-center space-y-6">
          <div className="relative">
            <button
              onClick={state.isRecording ? stopRecording : startRecording}
              disabled={state.isProcessing || state.isPlaying || state.status !== 'Connected'}
              className={`
                w-24 h-24 rounded-full font-bold text-white text-md shadow-lg transition-all duration-300 ease-in-out
                flex items-center justify-center
                ${state.isRecording 
                  ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                  : 'bg-blue-500 hover:bg-blue-600'
                }
                ${(state.isProcessing || state.isPlaying || state.status !== 'Connected') 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:scale-110'
                }
              `}
            >
              {state.isRecording ? 'Stop' : 'Start'}
            </button>
            
            {state.isRecording && (
              <div className="absolute top-0 right-0 w-8 h-8 bg-red-500 rounded-full animate-ping-slow" />
            )}
          </div>
          
          <div className="text-center">
            {state.isRecording && (
              <p className="text-gray-600 font-semibold animate-pulse">🎤 Recording... Tap to stop.</p>
            )}
            {state.isProcessing && (
              <p className="text-blue-600 font-semibold">🤖 Processing with Hume AI...</p>
            )}
            {state.isPlaying && (
              <p className="text-green-600 font-semibold">🔊 Playing response...</p>
            )}
            {!state.isRecording && !state.isProcessing && !state.isPlaying && (
              <p className="text-gray-500 font-medium">Tap to start speaking</p>
            )}
          </div>
          
          <div className="text-xs text-gray-400 text-center mt-4 max-w-xs">
            Powered by Hume AI - Emotionally intelligent speech interaction.
          </div>
        </div>
      </div>
    </div>
  );
};
