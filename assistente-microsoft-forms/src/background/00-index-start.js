const GSSF_MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const GSSF_FETCH_TIMEOUT_MS = 15000;
const GSSF_ALLOWED_IMAGE_HOSTS = [
  'hive.forms.usercontent.microsoft',
  'forms.usercontent.microsoft',
  'statics.forms.microsoft',
  'forms.office.com',
  'forms.cloud.microsoft'
];
const GSSF_ALLOWED_SENDER_HOSTS = new Set(['forms.office.com', 'forms.cloud.microsoft']);

function gssfAllowedImageUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return GSSF_ALLOWED_IMAGE_HOSTS.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch (_) {
    return false;
  }
}

function gssfAllowedSender(sender) {
  try {
    if (!sender || sender.id !== chrome.runtime.id || !sender.tab?.url) return false;
    const parsed = new URL(sender.tab.url);
    return parsed.protocol === 'https:' && GSSF_ALLOWED_SENDER_HOSTS.has(parsed.hostname);
  } catch (_) {
    return false;
  }
}

