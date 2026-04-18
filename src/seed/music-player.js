const DEFAULT_MUSIC_TRACKS = [
  {
    id: "laser-heartbeat",
    title: "Laser Heartbeat (MySpace Cut)",
    artist: "DJ Away Message",
    url: "https://actions.google.com/sounds/v1/alarms/beep_short.ogg",
    duration: "0:07"
  },
  {
    id: "glitch-love-anthem",
    title: "Glitch Love Anthem",
    artist: "Y2K Coder",
    url: "https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg",
    duration: "0:18"
  },
  {
    id: "neon-midnight-run",
    title: "Neon Midnight Run",
    artist: "Pixel Crush",
    url: "https://www.w3schools.com/html/horse.ogg",
    duration: "0:14"
  },
  {
    id: "aim-notification-symphony",
    title: "AIM Notification Symphony",
    artist: "PDA Lounge",
    url: "https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg",
    duration: "2:52"
  },
  {
    id: "ctrl-alt-del-heart",
    title: "Ctrl+Alt+Del My Heart",
    artist: "Neon Ghost",
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
    duration: "0:40"
  }
];

const musicStateByPlayer = new WeakMap();
const TRACK_CLASS = "music-track-item";
const ACTIVE_TRACK_CLASS = "is-active";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safeText(value) {
  return typeof value === "string" ? value : "";
}

