import {a} from '@aws-amplify/backend';

export const MessageModel = a
  .model({
    id: a.id().required(),
    chatId: a.string().required(),
    senderId: a.string().required(), // Sender's user ID
    receiverId: a.string().required(), // Receiver's user ID
    messageContent: a.string().required(), // Message text content
    isTyping: a.boolean().default(false), // Indicates if the sender is typing
    isActive: a.boolean().default(true), // User active status in the chat
    isDelivered: a.boolean().default(false), // Message delivered status
    isSent: a.boolean().default(true), // Message sent status
    isSeen: a.boolean().default(false), // Message seen status
    isFlagged: a.boolean().default(false), // Flag for content moderation
    timestamp: a.datetime().default(new Date().toISOString()), // Timestamp of when the message was sent
    isEdited: a.boolean().default(false), // Indicates if a message was edited
    messageType: a.enum(['TEXT', 'IMAGE', 'AUDIO', 'GIF']), // Type of message (text, image, audio, gif)
    mediaAttachment: a.hasMany('chatMediaAttachment', 'messageID'),
    responseTimeDiff: a.integer().default(0),
    activity: a.json(),
  })
  .secondaryIndexes(index => [
    index('chatId')
      .sortKeys(['timestamp'])
      .name('getChatMessagesList')
      .queryField('getChatMessagesList'),
    index('senderId')
      .sortKeys(['timestamp'])
      .name('getMessagesBySenderId')
      .queryField('getMessagesBySenderId'),
  ])
  .authorization(allow => [
    allow.owner().to(['create', 'delete', 'read', 'update']),
    allow.authenticated().to(['read']),
  ]);

export const chatMediaAttachment = a
  .model({
    id: a.id(), // Automatically generated ID
    messageID: a.id().required(), // Foreign key to Message
    receiverId: a.string().required(), // Foreign key to Chat
    chatId: a.string().required(), // Foreign key to Chat
    path: a.string().required(), // URL or path of the attachment
    tags: a.string().array(),
    isFlagged: a.boolean().default(false), // Flag for content moderation
    fileType: a.enum(['TEXT', 'IMAGE', 'AUDIO', 'GIF']),
    message: a.belongsTo('Message', 'messageID'), // Relationship to Message
  })
  .authorization(allow => [
    allow.owner().to(['create', 'delete', 'read', 'update']),
    allow.authenticated().to(['read', 'update']),
  ]);

export const ChatSummary = a.customType({
  lastMessageContent: a.string(), // Content of the last message
  lastMessageTimestamp: a.string(), // Timestamp of the last message
  lastSenderId: a.string(),
  messageType: a.enum(['TEXT', 'IMAGE', 'AUDIO', 'GIF']),
  readStatus: a.boolean(),
});

export const ConnectionStatus = a.enum([
  'PENDING',
  'ACTIVE',
  'REJECTED',
  'BLOCKED',
]);

export const CallLog = a
  .model({
    // Unique identifier for the call log entry
    id: a.id().required(),
    // The user who initiated the call
    callerId: a.id().required(),
    callerUsers: a.belongsTo('User', 'callerId'),
    // FK #2 – callee
    calleeId: a.id().required(),
    calleeUsers: a.belongsTo('User', 'calleeId'),
    // Type of call: incoming, outgoing, or missed
    callType: a.enum(['INCOMING', 'OUTGOING', 'MISSED']),
    // Media used for the call
    media: a.enum(['VOICE', 'VIDEO']),
    // When the call was initiated (ISO timestamp)
    callStartTime: a.datetime().required(),
    // When the call ended (ISO timestamp); null for missed
    callEndTime: a.datetime(),
    // Duration in seconds; zero or null for missed calls
    duration: a.integer(),
    // Was the call answered? (false for missed)
    answered: a.boolean().default(false),
    // URL to call recording, if recorded
    recordingUrl: a.string(),
    // Any additional metadata
    metadata: a.json(),
    // When this log entry was created
    createdAt: a.datetime().default(new Date().toISOString()),
  })
  // Allow querying logs by userId sorted by callStartTime descending
  .secondaryIndexes(index => [
    index('calleeId')
      .sortKeys(['callStartTime'])
      .name('getIncomingCallgs')
      .queryField('getIncomingCallgs'),
    index('callerId')
      .sortKeys(['callStartTime'])
      .name('getOutgoingCalls')
      .queryField('getOutgoingCalls'),
  ])
  .authorization(allow => [
    allow.authenticated().to(['list', 'get', 'create', 'update', 'delete']),
  ]);
