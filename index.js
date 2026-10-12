/**
 * 会话存储管理 —— 宿主半边（Host half）。
 *
 * 职责：扫描 `$DSH_HOME` 下的会话存储，计算体积、识别垃圾，并提供带安全护栏的删除接口。
 * 所有 HTTP 接口都挂在 `/session-storage` 前缀下；写操作额外要求来自本机回环地址。
 *
 * 安全原则：
 * 1. 删除目标一律由宿主**重新扫描**得出，绝不信任客户端传来的路径（防路径注入）。
 * 2. 任何要删除的路径都必须位于 `$DSH_HOME/sessions`（或回收站）之内。
 * 3. 正在运行的会话（`ctx.sessions`）拒绝删除。
 * 4. 默认只移入回收站，永久删除必须显式声明。
 */
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** 本插件占用的路由前缀。 */
const ROUTE_PREFIX = '/session-storage'
/** 会话目录名的严格格式，先于任何文件系统操作校验。 */
const SESSION_DIR_RE = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** 回收站目录名（位于 $DSH_HOME 下）。 */
const TRASH_DIR_NAME = '.session-storage-trash'
/** 允许发送写请求的 Host 名。 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
/** 单次响应最多列出的会话数，避免超大 JSON。 */
const MAX_LISTED_SESSIONS = 2000
/** 读取投影缓存做标题/统计时的体积上限（超过只取字节数）。 */
const MAX_CACHE_PARSE_BYTES = 4 * 1024 * 1024

/**
 * 解析 DSH 数据根目录，优先级与 `@deepseek-ai/dsh-home-paths` 一致：
 * 环境变量 `DSH_HOME` > `~/.dsh`。
 * @returns {string} 绝对路径。
 */
function resolveHome() {
  const env = process.env.DSH_HOME
  if (typeof env === 'string' && env.trim() !== '') return path.resolve(env.trim())
  return path.join(os.homedir(), '.dsh')
}

/**
 * 判断 child 是否严格位于 parent 之内。
 * @param {string} parent 父目录绝对路径。
 * @param {string} child 待校验绝对路径。
 * @returns {boolean} 位于其内为 true。
 */
