import './style.css';
import { splitVideo } from './video.js';
const $ = id => document.getElementById(id);
let selected = null;
let selectedBuffer = null;
let busy = false;
let diagnosticLines = [];
let previewUrl = null;
let completedCount = 0;
let retainedParts = [];
const discardParts = () => { retainedParts = []; $('partsList').replaceChildren(); $('shareSection').hidden = true; $('shareStatus').textContent = ''; };
function renderParts() {
  $('partsList').replaceChildren();
  retainedParts.forEach((file, index) => {
    const row = document.createElement('label'); row.className = 'part-row';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = true; check.value = String(index);
    const name = document.createElement('span'); name.textContent = `${file.name} (${(file.size / 1048576).toFixed(1)} MB)`;
    row.append(check, name); $('partsList').append(row);
  });
  $('shareSection').hidden = false;
}
$('discard').addEventListener('click', () => { discardParts(); $('doneHint').textContent = '分割データを破棄しました。'; });
$('share').addEventListener('click', async () => {
  const files = [...$('partsList').querySelectorAll('input:checked')].map(el => retainedParts[Number(el.value)]);
  record(`[${new Date().toISOString()}] 共有選択: ${files.length}件, 合計=${files.reduce((n, f) => n + f.size, 0)} bytes`);
  if (!files.length) { $('shareStatus').textContent = '共有する動画を選択してください。'; return; }
  if (!navigator.share || !navigator.canShare?.({ files })) { record(`[${new Date().toISOString()}] 共有不可: navigator.share=${!!navigator.share}, canShare=${!!navigator.canShare}, count=${files.length}`); $('shareStatus').textContent = 'この端末では選択したファイルを共有できません。動画の数を減らすか、ダウンロード方式を利用してください。'; return; }
  const policy = document.permissionsPolicy || document.featurePolicy;
  const policyAllowed = policy?.allowsFeature?.('web-share');
  record(`[${new Date().toISOString()}] 共有環境: secure=${window.isSecureContext}, topLevel=${window.top === window.self}, userActivation=${navigator.userActivation?.isActive ?? 'unknown'}, webSharePolicy=${policyAllowed ?? 'unknown'}, visibility=${document.visibilityState}, ua=${navigator.userAgent}`);
  if (policyAllowed === false) {
    $('shareStatus').textContent = 'このページを開いているアプリが共有機能を禁止しています。URLをコピーしてAndroid版Chromeで直接開いてください。';
    return;
  }
  $('share').disabled = true;
  try { record(`[${new Date().toISOString()}] Android共有開始`); await navigator.share({ files }); record(`[${new Date().toISOString()}] Android共有API完了（アップロード成功を意味しません）`); $('shareStatus').textContent = '共有画面に渡しました。みてねでアップロード完了を確認してから「分割データを破棄」を押してください。'; }
  catch (e) {
    record(`[${new Date().toISOString()}] Android共有例外: ${e?.name}: ${e?.message}`);
    $('shareStatus').textContent = e.name === 'AbortError' ? '共有をキャンセルしました。' : e.name === 'NotAllowedError'
      ? 'ブラウザが共有を拒否しました。Android版ChromeでURLを直接開いて再試行してください。改善しない場合は診断ログを送ってください。'
      : `共有できませんでした: ${e.message}`;
  }
  finally { $('share').disabled = false; }
});
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
  discardParts();
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
  selectedBuffer = null;
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  $('thumbnail').removeAttribute('src');
  $('thumbnail').load();
  $('preview').hidden = !selected;
  $('emptyFile').hidden = !!selected;
  $('videoDuration').textContent = '';
  if (selected) {
    const pickedFile = selected;
    record(`[${new Date().toISOString()}] ファイル選択: ${pickedFile.name}, size=${pickedFile.size}`);
    // Android's content URI can expire after the picker closes. Read immediately.
    pickedFile.arrayBuffer().then(buffer => {
      if (selected !== pickedFile) return;
      selectedBuffer = buffer;
      record(`[${new Date().toISOString()}] 選択直後の読み込み成功: ${buffer.byteLength} bytes`);
    }).catch(error => {
      if (selected !== pickedFile) return;
      record(`[${new Date().toISOString()}] 選択直後の読み込み失敗: ${error?.name}: ${error?.message}`);
    });
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
  // Release the preview's file reader before FFmpeg reads the same Android document URI.
  $('thumbnail').pause();
  $('thumbnail').removeAttribute('src');
  $('thumbnail').load();
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  busy = true;
  discardParts();
  const shareMode = document.querySelector('input[name="mode"]:checked').value === 'share';
  document.querySelectorAll('input[name="mode"]').forEach(el => el.disabled = true);
  diagnosticLines = [];
  $('copyLog').textContent = '診断ログをコピー';
  $('start').disabled = true;
  $('file').disabled = true;
  $('errorSection').hidden = true;
  $('doneSection').hidden = true;
  $('progressSection').hidden = false;
  setStep('loading');
  try {
    retainedParts = await splitVideo(selected, ({ status, percent, completed, total }) => {
      $('progress').value = percent;
      $('percent').textContent = `${percent}%`;
      completedCount = completed;
      $('count').textContent = total ? `${total}ファイルに分割` : '';
      $('status').textContent = status;
      const phase = percent === 100 ? 'complete' : /ダウンロード/.test(status) ? 'downloading' : /分割中/.test(status) ? 'processing' : /読み込み中/.test(status) ? 'reading' : 'loading';
      setStep(phase);
    }, record, { mode: shareMode ? 'share' : 'download', inputBuffer: selectedBuffer });
    $('doneCount').textContent = `${completedCount}ファイルに分割しました。`;
    $('doneHint').textContent = shareMode ? '共有する動画を選択してください。端末にはダウンロードしていません。' : '端末のダウンロード一覧を確認してください。';
    $('doneSection').hidden = false;
    if (shareMode) { record(`[${new Date().toISOString()}] 分割保持完了: ${retainedParts.length}件, 合計=${retainedParts.reduce((n, f) => n + f.size, 0)} bytes`); renderParts(); }
  } catch (error) {
    record(`[${new Date().toISOString()}] UI例外: ${error?.stack || error?.message || String(error)}`);
    $('errorSection').hidden = false;
    $('errorMessage').textContent = error?.message || '処理中にエラーが発生しました。';
    $('errorReason').textContent = '保存済みのファイルはそのまま残ります。原因が不明な場合は、動画形式・空きメモリ・Chromeのダウンロード許可を確認してください。';
  } finally {
    busy = false;
    document.querySelectorAll('input[name="mode"]').forEach(el => el.disabled = false);
    $('file').disabled = false;
    $('start').disabled = false;
    if (selected && !previewUrl) { previewUrl = URL.createObjectURL(selected); $('thumbnail').src = previewUrl; }
  }
});
