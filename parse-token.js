import 'dotenv/config';

async function parseToken() {
  const params = new URLSearchParams({
    client_id: process.env.MCP_SERVICE_APP_ID,
    client_secret: process.env.MCP_SERVICE_APP_CLIENT_SECRET,
    scope: `${process.env.DATAVERSE_URL}/.default`,
    grant_type: 'client_credentials',
  });

  const res = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', body: params });
  const data = await res.json();
  
  if (!res.ok) return console.log("Fetch failed");
  
  const token = data.access_token;
  const payloadStr = Buffer.from(token.split('.')[1], 'base64').toString('utf8');
  console.log(JSON.parse(payloadStr));
}
parseToken();