function isInside(parent, child) {
  const rel = path.relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/**
 * 递归统计一个目录的体积、文件数与最新修改时间。
 * @param {string} dir 目标目录。
 * @returns {Promise<{bytes:number,files:number,mtimeMs:number}>} 统计结果（不可读时为零值）。
 */
async function measureDir(dir) {
  let bytes = 0
  let files = 0
  let mtimeMs = 0
  const stack = [dir]
  while (stack.length > 0) {
    const cur = stack.pop()
    let entries
    try {
      entries = await fsp.readdir(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(cur, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!entry.isFile()) continue
      try {
        const st = await fsp.stat(full)
        bytes += st.size
        files += 1
        if (st.mtimeMs > mtimeMs) mtimeMs = st.mtimeMs
      } catch {
        /* 单个文件读不到就跳过，不影响整体统计 */
      }
    }
  }
  return { bytes, files, mtimeMs }
}

/**
 * 读取一个投影缓存文件，抽出标题与统计信息。
 * @param {string} file 缓存文件绝对路径。
 * @returns {Promise<{bytes:number,mtimeMs:number,title?:string,cwd?:string,turns?:number,tokens?:object}|undefined>} 元数据。
 */
async function readCacheMeta(file) {
  let st
  try {
    st = await fsp.stat(file)
  } catch {
    return undefined
  }
  const base = { bytes: st.size, mtimeMs: st.mtimeMs }
  if (st.size > MAX_CACHE_PARSE_BYTES) return base
  try {
    const parsed = JSON.parse(await fsp.readFile(file, 'utf8'))
    const rows = parsed?.record?.rows ?? {}
    const out = { ...base }
    if (typeof rows.title?.val === 'string') out.title = rows.title.val
    if (typeof parsed?.record?.identity?.cwd === 'string') out.cwd = parsed.record.identity.cwd
    if (typeof rows.sessionStats?.val?.turns === 'number') out.turns = rows.sessionStats.val.turns
    if (rows.tokenUsage?.val?.totals) out.tokens = rows.tokenUsage.val.totals
    if (typeof rows.sessionListMetadata?.val?.lastPromptAt === 'number') {
      out.lastPromptAt = rows.sessionListMetadata.val.lastPromptAt
    }
    return out
  } catch {
    return base
  }
}

/**
 * 扫描会话存储，构造完整清单。
 * @param {string} home DSH 数据根目录。
 * @param {Set<string>} liveIds 当前活动会话 id。
 * @returns {Promise<object>} 概览对象。
 */
async function scan(home, liveIds) {
  const sessionsRoot = path.join(home, 'sessions')
  const cacheRoot = path.join(home, 'storages', 'session_projcache', 'sessions')
  const trashRoot = path.join(home, TRASH_DIR_NAME)

  // 1) 工作区注册表：sessionId -> 工作区路径/标题
  const workspaceByPath = new Map()
  let workspaceJson
  try {
    workspaceJson = JSON.parse(await fsp.readFile(path.join(home, 'storages', 'workspace.json'), 'utf8'))
  } catch {
    workspaceJson = undefined
  }
  const sessionToWorkspace = new Map()
  const workspacesTable = workspaceJson?.tables?.workspaces ?? {}
  for (const record of Object.values(workspacesTable)) {
    if (!record || typeof record.path !== 'string') continue
    workspaceByPath.set(record.path, record.title || record.path)
    for (const sid of Array.isArray(record.sessionIds) ? record.sessionIds : []) {
      sessionToWorkspace.set(sid, record.path)
    }
  }

  // 2) 会话目录
  const sessions = []
  let scanTruncated = false
  let wsEntries = []
  try {
    wsEntries = await fsp.readdir(sessionsRoot, { withFileTypes: true })
  } catch {
    wsEntries = []
  }
  for (const wsEntry of wsEntries) {
    if (!wsEntry.isDirectory()) continue
    const wsDir = path.join(sessionsRoot, wsEntry.name)
    let subEntries
    try {
      subEntries = await fsp.readdir(wsDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const sub of subEntries) {
      if (!sub.isDirectory()) continue
      if (sessions.length >= MAX_LISTED_SESSIONS) {
        scanTruncated = true
        break
      }
      const dir = path.join(wsDir, sub.name)
      const size = await measureDir(dir)
      let logBytes = 0
      try {
        logBytes = (await fsp.stat(path.join(dir, 'session.v4.jsonl.zstd'))).size
      } catch {
        logBytes = 0
      }
      const wsPath = sessionToWorkspace.get(sub.name)
      sessions.push({
        id: sub.name,
        workspaceDir: wsEntry.name,
        workspacePath: wsPath,
        workspaceLabel: wsPath ? workspaceByPath.get(wsPath) || wsPath : undefined,
        bytes: size.bytes,
        files: size.files,
        mtimeMs: size.mtimeMs,
        logBytes,
        hasLog: logBytes > 0,
        isLive: liveIds.has(sub.name),
      })
    }
  }

  // 3) 投影缓存 + 孤儿识别
  const cacheEntries = []
  let cacheBytes = 0
  let cacheFiles = 0
  try {
    const cacheFilesList = await fsp.readdir(cacheRoot, { withFileTypes: true })
    for (const entry of cacheFilesList) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const id = entry.name.slice(0, -'.json'.length)
      const meta = await readCacheMeta(path.join(cacheRoot, entry.name))
      if (!meta) continue
      cacheFiles += 1
      cacheBytes += meta.bytes
      cacheEntries.push({ id, ...meta })
    }
  } catch {
    /* 缓存目录不存在是正常情况 */
  }

  const knownIds = new Set(sessions.map((s) => s.id))
  const cacheIds = new Set(cacheEntries.map((c) => c.id))

  // 孤儿缓存：有缓存条目，但没有对应会话目录
  const orphanCaches = cacheEntries
    .filter((c) => !knownIds.has(c.id))
    .map((c) => ({ id: c.id, bytes: c.bytes, mtimeMs: c.mtimeMs, title: c.title }))

  // 空会话目录：目录在，但没有会话正文
  const emptySessions = sessions
    .filter((s) => !s.hasLog)
    .map((s) => ({ id: s.id, workspaceDir: s.workspaceDir, bytes: s.bytes, mtimeMs: s.mtimeMs }))

  // 4) 回收站
  const trash = []
  let trashBytes = 0
  try {
    const batches = await fsp.readdir(trashRoot, { withFileTypes: true })
    for (const batch of batches) {
      if (!batch.isDirectory()) continue
      const batchDir = path.join(trashRoot, batch.name)
      const size = await measureDir(batchDir)
      trashBytes += size.bytes
      trash.push({ batch: batch.name, bytes: size.bytes, files: size.files, mtimeMs: size.mtimeMs })
    }
  } catch {
    /* 回收站未创建 */
  }

  // 5) 把缓存元数据合并回会话（标题/轮次/token）
  const cacheById = new Map(cacheEntries.map((c) => [c.id, c]))
  for (const s of sessions) {
    const c = cacheById.get(s.id)
    if (!c) continue
    if (c.title) s.title = c.title
    if (typeof c.turns === 'number') s.turns = c.turns
    if (c.tokens) s.tokens = c.tokens
    if (typeof c.lastPromptAt === 'number') s.lastPromptAt = c.lastPromptAt
  }

  const sessionBytes = sessions.reduce((n, s) => n + s.bytes, 0)
  const groups = new Map()
  for (const s of sessions) {
    const key = s.workspacePath || s.workspaceDir
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        path: s.workspacePath,
        label: s.workspaceLabel,
        encodedDir: s.workspaceDir,
        bytes: 0,
        sessions: [],
      })
    }
    const g = groups.get(key)
    g.bytes += s.bytes
    g.sessions.push(s.id)
  }

  return {
    ok: true,
    home,
    scannedAt: Date.now(),
    truncated: scanTruncated,
    totals: {
      sessionBytes,
      sessionCount: sessions.length,
      workspaceCount: groups.size,
      cacheBytes,
      cacheCount: cacheFiles,
      orphanBytes: orphanCaches.reduce((n, o) => n + o.bytes, 0),
      orphanCount: orphanCaches.length,
      emptyCount: emptySessions.length,
      emptyBytes: emptySessions.reduce((n, o) => n + o.bytes, 0),
      trashBytes,
      trashCount: trash.length,
    },
    workspaces: [...groups.values()].sort((a, b) => b.bytes - a.bytes),
    sessions: sessions.sort((a, b) => b.bytes - a.bytes),
    garbage: { orphanCaches, emptySessions, trash },
    liveSessionIds: [...liveIds],
  }
}

