import { FFmpeg } from '@ffmpeg/ffmpeg';
import { captureDateFromLog, outputMetadata, parseDuration } from './metadata.js';
import { downloadBlob } from './download.js';

const SEGMENT_SECONDS = 115;
const INPUT = 'source.mp4';
const MAX_BYTES = 1_500_000_000; // Guardrail only; actual Android limit may be lower.

function checkExit(code, phase) {
  if (code !== 0) throw new Error(`${phase}に失敗しました（FFmpeg終了コード: ${code}）。`);
}

export async function splitVideo(file, onUpdate, onDiagnostic = () => {}) {
  const diagnostic = (phase, detail = '') => onDiagnostic(`[${new Date().toISOString()}] ${phase}${detail ? ': ' + detail : ''}`);
  diagnostic('開始', `name=${file.name}, size=${file.size}, type=${file.type || 'unknown'}, base=${import.meta.env.BASE_URL}, crossOriginIsolated=${self.crossOriginIsolated}`);
  if (!/\.mp4$/i.test(file.name) || (file.type && file.type !== 'video/mp4')) {
    throw new Error('MP4形式の動画を選択してください。');
  }
  if (file.size === 0) throw new Error('ファイルが空です。');
  if (file.size > MAX_BYTES) throw new Error('ファイルが大きすぎます。Androidのメモリ制限を考慮し、1.5GB以下で試してください。');

  const ffmpeg = new FFmpeg();
  const logs = [];
  ffmpeg.on('log', ({ message }) => { logs.push(message); if (logs.length > 250) logs.shift(); diagnostic('FFmpeg', message); });
  let loaded = false;
  let completed = 0;
  try {
    onUpdate({ status: 'FFmpegを読み込み中…', percent: 0, completed, total: 0 });
    const base = new URL(`${import.meta.env.BASE_URL}ffmpeg-core/`, window.location.origin).href;
    diagnostic('FFmpegロード開始', `${base}ffmpeg-core.js / ${base}ffmpeg-core.wasm`);
    try {
      await ffmpeg.load({ coreURL: `${base}ffmpeg-core.js`, wasmURL: `${base}ffmpeg-core.wasm` });
    } catch (e) {
      diagnostic('FFmpegロード失敗', `${e?.name || 'Error'}: ${e?.message || String(e)}\n${e?.stack || ''}`);
      throw new Error(`FFmpegの初期化に失敗しました: ${e?.message || String(e)}`);
    }
    diagnostic('FFmpegロード完了');
    loaded = true;
    onUpdate({ status: '元動画を読み込み中…', percent: 2, completed, total: 0 });
    // ffmpeg.wasm requires an in-memory copy of the entire input. This is the main memory risk.
    let inputBytes;
    try { inputBytes = new Uint8Array(await file.arrayBuffer()); }
    catch (e) { throw new Error(`動画ファイルの読み込みに失敗しました: ${e.message}`); }
    diagnostic('入力ファイル読み込み完了', `${inputBytes.byteLength} bytes`);
    await ffmpeg.writeFile(INPUT, inputBytes);
    diagnostic('FFmpeg仮想ファイル書き込み完了');
    inputBytes = null;

    logs.length = 0;
    // ffmpeg exits non-zero because no output is requested; stderr still provides metadata.
    await ffmpeg.exec(['-hide_banner', '-i', INPUT]);
    diagnostic('動画情報解析完了');
    const inputLog = logs.join('\n');
    const duration = parseDuration(inputLog);
    const original = captureDateFromLog(inputLog, file);
    const total = Math.ceil(duration / SEGMENT_SECONDS);
    const basename = file.name.replace(/\.mp4$/i, '') || 'video';

    for (let i = 0; i < total; i++) {
      const start = i * SEGMENT_SECONDS;
      const remaining = duration - start;
      const length = Math.min(SEGMENT_SECONDS, remaining);
      if (length <= 0) break;
      const filename = `${basename}_${String(i+1).padStart(3,'0')}.mp4`;
      const temp = `part_${String(i+1).padStart(3,'0')}.mp4`;
      const date = new Date(original.date.getTime() + start * 1000);
      const metadata = outputMetadata(date);
      onUpdate({ status: `${filename} を分割中…`, percent: Math.round(5 + 90*i/total), completed, total });
      try {
        // Stream copy: seeking is keyframe dependent; boundaries may drift/overlap.
        const code = await ffmpeg.exec([
          '-hide_banner', '-loglevel', 'error', '-ss', String(start), '-i', INPUT,
          '-t', String(length), '-map', '0:v:0', '-map', '0:a?', '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          '-metadata', `creation_time=${metadata.utc}`,
          '-metadata', `com.apple.quicktime.creationdate=${metadata.quicktime}`,
          '-movflags', '+use_metadata_tags+faststart', '-y', temp
        ]);
        diagnostic('分割コマンド終了', `code=${code}`);
        checkExit(code, '動画分割または日時メタデータの更新');
        const bytes = await ffmpeg.readFile(temp);
        if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new Error('分割動画が空です。');
        onUpdate({ status: `${filename} のダウンロードを開始中…`, percent: Math.round(5 + 90*(i+.85)/total), completed, total });
        await downloadBlob(bytes, filename);
      } finally {
        try { await ffmpeg.deleteFile(temp); } catch { /* file may not exist */ }
      }
      completed++;
      onUpdate({ status: `${filename} のダウンロード開始処理を実行しました。`, percent: Math.round(5 + 90*completed/total), completed, total });
    }
    onUpdate({ status: '処理完了。ダウンロード一覧を確認してください。', percent: 100, completed, total });
  } catch (error) {
    diagnostic('例外', `${error?.name || 'Error'}: ${error?.message || String(error)}\n${error?.stack || ''}`);
    if (error instanceof RangeError || /memory|allocation|out of bounds|OOM/i.test(String(error))) {
      throw new Error('メモリ不足の可能性があります。ほかのタブを閉じるか、容量の小さいMP4で試してください。');
    }
    throw error;
  } finally {
    if (loaded) {
      try { await ffmpeg.deleteFile(INPUT); } catch { /* ignore */ }
    }
    try { ffmpeg.terminate(); } catch { /* ignore */ }
  }
}
