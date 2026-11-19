// Email Chekkr — site settings you can change without touching app.js.
//
// web3formsKey: free access key from https://web3forms.com (sign up with the inbox that
//   should receive contact and waitlist messages). Access keys are meant to be public.
// fallbackEmail: used only while web3formsKey is empty — opens the visitor's mail app.

// apiBase: the Email Chekkr API. When its mailbox check is switched on (see docs/mailbox-check.md),
//   single checks on the website ask it whether the exact mailbox exists. When it's off, asleep or
//   unreachable, the website keeps its normal in-browser result. Leave empty to never use the API.
export const API = {
  apiBase: 'https://email-chekkr-api.onrender.com',
  timeoutMs: 15000
};

export const FORMS = {
  web3formsKey: '',
  fallbackEmail: ''
};