/**
 * 收集当前活动（正在内存中）的会话 id。
 * @param {object} ctx 插件上下文。
 * @returns {Set<string>} 活动会话 id 集合。
 */
function liveSessionIds(ctx) {
  const ids = new Set()
  try {
    const sessions = ctx.get('sessions')
    if (sessions && typeof sessions.list === 'function') {
      for (const s of sessions.list()) {
        if (s && typeof s.id === 'string') ids.add(s.id)
      }
    }
  } catch {
    /* 没有 sessions 服务时视为无活动会话 */
  }
  return ids
}

/**
 * 计算信任栅栏的拒绝码。
 * @param {object} ctx 插件上下文。
 * @param {import('node:http').IncomingMessage} req 请求。
 * @param {boolean} isWrite 是否为写请求。
 * @returns {number} 0 表示放行，否则为 HTTP 状态码。
 */
function fenceCode(ctx, req, isWrite) {
  // DSH 宿主自带的浏览器信任栅栏（防跨站读写）
  const conn = ctx.get('connection')
  if (conn && typeof conn.requestRejection === 'function') {
    try {
      const code = conn.requestRejection(req)
      if (code !== undefined && code !== null && code !== false) {
        return typeof code === 'number' ? code : 403
      }
    } catch {
      return 403 // 栅栏自身异常时按拒绝处理（fail-closed）
    }
  }
  const site = req.headers['sec-fetch-site']
  if (site === 'cross-site') return 403
  if (isWrite) {
    const raw = String(req.headers.host || '').toLowerCase()
    const host = raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.split(':')[0]
    if (!LOOPBACK_HOSTS.has(host)) return 403
  }
  return 0
}

