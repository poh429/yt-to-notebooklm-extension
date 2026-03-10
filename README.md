# YT to NotebookLM Chrome Extension

## 中文說明

### 專案概述

這是一個 Chrome 擴充套件，目標是把 YouTube 頻道影片整理成可勾選的匯入工作台，並把你選到的影片送進 NotebookLM 的指定筆記本。

目前版本的核心流程是：
- 在 YouTube 頁面蒐集目前可見的頻道影片清單
- 將影片顯示成可勾選列表
- 指定目標 NotebookLM 筆記本
- 先比對目標 notebook 已存在的 YouTube 來源
- 阻擋重複影片，避免二次匯入
- 在 NotebookLM 頁面執行待匯入佇列

### 目前支援功能

#### YouTube 工作台
- 蒐集目前頁面可見的影片卡片
- 將影片整理成列表
- 顯示影片標題、頻道、網址與狀態
- 勾選要匯入的影片
- 全選目前可見且尚未存在於 notebook 的影片
- 清除勾選
- 只顯示未匯入影片
- 依標題、頻道或 metadata 篩選影片
- 將勾選結果整理成待匯入佇列

#### NotebookLM 工作台
- 將目前 notebook 設為目標 notebook
- 重新整理目前 notebook 的 YouTube 來源快取
- 顯示待匯入佇列與被阻擋的重複項
- 嘗試透過頁面上的新增來源流程自動匯入 YouTube URL
- 匯入後重新整理來源快取

#### 跨頁共享狀態
- 保存目標 notebook
- 保存目前頻道影片池
- 保存已勾選影片 ID
- 保存待匯入佇列
- 保存匯入結果與歷史
- 建立 notebook 來源索引，用影片 ID 做去重

### 專案檔案

- `manifest.json`: Chrome 擴充套件設定檔
- `background.js`: 輕量背景工作腳本
- `popup.html`: popup 操作面板
- `popup.js`: popup 與頁面間的訊息傳遞
- `shared.js`: 跨頁共用狀態、去重與匯入佇列管理
- `youtube.js`: YouTube 頁面工作台
- `notebooklm.js`: NotebookLM 頁面工作台
- `content.css`: 浮動面板、列表與 badge 樣式

### 支援頁面

#### YouTube
- 頻道影片頁
- 播放清單頁
- 搜尋結果頁
- 只要 DOM 中可見 YouTube 影片卡片的頁面

#### NotebookLM
- 含有可見 YouTube 來源的 notebook 頁面
- 含有新增來源 UI 的 notebook 頁面

### 新工作流

#### 步驟 1: 選擇目標 notebook
1. 打開 NotebookLM 某個目標 notebook。
2. 點擊 `Use this notebook as target`。
3. 點擊 `Refresh notebook source cache`。

預期結果：
- 當前 notebook 會成為 target notebook
- 現有 YouTube 來源會被寫入本地快取
- 之後 YouTube 頁面就能判斷哪些影片已存在

#### 步驟 2: 在 YouTube 蒐集影片
1. 打開某個 YouTube 頻道或影片列表頁。
2. 點擊 `Collect videos`。
3. 檢查影片列表是否出現。

預期結果：
- 面板中會出現目前蒐集到的影片列表
- 已存在於目標 notebook 的影片會標記為 `Already in notebook`
- 尚未存在的影片會標記為 `Ready to import`

#### 步驟 3: 勾選想匯入的影片
1. 勾選要匯入的影片。
2. 或點擊 `Select visible new` 全選目前可見且未重複的影片。
3. 可用 `Only show new` 只看未匯入項目。

預期結果：
- 已存在影片預設不可勾選
- 勾選狀態會保存在共享狀態中

#### 步驟 4: 建立匯入佇列
1. 在 YouTube 工作台點擊 `Prepare import queue`。
2. 檢查回傳結果中的 queued 與 blocked 數量。

預期結果：
- 未重複影片會進入待匯入佇列
- 已存在影片會被列入 blocked duplicate
- 不會把已存在影片再次送進匯入佇列

#### 步驟 5: 在 NotebookLM 執行匯入
1. 回到目標 NotebookLM 頁面。
2. 確認目前頁面就是 target notebook。
3. 點擊 `Run import queue`。

預期結果：
- 擴充套件會嘗試打開新增來源流程
- 會自動尋找 URL 輸入框並貼上 YouTube 連結
- 送出後會重新掃描 notebook 來源，確認影片是否真的出現

### Popup 使用方式

popup 現在提供的是流程控制入口：
- `Collect Channel Videos`: 在 YouTube 頁收集影片
- `Prepare Import Queue`: 在 YouTube 頁建立匯入佇列
- `Refresh Notebook Cache`: 在 NotebookLM 頁重新整理來源快取
- `Run Import Queue`: 在 NotebookLM 頁執行匯入
- `Apply Filter`: 對目前頁面套用篩選
- `Quick Scan`: 快速檢查目前頁面是否有抓到內容

