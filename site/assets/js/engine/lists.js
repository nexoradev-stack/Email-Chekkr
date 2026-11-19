// Email Chekkr — built-in word lists.

/** Addresses that usually reach a team or a system, not a person. */
export const ROLE_ACCOUNTS = new Set([
  'abuse', 'account', 'accounts', 'admin', 'administrator', 'all', 'billing', 'careers', 'contact',
  'customercare', 'customerservice', 'enquiries', 'enquiry', 'feedback', 'finance', 'hello', 'help',
  'helpdesk', 'hostmaster', 'hr', 'info', 'inquiries', 'inquiry', 'it', 'jobs', 'legal', 'mail',
  'marketing', 'media', 'newsletter', 'no-reply', 'noreply', 'do-not-reply', 'donotreply', 'office',
  'orders', 'postmaster', 'press', 'privacy', 'recruitment', 'reservations', 'root', 'sales',
  'security', 'service', 'support', 'team', 'webmaster'
]);

// Free consumer mailbox providers live in site/assets/data/free-providers.txt
// (loaded by the website, the API and the MCP server, like the disposable list).

/** Domains used to suggest a fix for likely typos (gmial.com → gmail.com). */
export const TYPO_TARGETS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com',
  'msn.com', 'protonmail.com', 'ymail.com', 'gmx.com', 'yandex.com', 'zoho.com', 'rediffmail.com',
  'yahoo.co.in', 'yahoo.co.uk', 'hotmail.co.uk', 'googlemail.com', 'me.com', 'mail.com'
];

/** Common mistakes in the domain extension. */
export const TLD_FIXES = {
  con: 'com', cmo: 'com', ocm: 'com', comm: 'com', vom: 'com', xom: 'com', cpm: 'com', coom: 'com', om: 'com',
  nte: 'net', ner: 'net', nett: 'net',
  ogr: 'org', orgg: 'org', irg: 'org'
};
