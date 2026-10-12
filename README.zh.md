# dsh-session-storage

一个标准的 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）bundle 插件，用来查看和管理 DSH 在本地产生的会话存储。

它在 DSH Web 界面左侧栏新增一个 **会话存储** 面板，用于查看对话占用了多少空间、清理垃圾、删除会话。

[English](README.md)

## 功能

- **占用概览**：会话总体积、会话数、工作区数、投影缓存体积、孤儿缓存数、空会话目录数。
- **按工作区分组**：每个会话的标题、体积、最后修改时间、轮次。
- **垃圾清理**
  - *孤儿缓存* —— `storages/session_projcache/sessions/<id>.json` 存在，但对应会话目录已不存在。
  - *空会话目录* —— 目录存在，但没有 `session.v4.jsonl.zstd` 正文。
- **会话删除**：勾选后删除。**默认移入回收站**（`$DSH_HOME/.session-storage-trash/`），空间不会立即释放；点「清空回收站」才真正回收。确认框里也可以选择永久删除。
- **搜索与排序**：按标题/路径搜索，按体积或时间排序。

## 安装

```bash
dsh plugin --profile <你的 profile> add github:WanderingEra/dsh-session-storage
```

`<你的 profile>` 是 DSH 实际运行的 profile，常见为 `web` 或 `desktop`；可用 `dsh --profile <name> --dump-config` 确认。

装完重启 DSH，在左侧栏找数据库形状的图标。如果没出现，硬刷新页面（Ctrl+F5）。

## 卸载

```bash
dsh plugin --profile <你的 profile> remove dsh-session-storage
```

## 存储位置

插件读取 `$DSH_HOME`（默认 `~/.dsh`，可用环境变量覆盖）：

| 路径 | 内容 |
| --- | --- |
| `sessions/<编码的工作区路径>/session-<uuid>/session.v4.jsonl.zstd` | 会话正文（zstd 压缩的 JSONL） |
| `storages/session_projcache/sessions/<会话 id>.json` | 投影缓存：标题、轮次、token 用量 |
| `storages/workspace.json` | 工作区注册表（本插件只读，用于把会话归到工作区） |
| `.session-storage-trash/` | 本插件的回收站（由插件创建） |

## 安全边界

删除是破坏性操作，插件按以下规则收紧：

1. **不信任客户端路径** —— 删除目标由宿主重新扫描得出；客户端只传会话 id。
2. **id 格式校验** —— 目录名必须匹配 `session-<uuid>`，`../../etc/passwd` 这类输入在触碰文件系统前就被拒绝。
3. **路径包含校验** —— 任何待删路径必须严格位于 `$DSH_HOME/sessions` 或回收站之内。
4. **活动会话保护** —— 正在内存中运行的会话（`ctx.sessions`）一律拒绝删除，界面上复选框也是禁用的。
5. **写操作仅限本机** —— 写接口要求 Host 为回环地址，同时复用 DSH 宿主的浏览器信任栅栏（`ctx.connection.requestRejection`）；栅栏抛异常时按拒绝处理（fail-closed）。
6. **默认可恢复** —— 删除默认进回收站，永久删除需要显式勾选。
7. **不修改 `workspace.json`** —— 该文件归 DSH 的 workspace registry 所有；会话目录消失后，registry 读取时会自动过滤失效条目，无需外部改写。

## 接口

宿主半边在 `/session-storage` 前缀下注册路由，全部经过信任栅栏：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/session-storage/overview` | 存储概览（只读） |
| POST | `/session-storage/delete` | 删除会话。Body：`{ sessionIds, mode?: 'trash'\|'purge', dryRun?: boolean }` |
| POST | `/session-storage/clean` | 清理孤儿缓存与空目录。Body：`{ dryRun?: boolean }` |
| POST | `/session-storage/trash/empty` | 清空回收站，真正释放空间 |

传 `dryRun: true` 时只返回计划，不产生任何副作用。

## 开发

纯 JavaScript，无需构建、无依赖。

```bash
# 宿主半边功能测试（用假 ctx 捕获路由，处理器真实执行）
node test/host.test.mjs
```

测试是只读的：所有写路径都以 `dryRun` 调用。覆盖概览扫描、删除干跑无副作用、路径穿越拒绝、未知会话拒绝、清理干跑，以及信任栅栏对非回环与跨站写请求返回 403。

插件以 `link:` 方式安装，因此改 `client.js` 后硬刷新即生效，改 `index.js` 需要重启 DSH。

## 目录结构

```
package.json          # bundle manifest（dsh.bundle.patch + dsh.client）
cordis.patch.yml      # 把插件行插入 profile 配置树
index.js              # 宿主半边：存储扫描、孤儿检测、带护栏的删除
client.js             # 客户端半边：侧边栏面板图标 + 管理页面
icon.svg              # 面板图标
locale/{en,zh}.json   # 显示标题与描述
test/host.test.mjs    # 宿主半边功能测试
```

## 许可证

[MIT](LICENSE)
