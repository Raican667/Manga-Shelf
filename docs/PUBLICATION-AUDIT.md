# Public baseline review

Review date: 2026-10-18. Public baseline: 0.20.8.

## Scope and findings

- Exported only tracked application source, tests, documentation and assets into
  a new directory. No old Git objects or remote metadata are imported.
- Gitleaks 8.30.1 scanned the available private Git history and the exported
  snapshot with redacted reporting: no supported secret patterns were detected.
- Checked current files for private user-directory paths, personal mail-provider
  addresses and credential assignments. No matches requiring publication were found.
- Private history contains a non-noreply author email. Original author identities,
  commits, branches and tags are deliberately not copied. The public initial
  commit uses the owner's GitHub noreply address.
- Old private issues/PRs, releases, ZIPs, workflow history, artifacts, secrets,
  collaborators and webhooks are not migrated. They remain private. Their content
  has not been certified safe for later publication.
- Current license is GPL-3.0-only. Prior MIT grants remain valid for earlier copies.
- New downloads are built from this public source rather than copying old ZIPs.
- CI has read-only permissions. Release writes are limited to the release job;
  no issue/comment event dispatches publishing or assistant work. Actions are SHA-pinned.
- Application identity and storage keys are unchanged so existing installations
  retain their data. The removed support button remains removed.

## Limitations

Pattern scanning cannot prove that all sensitive information or vulnerabilities
are absent. This is a publication/privacy and configuration review, not a
penetration test or independent security certification. Fixtures use mocks;
passing tests do not replace installation testing in each browser.

Future releases must be checked again. Never publish private backups or scanner
reports that contain actual secret values. Repository write access is restricted
separately by GitHub settings; public discussion is not authorization to act.
