(() => {
  let wordEntriesPromise = null;

  function loadWords() {
    if (!wordEntriesPromise) {
      wordEntriesPromise = fetch('vendor/better-profane-words/words.json')
        .then(response => {
          if (!response.ok) throw new Error(`Could not load moderation dictionary (${response.status}).`);
          return response.json();
        });
    }
    return wordEntriesPromise;
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function matchesEntry(text, entry) {
    const pattern = `(^|[^a-z0-9_])${escapeRegExp(entry.word)}([^a-z0-9_]|$)`;
    return new RegExp(pattern, 'i').test(text);
  }

  async function check(text) {
    const body = String(text || '');
    const entries = await loadWords();
    const matched = entries.filter(entry => matchesEntry(body, entry));
    const severity = matched.reduce((highest, entry) => Math.max(highest, Number(entry.intensity) || 0), 0);

    return {
      flagged: matched.length > 0,
      status: matched.length > 0 ? 'pending' : 'active',
      severity,
      matches: matched,
      reason: matched.length > 0
        ? `Automatic moderation matched ${matched.length} reference term${matched.length === 1 ? '' : 's'}.`
        : null
    };
  }

  window.PrayerWallModeration = { check, loadWords };
})();
