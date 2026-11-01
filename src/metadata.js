/** Extracts the most plausible original recording time from ffmpeg's input metadata output. */
export function captureDateFromLog(log, file) {
  const lines = log.split(/\r?\n/);
  const tags = [];
  for (const line of lines) {
    const m = line.match(/\b(?:creation_time|com\.apple\.quicktime\.creationdate)\s*:\s*(.+?)\s*$/i);
    if (m) tags.push({ key: line.toLowerCase().includes('quicktime') ? 'quicktime' : 'creation', value: m[1].trim() });
  }
  tags.sort((a,b) => (a.key === 'quicktime' ? -1 : 1) - (b.key === 'quicktime' ? -1 : 1));
  for (const tag of tags) {
    let text = tag.value;
    // MP4 timestamps normally represent UTC; naive QuickTime creationdate is treated as local.
    if (tag.key === 'creation' && !/(?:Z|[+-]\d\d:?\d\d)$/i.test(text)) text += 'Z';
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return { date, source: tag.key };
  }
  return { date: new Date(file.lastModified), source: 'lastModified' };
}

export function outputMetadata(date) {
  const utc = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const pad = n => String(n).padStart(2, '0');
  const local = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const minutes = -date.getTimezoneOffset();
  const offset = `${minutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutes)/60))}:${pad(Math.abs(minutes)%60)}`;
  return { utc, quicktime: local + offset };
}

export function parseDuration(log) {
  const m = log.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error('動画の再生時間を取得できませんでした。');
  const seconds = Number(m[1])*3600 + Number(m[2])*60 + Number(m[3]);
  if (!(seconds > 0 && Number.isFinite(seconds))) throw new Error('動画の再生時間が不正です。');
  return seconds;
}
