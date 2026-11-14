import { parseLrc, bestLine, formatTime } from "./lyrics.js";

const form = document.getElementById("form");
const qInput = document.getElementById("q");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = qInput.value.trim();
  if (!query) return;
  resultsEl.innerHTML = "";
  statusEl.textContent = "Searching…";
  try {
    const matches = await search(query);
    statusEl.textContent = matches.length ? "" : "No matches. Try adding the song title or artist.";
    for (const m of matches) resultsEl.append(await renderMatch(m));
  } catch (err) {
    statusEl.textContent = "Something went wrong: " + err.message;
  }
});

async function search(query) {
  const res = await fetch("https://lrclib.net/api/search?q=" + encodeURIComponent(query));
  if (!res.ok) throw new Error("lyrics search failed (" + res.status + ")");
  const tracks = await res.json();
  return tracks
    .filter((t) => t.syncedLyrics)
    .map((t) => {
      const lines = parseLrc(t.syncedLyrics);
      return { track: t, hit: bestLine(lines, query) };
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
  const start = hit ? Math.max(0, hit.time - 2) : 0; // lead in a little before the lyric
  const videoId = await findVideo(track);
  const link = linkFor(track, videoId, start);
  const text = `🎵 ${track.trackName} – ${track.artistName}` + (hit ? ` (${formatTime(hit.time)})` : "");

  li.innerHTML = `<div class="title"></div><div class="artist"></div><div class="line"></div><div class="actions"></div>`;
  li.querySelector(".title").textContent = track.trackName;
  li.querySelector(".artist").textContent = track.artistName;
  li.querySelector(".line").textContent = hit ? `“${hit.text}” at ${formatTime(hit.time)}` : "No exact lyric match";

  const actions = li.querySelector(".actions");
  const open = Object.assign(document.createElement("a"), { href: link, target: "_blank", rel: "noopener", textContent: "Play" });
  const share = Object.assign(document.createElement("button"), { className: "share", textContent: "Share" });
  share.addEventListener("click", async () => {
    if (navigator.share) {
      try { await navigator.share({ title: text, text, url: link }); } catch { /* cancelled */ }
    } else {
      location.href = "sms:&body=" + encodeURIComponent(`${text}\n${link}`);
    }
  });
  actions.append(open, share);
  return li;
}
