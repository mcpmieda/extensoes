

  const GSSF_SECTION_LAUNCH_PREF_KEY = 'gssf:ui:omr:section-launch-collapsed';

  const GSSF_SECTION_LAUNCH_LEGACY_KEYS = Object.freeze(['gssf-omr-section-launch-collapsed-v1364']);

  const GSSF_THEME_KEY = 'gssf:ui:theme';

  const GSSF_THEME_LEGACY_KEYS = Object.freeze(Array.from({ length: 26 }, (_, index) => `gssf_theme_v${index + 1}`).reverse());
  const GSSF_SETTINGS_KEY = 'gssf:ui:settings';
  const GSSF_SETTINGS_LEGACY_KEYS = Object.freeze(Array.from({ length: 26 }, (_, index) => `gssf_settings_v${index + 1}`).reverse());

  function readSectionLaunchCollapsedPref() {
    try {
      let raw = GSSF_STORAGE.getItem(GSSF_SECTION_LAUNCH_PREF_KEY);
      if (raw === null) {
        for (const legacyKey of GSSF_SECTION_LAUNCH_LEGACY_KEYS) {
          raw = GSSF_STORAGE.getItem(legacyKey);
          if (raw !== null) {
            GSSF_STORAGE.setItem(GSSF_SECTION_LAUNCH_PREF_KEY, raw);
            GSSF_STORAGE.removeItem(legacyKey);
            break;
          }
        }
      }
      return raw === null ? false : raw === '1' || raw === 'true';
    } catch (error) {
      reportNonFatalError('preferencia-secao:ler', error);
      return false;
    }
  }

  function saveSectionLaunchCollapsedPref(value) {
    try {
      GSSF_STORAGE.setItem(GSSF_SECTION_LAUNCH_PREF_KEY, value ? '1' : '0');
      GSSF_SECTION_LAUNCH_LEGACY_KEYS.forEach((legacyKey) => GSSF_STORAGE.removeItem(legacyKey));
    } catch (error) {
      reportNonFatalError('preferencia-secao:salvar', error);
    }
  }