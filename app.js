import { parseLrc, bestLine, formatTime } from "./lyrics.js";

const form = document.getElementById("form");
const qInput = document.getElementById("q");
const songInput = document.getElementById("song");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = qInput.value.trim();
  if (!query) return;
  resultsEl.innerHTML = "";
  statusEl.textContent = "Searching…";
  try {
    const matches = await search(query, songInput.value.trim());
    statusEl.textContent = matches.length ? "" : "No matches. Try adding the song title or artist.";
    for (const m of matches) resultsEl.append(await renderMatch(m));
  } catch (err) {
    statusEl.textContent = "Something went wrong: " + err.message;
  }
});

async function fetchTracks(q) {
  const res = await fetch("https://lrclib.net/api/search?q=" + encodeURIComponent(q));
  if (!res.ok) throw new Error("lyrics search failed (" + res.status + ")");
  return res.json();
}

async function search(lyric, song) {
  // LRCLIB only indexes titles/artists, so search by the song text when given, else the lyric itself
  const tracks = await fetchTracks(song || lyric);
  const seen = new Set();
  return tracks
    .filter((t) => t.syncedLyrics)
    .map((t) => ({ track: t, hit: bestLine(parseLrc(t.syncedLyrics), lyric) }))
    .filter(({ track }) => {
      const k = (track.artistName + track.trackName).toLowerCase();
      return seen.has(k) ? false : (seen.add(k), true);
    })
    .sort((a, b) => (b.hit?.score ?? 0) - (a.hit?.score ?? 0))
    .slice(0, 5);
}

const videoCache = JSON.parse(localStorage.getItem("videoCache") || "{}");
const offsets = JSON.parse(localStorage.getItem("offsets") || "{}");

async function findVideo(track) {
  const q = `${track.artistName} ${track.trackName}`;
  const key = window.YT_API_KEY;
  if (!key) return null;
  if (videoCache[q]) return videoCache[q];
  const id = await fetchVideo(q, key);
  if (id) {
    videoCache[q] = id;
    localStorage.setItem("videoCache", JSON.stringify(videoCache));
  }
  return id;
}

async function fetchVideo(q, key) {
  // "official audio" uploads usually lack the music-video intro, so they line up with LRCLIB times
  const url = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=" +
    encodeURIComponent(q + " official audio") + "&key=" + key;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.items?.[0]?.id?.videoId ?? null;
}

function linkFor(track, videoId, seconds) {
  if (videoId) return `https://youtu.be/${videoId}?t=${Math.max(0, Math.floor(seconds))}`;
  return "https://www.youtube.com/results?search_query=" + encodeURIComponent(`${track.artistName} ${track.trackName}`);
}

async function renderMatch({ track, hit }) {
  const li = document.createElement("li");
  let videoId = null;
  const lines = parseLrc(track.syncedLyrics);
  let picked = hit ? { time: hit.time, text: hit.text } : null;

  li.innerHTML = `<div class="title"></div><div class="artist"></div><div class="line"></div><div class="actions"></div><div class="preview" hidden><iframe allow="autoplay; encrypted-media" allowfullscreen></iframe><div class="offset"><button data-d="-5">−5s</button><button data-d="-1">−1s</button><span></span><button data-d="1">+1s</button><button data-d="5">+5s</button></div><p class="hint">Out of sync? Nudge until the lyric lines up, then Share.</p></div><ul class="lyrics" hidden></ul>`;
  li.querySelector(".title").textContent = track.trackName;
  li.querySelector(".artist").textContent = track.artistName;
  const lineEl = li.querySelector(".line");
  const lyricsEl = li.querySelector(".lyrics");

  const offsetKey = `${track.artistName} ${track.trackName}`;
  const startTime = () => Math.max(0, (picked ? picked.time - 2 : 0) + (offsets[offsetKey] || 0)); // lead in a little
  const currentLink = () => linkFor(track, videoId, startTime());
  const previewEl = li.querySelector(".preview");
  const frame = previewEl.querySelector("iframe");
  const offsetLabel = previewEl.querySelector(".offset span");
  const loadPreview = () => {
    offsetLabel.textContent = `${(offsets[offsetKey] || 0) > 0 ? "+" : ""}${offsets[offsetKey] || 0}s`;
    frame.src = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(startTime())}&autoplay=1&playsinline=1`;
  };
  const currentText = () => `🎵 ${track.trackName} – ${track.artistName}` + (picked ? ` (${formatTime(picked.time)})` : "");
  const refresh = () => {
    lineEl.textContent = picked ? `“${picked.text}” at ${formatTime(picked.time)}` : "No lyric match. Tap “Lyrics” and pick a line.";
  };

  const actions = li.querySelector(".actions");
  const play = Object.assign(document.createElement("button"), { textContent: "Play" });
  const toggle = Object.assign(document.createElement("button"), { textContent: "Lyrics" });
  const share = Object.assign(document.createElement("button"), { className: "share", textContent: "Share" });

  for (const l of lines) {
    const row = document.createElement("li");
    row.textContent = l.text;
    row.addEventListener("click", () => {
      picked = { time: l.time, text: l.text };
      lyricsEl.querySelectorAll(".sel").forEach((e) => e.classList.remove("sel"));
      row.classList.add("sel");
      refresh();
      if (!previewEl.hidden) loadPreview();
    });
    lyricsEl.append(row);
  }
  toggle.addEventListener("click", () => {
    lyricsEl.hidden = !lyricsEl.hidden;
    toggle.textContent = lyricsEl.hidden ? "Lyrics" : "Hide lyrics";
  });
  // The YouTube lookup happens only here, on demand, to save quota.
  const resolveVideo = async () => { videoId = videoId || (await findVideo(track)); };
  play.addEventListener("click", async () => {
    await resolveVideo();
    if (!videoId) { window.open(currentLink(), "_blank"); return; }
    previewEl.hidden = false;
    loadPreview();
  });
  previewEl.querySelectorAll("[data-d]").forEach((b) => b.addEventListener("click", () => {
    offsets[offsetKey] = (offsets[offsetKey] || 0) + Number(b.dataset.d);
    localStorage.setItem("offsets", JSON.stringify(offsets));
    loadPreview();
  }));
  share.addEventListener("click", async () => {
    await resolveVideo();
    const text = currentText(), url = currentLink();
    if (navigator.share) {
      try { await navigator.share({ title: text, text, url }); }
      catch (err) {
        // iOS can reject share after the async lookup; the video is now cached, so a second tap works
        if (err.name === "NotAllowedError") share.textContent = "Tap again to share";
      }
    } else {
      location.href = "sms:&body=" + encodeURIComponent(`${text}\n${url}`);
    }
  });
  actions.append(play, toggle, share);
  refresh();
  return li;
}
