// 打包联网服务器为单文件 bundle：部署只需 dist/ + server/ 两个目录（不需要 src/）。
// 产物 server/server.bundle.mjs（ESM，Node 20+）：src/core/sequence 与全部 npm 依赖（含 ws）内联，
// 自包含零依赖，服务器无需 npm install。
// 启动：node server/server.bundle.mjs（端口：PORT 环境变量 > config.json > 3004）
import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

await build({
  entryPoints: [path.join(ROOT, 'server', 'index.js')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: path.join(ROOT, 'server', 'server.bundle.mjs'),
  // ws 的两个可选原生加速模块：源码用 try/catch 包住 require，不装不影响功能
  external: ['bufferutil', 'utf-8-validate'],
  // 内联的 ws（CJS）通过 __require 调 node 内建模块，纯 ESM 环境注入 createRequire 兜底
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
  },
  legalComments: 'none',
  logLevel: 'info',
})

console.log('[build:server] 产物: server/server.bundle.mjs（自包含，无需 node_modules / src）')
console.log('[build:server] 部署 = dist/ + server/ 两个目录，服务器上 node server/server.bundle.mjs 启动')
