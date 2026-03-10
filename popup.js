const statusBox = document.getElementById('statusBox');
const pageType = document.getElementById('pageType');

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error('No active tab');
  const url = tab.url || '';
  const supported = url.includes('youtube.com') || url.includes('notebooklm.google.com');
  if (!supported) {
    throw new Error('Open a YouTube or NotebookLM page first.');
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    throw new Error('This page is not ready yet. Refresh the tab and try again.');
  }
}

function setStatus(value) {
  statusBox.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function detectPage() {
  const tab = await getActiveTab();
  const url = tab?.url || '';
  if (url.includes('youtube.com')) pageType.textContent = 'YouTube page detected';
  else if (url.includes('notebooklm.google.com')) pageType.textContent = 'NotebookLM page detected';
  else pageType.textContent = 'Unsupported page';
}

document.getElementById('collectBtn').addEventListener('click', async () => {
  try {
    const result = await sendToActiveTab({ type: 'YTNB_COLLECT_CHANNEL_VIDEOS' });
    setStatus(result);
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById('prepareQueueBtn').addEventListener('click', async () => {
  try {
    const result = await sendToActiveTab({ type: 'YTNB_PREPARE_IMPORT_QUEUE' });
    setStatus(result);
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById('refreshNotebookBtn').addEventListener('click', async () => {
  try {
    const result = await sendToActiveTab({ type: 'YTNB_REFRESH_NOTEBOOK_CACHE' });
    setStatus(result);
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById('runImportBtn').addEventListener('click', async () => {
  try {
    const result = await sendToActiveTab({ type: 'YTNB_RUN_IMPORT_QUEUE' });
    setStatus(result);
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById('applyFilterBtn').addEventListener('click', async () => {
  try {
    const value = document.getElementById('channelFilterInput').value;
    const result = await sendToActiveTab({ type: 'YTNB_APPLY_CHANNEL_FILTER', value });
    setStatus(result);
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById('scanBtn').addEventListener('click', async () => {
  try {
    const result = await sendToActiveTab({ type: 'YTNB_SCAN_PAGE' });
    setStatus(result);
  } catch (error) {
    setStatus(error.message);
  }
});

detectPage();
