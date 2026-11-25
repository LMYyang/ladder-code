# 阶梯密码（Ladder Code）

序列推理益智游戏：系统（或对手）生成一个数字互不重复的秘密序列，玩家每轮提交同长度猜想，服务端只回报两个统计量——**定序数（asc，相邻升序对）**与**逆序数（desc，逆序对）**——在限定次数内靠集合求交推出完整序列。

与 1A2B 的本质区别：反馈与位置无关，是序列的全局有序性统计，解空间压缩靠候选集求交。

- 单人闯关（主）：20 个常规关卡 + 无尽模式，入门 3–5 分钟、进阶 5–10 分钟
- 双人 1v1（辅）：一人设密码一人猜，独立 2 座位房间

需求与技术方案见 `docs/需求文档.md`（口径 v2 锁定，§2.5 唯一实现定义）、`docs/技术方案.md`。

## 开发

```bash
npm run dev:h5        # H5 开发（vite 热更新）
npm test              # vitest 全部用例（103 条：core 纯逻辑 + 双人服联 + 客户端接线）
npm run build:h5      # → dist/build/h5
npm run build:server  # → server/server.bundle.mjs（esbuild 自包含单文件）
node server/server.bundle.mjs   # 一个进程：页面 + WebSocket，端口 3004
```

> 依赖集中在工作区根 `node_modules`，项目目录内无需 `npm install`。

## 端口与部署

端口唯一来源是根目录 `config.json` 的 `wsPort`（默认 3004），`PORT` 环境变量优先级更高。构建期可用 `VITE_WS_URL` 注入跨域地址（`https` 页面自动用 `wss://` 同源）。

部署：拷 `dist/build/h5/` + `server/`（bundle + `config.json`），`node server/server.bundle.mjs` 一个进程同时供页面与 WebSocket，零依赖、不需要 nginx。

## 结构

```
src/core/sequence/   纯逻辑（不依赖 Vue 与 uni API）
  feedback.js          反馈统计唯一实现：asc（相邻升序对）+ desc（逆序对），skip 语义
  generator.js         密码生成（不重复数字、按关卡约束）
  levels.js            关卡表（20 关）+ 无尽模式 endlessCfg + 成就（5 枚）
  variant.js           高阶变体：反馈改为「最长连续升序段长度」（信息量更小，救援提示必开）
  solver.js            候选集求交求解 / 提示选择
  store.js             进度存档（key sequence_progress_v1，storage 可注入）
src/composables/     useSequence（单人状态机）/ useSeqNetGame（双人局，镜像 useNetGame 模式）
src/pages/sequence/  index 大厅 / levels 关卡 / game 单人+双人共用 / help 规则
server/              index.js（HTTP+WS+静态托管，seq.* 分支）/ sequenceRooms.js（独立 2 座位管理器）/ rooms.js（复用顶牛子 4 座位基础层）/ port.js
tests/               sequence-{feedback,generator,levels,solver,variant,useSequence}.test.js 纯逻辑
                     sequence-server.test.js 双人服联（仿 net-scenarios）
                     sequence-m4.test.js 双人模式集成
```

## 架构约定

- 反馈口径唯一实现：`src/core/sequence/feedback.js`，服务端与客户端共用，UI 只拿 `{asc, desc}` 不泄露序列
- 双人房间独立于顶牛子 `rooms.js`：`sequenceRooms.js` 只管 2 座位，房间生命周期/心跳/重连复用底层机制
- `vitest.config.js` 不加载 uni 插件，核心测试跑在 node 环境
