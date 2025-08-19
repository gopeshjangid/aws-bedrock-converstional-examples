import NovaSonicOneShot from "./Nova";

export default function NovaMain() {
  return (
    <div className="p-4">
      <NovaSonicOneShot
        endpoint="https://z75jbxg5l1.execute-api.ap-south-1.amazonaws.com/prod/nova"
        systemPrompt="You are a friendly, concise dating-coach assistant."
        // requestHeaders={{ Authorization: myJwt }} // if your API is protected
      />
    </div>
  );
}