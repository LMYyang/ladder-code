import { createServer } from 'node:http'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { SequenceRoomManager } from './sequenceRooms.js'
import { readPort } from './port.js'

/**
 * 阶梯密码服务器（M3：双人 1v1 设密猜谜；单人不走服务器）。
 * createServerApp(port, opts) 返回 { httpServer, wss, port, mgr }，测试用随机端口与短心跳。
 * v1 不托管 H5 静态产物（部署期由顶层 nginx/IIS 托管，或后续按顶牛子模式补 STATIC_DIR）。
 */

const HEARTBEAT_MS = 15_000

export function createServerApp(port = readPort(), { heartbeatMs = HEARTBEAT_MS } = {}) {
  const mgr = new SequenceRoomManager()
  const httpServer = createServer((req, res) => {
    res.writeHead(426).end('WebSocket only')
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
  app.httpServer.listen(app.port, () => console.log(`[ladder-code] server listening on :${app.port}`))
}