### 手動測試清單

#### 測試 1: 擴充套件可成功載入
預期結果：
- 擴充套件可載入且沒有 manifest 錯誤
- popup 可以正常打開
- popup 會顯示目前頁面的辨識結果

#### 測試 2: NotebookLM 設定目標 notebook
1. 開啟 NotebookLM 某個 notebook。
2. 點擊 `Use this notebook as target`。
3. 點擊 `Refresh notebook source cache`。

預期結果：
- debug 區塊的 `target_notebook_key` 會有值
- `cached_source_count` 會反映目前 notebook 中已抓到的 YouTube 來源

#### 測試 3: YouTube 收集與勾選
1. 打開 YouTube 頻道影片頁。
2. 點擊 `Collect videos`。
3. 勾選幾支尚未存在的影片。

預期結果：
- 面板會顯示 collected videos 數量
- 已存在影片不可勾選
- selected videos 數量會更新

#### 測試 4: 去重阻擋
1. 選取含有已存在影片與未存在影片的混合清單。
2. 點擊 `Prepare import queue`。

預期結果：
- 已存在影片會進 blocked
- 未存在影片會進 queued
- 不會把重複影片加入待匯入佇列

#### 測試 5: NotebookLM 匯入執行
1. 回到目標 NotebookLM 頁面。
2. 點擊 `Run import queue`。

預期結果：
- 擴充套件會嘗試找到新增來源按鈕、URL 輸入框與送出按鈕
- 若成功，匯入後重新整理快取時應能在來源列表中看到影片
- 若失敗，結果中會標示失敗階段，例如 `input`、`submit` 或 `verify`

### Debug 指南

YouTube 與 NotebookLM 面板都包含 debug 區塊，用來判斷目前卡在哪一段。

#### YouTube debug 欄位
- `channel_key`: 目前頻道頁的 key
- `channel_title`: 目前頁面辨識到的頻道名稱
- `video_cards`: DOM 中可見影片卡片數量
- `collected_videos`: 實際整理進工作台的影片數量
- `visible_after_filter`: 篩選後仍可見的影片數量
- `selected_videos`: 目前被勾選的影片數量
- `existing_in_target`: 已存在於目標 notebook 的影片數量
- `only_show_new`: 是否只顯示未匯入影片
- `active_filter`: 目前篩選文字
- `target_notebook_key`: 目前目標 notebook key
- `target_notebook_title`: 目標 notebook 標題
- `target_notebook_sources`: 目標 notebook 快取中的來源數量
- `queued_for_import`: 目前待匯入佇列數量
- `last_action`: 最近一次共享狀態操作

YouTube 快速診斷：
- 若 `video_cards` 很高但 `collected_videos` 是 `0`，表示影片 selector 需要調整
- 若 `collected_videos` 正常但 `existing_in_target` 一直是 `0`，表示目標 notebook 尚未快取或 target 未設定
- 若 `selected_videos` 沒增加，代表 checkbox 狀態沒有被正確寫回共享狀態

#### NotebookLM debug 欄位
- `current_notebook_key`: 目前頁面 notebook key
- `active_notebook_key`: 最近一次被設成 active 的 notebook key
- `target_notebook_key`: 目前全域目標 notebook key
- `notebook_title`: notebook 標題
- `dom_source_links`: 目前 DOM 中抓到的 YouTube 來源數量
- `cached_source_count`: 已寫入共享快取的來源數量
- `visible_after_filter`: 篩選後仍可見的來源數量
- `active_filter`: 目前篩選文字
- `queued_for_import`: 待匯入佇列數量
- `blocked_duplicates`: 被阻擋的重複影片數量
- `last_refresh_at`: 最近一次快取刷新時間
- `import_running`: 是否正在匯入
- `last_action`: 最近一次共享狀態操作

NotebookLM 快速診斷：
- 若 `queued_for_import` 是 `0`，表示你還沒在 YouTube 頁準備匯入佇列
- 若 `blocked_duplicates` 很高，表示大量影片已存在於目標 notebook 中
- 若執行匯入後失敗，請看回傳結果中的 `stage` 是 `input`、`submit` 還是 `verify`

### 已知限制

- 目前 YouTube 蒐集仍以當前 DOM 中可見影片為主，尚未做到自動無限捲動抓完整頻道歷史
- NotebookLM 自動匯入完全依賴頁面上的按鈕、輸入框與文字標籤，若 UI 改版可能失效
- 某些 NotebookLM 介面可能不是單純的 URL 貼上流程，這種情況會在 `input` 或 `submit` 階段失敗
- 目前沒有實作真正的背景批次排程，仍需在目標 notebook 頁面手動執行匯入
- notebook 來源驗證是靠重新掃描 DOM 中的 YouTube 來源連結完成，若 NotebookLM 延遲載入，可能會短暫判定失敗

