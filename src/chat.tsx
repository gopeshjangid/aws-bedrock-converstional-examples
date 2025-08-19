// e.g., src/pages/Chat.tsx
import ChatComposerWithSuggestions from "./components/ChatComposerWithSuggestions"
// import your message creation function / mutation here

export default function ChatPage() {
  const chatId = "826136a4-67d4-4d62-b7c5-590d24968397";          // from route or state
  const currentUserId = "d1f33d9a-6011-7027-c602-b1748b50eee2";   // from your user context / DB mapping

  async function sendMessage(text: string) {
    // TODO: implement using your Message model (Amplify Gen 2 Data)
    // Example sketch:
    // await client.models.Message.create({
    //   chatId,
    //   senderId: currentUserId,
    //   receiverId: otherUserId,
    //   messageContent: text,
    //   messageType: "TEXT",
    // });

    
    console.log("sendMessage", { chatId, currentUserId, text });
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      {/* ... your chat history list above ... */}
      <ChatComposerWithSuggestions
        chatId={chatId}
        currentUserId={currentUserId}
        onSend={sendMessage}
      />
    </div>
  );
}
