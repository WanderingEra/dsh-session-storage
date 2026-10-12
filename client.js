/**
 * 会话存储管理 —— 客户端半边（Client half）。
 *
 * 注册一个侧边栏面板图标（`sidebar.panellist`）与对应的主区域页面（`main`，key 与图标 id 同名）。
 * 数据通过同源 fetch 访问宿主半边注册的 `/session-storage/*` 接口。
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-storage',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** 本地化命名空间。 */
    const NS = 'session-storage'
    /** 面板 id：同时作为 sidebar.panellist 的 id 与 main 的 key。 */
    const PANEL_ID = 'session-storage'
    /** 宿主接口前缀。 */
    const API = '/session-storage'

    /** 简体中文文案。 */
    const ZH = {
      panel: '会话存储',
      title: '会话存储管理',
      subtitle: '查看本地会话占用、清理垃圾、删除会话',
      loading: '正在扫描存储…',
      refresh: '重新扫描',
      loadFailed: '加载失败',
      retry: '重试',
      statSessions: '会话',
      statSize: '会话体积',
      statWorkspaces: '工作区',
      statCache: '投影缓存',
      statOrphans: '孤儿缓存',
      statEmpty: '空会话目录',
      garbageTitle: '可清理的垃圾',
      garbageNone: '没有发现垃圾，存储很干净。',
      orphanCaches: '孤儿缓存（无对应会话）',
      emptySessions: '空会话目录（无正文）',
      clean: '清理垃圾',
      cleaning: '清理中…',
      cleanConfirmTitle: '确认清理垃圾？',
      cleanConfirmBody: '将删除下列 {count} 项，合计 {size}。这些是不含会话正文的残留数据。',
      cleaned: '已清理 {count} 项，释放 {size}',
      trashTitle: '回收站',
      trashEmpty: '回收站是空的。',
      trashBatches: '{count} 个批次 · {size}',
      emptyTrash: '清空回收站',
      emptying: '清空中…',
      emptyTrashConfirmTitle: '确认清空回收站？',
      emptyTrashConfirmBody: '这将永久删除回收站中的 {size} 数据，无法恢复。',
      emptied: '已清空回收站，释放 {size}',
      sessionsTitle: '会话列表',
      search: '搜索标题或路径…',
      sortSize: '按体积',
      sortDate: '按时间',
      selectAll: '全选',
      clearSelection: '清空选择',
      selected: '已选 {count} 项 · {size}',
      deleteSelected: '删除所选',
      deleting: '删除中…',
      columnTitle: '会话',
      columnWorkspace: '工作区',
      columnSize: '体积',
      columnTime: '最后修改',
      columnTurns: '轮次',
      live: '运行中',
      untitled: '(无标题)',
      noSessions: '还没有任何会话。',
      noMatch: '没有匹配的会话。',
      deleteConfirmTitle: '确认删除 {count} 个会话？',
      deleteConfirmBody: '合计 {size}。默认移入回收站，可以之后清空回收站永久删除。',
      deleteConfirmBodyPurge: '合计 {size}。⚠️ 你选择了永久删除，此操作立即释放空间且无法恢复。',
      purgeLabel: '永久删除（不进回收站，无法恢复）',
      trashHint: '删除的会话会先进入回收站，占用空间不变；清空回收站才真正释放。',
      deleteDone: '已删除 {count} 个会话，{mode}',
      modeTrash: '已移入回收站',
      modePurge: '已永久删除',
      skippedTitle: '以下项目被跳过',
      cancel: '取消',
      confirm: '确认',
      close: '关闭',
      errorLabel: '错误',
      cancelLabel: '取消',
    }

    /** English copy. */
    const EN = {
      panel: 'Session storage',
      title: 'Session storage manager',
      subtitle: 'Inspect local session usage, clean garbage, delete sessions',
      loading: 'Scanning storage…',
      refresh: 'Rescan',
      loadFailed: 'Failed to load',
      retry: 'Retry',
      statSessions: 'Sessions',
      statSize: 'Session size',
      statWorkspaces: 'Workspaces',
      statCache: 'Projection cache',
      statOrphans: 'Orphan caches',
      statEmpty: 'Empty session dirs',
      garbageTitle: 'Reclaimable garbage',
      garbageNone: 'No garbage found — storage is clean.',
      orphanCaches: 'Orphan caches (no session)',
      emptySessions: 'Empty session dirs (no log)',
      clean: 'Clean garbage',
      cleaning: 'Cleaning…',
      cleanConfirmTitle: 'Clean garbage?',
      cleanConfirmBody: 'This removes {count} item(s) totalling {size}. They contain no session log.',
      cleaned: 'Cleaned {count} item(s), freed {size}',
      trashTitle: 'Recycle bin',
      trashEmpty: 'The recycle bin is empty.',
      trashBatches: '{count} batch(es) · {size}',
      emptyTrash: 'Empty recycle bin',
      emptying: 'Emptying…',
      emptyTrashConfirmTitle: 'Empty the recycle bin?',
      emptyTrashConfirmBody: 'This permanently deletes {size} and cannot be undone.',
      emptied: 'Recycle bin emptied, freed {size}',
      sessionsTitle: 'Sessions',
      search: 'Search title or path…',
      sortSize: 'By size',
      sortDate: 'By time',
      selectAll: 'Select all',
      clearSelection: 'Clear',
      selected: '{count} selected · {size}',
      deleteSelected: 'Delete selected',
      deleting: 'Deleting…',
      columnTitle: 'Session',
      columnWorkspace: 'Workspace',
      columnSize: 'Size',
      columnTime: 'Modified',
      columnTurns: 'Turns',
      live: 'live',
      untitled: '(untitled)',
      noSessions: 'No sessions yet.',
      noMatch: 'No matching sessions.',
      deleteConfirmTitle: 'Delete {count} session(s)?',
      deleteConfirmBody: 'Totalling {size}. They move to the recycle bin first; empty it later to reclaim space.',
      deleteConfirmBodyPurge: 'Totalling {size}. ⚠️ You chose permanent deletion — space is freed immediately and this cannot be undone.',
      purgeLabel: 'Delete permanently (skip the recycle bin, unrecoverable)',
      trashHint: 'Deleted sessions go to the recycle bin first and still occupy space until you empty it.',
      deleteDone: 'Deleted {count} session(s), {mode}',
      modeTrash: 'moved to recycle bin',
      modePurge: 'permanently deleted',
      skippedTitle: 'Skipped',
      cancel: 'Cancel',
      confirm: 'Confirm',
      close: 'Close',
      errorLabel: 'Error',
      cancelLabel: 'Cancel',
    }

    /** 面板样式：仅使用宿主主题 token。 */
    const CSS = `
.dshss-root { padding: 24px 28px 48px; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.55; }
.dshss-head { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px; }
.dshss-head h1 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
.dshss-sub { color: var(--dsw-alias-label-secondary); }
.dshss-spacer { flex: 1 1 auto; }
.dshss-btn { appearance: none; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 5px 12px; font-size: 13px; cursor: pointer; white-space: nowrap; }
.dshss-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
.dshss-btn:disabled { opacity: .5; cursor: default; }
.dshss-btn-primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
.dshss-btn-danger { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.dshss-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-bottom: 22px; }
.dshss-card { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 8px; padding: 10px 12px; }
.dshss-card-k { color: var(--dsw-alias-label-secondary); font-size: 12px; margin-bottom: 2px; }
.dshss-card-v { font-size: 16px; font-weight: 600; }
.dshss-section { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; margin-bottom: 18px; overflow: hidden; }
.dshss-section-head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--dsw-alias-bg-layer-2); border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dshss-section-head h2 { margin: 0; font-size: 13px; font-weight: 600; }
.dshss-section-body { padding: 12px 14px; }
.dshss-empty { color: var(--dsw-alias-label-secondary); padding: 6px 0; }
.dshss-toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--dsw-alias-border-l1); flex-wrap: wrap; }
.dshss-input { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 5px 9px; font-size: 13px; min-width: 200px; }
.dshss-table { width: 100%; border-collapse: collapse; }
.dshss-table th { text-align: left; font-weight: 500; color: var(--dsw-alias-label-secondary); font-size: 12px; padding: 7px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); white-space: nowrap; }
.dshss-table td { padding: 7px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); vertical-align: middle; }
.dshss-table tr:last-child td { border-bottom: none; }
.dshss-table tbody tr:hover { background: var(--dsw-alias-bg-layer-2); }
.dshss-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.dshss-title { display: flex; align-items: center; gap: 6px; }
.dshss-ellip { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshss-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dshss-tag { display: inline-block; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; padding: 0 7px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dshss-tag-live { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }
.dshss-list { margin: 0; padding: 0; list-style: none; }
.dshss-list li { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dshss-list li:last-child { border-bottom: none; }
.dshss-notice { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 9px 12px; margin-bottom: 16px; }
.dshss-notice-error { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.dshss-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 60; }
.dshss-dialog { background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 18px 20px; width: 440px; max-width: calc(100vw - 40px); box-shadow: 0 12px 32px rgba(0,0,0,.28); }
.dshss-dialog h3 { margin: 0 0 8px; font-size: 14px; }
.dshss-dialog p { margin: 0 0 14px; color: var(--dsw-alias-label-secondary); }
.dshss-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
.dshss-check { display: flex; align-items: center; gap: 7px; margin-bottom: 14px; }
`

    /**
     * 把字节数格式化成人读形式。
     * @param {number} n 字节数。
     * @returns {string} 形如 `1.2 MB`。
     */
    function fmtBytes(n) {
      if (!Number.isFinite(n) || n <= 0) return '0 B'
      const units = ['B', 'KB', 'MB', 'GB', 'TB']
      let i = 0
      let value = n
      while (value >= 1024 && i < units.length - 1) {
        value /= 1024
        i += 1
      }
      return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
    }

    /**
     * 格式化时间戳。
     * @param {number|undefined} ms 毫秒时间戳。
     * @returns {string} 本地时间，缺失时为 `—`。
     */
    function fmtTime(ms) {
      if (!ms) return '—'
      const d = new Date(ms)
      const p = (x) => String(x).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    }

    /**
     * 带占位符替换的文案函数。
     * @param {string} text 含 `{name}` 占位符的模板。
     * @param {object} [vars] 占位符取值。
     * @returns {string} 替换结果。
     */
    function fill(text, vars) {
      if (!vars) return text
      return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m))
    }

    /**
     * 调用宿主接口。
     * @param {string} endpoint 接口路径。
     * @param {object} [body] 请求体；省略则为 GET。
     * @returns {Promise<object>} 响应 JSON。
     */
    async function callApi(endpoint, body) {
      const res = await fetch(`${API}${endpoint}`, body === undefined
        ? { cache: 'no-store' }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify(body),
          })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }

    /**
     * 侧边栏面板图标。
     * @param {{size:number, active:boolean}} props 宿主注入的图标属性。
     * @returns {object} React 元素。
     */
    function PanelIcon(props) {
      const size = props.size || 16
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('ellipse', { cx: 8, cy: 4, rx: 5.2, ry: 2.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', {
          d: 'M2.8 4v8c0 1.2 2.3 2.2 5.2 2.2s5.2-1 5.2-2.2V4',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
        }),
        h('path', { d: 'M2.8 8c0 1.2 2.3 2.2 5.2 2.2s5.2-1 5.2-2.2', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
      )
    }

    /**
     * 简易确认对话框，支持 Esc 关闭与初始聚焦。
     * @param {object} props 标题、正文、确认回调等。
     * @returns {object|null} React 元素。
     */
    function ConfirmDialog(props) {
      const confirmRef = React.useRef(null)
      React.useEffect(() => {
        const onKey = (e) => {
          if (e.key === 'Escape') props.onCancel()
        }
        document.addEventListener('keydown', onKey)
        if (confirmRef.current) confirmRef.current.focus()
        return () => document.removeEventListener('keydown', onKey)
      }, [props])
      return h(
        'div',
        { className: 'dshss-overlay', onClick: props.onCancel },
        h(
          'div',
          {
            className: 'dshss-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': props.title,
            onClick: (e) => e.stopPropagation(),
          },
          h('h3', null, props.title),
          h('p', null, props.body),
          props.children,
          h(
            'div',
            { className: 'dshss-dialog-actions' },
            h('button', { type: 'button', className: 'dshss-btn', onClick: props.onCancel }, props.cancelLabel),
            h(
              'button',
              {
                type: 'button',
                ref: confirmRef,
                className: `dshss-btn ${props.danger ? 'dshss-btn-danger' : 'dshss-btn-primary'}`,
                onClick: props.onConfirm,
                disabled: props.busy,
              },
              props.busy ? props.busyLabel : props.confirmLabel,
            ),
          ),
        ),
      )
    }

    /**
     * 主面板页面。
     * @param {{t:Function}} props 本地化函数。
     * @returns {object} React 元素。
     */
    function StoragePage(props) {
      const t = props.t
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [query, setQuery] = React.useState('')
      const [sortKey, setSortKey] = React.useState('size')
      const [selected, setSelected] = React.useState(() => new Set())
      const [dialog, setDialog] = React.useState(null)

      const load = React.useCallback(async () => {
        setError(null)
        try {
          setData(await callApi('/overview'))
        } catch (e) {
          setError(String(e.message || e))
        }
      }, [])

      React.useEffect(() => {
        load()
      }, [load])

      const sessions = data ? data.sessions : []
      const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase()
        let list = sessions
        if (q) {
          list = list.filter((s) =>
            `${s.title || ''} ${s.workspacePath || ''} ${s.workspaceLabel || ''} ${s.id}`.toLowerCase().includes(q),
          )
        }
        const sorted = [...list]
        if (sortKey === 'size') sorted.sort((a, b) => b.bytes - a.bytes)
        else sorted.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0))
        return sorted
      }, [sessions, query, sortKey])

      const selectedBytes = sessions.filter((s) => selected.has(s.id)).reduce((n, s) => n + s.bytes, 0)

      /**
       * 切换某一行选中状态。
       * @param {string} id 会话 id。
       * @returns {void}
       */
      const toggle = (id) => {
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }

      /**
       * 执行垃圾清理。
       * @returns {Promise<void>}
       */
      const doClean = async () => {
        setBusy(true)
        try {
          const res = await callApi('/clean', {})
          setNotice({ kind: 'ok', text: fill(t('cleaned'), { count: res.removed.length, size: fmtBytes(res.freedBytes) }) })
          setDialog(null)
          await load()
        } catch (e) {
          setNotice({ kind: 'error', text: `${t('errorLabel')}: ${e.message}` })
        } finally {
          setBusy(false)
        }
      }

      /**
       * 执行回收站清空。
       * @returns {Promise<void>}
       */
      const doEmptyTrash = async () => {
        setBusy(true)
        try {
          const res = await callApi('/trash/empty', {})
          setNotice({ kind: 'ok', text: fill(t('emptied'), { size: fmtBytes(res.freedBytes) }) })
          setDialog(null)
          await load()
        } catch (e) {
          setNotice({ kind: 'error', text: `${t('errorLabel')}: ${e.message}` })
        } finally {
          setBusy(false)
        }
      }

      /**
       * 执行会话删除。
       * @param {boolean} purge 是否永久删除。
       * @returns {Promise<void>}
       */
      const doDelete = async (purge) => {
        setBusy(true)
        try {
          const res = await callApi('/delete', { sessionIds: [...selected], mode: purge ? 'purge' : 'trash' })
          const modeText = purge ? t('modePurge') : t('modeTrash')
          setNotice({
            kind: res.failed && res.failed.length > 0 ? 'error' : 'ok',
            text: fill(t('deleteDone'), { count: res.deleted.length, mode: modeText }),
          })
          setSelected(new Set())
          setDialog(null)
          await load()
        } catch (e) {
          setNotice({ kind: 'error', text: `${t('errorLabel')}: ${e.message}` })
        } finally {
          setBusy(false)
        }
      }

      const totals = data ? data.totals : null

      return h(
        'div',
        { className: 'dshss-root' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'dshss-head' },
          h('div', null, h('h1', null, t('title')), h('div', { className: 'dshss-sub' }, t('subtitle'))),
          h('div', { className: 'dshss-spacer' }),
          h('button', { type: 'button', className: 'dshss-btn', onClick: load, disabled: busy }, t('refresh')),
        ),

        notice
          ? h(
              'div',
              { className: `dshss-notice${notice.kind === 'error' ? ' dshss-notice-error' : ''}` },
              notice.text,
            )
          : null,
        error
          ? h(
              'div',
              { className: 'dshss-notice dshss-notice-error' },
              `${t('loadFailed')}: ${error} `,
              h('button', { type: 'button', className: 'dshss-btn', onClick: load }, t('retry')),
            )
          : null,

        data === null && error === null ? h('div', { className: 'dshss-empty' }, t('loading')) : null,

        totals
          ? h(
              'div',
              { className: 'dshss-cards' },
              h('div', { className: 'dshss-card' }, h('div', { className: 'dshss-card-k' }, t('statSize')), h('div', { className: 'dshss-card-v' }, fmtBytes(totals.sessionBytes))),
              h('div', { className: 'dshss-card' }, h('div', { className: 'dshss-card-k' }, t('statSessions')), h('div', { className: 'dshss-card-v' }, String(totals.sessionCount))),
              h('div', { className: 'dshss-card' }, h('div', { className: 'dshss-card-k' }, t('statWorkspaces')), h('div', { className: 'dshss-card-v' }, String(totals.workspaceCount))),
              h('div', { className: 'dshss-card' }, h('div', { className: 'dshss-card-k' }, t('statCache')), h('div', { className: 'dshss-card-v' }, fmtBytes(totals.cacheBytes))),
              h('div', { className: 'dshss-card' }, h('div', { className: 'dshss-card-k' }, t('statOrphans')), h('div', { className: 'dshss-card-v' }, String(totals.orphanCount))),
              h('div', { className: 'dshss-card' }, h('div', { className: 'dshss-card-k' }, t('statEmpty')), h('div', { className: 'dshss-card-v' }, String(totals.emptyCount))),
            )
          : null,

        // ---- 垃圾清理 ----
        data
          ? h(
              'div',
              { className: 'dshss-section' },
              h(
                'div',
                { className: 'dshss-section-head' },
                h('h2', null, t('garbageTitle')),
                h('div', { className: 'dshss-spacer' }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshss-btn',
                    disabled: busy || (totals.orphanCount === 0 && totals.emptyCount === 0),
                    onClick: () =>
                      setDialog({
                        kind: 'clean',
                        title: t('cleanConfirmTitle'),
                        body: fill(t('cleanConfirmBody'), {
                          count: totals.orphanCount + totals.emptyCount,
                          size: fmtBytes(totals.orphanBytes + totals.emptyBytes),
                        }),
                      }),
                  },
                  t('clean'),
                ),
              ),
              h(
                'div',
                { className: 'dshss-section-body' },
                totals.orphanCount === 0 && totals.emptyCount === 0
                  ? h('div', { className: 'dshss-empty' }, t('garbageNone'))
                  : h(
                      'div',
                      null,
                      totals.orphanCount > 0
                        ? h(
                            'div',
                            null,
                            h('div', { className: 'dshss-card-k' }, `${t('orphanCaches')} · ${totals.orphanCount}`),
                            h(
                              'ul',
                              { className: 'dshss-list' },
                              data.garbage.orphanCaches.slice(0, 50).map((o) =>
                                h(
                                  'li',
                                  { key: o.id },
                                  h('span', { className: 'dshss-mono' }, o.id),
                                  h('span', { className: 'dshss-spacer' }),
                                  h('span', { className: 'dshss-num' }, fmtBytes(o.bytes)),
                                ),
                              ),
                            ),
                          )
                        : null,
                      totals.emptyCount > 0
                        ? h(
                            'div',
                            { style: { marginTop: totals.orphanCount > 0 ? 12 : 0 } },
                            h('div', { className: 'dshss-card-k' }, `${t('emptySessions')} · ${totals.emptyCount}`),
                            h(
                              'ul',
                              { className: 'dshss-list' },
                              data.garbage.emptySessions.slice(0, 50).map((o) =>
                                h(
                                  'li',
                                  { key: o.id },
                                  h('span', { className: 'dshss-mono' }, o.id),
                                  h('span', { className: 'dshss-spacer' }),
                                  h('span', { className: 'dshss-num' }, fmtBytes(o.bytes)),
                                ),
                              ),
                            ),
                          )
                        : null,
                    ),
              ),
            )
          : null,

        // ---- 回收站 ----
        data
          ? h(
              'div',
              { className: 'dshss-section' },
              h(
                'div',
                { className: 'dshss-section-head' },
                h('h2', null, t('trashTitle')),
                h('span', { className: 'dshss-sub' }, totals.trashCount > 0 ? fill(t('trashBatches'), { count: totals.trashCount, size: fmtBytes(totals.trashBytes) }) : ''),
                h('div', { className: 'dshss-spacer' }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshss-btn dshss-btn-danger',
                    disabled: busy || totals.trashCount === 0,
                    onClick: () =>
                      setDialog({
                        kind: 'trash',
                        title: t('emptyTrashConfirmTitle'),
                        body: fill(t('emptyTrashConfirmBody'), { size: fmtBytes(totals.trashBytes) }),
                        danger: true,
                      }),
                  },
                  t('emptyTrash'),
                ),
              ),
              h(
                'div',
                { className: 'dshss-section-body' },
                totals.trashCount === 0 ? h('div', { className: 'dshss-empty' }, t('trashEmpty')) : h('div', { className: 'dshss-sub' }, t('trashHint')),
              ),
            )
          : null,

        // ---- 会话列表 ----
        data
          ? h(
              'div',
              { className: 'dshss-section' },
              h(
                'div',
                { className: 'dshss-toolbar' },
                h('h2', { style: { margin: 0, fontSize: 13, fontWeight: 600 } }, t('sessionsTitle')),
                h('input', {
                  className: 'dshss-input',
                  placeholder: t('search'),
                  value: query,
                  onChange: (e) => setQuery(e.target.value),
                }),
                h(
                  'button',
                  { type: 'button', className: 'dshss-btn', onClick: () => setSortKey(sortKey === 'size' ? 'date' : 'size') },
                  sortKey === 'size' ? t('sortSize') : t('sortDate'),
                ),
                h('div', { className: 'dshss-spacer' }),
                selected.size > 0
                  ? h('span', { className: 'dshss-sub' }, fill(t('selected'), { count: selected.size, size: fmtBytes(selectedBytes) }))
                  : null,
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshss-btn',
                    onClick: () => setSelected(new Set(filtered.filter((s) => !s.isLive).map((s) => s.id))),
                  },
                  t('selectAll'),
                ),
                h('button', { type: 'button', className: 'dshss-btn', disabled: selected.size === 0, onClick: () => setSelected(new Set()) }, t('clearSelection')),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshss-btn dshss-btn-danger',
                    disabled: busy || selected.size === 0,
                    onClick: () => setDialog({ kind: 'delete' }),
                  },
                  t('deleteSelected'),
                ),
              ),
              filtered.length === 0
                ? h('div', { className: 'dshss-section-body dshss-empty' }, sessions.length === 0 ? t('noSessions') : t('noMatch'))
                : h(
                    'table',
                    { className: 'dshss-table' },
                    h(
                      'thead',
                      null,
                      h(
                        'tr',
                        null,
                        h('th', { style: { width: 28 } }),
                        h('th', null, t('columnTitle')),
                        h('th', null, t('columnWorkspace')),
                        h('th', { className: 'dshss-num' }, t('columnTurns')),
                        h('th', { className: 'dshss-num' }, t('columnSize')),
                        h('th', null, t('columnTime')),
                      ),
                    ),
                    h(
                      'tbody',
                      null,
                      filtered.map((s) =>
                        h(
                          'tr',
                          { key: s.id },
                          h(
                            'td',
                            null,
                            h('input', {
                              type: 'checkbox',
                              checked: selected.has(s.id),
                              disabled: s.isLive,
                              onChange: () => toggle(s.id),
                              'aria-label': s.title || s.id,
                            }),
                          ),
                          h(
                            'td',
                            null,
                            h(
                              'div',
                              { className: 'dshss-title' },
                              h('span', { className: 'dshss-ellip', title: s.id }, s.title || t('untitled')),
                              s.isLive ? h('span', { className: 'dshss-tag dshss-tag-live' }, t('live')) : null,
                            ),
                          ),
                          h(
                            'td',
                            null,
                            h('span', { className: 'dshss-ellip dshss-mono', title: s.workspacePath || s.workspaceDir }, s.workspaceLabel || s.workspacePath || s.workspaceDir),
                          ),
                          h('td', { className: 'dshss-num' }, s.turns === undefined ? '—' : String(s.turns)),
                          h('td', { className: 'dshss-num' }, fmtBytes(s.bytes)),
                          h('td', { className: 'dshss-mono' }, fmtTime(s.mtimeMs)),
                        ),
                      ),
                    ),
                  ),
            )
          : null,

        // ---- 对话框 ----
        dialog && dialog.kind === 'clean'
          ? h(ConfirmDialog, {
              title: dialog.title,
              body: dialog.body,
              confirmLabel: t('confirm'),
              cancelLabel: t('cancel'),
              busyLabel: t('cleaning'),
              busy,
              onCancel: () => setDialog(null),
              onConfirm: doClean,
            })
          : null,

        dialog && dialog.kind === 'trash'
          ? h(ConfirmDialog, {
              title: dialog.title,
              body: dialog.body,
              confirmLabel: t('confirm'),
              cancelLabel: t('cancel'),
              busyLabel: t('emptying'),
              busy,
              danger: true,
              onCancel: () => setDialog(null),
              onConfirm: doEmptyTrash,
            })
          : null,

        dialog && dialog.kind === 'delete'
          ? (() => {
              const purge = dialog.purge === true
              return h(
                ConfirmDialog,
                {
                  title: fill(t('deleteConfirmTitle'), { count: selected.size }),
                  body: fill(purge ? t('deleteConfirmBodyPurge') : t('deleteConfirmBody'), { size: fmtBytes(selectedBytes) }),
                  confirmLabel: t('confirm'),
                  cancelLabel: t('cancel'),
                  busyLabel: t('deleting'),
                  busy,
                  danger: true,
                  onCancel: () => setDialog(null),
                  onConfirm: () => doDelete(purge),
                },
                h(
                  'label',
                  { className: 'dshss-check' },
                  h('input', {
                    type: 'checkbox',
                    checked: purge,
                    onChange: (e) => setDialog({ kind: 'delete', purge: e.target.checked }),
                  }),
                  t('purgeLabel'),
                ),
              )
            })()
          : null,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'session-storage: dictionaries')

        // 侧边栏图标：id 与 main 面板的 key 同名，点击即切换到该面板
        ctx.effect(
          () =>
            ctx.slots.inject('sidebar.panellist', () =>
              ctx.slots.register(
                { name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: () => ctx.locale.bind(NS)('panel') },
                PanelIcon,
              ),
            ),
          'session-storage: panellist',
        )

        // 主区域页面
        ctx.effect(
          () =>
            ctx.slots.inject('main', () =>
              ctx.slots.register({ name: 'main', key: PANEL_ID, inject: () => ({ t }) }, StoragePage),
            ),
          'session-storage: main',
        )
      },
    }
  },
})
