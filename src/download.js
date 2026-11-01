export async function downloadBlob(bytes, name) {
  const blob = new Blob([bytes], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // A click does not guarantee Chrome accepted or finished the download.
    await new Promise(resolve => setTimeout(resolve, 1800));
  } finally {
    // Give the browser time to resolve the blob URL before revoking it.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