### 已完成修正

- 將共享狀態升級為支援 channels、notebooks、selectedVideoIds、importQueue、importHistory 與 importResults
- 將 YouTube 面板升級為勾選式工作台
- 加入目標 notebook 對照與重複影片阻擋
- 將 NotebookLM 面板升級為匯入工作台
- 將 popup 升級為跨頁流程控制入口
- 補上新的 debug 欄位與結果回報

### 目前驗證狀態

程式層級驗證已完成：
- 共享狀態模型、YouTube 工作台、NotebookLM 工作台與 popup 的訊息名稱已對齊
- 去重邏輯已改為以 YouTube video ID 為主
- 匯入佇列與匯入結果已能在兩個頁面共享

仍需在 Chrome 實際驗證：
- YouTube 真實頻道頁是否能穩定抓到你要的全部影片卡片
- NotebookLM 真實頁面是否能成功找到新增來源按鈕、URL 輸入框與送出按鈕
- NotebookLM 匯入完成後的 DOM 是否能及時反映新來源

### 下一步建議

如果你要把這個插件做到更完整，下一輪最值得補的是：
- 自動捲動頻道頁直到抓完整份影片清單
- 讀取多個 notebook 供下拉選擇，而不只依賴你先開啟目標 notebook
- 對匯入失敗項目提供重試機制
- 更精準適配 NotebookLM 的實際新增來源流程

---

## English

### Overview

This Chrome extension turns a YouTube page into a selectable import workspace for NotebookLM.

The current workflow is:
- collect visible videos from a YouTube page
- display them as a selectable list
- choose a target NotebookLM notebook
- compare selected videos against existing notebook sources
- block duplicates before import
- run the prepared import queue on the NotebookLM page

### Current Features

#### YouTube workspace
- collect visible video cards from the current page
- render videos as a selectable list
- show title, channel, URL, and current state
- select videos for import
- select all visible videos that are not already in the target notebook
- clear selection
- show only videos not yet imported
- filter by title, channel, or metadata
- prepare an import queue from selected videos

#### NotebookLM workspace
- mark the current notebook as the target notebook
- refresh cached YouTube sources from the current notebook
- show queued videos and blocked duplicates
- try to import YouTube URLs through the page's source creation flow
- refresh notebook cache after import attempts

#### Shared state
- store the target notebook
- store the current channel video pool
- store selected video IDs
- store the import queue
- store import results and import history
- build notebook source indexes using YouTube video IDs for deduplication

### Project Files

- `manifest.json`: Chrome extension manifest
- `background.js`: lightweight background worker
- `popup.html`: popup control panel
- `popup.js`: popup to page messaging
- `shared.js`: shared state, deduplication, and queue management
- `youtube.js`: YouTube workspace
- `notebooklm.js`: NotebookLM workspace
- `content.css`: floating panel, list, and badge styles

### Supported Pages

#### YouTube
- channel video pages
- playlist pages
- search result pages
- pages where YouTube video cards are visible in the DOM

#### NotebookLM
- notebook pages with visible YouTube sources
- notebook pages with a visible source creation flow

### Workflow

#### Step 1: choose the target notebook
1. Open a NotebookLM notebook.
2. Click `Use this notebook as target`.
3. Click `Refresh notebook source cache`.

Expected result:
- the current notebook becomes the target notebook
- existing YouTube sources are written into local cache
- the YouTube page can now detect which videos already exist

#### Step 2: collect videos on YouTube
1. Open a YouTube channel or video list page.
2. Click `Collect videos`.
3. Check whether the list appears.

Expected result:
- collected videos appear in the workspace list
- existing videos are marked `Already in notebook`
- new videos are marked `Ready to import`

#### Step 3: select videos
1. check the videos you want to import
2. or click `Select visible new`
3. use `Only show new` to focus on not-yet-imported items

Expected result:
- existing videos are not selectable
- selection is stored in shared state

#### Step 4: prepare import queue
1. Click `Prepare import queue` on the YouTube page.
2. Check the returned queued and blocked counts.

Expected result:
- non-duplicate videos move into the import queue
- duplicate videos go into blocked duplicates
- already existing videos are not queued again

#### Step 5: run import on NotebookLM
1. Go back to the target NotebookLM page.
2. Confirm the open page is the target notebook.
3. Click `Run import queue`.

Expected result:
- the extension tries to open the source creation flow
- it tries to find the URL input and submit button
- after submission it rescans notebook sources to verify the video was added

### Popup Usage

