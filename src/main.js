import './style.css';
import { splitVideo } from './video.js';
const $ = id => document.getElementById(id);
let selected = null;
let busy = false;
let diagnosticLines = [];
let previewUrl = null;
let completedCount = 0;
const record = line => { diagnosticLines.push(line); if (diagnosticLines.length > 300) diagnosticLines.shift(); };
$('copyLog').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(diagnosticLines.join('\n') || '診断ログはありません。'); $('copyLog').textContent = 'コピーしました'; }
  catch {
    $('diagnosticLog').hidden = false;
    $('diagnosticLog').value = diagnosticLines.join('\n');
    $('diagnosticLog').select();
    try { document.execCommand('copy'); $('copyLog').textContent = 'コピーしました'; }
    catch { $('copyLog').textContent = 'コピーに失敗しました'; }
    $('diagnosticLog').hidden = true;
  }
});
function setStep(step) {
  const order = ['loading', 'reading', 'processing', 'downloading', 'complete'];
  const current = order.indexOf(step);
  document.querySelectorAll('[data-step]').forEach(el => {
    const index = order.indexOf(el.dataset.step);
    el.classList.toggle('active', index === current);
    el.classList.toggle('passed', index < current);
  });
}
function reset() {
  $('errorSection').hidden = true;
  $('doneSection').hidden = true;
  $('progressSection').hidden = true;
  $('progress').value = 0;
  $('percent').textContent = '0%';
  $('count').textContent = '';
  $('start').disabled = !selected;
  completedCount = 0;
  setStep('loading');
}
$('file').addEventListener('change', event => {
  if (busy) return;
  selected = event.target.files?.[0] ?? null;
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  $('thumbnail').removeAttribute('src');
  $('thumbnail').load();
  $('preview').hidden = !selected;
  $('emptyFile').hidden = !!selected;
  $('videoDuration').textContent = '';
  if (selected) {
    $('filename').textContent = `${selected.name}（${(selected.size / 1024 / 1024).toFixed(1)} MB）`;
    previewUrl = URL.createObjectURL(selected);
    $('thumbnail').src = previewUrl;
  }
  reset();
});
$('thumbnail').addEventListener('loadedmetadata', () => {
  const video = $('thumbnail');
  if (Number.isFinite(video.duration)) {
    const s = Math.floor(video.duration);
    $('videoDuration').textContent = `長さ ${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`;
  }
  try { video.currentTime = Math.min(1, Math.max(0, video.duration / 2)); } catch { /* preview optional */ }
});
$('retry').addEventListener('click', reset);
$('start').addEventListener('click', async () => {
  if (!selected || busy) return;
  busy = true;
  diagnosticLines = [];
  $('copyLog').textContent = '診断ログをコピー';
  $('start').disabled = true;
  $('file').disabled = true;
  $('errorSection').hidden = true;
  $('doneSection').hidden = true;
  $('progressSection').hidden = false;
  setStep('loading');
  try {
    await splitVideo(selected, ({ status, percent, completed, total }) => {
      $('progress').value = percent;
      $('percent').textContent = `${percent}%`;
      completedCount = completed;
      $('count').textContent = total ? `${total}ファイルに分割` : '';
      $('status').textContent = status;
      const phase = percent === 100 ? 'complete' : /ダウンロード/.test(status) ? 'downloading' : /分割中/.test(status) ? 'processing' : /読み込み中/.test(status) ? 'reading' : 'loading';
      setStep(phase);
    }, record);
    $('doneCount').textContent = `${completedCount}ファイルに分割しました。`;
    $('doneSection').hidden = false;
  } catch (error) {
    record(`[${new Date().toISOString()}] UI例外: ${error?.stack || error?.message || String(error)}`);
    $('errorSection').hidden = false;
    $('errorMessage').textContent = error?.message || '処理中にエラーが発生しました。';
    $('errorReason').textContent = '保存済みのファイルはそのまま残ります。原因が不明な場合は、動画形式・空きメモリ・Chromeのダウンロード許可を確認してください。';
  } finally {
    busy = false;
    $('file').disabled = false;
    $('start').disabled = false;
  }
});
