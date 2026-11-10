// Truvio — built-in word lists.

/** Addresses that usually reach a team or a system, not a person. */
export const ROLE_ACCOUNTS = new Set([
  'abuse', 'account', 'accounts', 'admin', 'administrator', 'all', 'billing', 'careers', 'contact',
  'customercare', 'customerservice', 'enquiries', 'enquiry', 'feedback', 'finance', 'hello', 'help',
  'helpdesk', 'hostmaster', 'hr', 'info', 'inquiries', 'inquiry', 'it', 'jobs', 'legal', 'mail',
  'marketing', 'media', 'newsletter', 'no-reply', 'noreply', 'do-not-reply', 'donotreply', 'office',
  'orders', 'postmaster', 'press', 'privacy', 'recruitment', 'reservations', 'root', 'sales',
  'security', 'service', 'support', 'team', 'webmaster'
]);

/** Free consumer mailbox providers (informational, not a problem by itself). */
export const FREE_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'protonmail.com', 'proton.me', 'pm.me', 'gmx.com', 'gmx.de', 'gmx.net', 'mail.com',
  'yandex.com', 'yandex.ru', 'zoho.com', 'zohomail.com', 'rediffmail.com', 'web.de', 'tutanota.com',
  'fastmail.com', 'hey.com', 'qq.com', '163.com', '126.com', 'naver.com'
]);

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
