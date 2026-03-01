import 'dotenv/config';

async function testS2S() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.MCP_SERVICE_APP_ID;
  const clientSecret = process.env.MCP_SERVICE_APP_CLIENT_SECRET;
  
  // Notice here we use the exact Dataverse URL appended with /.default for the scope!
  const dataverseUrl = process.env.DATAVERSE_URL?.replace(/\/+$/, '');
  const scope = `${dataverseUrl}/.default`;
  
  console.log(`Getting token for ${clientId} via ${tenantId}...`);
  console.log(`Target Scope: ${scope}`);
  
  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: scope,
    grant_type: 'client_credentials',
  });

  const res = await fetch(tokenEndpoint, { method: 'POST', body: params });
  const data = await res.json();
  
  if (!res.ok) {
    console.error("Token Fetch Failed:", data);
    return;
  }
  
  console.log("Got Access Token (first 20 chars):", data.access_token.substring(0, 20) + "...");
  
  console.log(`\nPinging ${dataverseUrl}/api/data/v9.2/WhoAmI()`);
  const crmRes = await fetch(`${dataverseUrl}/api/data/v9.2/WhoAmI()`, {
    headers: { 'Authorization': `Bearer ${data.access_token}` }
  });
  
  const crmStatus = crmRes.status;
  const crmText = await crmRes.text();
  console.log(`Dataverse Status: ${crmStatus}`);
  console.log(`Dataverse Response: ${crmText}`);
}

testS2S().catch(console.error);
