(() => {
  const shared = window.YTNotebookShared;
  if (!shared || !location.hostname.includes('notebooklm.google.com')) return;

  let lastSources = [];
  let activeFilter = '';
  let observerStarted = false;
  let lastRefreshAt = '';
  let importRunning = false;

  function getNotebookTitle() {
    return document.querySelector('h1')?.textContent?.trim() || document.title || 'NotebookLM Notebook';
  }

  function getNotebookKey() {
    return shared.getNotebookKey(location.href);
  }

  function collectSources() {
    const anchors = Array.from(document.querySelectorAll('a[href*="youtube.com/watch"], a[href*="youtu.be/"]'));
    const seen = new Map();
    for (const anchor of anchors) {
      const url = shared.normalizeYouTubeUrl(anchor.href);
      const videoId = shared.extractYouTubeVideoId(url);
      if (!videoId || seen.has(videoId)) continue;
      const card = anchor.closest('[role="listitem"], .source-item, mat-card, .card, .chip-grid-item') || anchor.parentElement || anchor;
      const title = anchor.textContent?.trim() || card.textContent?.trim()?.slice(0, 120) || '';
      const text = card.textContent || '';
      const channelMatch = text.match(/Channel\s*:?\s*(.+)/i);
      seen.set(videoId, {
        videoId,
        url,
        title,
        channel: channelMatch ? channelMatch[1].trim() : '',
        importedAt: shared.nowIso(),
        element: card,
      });
    }
    lastSources = Array.from(seen.values());
    return lastSources;
  }

  async function refreshNotebookCache() {
    const notebookKey = getNotebookKey();
    const sources = collectSources();
    lastRefreshAt = shared.nowIso();
    await shared.upsertNotebook(notebookKey, {
      setActive: true,
      setTarget: true,
      notebookUrl: location.href,
      notebookTitle: getNotebookTitle(),
      updatedAt: lastRefreshAt,
      status: 'ready',
      sources: sources.map(({ element, ...rest }) => rest),
    });
    const result = { ok: true, notebook: getNotebookTitle(), count: sources.length };
    if (activeFilter) applyChannelFilter(activeFilter);
    await renderPanel();
    return result;
  }

  async function applyChannelFilter(value) {
    activeFilter = shared.normalizeText(value);
    const sources = lastSources.length ? lastSources : collectSources();
    let visible = 0;
    sources.forEach((item) => {
      const matched = !activeFilter || shared.normalizeText(item.channel).includes(activeFilter) || shared.normalizeText(item.title).includes(activeFilter);
      item.element.classList.toggle('ytnb-hidden-by-extension', !matched);
      if (matched) visible += 1;
    });
    const result = { ok: true, visible, total: sources.length, filter: value || '' };
    await updateDebugPanel({ message: `filter applied (${result.visible}/${result.total} visible)` });
    return result;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getAddSourceButton() {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    return buttons.find((button) => /add source|新增來源|new source|create source/i.test(button.textContent || '')) || null;
  }

  function getUrlInput() {
    const candidates = Array.from(document.querySelectorAll('input, textarea'));
    return candidates.find((node) => {
      const text = `${node.placeholder || ''} ${node.getAttribute('aria-label') || ''} ${node.name || ''}`;
      return /youtube|url|link|source|貼上|連結/i.test(text);
    }) || null;
  }

  function getSubmitButton() {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    return buttons.find((button) => /insert|add|import|新增|匯入|建立/i.test(button.textContent || '')) || null;
  }

  async function tryImportVideoUrl(url) {
    const addButton = getAddSourceButton();
    if (addButton) {
      addButton.click();
      await sleep(800);
    }

    const input = getUrlInput();
    if (!input) {
      return { ok: false, stage: 'input', error: 'Could not find source URL input on NotebookLM page.' };
    }

    input.focus();
    input.value = url;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(500);

    const submit = getSubmitButton();
    if (!submit) {
      return { ok: false, stage: 'submit', error: 'Could not find source submit button on NotebookLM page.' };
    }

    submit.click();
    await sleep(2500);

    const sources = collectSources();
    const videoId = shared.extractYouTubeVideoId(url);
    const imported = sources.some((item) => item.videoId === videoId);
    return imported
      ? { ok: true, videoId, imported: true }
      : { ok: false, videoId, stage: 'verify', error: 'Submit clicked, but the video was not detected in notebook sources yet.' };
  }

  function renderQueueRows(queue = [], blocked = []) {
    if (!queue.length && !blocked.length) {
      return '<div class="muted">No prepared import queue yet. Prepare queue from the YouTube page first.</div>';
    }

    const queuedRows = queue.map((item) => `
      <div class="ytnb-video-row">
        <div class="ytnb-video-main">
          <div class="ytnb-video-title">${item.title || '(untitled)'}</div>
          <div class="muted">${item.channel || ''}</div>
          <div class="muted">${item.url || ''}</div>
        </div>
        <div class="ytnb-video-state"><span class="ytnb-badge" data-state="new">Queued</span></div>
      </div>
    `).join('');

    const blockedRows = blocked.map((item) => `
      <div class="ytnb-video-row is-exists">
        <div class="ytnb-video-main">
          <div class="ytnb-video-title">${item.title || '(untitled)'}</div>
          <div class="muted">${item.url || ''}</div>
        </div>
        <div class="ytnb-video-state"><span class="ytnb-badge" data-state="added">Blocked duplicate</span></div>
      </div>
    `).join('');

    return `${queuedRows}${blockedRows}`;
  }

  async function runImportQueue() {
    if (importRunning) return { ok: false, error: 'Import already running.' };
    importRunning = true;
    const state = await shared.getBridgeState();
    const queue = state.importQueue || [];
    const blocked = state.importResults?.blocked || [];

    if (!queue.length) {
      importRunning = false;
      return { ok: false, error: 'No queued videos to import.' };
    }

    const currentNotebookKey = getNotebookKey();
    const targetNotebookKey = state.targetNotebookKey || state.activeNotebook;
    if (targetNotebookKey && currentNotebookKey !== targetNotebookKey) {
      importRunning = false;
      return { ok: false, error: 'Open the selected target notebook before running import.' };
    }

    const results = [];
    for (const item of queue) {
      renderStatus(`Importing: ${item.title || item.url}`);
      const result = await tryImportVideoUrl(item.url);
      await shared.recordImportResult(item.videoId, {
        status: result.ok ? 'imported' : 'failed',
        notebookKey: currentNotebookKey,
        title: item.title,
        url: item.url,
        error: result.error || '',
      });
      results.push({ videoId: item.videoId, title: item.title, ...result });
      if (result.ok) {
        await refreshNotebookCache();
      }
    }

    await shared.clearImportQueue();
    await refreshNotebookCache();
    importRunning = false;
    await renderPanel();
    return {
      ok: true,
      imported: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      blocked: blocked.length,
      results,
    };
  }

  async function updateDebugPanel(extra = {}) {
    const panel = document.getElementById('ytnb-panel');
    if (!panel) return;
    const debug = panel.querySelector('[data-role="debug"]');
    if (!debug) return;
    const state = await shared.getBridgeState();
    const notebookKey = getNotebookKey();
    const notebook = state.notebooks?.[notebookKey] || null;
    const visible = lastSources.filter((item) => !item.element.classList.contains('ytnb-hidden-by-extension')).length;
    const queue = state.importQueue || [];
    const blocked = state.importResults?.blocked || [];
    const lines = [
      `page: notebooklm`,
      `url: ${location.href}`,
      `current_notebook_key: ${notebookKey || '(none)'}`,
      `active_notebook_key: ${state.activeNotebook || '(none)'}`,
      `target_notebook_key: ${state.targetNotebookKey || '(none)'}`,
      `notebook_title: ${notebook?.notebookTitle || getNotebookTitle() || '(none)'}`,
      `dom_source_links: ${lastSources.length}`,
      `cached_source_count: ${notebook?.sources?.length || 0}`,
      `visible_after_filter: ${visible}`,
      `active_filter: ${activeFilter || '(none)'}`,
      `queued_for_import: ${queue.length}`,
      `blocked_duplicates: ${blocked.length}`,
      `last_refresh_at: ${lastRefreshAt || notebook?.updatedAt || '(none)'}`,
      `import_running: ${importRunning}`,
      `last_action: ${state.debug?.lastAction || '(none)'}`,
    ];
    if (extra.message) lines.push(`message: ${extra.message}`);
    debug.textContent = lines.join('\n');
  }

  function renderStatus(text) {
    const node = document.querySelector('#ytnb-panel [data-role="status"]');
    if (node) node.textContent = text;
  }

  async function renderPanel() {
    const panel = document.getElementById('ytnb-panel');
    if (!panel) return;
    const state = await shared.getBridgeState();
    const queue = state.importQueue || [];
    const blocked = state.importResults?.blocked || [];
    panel.innerHTML = `
      <h3>NotebookLM Import Workspace</h3>
      <div class="muted">Refresh the current notebook, review queued videos, and try to import YouTube URLs into this notebook.</div>
      <div class="ytnb-toolbar">
        <button data-action="setTarget">Use this notebook as target</button>
        <button data-action="refresh">Refresh notebook source cache</button>
        <button data-action="runImport">Run import queue</button>
      </div>
      <div class="ytnb-toolbar">
        <input data-action="filterInput" placeholder="Filter by channel or title" value="${activeFilter}" />
        <button data-action="filter">Apply filter</button>
      </div>
      <div class="muted">Queued ${queue.length} videos. Blocked duplicates ${blocked.length}. Current notebook: ${getNotebookTitle()}.</div>
      <div class="muted" data-role="status">Ready.</div>
      <div class="ytnb-video-list">${renderQueueRows(queue, blocked)}</div>
      <pre class="muted" data-role="debug">Loading debug status...</pre>
    `;

    panel.addEventListener('click', async (event) => {
      const action = event.target?.dataset?.action;
      if (!action) return;
      if (action === 'setTarget') {
        await shared.setTargetNotebookKey(getNotebookKey());
        await refreshNotebookCache();
        renderStatus('Current notebook set as target.');
      }
      if (action === 'refresh') {
        const result = await refreshNotebookCache();
        renderStatus(JSON.stringify(result));
      }
      if (action === 'runImport') {
        const result = await runImportQueue();
        renderStatus(JSON.stringify(result));
      }
      if (action === 'filter') {
        const value = panel.querySelector('[data-action="filterInput"]').value;
        const result = await applyChannelFilter(value);
        renderStatus(JSON.stringify(result));
      }
    });

    await updateDebugPanel({ message: 'panel rendered' });
  }

  function ensurePanel() {
    if (document.getElementById('ytnb-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'ytnb-panel';
    panel.className = 'ytnb-panel ytnb-workspace';
    document.body.appendChild(panel);
    renderPanel();
  }

  function watchPageChanges() {
    if (observerStarted) return;
    observerStarted = true;
    const observer = new MutationObserver(() => {
      ensurePanel();
      updateDebugPanel({ message: 'dom updated' });
    });
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'YTNB_REFRESH_NOTEBOOK_CACHE') {
      refreshNotebookCache().then(sendResponse);
      return true;
    }
    if (message?.type === 'YTNB_RUN_IMPORT_QUEUE') {
      runImportQueue().then(sendResponse);
      return true;
    }
    if (message?.type === 'YTNB_APPLY_CHANNEL_FILTER') {
      applyChannelFilter(message.value).then(sendResponse);
      return true;
    }
    if (message?.type === 'YTNB_SCAN_PAGE') {
      const result = { ok: true, count: collectSources().length, type: 'notebooklm' };
      updateDebugPanel({ message: `scan page requested (${result.count} sources)` });
      sendResponse(result);
      return false;
    }
    return false;
  });

  ensurePanel();
  watchPageChanges();
})();