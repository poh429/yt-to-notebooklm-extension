(() => {
  const STORAGE_KEY = 'ytNotebookBridge';

  function normalizeText(value) {
    return (value || '')
      .toString()
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function extractYouTubeVideoId(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url, location.origin);
      if (parsed.hostname.includes('youtu.be')) {
        return parsed.pathname.replace(/^\//, '').trim();
      }
      if (parsed.searchParams.get('v')) {
        return parsed.searchParams.get('v').trim();
      }
      const parts = parsed.pathname.split('/').filter(Boolean);
      const watchIndex = parts.findIndex((part) => part === 'shorts' || part === 'embed');
      if (watchIndex >= 0 && parts[watchIndex + 1]) return parts[watchIndex + 1];
      return '';
    } catch {
      return '';
    }
  }

  function normalizeYouTubeUrl(url) {
    const videoId = extractYouTubeVideoId(url);
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : (url || '').trim();
  }

  function getNotebookKey(url = location.href) {
    try {
      const parsed = new URL(url);
      return parsed.origin + parsed.pathname;
    } catch {
      return url;
    }
  }

  function getChannelKey(url = location.href) {
    try {
      const parsed = new URL(url);
      return parsed.origin + parsed.pathname.replace(/\/$/, '');
    } catch {
      return url;
    }
  }

  function defaultState() {
    return {
      activeNotebook: '',
      notebooks: {},
      selectedVideoIds: [],
      targetNotebookKey: '',
      importQueue: [],
      importHistory: [],
      importResults: {},
      channels: {},
      activeChannel: '',
      debug: {
        lastAction: '',
        updatedAt: '',
      },
    };
  }

  function ensureNotebookShape(notebookKey, notebook = {}) {
    return {
      notebookKey,
      notebookUrl: notebook.notebookUrl || notebookKey,
      notebookTitle: notebook.notebookTitle || '',
      updatedAt: notebook.updatedAt || '',
      sources: Array.isArray(notebook.sources) ? notebook.sources : [],
      sourceIndex: notebook.sourceIndex || {},
      status: notebook.status || 'unknown',
    };
  }

  function ensureChannelShape(channelKey, channel = {}) {
    return {
      channelKey,
      channelUrl: channel.channelUrl || channelKey,
      channelTitle: channel.channelTitle || '',
      updatedAt: channel.updatedAt || '',
      scanStatus: channel.scanStatus || 'idle',
      lastCursor: channel.lastCursor || '',
      videos: Array.isArray(channel.videos) ? channel.videos : [],
      videoIndex: channel.videoIndex || {},
      stats: channel.stats || {},
    };
  }

  function upgradeState(rawState) {
    const base = defaultState();
    const merged = {
      ...base,
      ...(rawState || {}),
      notebooks: {},
      channels: {},
      selectedVideoIds: Array.isArray(rawState?.selectedVideoIds) ? rawState.selectedVideoIds : [],
      importQueue: Array.isArray(rawState?.importQueue) ? rawState.importQueue : [],
      importHistory: Array.isArray(rawState?.importHistory) ? rawState.importHistory : [],
      importResults: rawState?.importResults || {},
      debug: {
        ...base.debug,
        ...(rawState?.debug || {}),
      },
    };

    Object.entries(rawState?.notebooks || {}).forEach(([key, notebook]) => {
      merged.notebooks[key] = ensureNotebookShape(key, notebook);
    });

    Object.entries(rawState?.channels || {}).forEach(([key, channel]) => {
      merged.channels[key] = ensureChannelShape(key, channel);
    });

    if (!merged.targetNotebookKey) {
      merged.targetNotebookKey = merged.activeNotebook || '';
    }

    return merged;
  }

  function buildSourceIndex(sources = []) {
    return sources.reduce((acc, item) => {
      if (!item?.videoId) return acc;
      acc[item.videoId] = {
        videoId: item.videoId,
        url: item.url || '',
        title: item.title || '',
        channel: item.channel || '',
        importedAt: item.importedAt || item.discoveredAt || '',
      };
      return acc;
    }, {});
  }

  function buildVideoIndex(videos = []) {
    return videos.reduce((acc, item) => {
      if (!item?.videoId) return acc;
      acc[item.videoId] = {
        videoId: item.videoId,
        url: item.url || '',
        title: item.title || '',
        channel: item.channel || '',
        selected: Boolean(item.selected),
        status: item.status || 'new',
        discoveredAt: item.discoveredAt || '',
      };
      return acc;
    }, {});
  }

  async function getBridgeState() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return upgradeState(result[STORAGE_KEY]);
  }

  async function setBridgeState(nextState) {
    const upgraded = upgradeState(nextState);
    await chrome.storage.local.set({ [STORAGE_KEY]: upgraded });
    return upgraded;
  }

  async function patchBridgeState(patchFn) {
    const current = await getBridgeState();
    const next = await patchFn(current);
    return setBridgeState(next);
  }

  async function upsertNotebook(notebookKey, patch = {}) {
    return patchBridgeState((state) => {
      const currentNotebook = ensureNotebookShape(notebookKey, state.notebooks[notebookKey]);
      const mergedSources = Array.isArray(patch.sources) ? patch.sources : currentNotebook.sources;
      const nextNotebook = ensureNotebookShape(notebookKey, {
        ...currentNotebook,
        ...patch,
        notebookKey,
        updatedAt: patch.updatedAt || nowIso(),
        sources: mergedSources,
        sourceIndex: buildSourceIndex(mergedSources),
      });
      return {
        ...state,
        activeNotebook: patch.setActive ? notebookKey : state.activeNotebook,
        targetNotebookKey: patch.setTarget ? notebookKey : (state.targetNotebookKey || notebookKey),
        notebooks: {
          ...state.notebooks,
          [notebookKey]: nextNotebook,
        },
        debug: {
          ...state.debug,
          lastAction: `upsertNotebook:${notebookKey}`,
          updatedAt: nowIso(),
        },
      };
    });
  }

  async function upsertChannel(channelKey, patch = {}) {
    return patchBridgeState((state) => {
      const currentChannel = ensureChannelShape(channelKey, state.channels[channelKey]);
      const mergedVideos = Array.isArray(patch.videos) ? patch.videos : currentChannel.videos;
      const nextChannel = ensureChannelShape(channelKey, {
        ...currentChannel,
        ...patch,
        channelKey,
        updatedAt: patch.updatedAt || nowIso(),
        videos: mergedVideos,
        videoIndex: buildVideoIndex(mergedVideos),
      });
      return {
        ...state,
        activeChannel: patch.setActive ? channelKey : state.activeChannel,
        channels: {
          ...state.channels,
          [channelKey]: nextChannel,
        },
        debug: {
          ...state.debug,
          lastAction: `upsertChannel:${channelKey}`,
          updatedAt: nowIso(),
        },
      };
    });
  }

  async function setTargetNotebookKey(notebookKey) {
    return patchBridgeState((state) => ({
      ...state,
      targetNotebookKey: notebookKey,
      debug: {
        ...state.debug,
        lastAction: `setTargetNotebookKey:${notebookKey}`,
        updatedAt: nowIso(),
      },
    }));
  }

  async function setSelectedVideoIds(videoIds = []) {
    const unique = Array.from(new Set((videoIds || []).filter(Boolean)));
    return patchBridgeState((state) => ({
      ...state,
      selectedVideoIds: unique,
      debug: {
        ...state.debug,
        lastAction: `setSelectedVideoIds:${unique.length}`,
        updatedAt: nowIso(),
      },
    }));
  }

  async function toggleSelectedVideo(videoId, forceValue = null) {
    return patchBridgeState((state) => {
      const nextSet = new Set(state.selectedVideoIds || []);
      const shouldSelect = typeof forceValue === 'boolean' ? forceValue : !nextSet.has(videoId);
      if (shouldSelect) nextSet.add(videoId);
      else nextSet.delete(videoId);
      return {
        ...state,
        selectedVideoIds: Array.from(nextSet),
        debug: {
          ...state.debug,
          lastAction: `toggleSelectedVideo:${videoId}:${shouldSelect}`,
          updatedAt: nowIso(),
        },
      };
    });
  }

  function getNotebookSourceIndex(state, notebookKey) {
    const notebook = state.notebooks?.[notebookKey];
    return notebook?.sourceIndex || buildSourceIndex(notebook?.sources || []);
  }

  function annotateVideosWithNotebook(channelVideos = [], sourceIndex = {}) {
    return channelVideos.map((item) => {
      const exists = Boolean(sourceIndex[item.videoId]);
      return {
        ...item,
        existsInTarget: exists,
        status: exists ? 'exists' : (item.status || 'ready'),
      };
    });
  }

  async function queueSelectedVideosForImport() {
    return patchBridgeState((state) => {
      const channel = state.channels[state.activeChannel] || ensureChannelShape(state.activeChannel, {});
      const sourceIndex = getNotebookSourceIndex(state, state.targetNotebookKey);
      const selectedIds = new Set(state.selectedVideoIds || []);
      const selectedVideos = (channel.videos || []).filter((item) => selectedIds.has(item.videoId));
      const deduped = selectedVideos.filter((item) => !sourceIndex[item.videoId]);
      const blocked = selectedVideos.filter((item) => sourceIndex[item.videoId]);
      const queue = deduped.map((item) => ({
        videoId: item.videoId,
        url: item.url,
        title: item.title,
        channel: item.channel,
        notebookKey: state.targetNotebookKey,
        queuedAt: nowIso(),
        status: 'queued',
      }));
      return {
        ...state,
        importQueue: queue,
        importResults: {
          ...state.importResults,
          lastQueuedAt: nowIso(),
          queued: queue,
          blocked: blocked.map((item) => ({
            videoId: item.videoId,
            url: item.url,
            title: item.title,
            reason: 'already_exists',
          })),
        },
        debug: {
          ...state.debug,
          lastAction: `queueSelectedVideosForImport:${queue.length}`,
          updatedAt: nowIso(),
        },
      };
    });
  }

  async function recordImportResult(videoId, result = {}) {
    return patchBridgeState((state) => {
      const nextQueue = (state.importQueue || []).map((item) => (
        item.videoId === videoId ? { ...item, ...result } : item
      ));
      const nextHistory = [
        {
          videoId,
          recordedAt: nowIso(),
          ...result,
        },
        ...(state.importHistory || []),
      ].slice(0, 200);
      return {
        ...state,
        importQueue: nextQueue,
        importHistory: nextHistory,
        debug: {
          ...state.debug,
          lastAction: `recordImportResult:${videoId}:${result.status || 'unknown'}`,
          updatedAt: nowIso(),
        },
      };
    });
  }

  async function clearImportQueue() {
    return patchBridgeState((state) => ({
      ...state,
      importQueue: [],
      debug: {
        ...state.debug,
        lastAction: 'clearImportQueue',
        updatedAt: nowIso(),
      },
    }));
  }

  window.YTNotebookShared = {
    STORAGE_KEY,
    nowIso,
    normalizeText,
    extractYouTubeVideoId,
    normalizeYouTubeUrl,
    getNotebookKey,
    getChannelKey,
    defaultState,
    getBridgeState,
    setBridgeState,
    patchBridgeState,
    upsertNotebook,
    upsertChannel,
    setTargetNotebookKey,
    setSelectedVideoIds,
    toggleSelectedVideo,
    queueSelectedVideosForImport,
    recordImportResult,
    clearImportQueue,
    buildSourceIndex,
    buildVideoIndex,
    getNotebookSourceIndex,
    annotateVideosWithNotebook,
  };
})();