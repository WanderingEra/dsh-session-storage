/**
 * 宿主半边的功能测试。
 *
 * 用假的 ctx 捕获路由注册，然后**真正调用**处理器，验证：
 * 概览扫描、删除干跑无副作用、路径穿越拒绝、未知会话拒绝、清理干跑、非回环写请求被拒。
 *
 * 这是一个只读测试：所有写操作都以 dryRun 进行，不会删除任何数据。
 *
 * 运行：node test/host.test.mjs
 */
const routes = new Map()

const fakeCtx = {
  get: () => undefined,
  on: () => () => {},
  effect: (cb) => {
    const d = cb()
    return typeof d === 'function' ? d : () => {}
  },
  webServer: {
    register: (route) => {
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
  },
}

let failures = 0

/**
 * 断言。
 * @param {boolean} cond 条件。
 * @param {string} label 描述。
 * @returns {void}
 */
function check(cond, label) {
  if (cond) {
    console.log(`  PASS  ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${label}`)
  }
}

/** 调用一条已注册路由并返回 {status, parsed}。 */
async function call(path, method = 'GET', body = undefined, headers = undefined) {
  const route = routes.get(path)
  if (!route) throw new Error(`route not registered: ${path}`)
  const req = {
    method,
    headers: headers ?? { host: '127.0.0.1:19387', 'sec-fetch-site': 'same-origin' },
    on(event, fn) {
      if (event === 'data' && body !== undefined) fn(Buffer.from(JSON.stringify(body)))
      if (event === 'end') fn()
      return this
    },
    destroy() {},
  }
  let status = 0
  let payload = ''
  const res = {
    writeHead(code) {
      status = code
    },
    end(chunk) {
      if (chunk !== undefined) payload += chunk
    },
  }
  await route.handler(req, res)
  let parsed
  try {
    parsed = JSON.parse(payload)
  } catch {
    parsed = payload
  }
  return { status, parsed }
}

const mod = await import(new URL('../index.js', import.meta.url))

console.log('=== 模块契约 ===')
check(typeof mod.apply === 'function', 'index.js 导出 apply 函数')
check(Array.isArray(mod.inject) && mod.inject.includes('webServer'), 'inject 声明硬依赖 webServer')

mod.apply(fakeCtx)
console.log('\n=== 路由注册 ===')
for (const p of ['/session-storage/overview', '/session-storage/delete', '/session-storage/clean', '/session-storage/trash/empty']) {
  check(routes.has(p), `已注册 ${p}`)
}

console.log('\n=== 只读概览 ===')
const overview = await call('/session-storage/overview')
check(overview.status === 200, 'overview 返回 200')
check(overview.parsed?.ok === true, 'overview ok=true')
const totals = overview.parsed?.totals ?? {}
check(typeof totals.sessionBytes === 'number', 'totals.sessionBytes 是数字')
check(typeof totals.sessionCount === 'number', 'totals.sessionCount 是数字')
check(Array.isArray(overview.parsed?.sessions), 'sessions 是数组')
check(Array.isArray(overview.parsed?.garbage?.orphanCaches), 'garbage.orphanCaches 是数组')
console.log(`  info  DSH_HOME=${overview.parsed?.home}  会话=${totals.sessionCount}  体积=${totals.sessionBytes}B  孤儿=${totals.orphanCount}`)

console.log('\n=== 删除干跑必须无副作用 ===')
const before = JSON.stringify((await call('/session-storage/overview')).parsed.totals)
const victim = (overview.parsed?.sessions ?? []).find((s) => !s.isLive)
if (victim) {
  const dry = await call('/session-storage/delete', 'POST', { sessionIds: [victim.id], dryRun: true })
  check(dry.status === 200 && dry.parsed?.dryRun === true, '删除干跑返回 dryRun=true')
  check(Array.isArray(dry.parsed?.planned) && dry.parsed.planned.length === 1, '干跑列出 1 个待删项')
  const after = JSON.stringify((await call('/session-storage/overview')).parsed.totals)
  check(before === after, '干跑后统计未变化（确认无副作用）')
} else {
  console.log('  skip  没有可用于干跑的非活动会话')
}

console.log('\n=== 安全护栏 ===')
const guard = await call('/session-storage/delete', 'POST', {
  sessionIds: ['../../etc/passwd', 'not-a-session', 'session-ffffffff-ffff-ffff-ffff-ffffffffffff'],
  dryRun: true,
})
check(guard.status === 200, '恶意输入返回 200 而非崩溃')
check((guard.parsed?.planned ?? []).length === 0, '没有任何路径穿越项进入待删列表')
check((guard.parsed?.skipped ?? []).length === 3, '3 项全部被跳过')
check(
  (guard.parsed?.skipped ?? []).every((s) => typeof s.reason === 'string' && s.reason.length > 0),
  '每个跳过项都带原因',
)

const badBody = await call('/session-storage/delete', 'POST', { sessionIds: 'not-an-array' })
check(badBody.status === 400, 'sessionIds 非数组时返回 400')

console.log('\n=== 清理干跑 ===')
const clean = await call('/session-storage/clean', 'POST', { dryRun: true })
check(clean.status === 200 && clean.parsed?.dryRun === true, 'clean 干跑返回 dryRun=true')
check(Array.isArray(clean.parsed?.planned), 'clean 干跑返回 planned 数组')
console.log(`  info  可清理 ${clean.parsed?.planned?.length ?? 0} 项`)

console.log('\n=== 信任栅栏 ===')
const fenced = await call('/session-storage/delete', 'POST', { sessionIds: [] }, { host: 'evil.example.com' })
check(fenced.status === 403, '非回环 Host 的写请求被拒（403）')
const crossSite = await call('/session-storage/delete', 'POST', { sessionIds: [] }, { host: '127.0.0.1:19387', 'sec-fetch-site': 'cross-site' })
check(crossSite.status === 403, '跨站标记的写请求被拒（403）')
const readOk = await call('/session-storage/overview', 'GET', undefined, { host: 'evil.example.com' })
check(readOk.status === 200, '只读接口不因 Host 被拒（读不受影响）')

console.log(`\n${failures === 0 ? '全部通过' : `${failures} 项失败`}`)
process.exit(failures === 0 ? 0 : 1)
