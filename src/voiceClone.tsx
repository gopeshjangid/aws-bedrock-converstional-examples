import React, { useRef, useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import { Schema } from '../amplify/data/resource'; // Adjust the path as necessary

const client = generateClient<Schema>();

// Use a MediaSource instance to stream audio to the audio element.
let mediaSource: MediaSource | null = null;
let sourceBuffer: SourceBuffer | null = null;

function VoiceCloning() {
  const [voiceName, setVoiceName] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  // Retained for testing/debugging purposes.
  const [clonedVoiceId, setClonedVoiceId] = useState<string | null>("laSaRt8WDT6FnHAIXXpj");
  const [textToSynthesize, setTextToSynthesize] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);

  // New state for recording functionality
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  // Toggle between AppSync (Base64) and Streaming approaches
  const [useStreaming, setUseStreaming] = useState(true); 
  
  // State for debugging logs
  const [audioStateLogs, setAudioStateLogs] = useState<string[]>([]);
  const logToState = (logMessage: string) => {
    setAudioStateLogs(prevLogs => [...prevLogs, `[${new Date().toLocaleTimeString()}] ${logMessage}`]);
    console.log(logMessage);
  };
  

  // Cleanup function to revoke Blob URLs when the component unmounts
  useEffect(() => {
    logToState("Component mounted. Setting up cleanup function.");
    return () => {
      logToState("Component unmounted. Revoking Blob URLs and cleaning up MediaSource.");
      if (audioFile && audioFile instanceof File) {
        URL.revokeObjectURL(URL.createObjectURL(audioFile));
      }
      if (audioRef.current && audioRef.current.src) {
        URL.revokeObjectURL(audioRef.current.src);
      }
      if (mediaSource && mediaSource.readyState === 'open') {
        mediaSource.endOfStream();
      }
    };
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      logToState(`File selected: ${file.name}, ${file.type}, ${file.size} bytes`);
      setAudioFile(file);
    }
  };

  const startRecording = async () => {
    logToState('Attempting to start recording...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunks.current = []; // Clear previous chunks
      setAudioFile(null); // Clear any previously uploaded file
      
      recorder.ondataavailable = (event) => {
        logToState(`Audio data available. Chunk size: ${event.data.size} bytes.`);
        audioChunks.current.push(event.data);
      };

      recorder.onstop = () => {
        logToState('Recording stopped. Creating audio blob.');
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const recordedFile = new File([audioBlob], "recording.webm", { type: 'audio/webm' });
        setAudioFile(recordedFile);
        logToState(`Recorded file created: ${recordedFile.name}, ${recordedFile.type}, ${recordedFile.size} bytes.`);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setMessage('');
      logToState('Recording started successfully.');
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setMessage('Failed to get microphone access. Please check your browser permissions.');
      setMessageType('error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      logToState('Stopping recording...');
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const handleCloneVoice = async () => {
    console.log("handle clone voice")
    if (!voiceName.trim() || !audioFile) {
      setMessage('Please provide a voice name and an audio file.');
      setMessageType('error');
      console.error('Validation failed: Voice name or audio file is missing.');
      return;
    }

    setLoading(true);
    setMessage('');
    setMessageType('');
    logToState(`Attempting to clone voice with name: "${voiceName}"`);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioFile);

      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        logToState(`File read as Base64. Data length: ${base64Data.length} bytes.`);

        const result = await client.mutations.cloneVoice({
          voiceName: voiceName,
          audioBase64: base64Data,
        });

        logToState('AppSync cloneVoice mutation response: ' + JSON.stringify(result));
        const newVoiceId = result.data?.voiceId;

        if (newVoiceId) {
          setClonedVoiceId(newVoiceId);
          setMessage(`Voice "${voiceName}" was successfully cloned! You can now use it to generate speech.`);
          setMessageType('success');
          logToState(`Voice cloned successfully. New voice ID: ${newVoiceId}`);
        } else {
          setMessage('Voice cloning failed. Unexpected API response.');
          setMessageType('error');
          console.error('Unexpected GraphQL response:', result);
        }
        setLoading(false);
      };

      reader.onerror = (error) => {
        setLoading(false);
        throw new Error('Error reading the audio file.');
      };

    } catch (error) {
      console.error('Error during voice cloning:', error);
      setMessage(`Failed to clone voice: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setMessageType('error');
      setLoading(false);
    }
  };

  const handleSynthesizeAppSync = async () => {
    if (!clonedVoiceId || !textToSynthesize.trim()) {
      setMessage('Please clone a voice and enter some text to synthesize.');
      setMessageType('error');
      console.error('Validation failed: clonedVoiceId or textToSynthesize is missing.');
      return;
    }

    setLoading(true);
    setMessage('Synthesizing speech...');
    setMessageType('');
    logToState(`Starting AppSync synthesis with voice ID: ${clonedVoiceId} and text: "${textToSynthesize}"`);
    
    try {
      const response = await client.queries.synthesizeSpeech({ 
        voiceId: clonedVoiceId, 
        text: textToSynthesize 
      });

      logToState('AppSync Response:' + JSON.stringify(response));

      let base64Audio = '';
      
      if (response.data) {
        if (typeof response.data === 'string') {
          const match = response.data.match(/base64Audio=([^}]+)/);
          if (match && match[1]) {
            base64Audio = match[1];
          }
        } else if (response.data) {
          base64Audio = response.data;
        }
      }
      
      if (base64Audio) {
        const audioDataUrl = `data:audio/mp3;base64,${base64Audio}`;
        logToState('Received base64 audio data. Creating data URL.');
        
        if (audioRef.current) {
          if (audioRef.current.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioRef.current.src);
            logToState('Revoked previous blob URL.');
          }
          audioRef.current.src = audioDataUrl;
          audioRef.current.load();
          logToState('Audio element source set. Attempting to play.');
          
          try {
            await audioRef.current.play();
            setMessage('Speech synthesized successfully! Audio is playing.');
            setMessageType('success');
          } catch (playError) {
            logToState('Auto-play prevented by browser');
            setMessage('Speech synthesized successfully! Click the play button to listen.');
            setMessageType('success');
          }
        }
      } else {
        throw new Error('No audio data received from the API');
      }

    } catch (error) {
      console.error('Error during speech synthesis:', error);
      setMessage(`Failed to synthesize speech: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleSynthesizeStreaming = async () => {
    setAudioStateLogs([]); // Clear previous logs
    if (!clonedVoiceId || !textToSynthesize.trim()) {
      // setMessage('Please clone a voice and enter some text to synthesize.');
      // setMessageType('error');
      console.error('Validation failed: clonedVoiceId or textToSynthesize is missing.');
      return;
    }
    
    // Clean up previous audio
    if (audioRef.current && audioRef.current.src) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        logToState('Paused and cleared audio element source.');
    }
    if (mediaSource && mediaSource.readyState === 'open') {
        mediaSource.endOfStream();
        logToState('Ended previous MediaSource stream.');
    }

    setLoading(true);
    // setMessage('Streaming speech synthesis...');
    // setMessageType('info');
    logToState(`Starting streaming synthesis with voice ID: ${clonedVoiceId} and text: "${textToSynthesize}"`);
    
    try {
      const streamingEndpoint = 'https://orosbphybra6uw4kgc33yafpzu0oocbg.lambda-url.ap-south-1.on.aws/';

      mediaSource = new MediaSource();
      if (!audioRef.current) throw new Error("Audio element not available.");
      audioRef.current.src = URL.createObjectURL(mediaSource);
      logToState('Created MediaSource and set audio element source to a new blob URL.');

      await new Promise((resolve, reject) => {
        if (!mediaSource) {
          reject(new Error("MediaSource is null"));
          return;
        }

        mediaSource.addEventListener('sourceopen', async () => {
          try {
            logToState('MediaSource "sourceopen" event triggered.');
            if (!mediaSource) throw new Error("MediaSource is null.");
            const mime = 'audio/mpeg';
            if (!MediaSource.isTypeSupported(mime)) {
              throw new Error(`MIME type ${mime} is not supported by your browser.`);
            }
            
            sourceBuffer = mediaSource.addSourceBuffer(mime);
            logToState(`SourceBuffer created with MIME type: ${mime}`);

            const response = await fetch(streamingEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                voiceId: clonedVoiceId,
                text: textToSynthesize
              })
            });

            logToState('Fetch request sent to streaming endpoint.');

            if (!response.ok || !response.body) {
              console.log("response error", response)
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            let hasReceivedData = false;
            let firstChunkReceived = false;

            const streamChunks = async () => {
              while (true) {
                // Wait for sourceBuffer to be ready
                await new Promise(resolve => {
                  if (!sourceBuffer) return resolve(null);
                  const onUpdateEnd = () => {
                    sourceBuffer?.removeEventListener('updateend', onUpdateEnd);
                    resolve(null);
                  };
                  if (!sourceBuffer.updating) {
                    resolve(null);
                  } else {
                    sourceBuffer.addEventListener('updateend', onUpdateEnd);
                  }
                });

                const { done, value } = await reader.read();

                if (done) {
                  logToState('Streaming finished. All chunks received.');
                  if (!hasReceivedData) {
                      throw new Error("Streaming finished but no audio data was received. The API may have returned an empty response.");
                  }
                  if (mediaSource?.readyState === 'open') {
                    mediaSource.endOfStream();
                  }
                  // setMessage('Speech streamed successfully! Audio is ready to play.');
                  // setMessageType('success');
                  setLoading(false);
                  resolve(null);
                  break;
                }
                
                if (value && sourceBuffer && !sourceBuffer.updating) {
                  hasReceivedData = true;
                  logToState(`Appending new chunk of data to source buffer. Chunk size: ${value.length} bytes.`);
                  sourceBuffer.appendBuffer(value);
                  
                  // Log the buffered time ranges after appending a chunk
                  if (sourceBuffer.buffered.length > 0) {
                    const start = sourceBuffer.buffered.start(0);
                    const end = sourceBuffer.buffered.end(0);
                    logToState(`SourceBuffer has buffered audio from ${start.toFixed(2)}s to ${end.toFixed(2)}s.`);
                  }
                  
                  // Attempt to play after the first chunk is appended
                  if (!firstChunkReceived && audioRef.current) {
                    logToState('First chunk appended. Attempting to play audio.');
                    firstChunkReceived = true;
                    try {
                      await audioRef.current.play();
                      logToState('Audio playback started successfully.');
                      // setMessage('Speech is streaming and playing!');
                      // setMessageType('success');
                    } catch (playError) {
                      logToState('Auto-play prevented by browser. User interaction may be required.');
                      // setMessage('Speech is ready! Please press the play button to listen.');
                      // setMessageType('info');
                    }
                  }
                }
              }
            };

            streamChunks().catch(reject);

          } catch (error) {
            console.error('Error during streaming synthesis:', error);
            if (mediaSource?.readyState === 'open') {
              mediaSource.endOfStream();
            }
            reject(error);
          }
        });
        
        mediaSource.addEventListener('sourceended', () => {
          logToState("MediaSource ended.");
        });
        
        mediaSource.addEventListener('error', (e) => {
          console.error("MediaSource error:", e);
          logToState("MediaSource error occurred. Check browser console for details.");
          reject(new Error("MediaSource error"));
        });
      });

    } catch (error) {
      console.error('Error setting up streaming:', error);
      // setMessage(`Failed to set up streaming: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // setMessageType('error');
      setLoading(false);
    }
  };

  const handleSynthesize = () => {
    if (useStreaming) {
      console.log(useStreaming)
      return handleSynthesizeStreaming();
    } else {
      return handleSynthesizeAppSync();
    }
  };
  
  const handleDebugAudio = () => {
    logToState("--- Debugging Audio Status ---");
    if (audioRef.current) {
      logToState(`Audio Element:
        - src: ${audioRef.current.src}
        - paused: ${audioRef.current.paused}
        - ended: ${audioRef.current.ended}
        - currentTime: ${audioRef.current.currentTime.toFixed(2)}s
        - duration: ${isNaN(audioRef.current.duration) ? 'N/A' : audioRef.current.duration.toFixed(2)}s`);
      if (audioRef.current.buffered.length > 0) {
        const bufferedStart = audioRef.current.buffered.start(0);
        const bufferedEnd = audioRef.current.buffered.end(0);
        logToState(`Audio Element Buffered: from ${bufferedStart.toFixed(2)}s to ${bufferedEnd.toFixed(2)}s`);
      } else {
        logToState('Audio Element Buffered: No data buffered.');
      }
    } else {
      logToState('Audio Element: Not available.');
    }
    
    if (mediaSource) {
      logToState(`MediaSource:
        - readyState: ${mediaSource.readyState}`);
    } else {
      logToState('MediaSource: Not initialized.');
    }
    
    if (sourceBuffer) {
      logToState(`SourceBuffer:
        - updating: ${sourceBuffer.updating}
        - buffered length: ${sourceBuffer.buffered.length}`);
      if (sourceBuffer.buffered.length > 0) {
        const bufferedStart = sourceBuffer.buffered.start(0);
        const bufferedEnd = sourceBuffer.buffered.end(0);
        logToState(`SourceBuffer Buffered: from ${bufferedStart.toFixed(2)}s to ${bufferedEnd.toFixed(2)}s`);
      }
    } else {
      logToState('SourceBuffer: Not initialized.');
    }
  };

  return (
    <div className="p-8 bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center">ElevenLabs Voice Cloning</h1>
      <div className="max-w-3xl mx-auto">
        <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
          <h2 className="text-xl font-semibold mb-3">1. Clone Your Voice</h2>
          
          <div className="mb-4">
            <label className="block text-gray-400 font-medium mb-1">Voice Name</label>
            <input
              type="text"
              className="w-full p-2 border rounded bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              placeholder="e.g., My Personal Voice"
              disabled={loading}
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-400 font-medium mb-2">Upload or Record an Audio Sample</label>
            <div className="flex flex-col sm:flex-row items-center sm:space-x-4 mb-2 space-y-2 sm:space-y-0">
              <input
                type="file"
                accept="audio/mpeg,audio/wav,audio/webm"
                onChange={handleFileChange}
                disabled={loading || isRecording}
                className="block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-full file:border-0
                          file:text-sm file:font-semibold
                          file:bg-blue-50 file:text-blue-700
                          hover:file:bg-blue-100"
              />
              <div className="flex-grow w-full sm:w-auto">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    disabled={loading}
                    className="w-full px-4 py-2 rounded-lg text-white font-bold transition-colors bg-red-600 hover:bg-red-700 disabled:bg-gray-500"
                  >
                    Start Recording
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="w-full px-4 py-2 rounded-lg text-white font-bold transition-colors bg-red-800 hover:bg-red-900 animate-pulse"
                  >
                    Stop Recording
                  </button>
                )}
              </div>
            </div>
          </div>
          
          {audioFile && (
              <div className="mt-4">
                <p className="text-sm text-gray-400 mb-2">Audio ready for cloning:</p>
                <audio controls src={URL.createObjectURL(audioFile)} className="w-full rounded" />
              </div>
          )}

          <button
            onClick={handleCloneVoice}
            disabled={loading || !voiceName.trim() || !audioFile}
            className={`mt-4 w-full px-4 py-2 rounded-lg text-white font-bold transition-colors ${
              loading ? 'bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Cloning...' : 'Clone Voice'}
          </button>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Synthesize with Cloned Voice</h2>
            <p className="text-sm text-gray-400 mb-4">Voice ID: {clonedVoiceId || 'Awaiting cloned voice...'}</p>
            <div className="mb-4">
              <label className="block text-gray-400 font-medium mb-1">Text to Speak</label>
              <textarea
                rows={4}
                className="w-full p-2 border rounded bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                value={textToSynthesize}
                onChange={(e) => setTextToSynthesize(e.target.value)}
                placeholder="Enter text to be spoken by your new voice clone."
                disabled={loading}
              ></textarea>
            </div>
            
            <div className="mb-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={useStreaming}
                  onChange={(e) => setUseStreaming(e.target.checked)}
                  disabled={loading}
                  className="mr-2"
                />
                Use streaming synthesis (faster playback start)
              </label>
            </div>

            <button
              onClick={handleSynthesize}
              disabled={loading || !textToSynthesize.trim() || !clonedVoiceId}
              className={`w-full px-4 py-2 rounded-lg text-white font-bold transition-colors ${
                loading ? 'bg-gray-500' : 'bg-green-600 hover:bg-green-700'
              } disabled:bg-gray-500`}
            >
              {loading ? 'Synthesizing...' : 'Synthesize Speech'}
            </button>
        </div>
        
        {message && (
          <div className={`mt-4 p-3 rounded text-center ${
            messageType === 'success' ? 'bg-green-700 text-white' : 
            messageType === 'info' ? 'bg-blue-600 text-white' : 
            'bg-red-700 text-white'
          }`}>
            {message}
          </div>
        )}
        
        <div className="mt-4">
          <audio controls ref={audioRef} className="w-full"></audio>
        </div>
        
        {/* Debugging Section */}
        {/* <div className="mt-8 bg-gray-800 p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-3">Debugging Tools</h2>
          <p className="text-sm text-gray-400 mb-4">Click the button below to get a snapshot of the audio streaming state. This can help diagnose why the audio isn't playing.</p>
          <button
            onClick={handleDebugAudio}
            className="w-full px-4 py-2 rounded-lg text-white font-bold transition-colors bg-purple-600 hover:bg-purple-700"
          >
            Check Audio Status
          </button>
          
          <div className="mt-4 bg-gray-900 p-4 rounded-lg font-mono text-sm max-h-64 overflow-y-auto">
            {audioStateLogs.length > 0 ? (
              audioStateLogs.map((log, index) => (
                <pre key={index} className="whitespace-pre-wrap text-xs">{log}</pre>
              ))
            ) : (
              <pre className="text-gray-400">Click "Check Audio Status" to view logs.</pre>
            )}
          </div>
        </div> */}
      </div>
    </div>
  );
}

export default VoiceCloning;