import { ChangeEvent, SyntheticEvent, useEffect, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  CircularProgress,
  IconButton
} from '@mui/material';
// import SendIcon from "@mui/material/IconButton/Send";
//import ChatbotImage from '../chatbot-image';
import { getCurrentUser } from 'aws-amplify/auth';
import { v4 as uuidv4 } from 'uuid';

import { generateClient } from "aws-amplify/data";
import type { Schema } from "../amplify/data/resource";
export const clientSchema = generateClient<Schema>();

const Chatbot: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [chatAreaState, setChatAreaState] = useState<Array<JSX.Element>>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [chatLastMessageId, setChatLastMessageId] = useState<string>('');
  const [chatSessionId, setChatSessionId] = useState<string>('');

  const initialAssistantMessage = 'How can I help you today?';

  const assistantRowComponent = (assistMessage: string | undefined, displayIcon?: boolean) => {
    const newUuid = uuidv4();
    return (
      <Box key={newUuid} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', mb: 2 }}>
        {displayIcon && (
          <Box sx={{ width: 36, height: 36, flex: '0 0 auto' }}>
           
          </Box>
        )}
        <Paper elevation={1} sx={{ p: 1.5, bgcolor: 'grey.50', maxWidth: '75%' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
            Assistant:
          </Typography>
          <Typography variant="body2">
            {assistMessage || 'Sorry, could not get an answer for you. Please try again with a different question.'}
          </Typography>
        </Paper>
      </Box>
    );
  };

  const userRowComponent = (userMessage: string) => {
    const newUuid = uuidv4();
    return (
      <Box
        key={newUuid}
        sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}
      >
        <Paper
          elevation={1}
          sx={{ p: 1.5, bgcolor: 'primary.main', color: 'primary.contrastText', maxWidth: '75%' }}
        >
          <Typography variant="subtitle2" sx={{ fontStyle: 'italic', fontWeight: 700, mb: 0.5 }}>
            User:
          </Typography>
          <Typography variant="body2">{userMessage}</Typography>
        </Paper>
      </Box>
    );
  };

  useEffect(() => {
    const initAreaState: Array<JSX.Element> = [assistantRowComponent(initialAssistantMessage, true)];
    setChatAreaState(initAreaState);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setInputValue(event.target.value);
  }

  async function submitQuery() {
    const { username } = await getCurrentUser();
    const query = {
      prompt: inputValue,
      userId: username,
      messageId: chatLastMessageId || '',
      sessionId: chatSessionId || ''
    };

    const response = await clientSchema.queries.submitPrompt(query);
    return response.data;
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement | HTMLButtonElement>) {
    event.preventDefault();
    if (!inputValue.trim()) return;

    // Append user message without mutating state
    const userElement = userRowComponent(inputValue);
    setChatAreaState(prev => [...prev, userElement]);

    const question = inputValue;
    setInputValue('');

    // Display Result
    try {
      setLoading(true);
      const response = await submitQuery();
      if (response) {
        setChatLastMessageId(response?.systemMessageId || '');
        setChatSessionId(response?.sessionId || '');

        const assistantElement = assistantRowComponent(response.systemMessage || '', true);
        setChatAreaState(prev => [...prev, assistantElement]);
      } else {
        const assistantElement = assistantRowComponent(undefined, true);
        setChatAreaState(prev => [...prev, assistantElement]);
      }
    } catch (e) {
      console.error('Request failed: ', e);
      const assistantElement = assistantRowComponent(undefined, true);
      setChatAreaState(prev => [...prev, assistantElement]);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.focus();
    }
  }

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden'
      }}
    >
      {/* Chat Area */}
      <Box
        id="chatbot-chat"
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 2,
          bgcolor: 'background.default'
        }}
      >
        <Box id="chatbot-messages">{chatAreaState}</Box>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}
      </Box>

      {/* Input Area */}
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          borderTop: '1px solid',
          borderColor: 'divider',
          p: 1.5,
          display: 'flex',
          gap: 1
        }}
      >
        <TextField
          fullWidth
          inputRef={inputRef}
          id="input-form"
          placeholder="Ask me anything..."
          value={inputValue}
          onChange={handleChange}
          size="small"
        />
        <Button
          variant="contained"
          type="submit"
        //   endIcon={<SendIcon />}
          disabled={loading}
          sx={{ minWidth: 120 }}
        >
          Submit
        </Button>
      </Box>
    </Box>
  );
};

export default Chatbot;
