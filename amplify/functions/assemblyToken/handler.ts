export const handler = async(event:any)=>{
 

const url = new URL("https://streaming.assemblyai.com/v3/token");
url.search = new URLSearchParams({
  expires_in_seconds: "60",
}).toString();
const response = await fetch(url, {
  headers: {
    Authorization: "f59fe02a7d8d4404ba3fa445bc2f558d",
  },
});
const data = await response.json();
return data.token;
}