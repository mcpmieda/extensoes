chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'GSSF_FORCE_PANEL' }, () => void chrome.runtime.lastError);
});

