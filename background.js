chrome.runtime.onInstalled.addListener(() => {
  console.log('YT to NotebookLM Helper installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_STORAGE') {
    chrome.storage.local.get(message.keys || null).then((result) => sendResponse({ ok: true, data: result }));
    return true;
  }

  if (message?.type === 'SET_STORAGE') {
    chrome.storage.local.set(message.data || {}).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === 'COPY_TEXT') {
    sendResponse({ ok: false, error: 'Copy should be handled in page context.' });
    return false;
  }

  return false;
});
