/* Chrome entry point: dependencies load synchronously before event registration.
 * No DOM, window, or FileReader is available in this context. */
importScripts('../shared/platform.js', '../shared/store.js', '../shared/sync.js', '../shared/backup-target.js', '../shared/backups.js', 'background.js');
