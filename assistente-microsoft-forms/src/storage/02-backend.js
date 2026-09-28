  function createChromeBackend(chromeApi) {
    const area = chromeApi?.storage?.local;
    if (!area) throw new Error('chrome.storage.local indisponível.');
    return {
      async getAll() {
        return area.get(null);
      },
      async set(values) {
        return area.set(values);
      },
      async remove(keys) {
        return area.remove(keys);
      }
    };
  }

