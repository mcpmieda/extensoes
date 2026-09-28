function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof FileReader === 'undefined') {
        blob.arrayBuffer()
          .then((buffer) => resolve(`data:${blob.type || 'image/png'};base64,${arrayBufferToBase64(buffer)}`))
          .catch(reject);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
      reader.readAsDataURL(blob);
    } catch (error) {
      reject(error);
    }
  });
}

async function responseToLimitedImageBlob(response) {
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!contentType.startsWith('image/')) throw new Error('O recurso solicitado não é uma imagem.');
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > GSSF_MAX_IMAGE_BYTES) throw new Error('Imagem muito grande para embutir com segurança.');

  if (!response.body?.getReader) {
    const blob = await response.blob();
    if (blob.size > GSSF_MAX_IMAGE_BYTES) throw new Error('Imagem muito grande para embutir com segurança.');
    return blob;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > GSSF_MAX_IMAGE_BYTES) {
        await reader.cancel('Limite de tamanho excedido.');
        throw new Error('Imagem muito grande para embutir com segurança.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  return new Blob(chunks, { type: contentType || 'image/png' });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'GSSF_FETCH_IMAGE' || !message.url) return false;
  (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GSSF_FETCH_TIMEOUT_MS);
    try {
      if (!gssfAllowedSender(sender)) throw new Error('Origem da solicitação não permitida.');
      if (!gssfAllowedImageUrl(message.url)) throw new Error('Domínio de imagem não permitido.');
      const response = await fetch(message.url, {
        credentials: 'include',
        cache: 'force-cache',
        redirect: 'follow',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!gssfAllowedImageUrl(response.url || message.url)) throw new Error('Redirecionamento de imagem não permitido.');
      const blob = await responseToLimitedImageBlob(response);
      const dataUrl = await blobToDataUrl(blob);
      sendResponse({ ok: true, dataUrl });
    } catch (error) {
      const messageText = error?.name === 'AbortError' ? 'Tempo limite ao carregar imagem.' : String(error?.message || error);
      sendResponse({ ok: false, error: messageText });
    } finally {
      clearTimeout(timeoutId);
    }
  })();
  return true;
});


