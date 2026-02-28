# Dataverse Table Creation Guide (MCP)

This document serves as a "Golden Reference" for successfully creating custom Dataverse tables via the MCP server (`dataverse_create_table`), specifically covering the quirks of strict Dataverse environments and ChatGPT UI limitations.

**If the tool breaks in the future, revert the payload and schema design back to what is documented here.**

## The Problems We Solved

1.  **Strict OData Schema Validation**: Many Dataverse tenants strictly require the `PrimaryNameAttribute` property AND a perfectly formed `PrimaryAttribute` definition inside the `Attributes` array when sending a `POST` to `EntityDefinitions`. If it is missing, or missing metadata like `IsPrimaryName: true`, it throws: `Required field 'PrimaryAttribute' is missing for RequestName='CreateEntity'`.
2.  **ChatGPT UI Zod Parsing Crash**: If the MCP input schema defines `item` as a complex nested array structure (`z.array(z.record(z.any()))`), ChatGPT's frontend parser will crash with `Cannot read properties of undefined (reading '_zod')`. The workaround is defining `item` as a raw `z.string()` and parsing the JSON array inside the server.

## The "Golden Payload" for the LLM

This is the exact, tested JSON payload that successfully navigates all Dataverse schema strictness and ChatGPT parser bugs. 

**Instruction for GPT (copy-paste this to the LLM):**
> Call the `dataverse_create_table` tool with the JSON below and, on any failure, return the exact request payload you sent and the exact JSON response returned by the tool.

```json
{
  "tool": "dataverse_create_table",
  "input": {
    "logicalName": "temp_chatguidance",
    "displayName": "Chat Guidance",
    "displayCollectionName": "Chat Guidances",
    "primaryNameLogicalName": "temp_chatguidancename",
    "primaryNameDisplayName": "Chat Guidance Name",
    "ownershipType": "UserOwned",
    "description": "Example table created for testing dataverse_create_table",
    "primaryNameMaxLength": 200,
    "publishAfterCreate": true,
    "item": "[{\"name\":\"Title\",\"type\":\"String\",\"required\":true},{\"name\":\"Owner\",\"type":"Lookup\",\"relatedtable\":\"systemuser\"},{\"name\":\"Status\",\"type\":\"Choice\",\"choices\":[{\"label\":\"Open\",\"value\":1},{\"label\":\"In Progress\",\"value\":2},{\"label\":\"Closed\",\"value\":3}]}]"
  }
}
```
*Note: The `item` array is passed as an escaped JSON string.*

## Internal MCP Core Logic Requirements

For the MCP server code (`src/mcp/server.js`) to process that input correctly, it MUST do the following:

1.  **Entity Body Construction**: 
    The `POST EntityDefinitions` body must map the `PrimaryNameAttribute` property to the logical name of the primary column.
    
2.  **Attributes Array Injection**:
    The body MUST contain an `Attributes` array containing the `Microsoft.Dynamics.CRM.StringAttributeMetadata` object for the primary column.

3.  **`IsPrimaryName` Flag**:
    Crucially, the nested string attribute object inside the `Attributes` array MUST include the property `"IsPrimaryName": true`. Dataverse will reject the CreateEntity call otherwise.

4.  **Secondary Column Generation**:
    After the base table is created, the system parses the `item` string into a JSON array, iterates over it, and sequentially `POST`s to `EntityDefinitions(LogicalName='...')/Attributes` to create `Lookup`, `Choice`, and `String` columns.

### Example Internal Payload `POST EntityDefinitions`

This is what the server must map the input to and send to Dataverse:

```json
{
  "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
  "LogicalName": "temp_chatguidance",
  "SchemaName": "temp_Chatguidance",
  "DisplayName": {
    "@odata.type": "Microsoft.Dynamics.CRM.Label",
    "LocalizedLabels": [{ "Label": "Chat Guidance", "LanguageCode": 1033 }]
  },
  "DisplayCollectionName": {
    "@odata.type": "Microsoft.Dynamics.CRM.Label",
    "LocalizedLabels": [{ "Label": "Chat Guidances", "LanguageCode": 1033 }]
  },
  "Description": {
    "@odata.type": "Microsoft.Dynamics.CRM.Label",
    "LocalizedLabels": [{ "Label": "Example table created for testing", "LanguageCode": 1033 }]
  },
  "OwnershipType": "UserOwned",
  "IsActivity": false,
  "HasActivities": false,
  "HasNotes": true,
  "Attributes": [
    {
      "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
      "LogicalName": "temp_chatguidancename",
      "SchemaName": "temp_Chatguidancename",
      "DisplayName": {
        "@odata.type": "Microsoft.Dynamics.CRM.Label",
        "LocalizedLabels": [{ "Label": "Chat Guidance Name", "LanguageCode": 1033 }]
      },
      "RequiredLevel": { "Value": "None" },
      "MaxLength": 200,
      "FormatName": { "Value": "Text" }
    }
  ],
  "PrimaryNameAttribute": "temp_chatguidancename"
}
```
