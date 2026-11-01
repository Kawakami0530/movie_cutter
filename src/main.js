import './style.css';
import { splitVideo } from './video.js';
const $ = id => document.getElementById(id);
let selected = null;
let busy = false;
function reset() {
  $('errorSection').hidden = true;
  $('doneSection').hidden = true;
  $('progressSection').hidden = true;
  $('progress').value = 0;
  $('percent').textContent = '0%';
  $('count').textContent = '完了 0 / 0 ファイル';
  $('start').disabled = !selected;
}
$('file').addEventListener('change', event => {
  if (busy) return;
  selected = event.target.files?.[0] ?? null;
  $('filename').textContent = selected ? `${selected.name}（${(selected.size / 1024 / 1024).toFixed(1)} MB）` : '未選択';
  reset();
});
$('retry').addEventListener('click', reset);
$('start').addEventListener('click', async () => {
  if (!selected || busy) return;
  busy = true;
  $('start').disabled = true;
  $('file').disabled = true;
  $('errorSection').hidden = true;
  $('doneSection').hidden = true;
  $('progressSection').hidden = false;
  try {
    await splitVideo(selected, ({ status, percent, completed, total }) => {
      $('progress').value = percent;
      $('percent').textContent = `${percent}%`;
      $('count').textContent = `完了 ${completed} / ${total} ファイル（ダウンロード開始処理基準）`;
      $('status').textContent = status;
    });
    $('doneSection').hidden = false;
  } catch (error) {
    $('errorSection').hidden = false;
    $('errorMessage').textContent = error?.message || '処理中にエラーが発生しました。';
    $('errorReason').textContent = '保存済みのファイルはそのまま残ります。原因が不明な場合は、動画形式・空きメモリ・Chromeのダウンロード許可を確認してください。';
  } finally {
    busy = false;
    $('file').disabled = false;
    $('start').disabled = false;
  }
});
