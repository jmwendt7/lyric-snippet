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

async function findVideo(track) {
  const q = `${track.artistName} ${track.trackName}`;
  const key = window.YT_API_KEY;
  if (!key) return null;
  const url = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=" +
    encodeURIComponent(q) + "&key=" + key;
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
  const videoId = await findVideo(track);
  const lines = parseLrc(track.syncedLyrics);
  let picked = hit ? { time: hit.time, text: hit.text } : null;

  li.innerHTML = `<div class="title"></div><div class="artist"></div><div class="line"></div><div class="actions"></div><ul class="lyrics" hidden></ul>`;
  li.querySelector(".title").textContent = track.trackName;
  li.querySelector(".artist").textContent = track.artistName;
  const lineEl = li.querySelector(".line");
  const lyricsEl = li.querySelector(".lyrics");

  const currentLink = () => linkFor(track, videoId, picked ? Math.max(0, picked.time - 2) : 0); // lead in a little
  const currentText = () => `🎵 ${track.trackName} – ${track.artistName}` + (picked ? ` (${formatTime(picked.time)})` : "");
  const refresh = () => {
    lineEl.textContent = picked ? `“${picked.text}” at ${formatTime(picked.time)}` : "No lyric match. Tap “Lyrics” and pick a line.";
    play.href = currentLink();
  };

  const actions = li.querySelector(".actions");
  const play = Object.assign(document.createElement("a"), { target: "_blank", rel: "noopener", textContent: "Play" });
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
    });
    lyricsEl.append(row);
  }
  toggle.addEventListener("click", () => {
    lyricsEl.hidden = !lyricsEl.hidden;
    toggle.textContent = lyricsEl.hidden ? "Lyrics" : "Hide lyrics";
  });
  share.addEventListener("click", async () => {
    const text = currentText(), url = currentLink();
    if (navigator.share) {
      try { await navigator.share({ title: text, text, url }); } catch { /* cancelled */ }
    } else {
      location.href = "sms:&body=" + encodeURIComponent(`${text}\n${url}`);
    }
  });
  actions.append(play, toggle, share);
  refresh();
  return li;
}
