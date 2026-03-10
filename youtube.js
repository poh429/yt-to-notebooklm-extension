(() => {
  const shared = window.YTNotebookShared;
  if (!shared || !location.hostname.includes('youtube.com')) return;

  let observerStarted = false;
  let lastUrl = location.href;
  let onlyShowNew = false;
  let activeFilterValue = '';
  let currentVideos = [];
  let isCollecting = false;

  function getChannelTitle() {
    return document.querySelector('#channel-name, ytd-channel-name, h1.ytd-c4-tabbed-header-renderer')?.textContent?.trim()
      || document.title.replace(/\s*-\s*YouTube$/i, '').trim()
      || 'YouTube Channel';
  }

  function getChannelKey() {
    return shared.getChannelKey(location.href);
  }

  function getVideoCards() {
    return Array.from(
      document.querySelectorAll(
        'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer, ytd-compact-video-renderer'
      )
    );
  }

  function getPrimaryAnchor(card) {
    if (!card) return null;
    const candidates = [
      'a#video-title[href*="watch?v="]',
      'a#video-title-link[href*="watch?v="]',
      'a.yt-simple-endpoint[href*="watch?v="]#video-title',
      'a[href*="/shorts/"]#thumbnail',
      'a[href*="/shorts/"]#video-title',
      'a[href*="watch?v="]'
    ];
    for (const selector of candidates) {
      const anchor = card.querySelector(selector);
      if (anchor?.href) return anchor;
    }
    return null;
  }

  function getTitleText(card, anchor) {
    const titleNode = card.querySelector('#video-title, #video-title-link');
    return titleNode?.textContent?.trim() || anchor?.getAttribute('title') || anchor?.textContent?.trim() || '';
  }

  function getChannelText(card) {
    const channelNode = card.querySelector(
      'ytd-channel-name a, #channel-name a, .ytd-channel-name a, [href^="/@"], a[href^="/@"]'
    );
    return channelNode?.textContent?.trim() || getChannelTitle();
  }

  function getMetaText(card) {
    return card.querySelector('#metadata-line')?.textContent?.trim() || '';
  }

  function collectVisibleVideos() {
    const seen = new Map();
    for (const card of getVideoCards()) {
      const anchor = getPrimaryAnchor(card);
      if (!anchor) continue;
      const url = shared.normalizeYouTubeUrl(anchor.href);
      const videoId = shared.extractYouTubeVideoId(url);
      if (!videoId || seen.has(videoId)) continue;
      seen.set(videoId, {
        videoId,
        url,
        title: getTitleText(card, anchor),
        channel: getChannelText(card),
        meta: getMetaText(card),
        discoveredAt: shared.nowIso(),
        selected: false,
        element: card,
      });
    }
    return Array.from(seen.values());
  }

  async function collectChannelVideos() {
    isCollecting = true;
    renderStatus('Collecting visible videos from channel page...');
    const collected = collectVisibleVideos();
    const state = await shared.getBridgeState();
    const sourceIndex = shared.getNotebookSourceIndex(state, state.targetNotebookKey || state.activeNotebook);
    const selectedIds = new Set(state.selectedVideoIds || []);
    const annotated = shared.annotateVideosWithNotebook(collected, sourceIndex).map((item) => ({
      ...item,
      selected: selectedIds.has(item.videoId),
    }));
    currentVideos = annotated;
    await shared.upsertChannel(getChannelKey(), {
      setActive: true,
      channelUrl: location.href,
      channelTitle: getChannelTitle(),
      scanStatus: 'collected',
      videos: annotated.map(({ element, ...rest }) => rest),
      stats: {
        total: annotated.length,
        exists: annotated.filter((item) => item.existsInTarget).length,
        ready: annotated.filter((item) => !item.existsInTarget).length,
      },
    });
    isCollecting = false;
    await renderPanel();
    const existsCount = annotated.filter((item) => item.existsInTarget).length;
    return {
      ok: true,
      total: annotated.length,
      exists: existsCount,
      ready: annotated.length - existsCount,
    };
  }

  function renderStatus(text) {
    const node = document.querySelector('#ytnb-panel [data-role="status"]');
    if (node) node.textContent = text;
  }

  function createBadgeCell(video) {
    const state = video.existsInTarget ? 'exists' : 'ready';
    return `<span class="ytnb-badge" data-state="${state === 'exists' ? 'added' : 'new'}">${state === 'exists' ? 'Already in notebook' : 'Ready to import'}</span>`;
  }

  function getFilteredVideos() {
    const filter = shared.normalizeText(activeFilterValue);
    return currentVideos.filter((item) => {
      const matched = !filter
        || shared.normalizeText(item.title).includes(filter)
        || shared.normalizeText(item.channel).includes(filter)
        || shared.normalizeText(item.meta).includes(filter);
      const allowedByNew = !onlyShowNew || !item.existsInTarget;
      return matched && allowedByNew;
    });
  }

  async function syncSelectionFromDom() {
    const panel = document.getElementById('ytnb-panel');
    if (!panel) return;
    const checkedIds = Array.from(panel.querySelectorAll('input[data-role="video-check"]:checked')).map((node) => node.value);
    currentVideos = currentVideos.map((item) => ({ ...item, selected: checkedIds.includes(item.videoId) }));
    await shared.setSelectedVideoIds(checkedIds);
    await shared.upsertChannel(getChannelKey(), {
      channelUrl: location.href,
      channelTitle: getChannelTitle(),
      scanStatus: 'collected',
      videos: currentVideos.map(({ element, ...rest }) => rest),
      stats: {
        total: currentVideos.length,
        selected: checkedIds.length,
        exists: currentVideos.filter((item) => item.existsInTarget).length,
      },
    });
  }

  async function toggleAllVisible(forceValue) {
    const visibleIds = new Set(getFilteredVideos().filter((item) => !item.existsInTarget).map((item) => item.videoId));
    currentVideos = currentVideos.map((item) => (
      visibleIds.has(item.videoId) ? { ...item, selected: forceValue } : item
    ));
    await shared.setSelectedVideoIds(currentVideos.filter((item) => item.selected).map((item) => item.videoId));
    await shared.upsertChannel(getChannelKey(), {
      channelUrl: location.href,
      channelTitle: getChannelTitle(),
      scanStatus: 'collected',
      videos: currentVideos.map(({ element, ...rest }) => rest),
    });
    await renderPanel();
  }

  async function prepareImportQueue() {
    const state = await shared.getBridgeState();
    if (!(state.targetNotebookKey || state.activeNotebook)) {
      return { ok: false, error: 'No target notebook selected yet. Open NotebookLM and refresh a notebook first.' };
    }
    await shared.queueSelectedVideosForImport();
    const nextState = await shared.getBridgeState();
    const queued = nextState.importResults?.queued || [];
    const blocked = nextState.importResults?.blocked || [];
    await renderPanel();
    return {
      ok: true,
      queued: queued.length,
      blocked: blocked.length,
      message: blocked.length ? 'Some selected videos were skipped because they already exist in target notebook.' : 'Import queue prepared.',
    };
  }

  async function hydrateFromState() {
    const state = await shared.getBridgeState();
    const channel = state.channels?.[getChannelKey()];
    const sourceIndex = shared.getNotebookSourceIndex(state, state.targetNotebookKey || state.activeNotebook);
    if (channel?.videos?.length) {
      currentVideos = shared.annotateVideosWithNotebook(channel.videos, sourceIndex).map((item) => ({
        ...item,
        selected: (state.selectedVideoIds || []).includes(item.videoId),
      }));
    } else {
      currentVideos = [];
    }
  }

  async function renderDebugPanel(extra = {}) {
    const panel = document.getElementById('ytnb-panel');
    if (!panel) return;
    const debug = panel.querySelector('[data-role="debug"]');
    if (!debug) return;
    const state = await shared.getBridgeState();
    const notebookKey = state.targetNotebookKey || state.activeNotebook || '';
    const notebook = notebookKey ? state.notebooks?.[notebookKey] : null;
    const filtered = getFilteredVideos();
    const lines = [
      `page: youtube`,
      `channel_key: ${getChannelKey()}`,
      `channel_title: ${getChannelTitle()}`,
      `video_cards: ${getVideoCards().length}`,
      `collected_videos: ${currentVideos.length}`,
      `visible_after_filter: ${filtered.length}`,
      `selected_videos: ${currentVideos.filter((item) => item.selected).length}`,
      `existing_in_target: ${currentVideos.filter((item) => item.existsInTarget).length}`,
      `only_show_new: ${onlyShowNew}`,
      `active_filter: ${activeFilterValue || '(none)'}`,
      `target_notebook_key: ${notebookKey || '(none)'}`,
      `target_notebook_title: ${notebook?.notebookTitle || '(none)'}`,
      `target_notebook_sources: ${notebook?.sources?.length || 0}`,
      `queued_for_import: ${(state.importQueue || []).length}`,
      `last_action: ${state.debug?.lastAction || '(none)'}`,
    ];
    if (extra.message) lines.push(`message: ${extra.message}`);
    debug.textContent = lines.join('\n');
  }

  function renderTableRows(videos) {
    if (!videos.length) {
      return '<div class="muted">No collected videos yet. Open a channel/videos page and click Collect videos.</div>';
    }
    return videos.map((item) => `
      <label class="ytnb-video-row ${item.existsInTarget ? 'is-exists' : ''}">
        <input type="checkbox" data-role="video-check" value="${item.videoId}" ${item.selected ? 'checked' : ''} ${item.existsInTarget ? 'disabled' : ''} />
        <div class="ytnb-video-main">
          <div class="ytnb-video-title">${item.title || '(untitled)'}</div>
          <div class="muted">${item.channel || ''}${item.meta ? ' | ' + item.meta : ''}</div>
          <div class="muted">${item.url}</div>
        </div>
        <div class="ytnb-video-state">${createBadgeCell(item)}</div>
      </label>
    `).join('');
  }

  async function renderPanel() {
    const panel = document.getElementById('ytnb-panel');
    if (!panel) return;
    const state = await shared.getBridgeState();
    const notebooks = Object.values(state.notebooks || {});
    const filteredVideos = getFilteredVideos();
    const selectedCount = currentVideos.filter((item) => item.selected).length;
    const targetNotebook = state.targetNotebookKey || state.activeNotebook || '';

    panel.innerHTML = `
      <h3>YT to NotebookLM Workspace</h3>
      <div class="muted">Collect channel videos, choose what to import, and block duplicates before import.</div>
      <div class="ytnb-toolbar">
        <button data-action="collect">Collect videos</button>
        <button data-action="selectAll">Select visible new</button>
        <button data-action="clearAll">Clear selection</button>
        <button data-action="toggleOnlyNew">${onlyShowNew ? 'Show all' : 'Only show new'}</button>
      </div>
      <div class="ytnb-toolbar">
        <input data-action="filterInput" placeholder="Filter title / channel / meta" value="${activeFilterValue}" />
        <button data-action="applyFilter">Apply filter</button>
      </div>
      <div class="ytnb-toolbar">
        <select data-action="targetNotebook">
          <option value="">Select target notebook</option>
          ${notebooks.map((item) => `<option value="${item.notebookKey}" ${item.notebookKey === targetNotebook ? 'selected' : ''}>${item.notebookTitle || item.notebookKey}</option>`).join('')}
        </select>
        <button data-action="queueImport">Prepare import queue</button>
      </div>
      <div class="muted">Collected ${currentVideos.length} videos. Selected ${selectedCount}. Visible ${filteredVideos.length}.</div>
      <div class="muted" data-role="status">${isCollecting ? 'Collecting...' : 'Ready.'}</div>
      <div class="ytnb-video-list">${renderTableRows(filteredVideos)}</div>
      <pre class="muted" data-role="debug">Loading debug status...</pre>
    `;

    panel.addEventListener('click', async (event) => {
      const action = event.target?.dataset?.action;
      if (!action) return;
      if (action === 'collect') {
        const result = await collectChannelVideos();
        renderStatus(JSON.stringify(result));
      }
      if (action === 'selectAll') {
        await toggleAllVisible(true);
        renderStatus('Selected visible new videos.');
      }
      if (action === 'clearAll') {
        await toggleAllVisible(false);
        renderStatus('Cleared visible selection.');
      }
      if (action === 'toggleOnlyNew') {
        onlyShowNew = !onlyShowNew;
        await renderPanel();
        renderStatus(onlyShowNew ? 'Only showing videos not yet in notebook.' : 'Showing all collected videos.');
      }
      if (action === 'applyFilter') {
        activeFilterValue = panel.querySelector('[data-action="filterInput"]').value || '';
        await renderPanel();
        renderStatus(`Applied filter: ${activeFilterValue || '(none)'}`);
      }
      if (action === 'queueImport') {
        const result = await prepareImportQueue();
        renderStatus(JSON.stringify(result));
      }
    });

    panel.addEventListener('change', async (event) => {
      const action = event.target?.dataset?.action;
      if (event.target?.dataset?.role === 'video-check') {
        await syncSelectionFromDom();
        await renderDebugPanel({ message: 'selection updated' });
      }
      if (action === 'targetNotebook') {
        await shared.setTargetNotebookKey(event.target.value || '');
        await hydrateFromState();
        await renderPanel();
        renderStatus(`Target notebook set.`);
      }
    });

    await renderDebugPanel({ message: 'panel rendered' });
  }

  function ensurePanel() {
    if (document.getElementById('ytnb-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'ytnb-panel';
    panel.className = 'ytnb-panel ytnb-workspace';
    document.body.appendChild(panel);
    hydrateFromState().then(renderPanel);
  }

  function watchPageChanges() {
    if (observerStarted) return;
    observerStarted = true;

    const observer = new MutationObserver(() => {
      ensurePanel();
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        currentVideos = [];
        activeFilterValue = '';
        onlyShowNew = false;
        hydrateFromState().then(renderPanel);
      }
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener('yt-navigate-finish', () => {
      lastUrl = location.href;
      currentVideos = [];
      activeFilterValue = '';
      onlyShowNew = false;
      ensurePanel();
      hydrateFromState().then(renderPanel);
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'YTNB_SCAN_PAGE' || message?.type === 'YTNB_COLLECT_CHANNEL_VIDEOS') {
      collectChannelVideos().then(sendResponse);
      return true;
    }
    if (message?.type === 'YTNB_PREPARE_IMPORT_QUEUE') {
      prepareImportQueue().then(sendResponse);
      return true;
    }
    return false;
  });

  ensurePanel();
  watchPageChanges();
})();