The popup now acts as a workflow controller:
- `Collect Channel Videos`: collect videos on a YouTube page
- `Prepare Import Queue`: create the queue on a YouTube page
- `Refresh Notebook Cache`: refresh source cache on a NotebookLM page
- `Run Import Queue`: run import on a NotebookLM page
- `Apply Filter`: apply the current filter on the active page
- `Quick Scan`: quick page sanity check

### Manual Test Checklist

#### Test 1: extension loads
Expected result:
- the extension loads without manifest errors
- the popup opens
- the popup shows page detection text

#### Test 2: target notebook setup
1. Open a NotebookLM notebook.
2. Click `Use this notebook as target`.
3. Click `Refresh notebook source cache`.

Expected result:
- `target_notebook_key` is populated in debug output
- `cached_source_count` reflects detected YouTube sources

#### Test 3: YouTube collection and selection
1. Open a YouTube channel videos page.
2. Click `Collect videos`.
3. Select some videos not already in the notebook.

Expected result:
- collected video count appears
- existing videos are disabled
- selected video count updates

#### Test 4: deduplication blocking
1. Select a mix of existing and new videos.
2. Click `Prepare import queue`.

Expected result:
- existing videos are blocked
- new videos are queued
- duplicates are not added to the queue

#### Test 5: NotebookLM import execution
1. Return to the target NotebookLM page.
2. Click `Run import queue`.

Expected result:
- the extension tries to find add-source controls, URL input, and submit button
- if successful, refreshed cache should show the imported videos
- if not, the result should expose the failing stage such as `input`, `submit`, or `verify`

### Debug Guide

Both YouTube and NotebookLM panels include debug output.

#### YouTube debug fields
- `channel_key`: current channel page key
- `channel_title`: detected channel title
- `video_cards`: visible video cards in DOM
- `collected_videos`: videos added to the workspace list
- `visible_after_filter`: videos still visible after filtering
- `selected_videos`: currently selected videos
- `existing_in_target`: videos already found in target notebook
- `only_show_new`: whether only new videos are shown
- `active_filter`: current filter text
- `target_notebook_key`: current target notebook key
- `target_notebook_title`: target notebook title
- `target_notebook_sources`: cached source count for target notebook
- `queued_for_import`: current import queue size
- `last_action`: last shared-state action

Quick YouTube diagnosis:
- if `video_cards` is high but `collected_videos` is `0`, selectors likely need adjustment
- if `collected_videos` is correct but `existing_in_target` stays `0`, the target notebook cache is missing or target notebook is not set
- if `selected_videos` does not change, checkbox state is not being written back correctly

#### NotebookLM debug fields
- `current_notebook_key`: current notebook key
- `active_notebook_key`: most recent active notebook key
- `target_notebook_key`: global target notebook key
- `notebook_title`: notebook title
- `dom_source_links`: YouTube source links detected in DOM
- `cached_source_count`: source count written into shared cache
- `visible_after_filter`: visible sources after filtering
- `active_filter`: current filter text
- `queued_for_import`: current import queue size
- `blocked_duplicates`: number of blocked duplicates
- `last_refresh_at`: last cache refresh time
- `import_running`: whether import is in progress
- `last_action`: last shared-state action

Quick NotebookLM diagnosis:
- if `queued_for_import` is `0`, no queue has been prepared from YouTube yet
- if `blocked_duplicates` is high, many selected videos already exist in the notebook
- if import fails, check whether the reported stage is `input`, `submit`, or `verify`

### Known Limits

- YouTube collection still depends on currently visible DOM items and does not yet auto-scroll through a full channel archive
- NotebookLM import automation depends on page buttons, input fields, and text labels that may change
- some NotebookLM flows may not be a simple paste-URL flow, which can fail at the `input` or `submit` stage
- this version still requires manually opening the target notebook page to execute import
- import verification depends on rescanning visible YouTube source links in the DOM, so delayed rendering may temporarily look like failure

### Fixes Completed

- upgraded shared state to support channels, notebooks, selectedVideoIds, importQueue, importHistory, and importResults
- upgraded YouTube panel into a selectable workspace
- added target notebook matching and duplicate blocking
- upgraded NotebookLM panel into an import workspace
- upgraded popup into a cross-page workflow controller
- added new debug fields and result reporting

### Current Validation Status

Code-level validation completed:
- shared state, YouTube workspace, NotebookLM workspace, and popup message names are aligned
- deduplication now uses YouTube video ID as the primary key
- import queue and results are shared across both pages

Still requires live Chrome validation:
- real YouTube channel page compatibility
- real NotebookLM add-source button, URL input, and submit button detection
- timely DOM reflection after NotebookLM import

### Next Improvements

The highest-value next steps would be:
- auto-scroll to collect a full channel video list
- load multiple notebooks for dropdown selection without requiring the notebook page to be opened first
- retry support for failed imports
- tighter adaptation to the real NotebookLM source import flow