import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { SequenceRoomManager } from './sequenceRooms.js'
import { readPort } from './port.js'

/**
 * 阶梯密码服务器（M3：双人 1v1 设密猜谜；单人不走服务器）。
 * createServerApp(port, opts) 返回 { httpServer, wss, port, mgr }，测试用随机端口与短心跳。
 * 同端口托管 H5 静态产物（dist/build/h5）：一个进程同时提供页面与 WebSocket，
 * 不再需要 nginx 托管页面；dist 缺失时回 426 提示先构建。
 */

const HEARTBEAT_MS = 15_000

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

/**
 * html 必须 no-cache（index.html 引用带 hash 的 js，缓存住会导致强刷也拿不到新包），
 * 带 hash 的 assets 长缓存。
 */
function sendFile(res, file, data) {
  const ext = path.extname(file).toLowerCase()
  const cache = ext === '.html' ? 'no-cache, must-revalidate' : 'public, max-age=31536000, immutable'
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache }).end(data)
}

export function createServerApp(port = readPort(), { heartbeatMs = HEARTBEAT_MS, staticDir: staticDirOpt = null } = {}) {
  const mgr = new SequenceRoomManager()
  const staticDir = staticDirOpt
    ? path.resolve(staticDirOpt)
    : process.env.STATIC_DIR
      ? path.resolve(process.env.STATIC_DIR)
      : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/build/h5')

  let staticReady = null
  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      let pathname = decodeURIComponent(url.pathname)
      if (pathname.includes('..')) {
        res.writeHead(403).end()
        return
      }
      if (pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('ok')
        return
      }
      if (pathname === '/') pathname = '/index.html'
      const file = path.join(staticDir, pathname)
      if (!file.startsWith(staticDir)) {
        res.writeHead(403).end()
        return
      }
      staticReady ||= fs.readdir(staticDir).then(() => true, () => false)
      if (!(await staticReady)) {
        res.writeHead(426).end('WebSocket only: 请先 npm run build:h5')
        return
      }
      const data = await fs.readFile(file).catch(() => null)
      if (data === null) {
        const index = await fs.readFile(path.join(staticDir, 'index.html')).catch(() => null)
        if (index === null) {
          res.writeHead(404).end('Not Found')
          return
        }
        sendFile(res, 'index.html', index)
        return
      }
      sendFile(res, file, data)
    } catch (e) {
      console.error('[ladder-code] static error:', e.message)
      res.writeHead(500).end()
    }
  })
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 64 * 1024 })

  wss.on('connection', (socket) => {
    const conn = {
      raw: socket,
      alive: true,
      send(obj) { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(obj)) },
      close() { try { socket.close() } catch { /* noop */ } },
    }
    socket.on('error', (err) => console.error('[ladder-code] socket error:', err.message))
    socket.on('pong', () => { conn.alive = true })
    socket.on('message', () => { conn.alive = true })
    const beat = setInterval(() => {
      if (socket.readyState !== socket.OPEN) { clearInterval(beat); return }
      if (!conn.alive) {
        clearInterval(beat)
        socket.terminate()
        return
      }
      conn.alive = false
      try { socket.ping() } catch { /* readyState 竞态：下一轮再判 */ }
    }, heartbeatMs)
    beat.unref?.()
    socket.on('close', () => {
      clearInterval(beat)
      mgr.onConnClose(conn)
    })
    socket.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch {
        conn.send({ type: 'error', payload: { code: 'BAD_JSON', message: '消息格式错误' } })
        return
      }
      try {
        handle(mgr, conn, msg)
      } catch (e) {
        conn.send({ type: 'error', payload: { code: 'INTERNAL', message: '服务器内部错误' } })
        console.error('[ladder-code] handle error:', e)
      }
    })
  })

  const sweepTimer = setInterval(() => mgr.sweep(), 30_000)
  sweepTimer.unref?.()

  return { httpServer, wss, port, mgr }
}

/** 消息路由：seq.* 命名空间。有 requestId 时带 requestId 回执 */
function handle(mgr, conn, msg) {
  const { type, requestId } = msg || {}
  const payload = (msg && msg.payload) || {}
  const reply = (t, p) => conn.send({ type: t, payload: p, ...(requestId ? { requestId } : {}) })
  const replyError = (code, message) => reply('error', { code, message })

  switch (type) {
    case 'seq.room.create': {
      const { room, token, seat } = mgr.createRoom(conn, sanitizeName(payload.name))
      conn.token = token
      return reply('seq.room.created', { room: mgr.roomState(room), token, yourSeat: seat })
    }
    case 'seq.room.join': {
      const roomId = Number(payload.roomId)
      if (!Number.isInteger(roomId)) return replyError('SEQ_BAD_REQUEST', '房间号非法')
      const res = mgr.joinRoom(conn, sanitizeName(payload.name), roomId)
      if (res.error) return replyError(res.error.code, res.error.message)
      conn.token = res.token
      return reply('seq.room.joined', { room: mgr.roomState(res.room), token: res.token, yourSeat: res.seat })
    }
    case 'seq.room.leave': {
      reply('seq.room.left', {})
      if (conn.token) mgr.leave(conn.token)
      conn.token = null
      return
    }
    case 'seq.round.setSecret': {
      const room = mgr.roomOf(conn.token)
      if (!room) return replyError('SEQ_NOT_IN_ROOM', '不在此房间')
      const res = mgr.setSecret(conn.token, payload.secret, payload.mode)
      if (res.error) return replyError(res.error.code, res.error.message)
      return reply('seq.round.setSecret.ok', {})
    }
    case 'seq.guess': {
      const res = mgr.guess(conn.token, payload.guess)
      if (res.error) return replyError(res.error.code, res.error.message)
      return reply('seq.guess.ok', { solved: res.solved })
    }
    case 'seq.round.hint': {
      const res = mgr.askHint(conn.token)
      if (res.error) return replyError(res.error.code, res.error.message)
      return reply('seq.round.hint.ok', {})
    }
    case 'seq.round.again': {
      const res = mgr.settleContinue(conn.token)
      if (res.error) return replyError(res.error.code, res.error.message)
      return reply('seq.round.again.ok', {})
    }
    case 'seq.session.check': {
      const found = mgr.checkSession(String(payload.token || ''))
      return reply('seq.session.check.ok', { session: found })
    }
    case 'reconnect': {
      const reqToken = String(payload.token || '')
      const res = mgr.reconnect(conn, reqToken)
      if (res.error) return replyError(res.error.code, res.error.message)
      conn.token = reqToken
      return reply('reconnected', { room: mgr.roomState(res.room), yourSeat: res.seat })
    }
    default:
      return replyError('UNKNOWN_TYPE', '未知消息类型')
  }
}

function sanitizeName(name) {
  const s = String(name ?? '').replace(/[\u0000-\u001f\u202a-\u202e]/g, '').trim().slice(0, 12)
  return s || '玩家'
}

// 直接运行时启动（被 import 时不启动）
const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (entry && entry === import.meta.url) {
  const app = createServerApp(Number(process.env.PORT || readPort()))
  app.httpServer.listen(app.port, () => {
    console.log(`[ladder-code] server listening on :${app.port}（static: ${process.env.STATIC_DIR || 'dist/build/h5'}）`)
    console.log(`[ladder-code] ws://127.0.0.1:${app.port}  ·  页面 http://127.0.0.1:${app.port}`)
  })
}