function sanitizeTrackId(value) {
  return safeText(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-");
}

function nextUniqueTrackId(base, index, usedIds) {
  let candidate = base;
  if (!candidate) {
    candidate = `track-${index + 1}`;
  }
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function ensureTrackState(player) {
  let state = musicStateByPlayer.get(player);
  if (!state) {
    state = {
      tracks: [],
      currentIndex: -1,
      isBound: false
    };
    musicStateByPlayer.set(player, state);
  }
  return state;
}

function slug(value, index, used) {
  const base = safeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 36) || "track";
  let candidate = `${base}-${index + 1}`;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${index + 1}-${i}`;
    i += 1;
  }
  used.add(candidate);
  return candidate;
}

function normalizeDuration(value) {
  if (!safeText(value)) {
    return "";
  }
  const trimmed = value.trim();
  return /^\d{1,3}:\d{2}$/.test(trimmed) ? trimmed : "";
}

function normalizeTrack(rawTrack, index, usedIds = new Set(), options = {}) {
  const track = {
    id: safeText(rawTrack.id).trim(),
    title: safeText(rawTrack.title).trim() || "Unknown track",
    artist: safeText(rawTrack.artist).trim() || "Unknown artist",
    url: safeText(rawTrack.url).trim(),
    duration: normalizeDuration(rawTrack.duration)
  };

  if (!track.url) {
    throw new Error("Each track must include a playable audio URL.");
  }

  const preserveId = safeText(options.preserveId).trim();
  if (!track.id) {
    track.id = slug(track.title, index, usedIds);
  } else {
    const desiredId = sanitizeTrackId(track.id) || track.id || "";
    if (preserveId) {
      usedIds.delete(sanitizeTrackId(preserveId));
    }

    track.id = desiredId ? desiredId : sanitizeTrackId(track.title) || `track-${index + 1}`;
    if (usedIds.has(track.id)) {
      track.id = nextUniqueTrackId(track.id, index, usedIds);
    }
    usedIds.add(track.id);
  }

  return track;
}

function normalizeTrackList(tracks) {
  const source = Array.isArray(tracks) ? tracks : [];
  const usedIds = new Set();
  const normalized = [];

  for (let i = 0; i < source.length; i += 1) {
    normalized.push(normalizeTrack(source[i], i, usedIds));
  }

  return normalized;
}

function getPlayer(player = document.getElementById("agent-world")) {
  return player ? player.querySelector(".music-player") : null;
}

function formatDurationFromSeconds(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return "--:--";
  }
  const totalSeconds = Math.floor(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function trackMarkup(track, index, active) {
  const activeClass = active ? ` ${ACTIVE_TRACK_CLASS}` : "";
  const duration = track.duration || "--:--";
  return `<button type="button" class="${TRACK_CLASS}${activeClass}" data-track-index="${index}" data-track-id="${escapeAttribute(track.id)}" data-track-url="${escapeAttribute(track.url)}" data-track-title="${escapeAttribute(track.title)}" data-track-artist="${escapeAttribute(track.artist)}" data-track-duration="${escapeAttribute(duration)}" aria-pressed="${active ? "true" : "false"}"><span><span class="track-num">${index + 1}.</span> ${escapeHtml(track.title)}</span> <span class="track-meta">${escapeHtml(track.artist)}</span> <span class="track-dur">${duration}</span></button>`;
}

function getAudio(player) {
  return player ? player.querySelector("audio") : null;
}

function getTrackList(player) {
  return player ? player.querySelector(".track-list") : null;
}

function getNowPlaying(player) {
  if (!player) return null;
  return {
    title: player.querySelector(".now-playing-track-title"),
    artist: player.querySelector(".now-playing-track-artist")
  };
}

function getStateFromDom(player) {
  const state = ensureTrackState(player);
  if (state.tracks.length === 0) {
    const trackNodes = Array.from((getTrackList(player) || {}).querySelectorAll?.(`.${TRACK_CLASS}`) || []);
    const domTracks = trackNodes.map((node, index) => ({
      id: safeText(node.getAttribute("data-track-id")) || `track-${index + 1}`,
      title: safeText(node.getAttribute("data-track-title")) || "Unknown track",
      artist: safeText(node.getAttribute("data-track-artist")) || "Unknown artist",
      url: safeText(node.getAttribute("data-track-url")),
      duration: safeText(node.getAttribute("data-track-duration"))
    }));
    if (domTracks.length) {
      state.tracks = normalizeTrackList(domTracks);
      state.currentIndex = 0;
    }
  }
  return state;
}

function renderTrackList(player, tracks, activeIndex) {
  const trackList = getTrackList(player);
  if (!trackList) return;
  if (!tracks.length) {
    trackList.innerHTML = "<p class=\"track-empty\">No tracks available.</p>";
    return;
  }

  trackList.innerHTML = tracks
    .map((track, index) => trackMarkup(track, index, index === activeIndex))
    .join("");
}

function updateNowPlayingUI(player, state) {
  const now = getNowPlaying(player);
  if (!now || !now.title || !now.artist) {
    return;
  }

  if (state.currentIndex < 0 || state.currentIndex >= state.tracks.length) {
    now.title.textContent = "No track selected";
    now.artist.textContent = "Add a track to start listening";
    return;
  }

  const track = state.tracks[state.currentIndex];
  now.title.textContent = track.title;
  now.artist.textContent = track.artist;
}

function updateProgress(player) {
  if (!player) return;
  const audio = getAudio(player);
  const fill = player.querySelector(".progress-fill");
  if (!audio || !fill) return;

  if (!audio.duration || Number.isNaN(audio.duration)) {
    fill.style.width = "0%";
    return;
  }
  fill.style.width = `${Math.min(100, (audio.currentTime / audio.duration) * 100)}%`;
}

function syncCurrentTrackDurations(player, state) {
  const audio = getAudio(player);
  const currentTrack = state.currentIndex >= 0 ? state.tracks[state.currentIndex] : null;
  if (!audio || !currentTrack || currentTrack.duration) return;
  if (!audio.duration || Number.isNaN(audio.duration)) return;

  const label = formatDurationFromSeconds(audio.duration);
  const row = player.querySelector(`[data-track-index="${state.currentIndex}"] .track-dur`);
  if (row) {
    row.textContent = label;
  }
  currentTrack.duration = label;
}

function setAudioSource(player, state) {
  const audio = getAudio(player);
  if (!audio) return;
  if (state.currentIndex < 0 || state.currentIndex >= state.tracks.length) {
    audio.removeAttribute("src");
    audio.removeAttribute("data-track-id");
    return;
  }

  const track = state.tracks[state.currentIndex];
  audio.src = track.url;
  audio.dataset.trackId = track.id;
  audio.load();
}

function selectTrack(player, state, targetIndex, options = {}) {
  if (!state.tracks.length) return false;
  let index = Number.parseInt(targetIndex, 10);
  if (!Number.isFinite(index)) index = 0;
  const count = state.tracks.length;
  if (count === 0) {
    state.currentIndex = -1;
    return false;
  }
  if (index < 0) index = count - 1;
  if (index >= count) index = 0;

  state.currentIndex = index;
  const isActiveTrack = (i) => (i === index ? "true" : "false");
  const trackList = getTrackList(player);
  if (trackList) {
    Array.from(trackList.querySelectorAll(`.${TRACK_CLASS}`)).forEach((button, i) => {
      if (isActiveTrack(i) === "true") {
        button.classList.add(ACTIVE_TRACK_CLASS);
        button.setAttribute("aria-pressed", "true");
      } else {
        button.classList.remove(ACTIVE_TRACK_CLASS);
        button.setAttribute("aria-pressed", "false");
      }
    });
  }

  updateNowPlayingUI(player, state);
  setAudioSource(player, state);
  syncCurrentTrackDurations(player, state);
  updateProgress(player);

  if (options.autoplay) {
    const audio = getAudio(player);
    if (audio) {
      audio.play().catch(() => {});
    }
  }
  return true;
}

function bindEvents(player, state) {
  if (state.isBound) return;
  const audio = getAudio(player);
  if (!audio) return;

  const prev = player.querySelector("[data-music-action='previous']");
  const play = player.querySelector("[data-music-action='play']");
  const pause = player.querySelector("[data-music-action='pause']");
  const next = player.querySelector("[data-music-action='next']");
  const trackList = getTrackList(player);

  if (prev) {
    prev.addEventListener("click", () => selectTrack(player, state, state.currentIndex - 1, { autoplay: true }));
  }
  if (next) {
    next.addEventListener("click", () => selectTrack(player, state, state.currentIndex + 1, { autoplay: true }));
  }
  if (play) {
    play.addEventListener("click", () => {
      if (!audio.src && state.tracks.length) {
        selectTrack(player, state, 0, { autoplay: true });
      } else if (audio.src) {
        audio.play().catch(() => {});
      }
    });
  }
  if (pause) {
    pause.addEventListener("click", () => {
      if (!audio.paused) {
        audio.pause();
      }
    });
  }
  if (trackList) {
    trackList.addEventListener("click", (event) => {
      const target = event.target.closest(`.${TRACK_CLASS}`);
      if (!target || !trackList.contains(target)) return;
      const index = Number.parseInt(target.getAttribute("data-track-index"), 10);
      if (Number.isFinite(index)) {
        selectTrack(player, state, index, { autoplay: true });
      }
    });
  }

  audio.addEventListener("timeupdate", () => updateProgress(player));
  audio.addEventListener("ended", () => {
    selectTrack(player, state, state.currentIndex + 1, { autoplay: true });
  });
  audio.addEventListener("loadedmetadata", () => syncCurrentTrackDurations(player, state));
  state.isBound = true;
}

function rebuildPlayer(player, tracks, options = {}) {
  const state = getStateFromDom(player);
  if (tracks) {
    state.tracks = normalizeTrackList(tracks);
  }
  if (state.currentIndex < 0 || state.currentIndex >= state.tracks.length) {
    state.currentIndex = state.tracks.length ? 0 : -1;
  }
  if (typeof options.currentIndex === "number" && Number.isFinite(options.currentIndex)) {
    state.currentIndex = options.currentIndex;
  }

  renderTrackList(player, state.tracks, state.currentIndex);
  updateNowPlayingUI(player, state);
  setAudioSource(player, state);
  if (state.currentIndex >= 0) {
    selectTrack(player, state, state.currentIndex, { autoplay: false });
  } else {
    updateProgress(player);
  }
  bindEvents(player, state);
  return state;
}

export function buildMusicPlayerHtml(tracks = DEFAULT_MUSIC_TRACKS) {
  const safeTracks = normalizeTrackList(tracks);
  const firstTrack = safeTracks[0] || { title: "No tracks yet", artist: "" };
  const renderedTracks = safeTracks
    .map((track, index) => trackMarkup(track, index, index === 0))
    .join("");

  return `
    <div class="music-player">
      <div class="track">
        <strong>Now Playing:</strong><br>
        <span class="now-playing-track-title">${escapeHtml(firstTrack.title)}</span>
        <small class="now-playing-track-artist">${escapeHtml(firstTrack.artist)}</small>
      </div>

      <audio class="music-audio" preload="metadata"></audio>

      <div class="progress-bar">
        <div class="progress-fill"></div>
      </div>

      <div class="track-list">
        ${renderedTracks || "<p class=\"track-empty\">No tracks available.</p>"}
      </div>

      <div class="player-controls">
        <button type="button" data-music-action="previous">&#9198;</button>
        <button type="button" data-music-action="play">&#9654;</button>
        <button type="button" data-music-action="pause">&#10074;&#10074;</button>
        <button type="button" data-music-action="next">&#9197;</button>
      </div>

      <small class=\"music-helper\">Real audio playback via HTML5.</small>
    </div>
  `;
}

export function initializeMusicPlayer(agentWorld = document.getElementById("agent-world"), options = {}) {
  const player = getPlayer(agentWorld);
  if (!player) {
    return { ok: false, error: "Music player container not found." };
  }

  const tracks = options.tracks || null;
  const state = rebuildPlayer(player, tracks, options);
  return {
    ok: true,
    tracks: state.tracks,
    currentIndex: state.currentIndex
  };
}

export function manageMusicTracks(agentWorld = document.getElementById("agent-world"), args = {}) {
  const player = getPlayer(agentWorld);
  if (!player) {
    return JSON.stringify({ ok: false, error: "Music player container not found." });
  }

  const action = safeText(args.action).trim().toLowerCase();
  const state = getStateFromDom(player);
  const current = state.tracks;
  let result;

  try {
    if (action === "set_tracks") {
      const next = normalizeTrackList(args.tracks || []);
      state.tracks = next;
      state.currentIndex = next.length ? 0 : -1;
      result = { ok: true, action: "set_tracks", count: next.length };
    } else if (action === "add_track") {
      const added = normalizeTrack(
        args.track || {},
        current.length,
        new Set(current.map((track) => track.id))
      );
      current.push(added);
      if (state.currentIndex < 0) state.currentIndex = 0;
      result = { ok: true, action: "add_track", track: added };
    } else if (action === "update_track") {
      const trackId = safeText(args.track_id);
      const update = args.updates || {};
      if (!trackId) {
        return JSON.stringify({ ok: false, error: "track_id is required for update_track." });
      }
      const index = current.findIndex((track) => track.id === trackId);
      if (index === -1) {
        return JSON.stringify({ ok: false, error: `Track not found: ${trackId}` });
      }
      const merged = Object.assign({}, current[index], update);
      current[index] = normalizeTrack(
        merged,
        index,
        new Set(current.map((track) => track.id)),
        { preserveId: current[index].id }
      );
      result = { ok: true, action: "update_track", track: current[index], index };
    } else if (action === "remove_track") {
      const trackId = safeText(args.track_id);
      if (!trackId) {
        return JSON.stringify({ ok: false, error: "track_id is required for remove_track." });
      }
      const index = current.findIndex((track) => track.id === trackId);
      if (index === -1) {
        return JSON.stringify({ ok: false, error: `Track not found: ${trackId}` });
      }
      const removed = current[index];
      current.splice(index, 1);
      if (current.length === 0) {
        state.currentIndex = -1;
      } else if (state.currentIndex >= index) {
        state.currentIndex = Math.max(0, state.currentIndex - 1);
      }
      result = { ok: true, action: "remove_track", removed };
    } else if (action === "clear_tracks") {
      state.tracks = [];
      state.currentIndex = -1;
      result = { ok: true, action: "clear_tracks" };
    } else {
      return JSON.stringify({ ok: false, error: `Unknown action: ${action}` });
    }
  } catch (error) {
    return JSON.stringify({ ok: false, error: error.message || "Invalid track operation." });
  }

  rebuildPlayer(player, state.tracks, { currentIndex: state.currentIndex });
  return JSON.stringify(result);
}

export { DEFAULT_MUSIC_TRACKS };
