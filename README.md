# dsh-session-storage

A [DeepSeek Harness](https://github.com/deepseek-ai) (DSH) bundle plugin that inspects and manages the local session storage DSH produces.

It adds a **Session storage** panel to the DSH Web UI left sidebar, where you can see what your conversations occupy, clean up garbage, and delete sessions.

[中文说明](README.zh.md)

## Features

- **Usage overview** — total session size, session count, workspace count, projection-cache size, orphan-cache count, empty-directory count.
- **Grouped by workspace** — every session with its title, size, last-modified time, and turn count.
- **Garbage cleanup**
  - *Orphan caches* — a `storages/session_projcache/sessions/<id>.json` exists but its session directory is gone.
  - *Empty session directories* — the directory exists but has no `session.v4.jsonl.zstd` log.
- **Session deletion** — select and delete. **Deleted sessions move to a recycle bin first** (`$DSH_HOME/.session-storage-trash/`), so space is not freed immediately; use **Empty recycle bin** to actually reclaim it. A permanent-delete option is available in the confirmation dialog.
- **Search and sort** — filter by title/path, sort by size or time.

## Install

```bash
dsh plugin --profile <your-profile> add github:WanderingEra/dsh-session-storage
```

`<your-profile>` is the profile your DSH actually runs, commonly `web` or `desktop`. Check with `dsh --profile <name> --dump-config`.

Then restart DSH and look for the database icon in the left sidebar. If it does not appear, hard-refresh the page (Ctrl+F5).

## Uninstall

```bash
dsh plugin --profile <your-profile> remove dsh-session-storage
```

## Where the data lives

The plugin reads `$DSH_HOME` (default `~/.dsh`, overridable by the environment variable):

| Path | Contents |
| --- | --- |
| `sessions/<encoded workspace path>/session-<uuid>/session.v4.jsonl.zstd` | Session log (zstd-compressed JSONL) |
| `storages/session_projcache/sessions/<session id>.json` | Projection cache: title, turns, token usage |
| `storages/workspace.json` | Workspace registry (read-only here; used to group sessions) |
| `.session-storage-trash/` | This plugin's recycle bin (created by the plugin) |

## Safety

Deletion is destructive, so the plugin tightens it deliberately:

1. **Paths are never trusted from the client** — deletion targets are re-derived by the host through its own scan; the client only sends session ids.
2. **Id format validation** — the directory name must match `session-<uuid>`; input like `../../etc/passwd` is rejected before touching the filesystem.
3. **Containment check** — every path to be deleted must lie strictly inside `$DSH_HOME/sessions` or the recycle bin.
4. **Live-session protection** — sessions currently running in memory (`ctx.sessions`) are refused, and their checkboxes are disabled in the UI.
5. **Writes are local-only** — write endpoints require a loopback `Host`, and also defer to DSH's own browser trust fence (`ctx.connection.requestRejection`); if the fence throws, the request is denied (fail-closed).
6. **Recoverable by default** — deletion goes to the recycle bin; permanent deletion requires an explicit checkbox.
7. **`workspace.json` is never modified** — that file belongs to DSH's workspace registry. Once a session directory disappears, the registry filters the stale entry out on read, so no external rewrite is needed.

## Endpoints

The host half registers routes under `/session-storage`, all behind the trust fence:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/session-storage/overview` | Storage overview (read-only) |
| POST | `/session-storage/delete` | Delete sessions. Body: `{ sessionIds, mode?: 'trash'\|'purge', dryRun?: boolean }` |
| POST | `/session-storage/clean` | Remove orphan caches and empty directories. Body: `{ dryRun?: boolean }` |
| POST | `/session-storage/trash/empty` | Empty the recycle bin, actually reclaiming space |

Passing `dryRun: true` returns the plan without any side effect.

## Development

The plugin is plain JavaScript — no build step, no dependencies.

```bash
# Functional test of the host half (fake ctx captures routes, handlers really run)
node test/host.test.mjs
```

The test is read-only: every write path is exercised with `dryRun`. It covers the overview scan, delete dry-run isolation, path-traversal rejection, unknown-session rejection, cleanup dry-run, and the trust fence returning 403 for non-loopback and cross-site writes.

Since the plugin is installed with `link:`, editing `client.js` takes effect after a hard refresh, while editing `index.js` requires a DSH restart.

## Structure

```
package.json          # bundle manifest (dsh.bundle.patch + dsh.client)
cordis.patch.yml      # inserts the plugin row into the profile tree
index.js              # host half: storage scan, orphan detection, guarded deletion
client.js             # client half: sidebar panel icon + management page
icon.svg              # panel icon
locale/{en,zh}.json   # display title and description
test/host.test.mjs    # host-half functional test
```

## License

[MIT](LICENSE)
