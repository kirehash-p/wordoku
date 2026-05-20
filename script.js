(function () {
  "use strict";

  const storageKey = "wordoku-settings-v1";
  const textStorageKey = "wordoku-practice-text-v1";
  const defaultText = "The quick brown fox jumps over the lazy dog.";
  const wordPattern = /[\p{L}\p{M}]+(?:[’'\-][\p{L}\p{M}]+)*/gu;

  const els = {
    textInput: document.getElementById("textInput"),
    languageSelect: document.getElementById("languageSelect"),
    sourceSelect: document.getElementById("sourceSelect"),
    googleApiKeyInput: document.getElementById("googleApiKeyInput"),
    googleApiHelpButton: document.getElementById("googleApiHelpButton"),
    googleApiHelp: document.getElementById("googleApiHelp"),
    googleVoiceNameInput: document.getElementById("googleVoiceNameInput"),
    voiceSelect: document.getElementById("voiceSelect"),
    orderSelect: document.getElementById("orderSelect"),
    speedRange: document.getElementById("speedRange"),
    speedValue: document.getElementById("speedValue"),
    delayRange: document.getElementById("delayRange"),
    delayValue: document.getElementById("delayValue"),
    preloadRange: document.getElementById("preloadRange"),
    preloadValue: document.getElementById("preloadValue"),
    autoToggle: document.getElementById("autoToggle"),
    normalizeToggle: document.getElementById("normalizeToggle"),
    themeSelect: document.getElementById("themeSelect"),
    progressPanel: document.getElementById("progressPanel"),
    manualModeButton: document.getElementById("manualModeButton"),
    autoModeButton: document.getElementById("autoModeButton"),
    prevButton: document.getElementById("prevButton"),
    nextButton: document.getElementById("nextButton"),
    playButton: document.getElementById("playButton"),
    pauseButton: document.getElementById("pauseButton"),
    stopButton: document.getElementById("stopButton"),
    settingsButton: document.getElementById("settingsButton"),
    settingsCloseButton: document.getElementById("settingsCloseButton"),
    settingsBackdrop: document.getElementById("settingsBackdrop"),
    settingsPanel: document.getElementById("settingsPanel"),
    currentWord: document.getElementById("currentWord"),
    progressText: document.getElementById("progressText"),
    sourceText: document.getElementById("sourceText"),
  };

  const audioCache = new Map();
  const audioRequests = new Map();
  const googleContextCache = new Map();
  const googleContextRequests = new Map();
  const mediaPreloadCache = new Map();
  let tokens = [];
  let currentIndex = 0;
  let runId = 0;
  let currentAudio = null;
  let browserVoices = [];
  let isPlaying = false;
  let inputTimer = 0;
  let savedSettings = {};

  function init() {
    savedSettings = readSettings();
    restoreSettings();
    bindEvents();
    refreshRangeLabels();
    loadVoices();
    renderEditor(localStorage.getItem(textStorageKey) || defaultText);
  }

  function bindEvents() {
    els.playButton.addEventListener("click", handlePlay);
    els.prevButton.addEventListener("click", () => moveSelection(-1, true));
    els.nextButton.addEventListener("click", () => moveSelection(1, true));
    els.manualModeButton.addEventListener("click", () => setAutoPlayMode(false));
    els.autoModeButton.addEventListener("click", () => setAutoPlayMode(true));
    els.pauseButton.addEventListener("click", pausePlayback);
    els.stopButton.addEventListener("click", stopPlayback);
    els.settingsButton.addEventListener("click", openSettings);
    els.settingsCloseButton.addEventListener("click", closeSettings);
    els.settingsBackdrop.addEventListener("click", closeSettings);
    els.googleApiHelpButton.addEventListener("click", toggleGoogleApiHelp);

    els.textInput.addEventListener("click", handleEditorClick);
    els.textInput.addEventListener("paste", handlePaste);
    els.textInput.addEventListener("input", scheduleEditorRebuild);

    [
      els.languageSelect,
      els.sourceSelect,
      els.googleApiKeyInput,
      els.googleVoiceNameInput,
      els.voiceSelect,
      els.orderSelect,
      els.speedRange,
      els.delayRange,
      els.preloadRange,
      els.autoToggle,
      els.normalizeToggle,
      els.themeSelect,
    ].forEach((control) => {
      control.addEventListener("change", handleSettingsChange);
      control.addEventListener("input", handleSettingsChange);
    });

    window.addEventListener("keydown", (event) => {
      handleKeyboard(event);
    });

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

    if ("speechSynthesis" in window) {
      speechSynthesis.addEventListener("voiceschanged", loadVoices);
    }
  }

  function readSettings() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      return {};
    }
  }

  function restoreSettings() {
    setValue(els.languageSelect, savedSettings.language || "en-US");
    setValue(els.sourceSelect, savedSettings.source || "auto");
    els.googleApiKeyInput.value = savedSettings.googleApiKey || "";
    els.googleVoiceNameInput.value = savedSettings.googleVoiceName || "";
    setValue(els.orderSelect, savedSettings.order || "normal");
    setValue(els.speedRange, savedSettings.speed || "0.9");
    setValue(els.delayRange, savedSettings.delay || "1");
    setValue(els.preloadRange, savedSettings.preload || "5");
    setValue(els.themeSelect, savedSettings.theme || "auto");
    els.autoToggle.checked = savedSettings.autoPlay !== false;
    els.normalizeToggle.checked = savedSettings.normalize !== false;
    updateModeUi();
    applyTheme();
  }

  function setValue(element, value) {
    if ([...element.options || []].some((option) => option.value === value) || element.type === "range") {
      element.value = value;
    }
  }

  function saveSettings() {
    const settings = {
      language: els.languageSelect.value,
      source: els.sourceSelect.value,
      googleApiKey: els.googleApiKeyInput.value.trim(),
      googleVoiceName: els.googleVoiceNameInput.value.trim(),
      voice: els.voiceSelect.value,
      order: els.orderSelect.value,
      speed: els.speedRange.value,
      delay: els.delayRange.value,
      preload: els.preloadRange.value,
      autoPlay: els.autoToggle.checked,
      normalize: els.normalizeToggle.checked,
      theme: els.themeSelect.value,
    };
    localStorage.setItem(storageKey, JSON.stringify(settings));
  }

  function handleSettingsChange(event) {
    refreshRangeLabels();
    if (event?.target === els.autoToggle) updateModeUi();
    applyTheme();
    saveSettings();
    if (
      event?.target === els.languageSelect ||
      event?.target === els.sourceSelect ||
      event?.target === els.googleApiKeyInput ||
      event?.target === els.googleVoiceNameInput
    ) {
      rebuildFromEditorText();
    }
    if (event?.target === els.preloadRange) {
      prefetchAhead(currentIndex);
    }
  }

  function applyTheme() {
    const selected = els.themeSelect.value;
    const theme =
      selected === "auto"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : selected;
    document.documentElement.dataset.theme = theme;
  }

  function openSettings() {
    els.settingsPanel.classList.add("open");
    els.settingsPanel.setAttribute("aria-hidden", "false");
    els.settingsBackdrop.hidden = false;
    els.settingsButton.setAttribute("aria-expanded", "true");
  }

  function closeSettings() {
    els.settingsPanel.classList.remove("open");
    els.settingsPanel.setAttribute("aria-hidden", "true");
    els.settingsBackdrop.hidden = true;
    els.settingsButton.setAttribute("aria-expanded", "false");
  }

  function toggleGoogleApiHelp() {
    const willOpen = els.googleApiHelp.hidden;
    els.googleApiHelp.hidden = !willOpen;
    els.googleApiHelpButton.setAttribute("aria-expanded", String(willOpen));
  }

  function handleKeyboard(event) {
    if (event.key === "Escape") {
      closeSettings();
      return;
    }
    if (els.settingsPanel.classList.contains("open") || isEditableTarget(event.target)) return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelection(-1, true);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSelection(1, true);
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      moveSelection(event.shiftKey ? -1 : 1, true);
    }
  }

  function isEditableTarget(target) {
    return Boolean(
      target?.closest?.("input, select, textarea") ||
        (target?.isContentEditable && !target.classList?.contains("word-token"))
    );
  }

  function setAutoPlayMode(enabled) {
    els.autoToggle.checked = enabled;
    updateModeUi();
    saveSettings();
  }

  function updateModeUi() {
    const isAuto = els.autoToggle.checked;
    els.manualModeButton.classList.toggle("active", !isAuto);
    els.autoModeButton.classList.toggle("active", isAuto);
    els.manualModeButton.setAttribute("aria-pressed", String(!isAuto));
    els.autoModeButton.setAttribute("aria-pressed", String(isAuto));
    els.playButton.textContent = isAuto ? "ここから連続再生" : "この単語を再生";
  }

  function refreshRangeLabels() {
    els.speedValue.textContent = `${Number(els.speedRange.value).toFixed(2)}x`;
    els.delayValue.textContent = `${Number(els.delayRange.value).toFixed(1)}秒`;
    els.preloadValue.textContent = `${Number(els.preloadRange.value)}個`;
    if (currentAudio) currentAudio.playbackRate = getSpeed();
  }

  function handlePaste(event) {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") || "";
    renderEditor(text);
  }

  function scheduleEditorRebuild() {
    window.clearTimeout(inputTimer);
    inputTimer = window.setTimeout(rebuildFromEditorText, 700);
  }

  function rebuildFromEditorText() {
    renderEditor(getEditorText());
  }

  function renderEditor(text) {
    stopPlayback();
    const previousIndex = currentIndex;
    const previousWord = tokens[currentIndex]?.word || "";
    const normalizedText = text.trim() ? text : "";
    const fragment = document.createDocumentFragment();
    tokens = [];

    let lastIndex = 0;
    for (const match of normalizedText.matchAll(wordPattern)) {
      const word = match[0];
      const start = match.index || 0;
      if (start > lastIndex) {
        fragment.append(document.createTextNode(normalizedText.slice(lastIndex, start)));
      }

      const index = tokens.length;
      const span = document.createElement("span");
      span.className = "word-token";
      span.dataset.index = String(index);
      span.contentEditable = "false";
      span.lang = els.languageSelect.value;
      span.textContent = word;
      fragment.append(span);

      tokens.push({
        word,
        lang: els.languageSelect.value,
        start,
        end: start + word.length,
      });
      lastIndex = start + word.length;
    }

    if (lastIndex < normalizedText.length) {
      fragment.append(document.createTextNode(normalizedText.slice(lastIndex)));
    }

    els.textInput.replaceChildren(fragment);
    currentIndex = preserveCurrentIndex(previousWord, previousIndex);
    localStorage.setItem(textStorageKey, normalizedText);
    if (els.sourceSelect.value === "google") {
      setAllWordAudioState("pending");
    } else {
      syncAllAudioStates();
    }
    updateStatus(tokens.length ? "準備完了" : "単語がありません");
    prefetchAhead(currentIndex);
  }

  function preserveCurrentIndex(previousWord, previousIndex) {
    if (!tokens.length) return 0;
    const clampedIndex = clamp(previousIndex, 0, tokens.length - 1);
    const normalizedPrevious = normalizeWord(previousWord);
    if (!normalizedPrevious) return clampedIndex;
    if (normalizeWord(tokens[clampedIndex].word) === normalizedPrevious) return clampedIndex;

    const sameWordIndexes = tokens
      .map((token, index) => ({ token, index }))
      .filter(({ token }) => normalizeWord(token.word) === normalizedPrevious);
    if (!sameWordIndexes.length) return clampedIndex;

    return sameWordIndexes.reduce((nearest, candidate) =>
      Math.abs(candidate.index - previousIndex) < Math.abs(nearest.index - previousIndex)
        ? candidate
        : nearest
    ).index;
  }

  function getEditorText() {
    return els.textInput.innerText.replace(/\u00a0/g, " ").trim();
  }

  function handleEditorClick(event) {
    const tokenElement = event.target.closest(".word-token");
    if (!tokenElement || !els.textInput.contains(tokenElement)) return;

    event.preventDefault();
    els.textInput.blur();
    currentIndex = Number(tokenElement.dataset.index);
    updateActiveWord();
    if (els.autoToggle.checked) {
      startPlayback(currentIndex);
    } else {
      playSingle(currentIndex);
    }
  }

  async function handlePlay() {
    if (!tokens.length) rebuildFromEditorText();
    if (!tokens.length) {
      updateStatus("単語がありません");
      return;
    }
    startPlayback(currentIndex);
  }

  function moveSelection(delta, shouldPlay) {
    if (!tokens.length) {
      rebuildFromEditorText();
      return;
    }
    stopPlayback();
    currentIndex = clamp(currentIndex + delta, 0, tokens.length - 1);
    updateStatus(shouldPlay ? "再生準備中" : "選択中");
    prefetchAhead(currentIndex);
    scrollActiveWordIntoView();
    if (shouldPlay) {
      playSingle(currentIndex);
    }
  }

  async function startPlayback(startIndex) {
    const activeRun = ++runId;
    isPlaying = true;
    setButtons();
    currentIndex = clamp(startIndex, 0, tokens.length - 1);

    while (activeRun === runId && tokens[currentIndex]) {
      updateActiveWord();
      prefetchAhead(currentIndex + 1);
      await wait(getDelay(), activeRun);
      if (activeRun !== runId) break;

      await playWord(currentIndex, activeRun);
      if (activeRun !== runId) break;

      if (els.orderSelect.value === "repeat") continue;
      if (!els.autoToggle.checked) break;

      currentIndex += 1;
      if (currentIndex >= tokens.length) {
        updateStatus("完了");
        break;
      }
    }

    if (activeRun === runId) {
      isPlaying = false;
      setButtons();
    }
  }

  async function playSingle(index) {
    const activeRun = ++runId;
    isPlaying = true;
    setButtons();
    currentIndex = index;
    updateActiveWord();
    prefetchAhead(index + 1);
    await wait(getDelay(), activeRun);
    if (activeRun === runId) await playWord(index, activeRun);
    if (activeRun === runId) {
      isPlaying = false;
      setButtons();
    }
  }

  async function playWord(index, activeRun) {
    const token = tokens[index];
    if (!token) return;
    markWord(index, "loading", true);

    try {
      const source = els.sourceSelect.value;
      if (source === "google") {
        const segment = await findGoogleSegment(index);
        if (activeRun !== runId) return;
        if (segment) {
          updateStatus(segment.label);
          await playAudioSegment(segment, activeRun);
          return;
        }
        updateStatus("Google Cloud音声なし");
      }

      if (source !== "speech") {
        const audio = await findPronunciationAudio(token, index);
        if (activeRun !== runId) return;
        if (audio) {
          updateStatus(audio.label);
          await playAudioUrl(audio.url, activeRun);
          return;
        }
        if (source === "library") {
          updateStatus("ライブラリ音声なし");
          markWord(index, "missing", true);
          return;
        }
      }

      updateStatus("ブラウザTTS");
      await speakWithBrowser(token, activeRun);
    } catch {
      if (activeRun !== runId) return;
      if (els.sourceSelect.value === "auto") {
        updateStatus("ブラウザTTSへ切替");
        await speakWithBrowser(token, activeRun);
      } else {
        markWord(index, "missing", true);
        updateStatus("音声を取得できません");
      }
    } finally {
      markWord(index, "loading", false);
    }
  }

  async function prefetchAhead(startIndex) {
    if (els.sourceSelect.value === "speech") return;
    if (els.sourceSelect.value === "google") return;
    const count = getPreloadCount();
    if (!count) return;

    const slice = tokens.slice(startIndex, startIndex + count);
    await Promise.allSettled(
      slice.map(async (token, index) => {
        const audio = await findPronunciationAudio(token, startIndex + index);
        if (!audio?.url || mediaPreloadCache.has(audio.url)) return;
        const preload = new Audio();
        preload.preload = "auto";
        preload.src = audio.url;
        preload.load();
        mediaPreloadCache.set(audio.url, preload);
      })
    );
  }

  async function findGoogleSegment(index) {
    const token = tokens[index];
    const apiKey = els.googleApiKeyInput.value.trim();
    if (!token || !apiKey) return null;

    const bundle = await getGoogleContextBundle(apiKey);
    return bundle?.segments[index] || null;
  }

  async function getGoogleContextBundle(apiKey) {
    const cacheKey = makeGoogleContextKey(apiKey);
    if (googleContextCache.has(cacheKey)) return googleContextCache.get(cacheKey);
    if (googleContextRequests.has(cacheKey)) return googleContextRequests.get(cacheKey);

    setAllWordAudioState("preloading");
    const request = synthesizeGoogleContext(apiKey)
      .then((bundle) => {
        googleContextCache.set(cacheKey, bundle);
        setAllWordAudioState("ready");
        return bundle;
      })
      .catch((error) => {
        setAllWordAudioState("missing");
        throw error;
      })
      .finally(() => {
        googleContextRequests.delete(cacheKey);
      });

    googleContextRequests.set(cacheKey, request);
    return request;
  }

  async function synthesizeGoogleContext(apiKey) {
    if (!tokens.length) return null;

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { ssml: buildMarkedSsml(getEditorText()) },
          voice: buildGoogleVoiceConfig(),
          audioConfig: { audioEncoding: "MP3" },
          enableTimePointing: ["SSML_MARK"],
        }),
      }
    );

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`Google Cloud TTS failed: ${response.status} ${message}`);
    }

    const data = await response.json();
    if (!data.audioContent) return null;

    const url = createAudioUrlFromBase64(data.audioContent, "audio/mpeg");
    const timepointMap = new Map(
      (data.timepoints || []).map((point) => [point.markName, point.timeSeconds])
    );
    const segments = tokens.map((token, index) => {
      const start = timepointMap.get(`w${index}`);
      if (typeof start !== "number") return null;

      let end = null;
      for (let nextIndex = index + 1; nextIndex < tokens.length; nextIndex += 1) {
        const nextStart = timepointMap.get(`w${nextIndex}`);
        if (typeof nextStart === "number") {
          end = Math.max(start, nextStart - 0.03);
          break;
        }
      }

      return {
        url,
        start,
        end,
        label: "Google Cloud TTS",
      };
    });

    return { url, segments };
  }

  function buildGoogleVoiceConfig() {
    const config = { languageCode: els.languageSelect.value };
    const voiceName = els.googleVoiceNameInput.value.trim();
    if (voiceName) config.name = voiceName;
    return config;
  }

  function buildMarkedSsml(text) {
    let ssml = "<speak>";
    let lastIndex = 0;
    let wordIndex = 0;

    for (const match of text.matchAll(wordPattern)) {
      const word = match[0];
      const start = match.index || 0;
      ssml += escapeSsml(text.slice(lastIndex, start));
      ssml += `<mark name="w${wordIndex}"/>`;
      ssml += escapeSsml(word);
      lastIndex = start + word.length;
      wordIndex += 1;
    }

    ssml += escapeSsml(text.slice(lastIndex));
    ssml += "</speak>";
    return ssml;
  }

  function escapeSsml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function createAudioUrlFromBase64(base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  }

  async function findPronunciationAudio(token, index) {
    const cacheKey = makeCacheKey(token);
    if (audioCache.has(cacheKey)) {
      syncAudioStateForKey(cacheKey);
      return audioCache.get(cacheKey);
    }
    if (audioRequests.has(cacheKey)) {
      setAudioStateForKey(cacheKey, "preloading");
      return audioRequests.get(cacheKey);
    }

    markWord(index, "preloading", true);
    setAudioStateForKey(cacheKey, "preloading");
    const request = (async () => {
      let result = null;
      if (token.lang.startsWith("ru")) {
        result = await lookupOpenRussian(token);
      }
      if (!result && token.lang.startsWith("en")) {
        result = await lookupDictionaryApi(token);
      }
      if (!result) {
        result = await lookupCommons(token);
      }

      audioCache.set(cacheKey, result);
      syncAudioStateForKey(cacheKey);
      return result;
    })();

    audioRequests.set(cacheKey, request);
    try {
      return await request;
    } finally {
      audioRequests.delete(cacheKey);
      markWord(index, "preloading", false);
      syncAudioStateForKey(cacheKey);
    }
  }

  async function lookupOpenRussian(token) {
    const word = normalizeWord(token.word);
    if (!word || !/^[а-яё-]+$/iu.test(word)) return null;

    const url = `https://api.openrussian.org/read/ru/${encodeURIComponent(word)}`;
    const canLoad = await probeAudioUrl(url);
    if (!canLoad) return null;

    return {
      url,
      label: "OpenRussian/Shtooka音声",
    };
  }

  function probeAudioUrl(url) {
    if (mediaPreloadCache.has(url)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const audio = new Audio();
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (result) mediaPreloadCache.set(url, audio);
        resolve(result);
      };
      const timer = window.setTimeout(() => finish(false), 4500);

      audio.preload = "metadata";
      audio.addEventListener("loadedmetadata", () => finish(true), { once: true });
      audio.addEventListener("canplaythrough", () => finish(true), { once: true });
      audio.addEventListener("error", () => finish(false), { once: true });
      audio.src = url;
      audio.load();
    });
  }

  async function lookupDictionaryApi(token) {
    const word = normalizeWord(token.word);
    if (!word || !/^[a-z][a-z'\-]*$/i.test(word)) return null;

    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
    );
    if (!response.ok) return null;

    const entries = await response.json();
    const phonetics = entries.flatMap((entry) => entry.phonetics || []);
    const preferred = preferDictionaryPronunciation(phonetics, token.lang);
    if (!preferred) return null;

    return {
      url: preferred.audio,
      label: token.lang === "en-GB" ? "辞書音声（UK）" : "辞書音声",
    };
  }

  function preferDictionaryPronunciation(phonetics, lang) {
    const withAudio = phonetics.filter((item) => item.audio);
    if (!withAudio.length) return null;
    const region = lang === "en-GB" ? "uk" : "us";
    return (
      withAudio.find((item) => item.audio.toLowerCase().includes(`-${region}.`)) ||
      withAudio.find((item) => item.audio.toLowerCase().includes(region)) ||
      withAudio[0]
    );
  }

  async function lookupCommons(token) {
    const word = normalizeWord(token.word);
    if (!word) return null;

    const languageHint = token.lang.startsWith("ru")
      ? 'intitle:"LL-Q7737"'
      : token.lang.startsWith("en")
        ? 'intitle:"LL-Q1860"'
        : "";
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      generator: "search",
      gsrnamespace: "6",
      gsrlimit: "8",
      gsrsearch: `${languageHint} intitle:"${word}" filetype:audio`,
      prop: "imageinfo",
      iiprop: "url|mime|extmetadata",
    });

    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    const pages = Object.values(data.query?.pages || {}).sort(
      (a, b) => (a.index || 0) - (b.index || 0)
    );
    const match = pages
      .map((page) => ({
        title: page.title || "",
        info: page.imageinfo?.[0],
      }))
      .find(({ title, info }) => info?.url && isLikelyWordAudio(title, word));

    if (!match) return null;
    return {
      url: match.info.url,
      label: token.lang.startsWith("ru") ? "Lingua Libre音声" : "Wikimedia音声",
    };
  }

  function isLikelyWordAudio(title, word) {
    const titleWord = title
      .replace(/^File:/i, "")
      .replace(/\.[^.]+$/, "")
      .split("-")
      .pop()
      .replace(/[!?.。、「」,;:()[\]{}]/g, "")
      .trim()
      .toLocaleLowerCase();
    return titleWord === word.toLocaleLowerCase();
  }

  function playAudioUrl(url, activeRun) {
    stopCurrentAudioOnly();
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        window.clearInterval(watcher);
        callback(value);
      };
      const watcher = window.setInterval(() => {
        if (activeRun !== runId) {
          audio.pause();
          finish(resolve);
        }
      }, 80);

      currentAudio = audio;
      audio.playbackRate = getSpeed();
      audio.addEventListener("ended", () => finish(resolve), { once: true });
      audio.addEventListener("error", (event) => finish(reject, event), { once: true });
      audio.play().catch((error) => finish(reject, error));
    });
  }

  function playAudioSegment(segment, activeRun) {
    stopCurrentAudioOnly();
    return new Promise((resolve, reject) => {
      const audio = new Audio(segment.url);
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        window.clearInterval(watcher);
        callback(value);
      };
      const watcher = window.setInterval(() => {
        const end = segment.end ?? audio.duration;
        if (activeRun !== runId) {
          audio.pause();
          finish(resolve);
        } else if (Number.isFinite(end) && audio.currentTime >= end) {
          audio.pause();
          finish(resolve);
        }
      }, 30);

      currentAudio = audio;
      audio.playbackRate = getSpeed();
      audio.addEventListener(
        "loadedmetadata",
        () => {
          audio.currentTime = segment.start;
          audio.play().catch((error) => finish(reject, error));
        },
        { once: true }
      );
      audio.addEventListener("error", (event) => finish(reject, event), { once: true });
      audio.addEventListener("ended", () => finish(resolve), { once: true });
    });
  }

  function speakWithBrowser(token, activeRun) {
    if (!("speechSynthesis" in window)) return Promise.reject(new Error("No speechSynthesis"));
    stopCurrentAudioOnly();
    speechSynthesis.cancel();

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(token.word);
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        window.clearInterval(watcher);
        callback(value);
      };
      const watcher = window.setInterval(() => {
        if (activeRun !== runId) {
          speechSynthesis.cancel();
          finish(resolve);
        }
      }, 80);

      utterance.lang = token.lang;
      utterance.rate = getSpeed();
      utterance.voice = selectVoice(token.lang);
      utterance.onend = () => finish(resolve);
      utterance.onerror = (event) => finish(reject, event);
      speechSynthesis.speak(utterance);
    });
  }

  function selectVoice(lang) {
    const selected = els.voiceSelect.value;
    if (selected) {
      const byName = browserVoices.find((voice) => voice.name === selected);
      if (byName) return byName;
    }
    return (
      browserVoices.find((voice) => voice.lang === lang) ||
      browserVoices.find((voice) => voice.lang.toLowerCase().startsWith(lang.slice(0, 2))) ||
      null
    );
  }

  function loadVoices() {
    if (!("speechSynthesis" in window)) {
      els.voiceSelect.innerHTML = '<option value="">ブラウザTTSを利用できません</option>';
      return;
    }

    browserVoices = speechSynthesis.getVoices();
    const current = savedSettings.voice || els.voiceSelect.value;
    els.voiceSelect.textContent = "";

    const auto = document.createElement("option");
    auto.value = "";
    auto.textContent = "言語に合わせて自動選択";
    els.voiceSelect.appendChild(auto);

    browserVoices
      .filter((voice) => /^(en|ru)/i.test(voice.lang))
      .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name))
      .forEach((voice) => {
        const option = document.createElement("option");
        option.value = voice.name;
        option.textContent = `${voice.lang} - ${voice.name}`;
        els.voiceSelect.appendChild(option);
      });

    if ([...els.voiceSelect.options].some((option) => option.value === current)) {
      els.voiceSelect.value = current;
    }
  }

  function pausePlayback() {
    runId += 1;
    isPlaying = false;
    stopCurrentAudioOnly();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    updateStatus("一時停止中");
    setButtons();
  }

  function stopPlayback() {
    runId += 1;
    isPlaying = false;
    stopCurrentAudioOnly();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    setButtons();
  }

  function stopCurrentAudioOnly() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.removeAttribute("src");
      currentAudio.load();
      currentAudio = null;
    }
  }

  function wait(milliseconds, activeRun) {
    if (!milliseconds) return Promise.resolve();
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = () => {
        if (activeRun !== runId || performance.now() - start >= milliseconds) {
          resolve();
          return;
        }
        window.setTimeout(tick, 40);
      };
      tick();
    });
  }

  function updateActiveWord() {
    els.textInput.querySelectorAll(".word-token").forEach((span) => {
      span.classList.toggle("active", Number(span.dataset.index) === currentIndex);
    });

    const token = tokens[currentIndex];
    els.currentWord.textContent = token ? token.word : "未選択";
    els.progressText.textContent = tokens.length ? `${currentIndex + 1} / ${tokens.length}` : "0 / 0";
    els.progressPanel.style.setProperty(
      "--progress",
      tokens.length ? `${((currentIndex + 1) / tokens.length) * 100}%` : "0%"
    );
    setButtons();
  }

  function scrollActiveWordIntoView() {
    els.textInput
      .querySelector(`[data-index="${currentIndex}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function markWord(index, className, enabled) {
    const span = els.textInput.querySelector(`[data-index="${index}"]`);
    if (span) span.classList.toggle(className, enabled);
  }

  function syncAllAudioStates() {
    tokens.forEach((token) => syncAudioStateForKey(makeCacheKey(token)));
  }

  function syncAudioStateForKey(cacheKey) {
    if (audioRequests.has(cacheKey)) {
      setAudioStateForKey(cacheKey, "preloading");
      return;
    }
    if (!audioCache.has(cacheKey)) {
      setAudioStateForKey(cacheKey, "pending");
      return;
    }
    setAudioStateForKey(cacheKey, audioCache.get(cacheKey) ? "ready" : "missing");
  }

  function setAudioStateForKey(cacheKey, state) {
    tokens.forEach((token, index) => {
      if (makeCacheKey(token) !== cacheKey) return;
      const span = els.textInput.querySelector(`[data-index="${index}"]`);
      if (!span) return;
      span.classList.remove("ready", "preloading", "missing");
      if (state !== "pending") span.classList.add(state);
    });
  }

  function setAllWordAudioState(state) {
    els.textInput.querySelectorAll(".word-token").forEach((span) => {
      span.classList.remove("ready", "preloading", "missing");
      if (state !== "pending") span.classList.add(state);
    });
  }

  function updateStatus(message) {
    els.sourceText.textContent = message;
    updateActiveWord();
  }

  function setButtons() {
    els.playButton.disabled = isPlaying;
    els.pauseButton.disabled = !isPlaying;
    els.prevButton.disabled = isPlaying || currentIndex <= 0 || !tokens.length;
    els.nextButton.disabled = isPlaying || currentIndex >= tokens.length - 1 || !tokens.length;
  }

  function normalizeWord(word) {
    return word
      .replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, "")
      .toLocaleLowerCase();
  }

  function makeCacheKey(token) {
    const word = els.normalizeToggle.checked ? normalizeWord(token.word) : token.word;
    return `${token.lang}:${word}`;
  }

  function makeGoogleContextKey(apiKey) {
    return [
      els.languageSelect.value,
      els.googleVoiceNameInput.value.trim(),
      apiKey,
      getEditorText(),
    ].join("\n");
  }

  function getSpeed() {
    return Number(els.speedRange.value);
  }

  function getDelay() {
    return Number(els.delayRange.value) * 1000;
  }

  function getPreloadCount() {
    return Number(els.preloadRange.value);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  init();
})();
