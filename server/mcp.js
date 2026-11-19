// Email Chekkr — MCP (Model Context Protocol) server, so AI tools like Claude and Cursor can verify emails.
// Speaks JSON-RPC 2.0. Used two ways:
//   - over HTTP at POST /mcp (remote; needs an API key)  — see app.js
//   - over stdin/stdout for local AI apps                — see stdio.js

export const SERVER_INFO = { name: 'email-chekkr', title: 'Email Chekkr — Email verification', version: '0.4.0' };
const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS =
  'Email Chekkr checks email addresses before sending: format, domain, mail server (MX), temporary/disposable inboxes, ' +
  'team addresses like info@, and typos. Status is valid, risky, invalid or unknown with a 0–100 score, a confidence (high, medium, low) and a provider_type ' +
  '(disposable, free, custom). Use verify_csv for whole CSV files and get_statistics for totals since the server started. ' +
  'Placeholder names like test@ or sample@ are flagged. When the server has the mailbox check on, verify_email also asks the mail server ' +
  'whether the exact mailbox exists (checks.mailbox: exists, not-found, full, catch-all, unknown); otherwise "valid" means the address ' +
  'and domain look deliverable, not that the mailbox was confirmed.';

/** The tools Email Chekkr offers to AI apps. */
export function toolDefinitions(batchMax, csvMaxRows = 10_000) {
  return [
    {
      name: 'verify_email',
      title: 'Verify email',
      description: 'Check one email address. Returns status (valid, risky, invalid, unknown), a 0–100 score, confidence (high, medium, low), provider_type (disposable, free, custom), the reason, a typo suggestion if any, and each check, including checks.mailbox when the server has the mailbox check on.',
      inputSchema: {
        type: 'object',
        properties: { email: { type: 'string', description: 'The email address to check' } },
        required: ['email'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    {
      name: 'verify_emails_batch',
      title: 'Verify emails (batch)',
      description: `Check up to ${batchMax} email addresses at once. Returns a summary of counts and one result per address, in the same order.`,
      inputSchema: {
        type: 'object',
        properties: {
          emails: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: batchMax, description: 'Email addresses to check' }
        },
        required: ['emails'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    {
      name: 'check_domain',
      title: 'Check domain',
      description: 'Check a domain (or the part after @ in an address): whether it exists, accepts email, its mail servers, and whether it is disposable or a free provider.',
      inputSchema: {
        type: 'object',
        properties: { domain: { type: 'string', description: 'A domain like example.com, or an email address' } },
        required: ['domain'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    {
      name: 'verify_csv',
      title: 'Verify a CSV file',
      description: `Check every address in a CSV file (up to ${csvMaxRows} rows). Pass the file content as text. ` +
        'The email column is found automatically (a header like "email", or the column with @ signs). ' +
        'Returns a summary of counts, up to 20 rows that need attention, and the full CSV with chekkr_status, chekkr_score, ' +
        'chekkr_reason, chekkr_suggestion, chekkr_confidence and chekkr_provider columns added.',
      inputSchema: {
        type: 'object',
        properties: {
          csv: { type: 'string', description: 'The CSV file content, including the header row' },
          only_valid: { type: 'boolean', description: 'When true, the returned CSV keeps only the valid rows. Default false.' }
        },
        required: ['csv'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    {
      name: 'get_statistics',
      title: 'Get statistics',
      description: 'Totals since the server started: emails checked, results by status, domains and CSV files checked, ' +
        'domains in the cache, list sizes and uptime. No email addresses are stored or returned.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false }
    }
  ];
}

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });

function toolText(data, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError
  };
}

/**
 * Creates a handler for one JSON-RPC message. Returns the response object,
 * or null for notifications (messages without an id), which get no reply.
 * @param {{ service: ReturnType<import('./service.js').createService>, batchMax: number, csvMaxRows?: number }} deps
 */
export function createMcpHandler({ service, batchMax, csvMaxRows = 10_000 }) {
  const tools = toolDefinitions(batchMax, csvMaxRows);

  async function callTool(name, args = {}) {
    if (name === 'verify_email') {
      if (typeof args.email !== 'string') return toolText({ error: '"email" must be a string' }, true);
      return toolText(await service.verifyEmail(args.email));
    }
    if (name === 'verify_emails_batch') {
      const { emails } = args;
      if (!Array.isArray(emails) || emails.length === 0 || !emails.every((e) => typeof e === 'string')) {
        return toolText({ error: '"emails" must be a non-empty list of strings' }, true);
      }
      if (emails.length > batchMax) return toolText({ error: `At most ${batchMax} emails per batch` }, true);
      return toolText(await service.verifyEmails(emails));
    }
    if (name === 'check_domain') {
      if (typeof args.domain !== 'string') return toolText({ error: '"domain" must be a string' }, true);
      return toolText(await service.checkDomain(args.domain));
    }
    if (name === 'verify_csv') {
      if (typeof args.csv !== 'string' || !args.csv.trim()) return toolText({ error: '"csv" must be the CSV file content as text' }, true);
      if (args.only_valid !== undefined && typeof args.only_valid !== 'boolean') return toolText({ error: '"only_valid" must be true or false' }, true);
      const result = await service.verifyCsv(args.csv, { onlyValid: args.only_valid === true });
      return toolText(result, Boolean(result.error));
    }
    if (name === 'get_statistics') {
      return toolText(service.getStatistics());
    }
    return null;
  }

  return async function handle(message) {
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return rpcError(message?.id, -32600, 'Invalid request');
    }
    const { id, method, params = {} } = message;
    const isNotification = id === undefined || id === null;

    try {
      switch (method) {
        case 'initialize': {
          const asked = params.protocolVersion;
          const protocolVersion = SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0];
          return rpcResult(id, {
            protocolVersion,
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions: INSTRUCTIONS
          });
        }
        case 'ping':
          return isNotification ? null : rpcResult(id, {});
        case 'tools/list':
          return rpcResult(id, { tools });
        case 'tools/call': {
          const result = await callTool(params.name, params.arguments);
          if (!result) return rpcError(id, -32602, `Unknown tool: ${params.name}`);
          return rpcResult(id, result);
        }
        default:
          if (isNotification) return null; // e.g. notifications/initialized
          return rpcError(id, -32601, `Method not found: ${method}`);
      }
    } catch (error) {
      return isNotification ? null : rpcError(id, -32603, 'Internal error');
    }
  };
}
