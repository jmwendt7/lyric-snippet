export function parseLrc(lrc) {
  const lines = [];
  for (const raw of lrc.split("\n")) {
    const m = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (m && m[3]) lines.push({ time: Number(m[1]) * 60 + Number(m[2]), text: m[3] });
  }
  return lines;
}

const tokens = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);

// Returns the lyric line sharing the most words with the query, or null if under 50% overlap.
export function bestLine(lines, query) {
  const q = new Set(tokens(query));
  if (!q.size) return null;
  let best = null;
  for (const line of lines) {
    const lt = new Set(tokens(line.text));
    let common = 0;
    for (const t of q) if (lt.has(t)) common++;
    const score = common / q.size;
    if (!best || score > best.score) best = { ...line, score };
  }
  return best && best.score >= 0.5 ? best : null;
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
