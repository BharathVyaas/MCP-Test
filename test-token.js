import 'dotenv/config';

async function verifyToken() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.MCP_SERVICE_APP_ID;
  const clientSecret = process.env.MCP_SERVICE_APP_CLIENT_SECRET;
  
  // Try two variants
  const scope1 = `https://orgdfd10b1b.crm8.dynamics.com/.default`;
  const scope2 = `${clientId}/.default`;
  
  for (const scope of [scope1, scope2]) {
    console.log(`\n--- Fetching with Scope: ${scope} ---`);
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: scope,
      grant_type: 'client_credentials',
    });

    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, { method: 'POST', body: params });
    const data = await res.json();
    
    if (!res.ok) {
       console.log("Failed:", data.error_description || data.error);
       continue;
    }
    
    // Test the token against Dataverse
    const crmRes = await fetch("https://orgdfd10b1b.crm8.dynamics.com/api/data/v9.2/WhoAmI", {
      headers: { 'Authorization': `Bearer ${data.access_token}` },
    });
    
    console.log(`WhoAmI Status: ${crmRes.status}`);
    if (crmRes.ok) {
      console.log(await crmRes.json());
    } else {
      console.log(await crmRes.text());
    }
  }
}

verifyToken();
