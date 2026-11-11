// Email Chekkr — MCP (Model Context Protocol) server, so AI tools like Claude and Cursor can verify emails.
// Speaks JSON-RPC 2.0. Used two ways:
//   - over HTTP at POST /mcp (remote; needs an API key)  — see app.js
//   - over stdin/stdout for local AI apps                — see stdio.js

export const SERVER_INFO = { name: 'email-chekkr', title: 'Email Chekkr — Email verification', version: '0.3.0' };
const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS =
  'Email Chekkr checks email addresses before sending: format, domain, mail server (MX), temporary/disposable inboxes, ' +
  'team addresses like info@, and typos. Status is valid, risky, invalid or unknown with a 0–100 score. ' +
  'It does not log in to mail servers, so "valid" means the address and domain look deliverable, not that the mailbox was confirmed.';

/** The tools Email Chekkr offers to AI apps. */
export function toolDefinitions(batchMax) {
  return [
    {
      name: 'verify_email',
      title: 'Verify email',
      description: 'Check one email address. Returns status (valid, risky, invalid, unknown), a 0–100 score, the reason, a typo suggestion if any, and each check.',
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
 * @param {{ service: ReturnType<import('./service.js').createService>, batchMax: number }} deps
 */
export function createMcpHandler({ service, batchMax }) {
  const tools = toolDefinitions(batchMax);

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