/**
 * 读取并解析 JSON 请求体。
 * @param {import('node:http').IncomingMessage} req 请求。
 * @param {number} [limit] 体积上限。
 * @returns {Promise<any|null>} 解析结果，失败为 null。
 */
function readJsonBody(req, limit = 1_000_000) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        done(null)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        done(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        done(null)
      }
    })
    req.on('error', () => done(null))
  })
}

/**
 * 发送 JSON 响应。
 * @param {import('node:http').ServerResponse} res 响应。
 * @param {number} status 状态码。
 * @param {object} payload 响应体。
 * @returns {void}
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': String(Buffer.byteLength(body)),
  })
  res.end(body)
}

/**
 * 宿主半边入口。
 * @param {object} ctx 插件上下文。
 * @returns {void}
 */
export function apply(ctx) {
  const home = resolveHome()
  const sessionsRoot = path.join(home, 'sessions')
  const cacheRoot = path.join(home, 'storages', 'session_projcache', 'sessions')
  const trashRoot = path.join(home, TRASH_DIR_NAME)

  /**
   * 注册一条已套用信任栅栏的路由。
   * @param {object} route 路由定义（kind/path/handler）。
   * @param {boolean} isWrite 是否为写路由。
   * @returns {() => void} 注销函数。
   */
  const registerRoute = (route, isWrite) => {
    const inner = route.handler
    return ctx.webServer.register({
      ...route,
      handler: async (req, res) => {
        const code = fenceCode(ctx, req, isWrite)
        if (code !== 0) {
          res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('rejected by trust fence')
          return
        }
        await inner(req, res)
      },
    })
  }

  ctx.effect(() => {
    const disposers = []

    // ---- 只读：存储概览 ----
    disposers.push(
      registerRoute(
        {
          kind: 'exact',
          path: `${ROUTE_PREFIX}/overview`,
          handler: async (_req, res) => {
            try {
              sendJson(res, 200, await scan(home, liveSessionIds(ctx)))
            } catch (error) {
              sendJson(res, 500, { ok: false, error: String(error?.message || error) })
            }
          },
        },
        false,
      ),
    )

    // ---- 写：删除会话（默认进回收站） ----
    disposers.push(
      registerRoute(
        {
          kind: 'exact',
          path: `${ROUTE_PREFIX}/delete`,
          handler: async (req, res) => {
            const body = await readJsonBody(req)
            if (!body || !Array.isArray(body.sessionIds)) {
              sendJson(res, 400, { ok: false, error: 'sessionIds 必须是数组' })
              return
            }
            const live = liveSessionIds(ctx)
            const purge = body.mode === 'purge'
            const dryRun = body.dryRun === true

            // 重新扫描，用宿主自己的结果解析 id -> 目录（不信任客户端路径）
            const known = new Map()
            try {
              for (const ws of await fsp.readdir(sessionsRoot, { withFileTypes: true })) {
                if (!ws.isDirectory()) continue
                for (const s of await fsp.readdir(path.join(sessionsRoot, ws.name), { withFileTypes: true })) {
                  if (!s.isDirectory()) continue
                  known.set(s.name, path.join(sessionsRoot, ws.name, s.name))
                }
              }
            } catch {
              /* 没有会话目录 */
            }

            const planned = []
            const skipped = []
            for (const rawId of body.sessionIds) {
              const id = String(rawId)
              if (!SESSION_DIR_RE.test(id)) {
                skipped.push({ id, reason: '会话 id 格式非法' })
                continue
              }
              if (live.has(id)) {
                skipped.push({ id, reason: '会话正在运行，拒绝删除' })
                continue
              }
              const dir = known.get(id)
              if (dir === undefined) {
                skipped.push({ id, reason: '找不到会话目录' })
                continue
              }
              if (!isInside(sessionsRoot, dir)) {
                skipped.push({ id, reason: '路径越界，拒绝删除' })
                continue
              }
              const size = await measureDir(dir)
              planned.push({ id, dir, bytes: size.bytes, cacheFile: path.join(cacheRoot, `${id}.json`) })
            }

            if (dryRun) {
              sendJson(res, 200, {
                ok: true,
                dryRun: true,
                mode: purge ? 'purge' : 'trash',
                planned: planned.map((p) => ({ id: p.id, bytes: p.bytes })),
                skipped,
              })
              return
            }

            const batch = new Date().toISOString().replace(/[:.]/g, '-')
            const deleted = []
            const failed = []
            for (const item of planned) {
              try {
                if (purge) {
                  await fsp.rm(item.dir, { recursive: true, force: true })
                } else {
                  const target = path.join(trashRoot, batch, path.basename(path.dirname(item.dir)), item.id)
                  await fsp.mkdir(path.dirname(target), { recursive: true })
                  await fsp.rename(item.dir, target)
                }
                // 连带清掉投影缓存，避免留下孤儿
                await fsp.rm(item.cacheFile, { force: true }).catch(() => {})
                deleted.push({ id: item.id, bytes: item.bytes })
              } catch (error) {
                failed.push({ id: item.id, reason: String(error?.message || error) })
              }
            }
            sendJson(res, 200, {
              ok: true,
              mode: purge ? 'purge' : 'trash',
              batch: purge ? undefined : batch,
              deleted,
              failed,
              skipped,
            })
          },
        },
        true,
      ),
    )

    // ---- 写：清理孤儿缓存与空目录 ----
    disposers.push(
      registerRoute(
        {
          kind: 'exact',
          path: `${ROUTE_PREFIX}/clean`,
          handler: async (req, res) => {
            const body = (await readJsonBody(req)) ?? {}
            const dryRun = body.dryRun === true
            const data = await scan(home, liveSessionIds(ctx))

            const targets = []
            for (const orphan of data.garbage.orphanCaches) {
              if (!SESSION_DIR_RE.test(orphan.id)) continue
              const file = path.join(cacheRoot, `${orphan.id}.json`)
              if (!isInside(cacheRoot, file)) continue
              targets.push({ kind: 'orphan-cache', id: orphan.id, target: file, bytes: orphan.bytes })
            }
            for (const empty of data.garbage.emptySessions) {
              if (!SESSION_DIR_RE.test(empty.id)) continue
              const dir = path.join(sessionsRoot, empty.workspaceDir, empty.id)
              if (!isInside(sessionsRoot, dir)) continue
              targets.push({ kind: 'empty-session', id: empty.id, target: dir, bytes: empty.bytes })
            }

            if (dryRun) {
              sendJson(res, 200, {
                ok: true,
                dryRun: true,
                planned: targets.map((t) => ({ kind: t.kind, id: t.id, bytes: t.bytes })),
              })
              return
            }

            const removed = []
            const failed = []
            for (const t of targets) {
              try {
                await fsp.rm(t.target, { recursive: true, force: true })
                removed.push({ kind: t.kind, id: t.id, bytes: t.bytes })
              } catch (error) {
                failed.push({ kind: t.kind, id: t.id, reason: String(error?.message || error) })
              }
            }
            sendJson(res, 200, {
              ok: true,
              removed,
              failed,
              freedBytes: removed.reduce((n, r) => n + r.bytes, 0),
            })
          },
        },
        true,
      ),
    )

    // ---- 写：清空回收站（真正释放空间） ----
    disposers.push(
      registerRoute(
        {
          kind: 'exact',
          path: `${ROUTE_PREFIX}/trash/empty`,
          handler: async (_req, res) => {
            let freed = 0
            let batches = 0
            try {
              const entries = await fsp.readdir(trashRoot, { withFileTypes: true })
              for (const entry of entries) {
                if (!entry.isDirectory()) continue
                const dir = path.join(trashRoot, entry.name)
                if (!isInside(trashRoot, dir)) continue
                freed += (await measureDir(dir)).bytes
                await fsp.rm(dir, { recursive: true, force: true })
                batches += 1
              }
            } catch {
              /* 回收站不存在 */
            }
            sendJson(res, 200, { ok: true, batches, freedBytes: freed })
          },
        },
        true,
      ),
    )

    return () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          /* 注销失败不影响卸载 */
        }
      }
    }
  }, 'session-storage: routes')
}

/** 硬依赖：没有 Web 服务器时本插件不激活。 */
export const inject = ['webServer']
