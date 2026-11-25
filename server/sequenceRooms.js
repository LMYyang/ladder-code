/**
 * 阶梯密码双人对局管理器（服务器权威，独立于顶牛子 rooms.js，机制照抄其成熟模式）。
 *
 * 房间: { roomId, members, phase, secret, guesses, triesMax, triesLeft, hintsUsed,
 *         hintsLeft, hintOffers, settleAck, timers, createdAt, lastActiveAt }
 * 成员: { seat, token, name, connected, gone, isHost, conn, graceTimer }
 *
 * 阶段: 'WAITING' → 'SETTING'（设密方设密）→ 'GUESSING'（猜方推理）→ 'ROUND_OVER'（双方确认再来）
 *
 * 安全铁律（NFR-01）：secret 永不出现在任何 S→C 消息中，包括设密方自己的快照；
 * 仅 ROUND_OVER 且 result.revive 时回显。
 */

import { randomUUID } from 'node:crypto'

import { validateSeq, feedback } from '../src/core/sequence/feedback.js'
import { feedbackVariant } from '../src/core/sequence/variant.js'

const GRACE_MS = 60_000 // 断线宽限：超时未重连则移除并判负收尾
const ROOM_IDLE_MS = 5 * 60_000 // WAITING 房无活动销毁
const DUEL_TRIES = 8 // 双人局猜方次数（需求 §2.9）

function makeToken() {
  return randomUUID()
}

export class SequenceRoomManager {
  constructor() {
    this.rooms = new Map() // roomId -> room
    this.tokens = new Map() // token -> room
    this.now = () => Date.now()
  }

  // ---------- 房间生命周期 ----------

  newRoomId() {
    for (;;) {
      const id = 100000 + Math.floor(Math.random() * 900000)
      if (!this.rooms.has(id)) return id
    }
  }

  roomOf(token) {
    return this.tokens.get(token) || null
  }

  memberByToken(room, token) {
    return room.members.find((m) => m.token === token) || null
  }

  /** 房间快照（不含任何对局秘密） */
  roomState(room) {
    return {
      roomId: room.roomId,
      phase: room.phase,
      members: room.members.map((m) => ({
        seat: m.seat, name: m.name, connected: m.connected, gone: m.gone,
        isHost: m.isHost, token: m.token,
      })),
    }
  }

  /** 对局私有视图（按成员过滤；secret 绝不出现） */
  roundView(room, member) {
    return {
      phase: room.phase,
      L: room.L,
      triesMax: room.triesMax,
      triesLeft: room.triesLeft,
      role: member.seat === 0 ? 'setter' : 'guesser',
      guesses: room.guesses, // [{ seq, asc, desc, hits, solved }]（不含 secret）
      hintsUsed: room.hintsUsed,
      hintsLeft: room.hintsLeft,
      hintOffer: room.hintOffer,
      // ROUND_OVER 且正常结束：揭晓密码（需求 AC-06 单人可选展示、双人默认揭晓）
      secret: room.phase === 'ROUND_OVER' && room.result?.revive ? room.secret : null,
      result: room.result,
      mode: room.mode,
    }
  }

  broadcast(room, type, payload, exceptToken = null) {
    for (const m of room.members) {
      if (m.token === exceptToken || !m.conn) continue
      m.conn.send({ type, payload })
    }
  }

  pushRoomState(room, exceptToken = null) {
    this.broadcast(room, 'seq.room.state', { room: this.roomState(room) }, exceptToken)
  }

  /** 逐人下发各自的 round 视图（同消息类型、不同 payload） */
  pushRoundState(room) {
    for (const m of room.members) {
      if (!m.conn || m.gone) continue
      m.conn.send({ type: 'seq.round.state', payload: { view: this.roundView(room, m) } })
    }
  }

  createRoom(conn, name) {
    // 同连接已在房：幂等回原身份
    const existing = this.findByConn(conn)
    if (existing) {
      existing.member.name = name
      this.pushRoomState(existing.room)
      return { room: existing.room, token: existing.member.token, seat: existing.member.seat }
    }
    const room = this.freshRoom()
    const token = makeToken()
    room.members.push({ seat: 0, token, name, connected: true, gone: false, isHost: true, conn, graceTimer: null })
    this.rooms.set(room.roomId, room)
    this.tokens.set(token, room)
    return { room, token, seat: 0 }
  }

  joinRoom(conn, name, roomId) {
    const room = this.rooms.get(Number(roomId))
    if (!room) return { error: { code: 'SEQ_ROOM_GONE', message: '房间不存在或已解散' } }
    if (room.phase !== 'WAITING' && room.phase !== 'SETTING' && room.phase !== 'GUESSING' && room.phase !== 'ROUND_OVER') {
      return { error: { code: 'SEQ_BAD_STATE', message: '房间状态异常' } }
    }
    if (room.members.length >= 2) {
      // 已是本房成员：复用身份（幂等）
      const me = room.members.find((m) => m.conn === conn)
      if (me) return { room, token: me.token, seat: me.seat }
      return { error: { code: 'SEQ_ROOM_FULL', message: '房间已满' } }
    }
    const existing = this.findByConn(conn)
    if (existing && existing.room !== room) this.leave(existing.member.token)
    const token = makeToken()
    room.members.push({ seat: 1, token, name, connected: true, gone: false, isHost: false, conn, graceTimer: null })
    this.tokens.set(token, room)
    room.lastActiveAt = this.now()
    this.pushRoomState(room)
    return { room, token, seat: 1 }
  }

  findByConn(conn) {
    for (const room of this.rooms.values()) {
      const m = room.members.find((mm) => mm.conn === conn)
      if (m) return { room, member: m }
    }
    return null
  }

  freshRoom() {
    return {
      roomId: this.newRoomId(),
      members: [],
      phase: 'WAITING',
      mode: 'classic', // classic | variant（最长升序段）
      L: 4,
      secret: null,
      guesses: [],
      triesMax: DUEL_TRIES,
      triesLeft: DUEL_TRIES,
      hintsUsed: 0,
      hintsLeft: 2,
      hintOffer: null,
      result: null,
      settleAck: new Set(),
      timers: new Set(),
      createdAt: this.now(),
      lastActiveAt: this.now(),
    }
  }

  destroyRoom(roomId) {
    const room = this.rooms.get(roomId)
    if (!room) return
    for (const m of room.members) {
      this.tokens.delete(m.token)
      if (m.graceTimer) clearTimeout(m.graceTimer)
      m.conn = null
    }
    for (const t of room.timers || []) clearTimeout(t)
    this.rooms.delete(roomId)
  }

  leave(token) {
    const room = this.roomOf(token)
    if (!room) return { ok: true }
    const me = this.memberByToken(room, token)
    if (!me) return { ok: true }
    if (me.graceTimer) { clearTimeout(me.graceTimer); me.graceTimer = null }
    if (room.phase === 'WAITING') {
      this.removeMember(room, me)
      return { ok: true }
    }
    // 对局各阶段离开/断线统一走宽限 + 托管判定（60s 不回判负收尾）
    me.connected = false
    me.conn = null
    if (me.graceTimer) clearTimeout(me.graceTimer)
    me.graceTimer = setTimeout(() => {
      if (me.connected || me.gone) return
      me.gone = true
      this.tokens.delete(token)
      this.onGoneDuringPlay(room, me)
    }, GRACE_MS)
    room.lastActiveAt = this.now()
    this.pushRoomState(room)
    return { ok: true }
  }

  removeMember(room, member) {
    room.members = room.members.filter((m) => m !== member)
    this.tokens.delete(member.token)
    room.lastActiveAt = this.now()
    if (room.members.length === 0) {
      this.destroyRoom(room.roomId)
      return
    }
    if (member.isHost) this.promoteHost(room)
    this.pushRoomState(room)
  }

  promoteHost(room) {
    const next = room.members[0]
    if (next) {
      next.isHost = true
      next.seat = 0 // 房主恒为 setter 座位
      // 换位后原 guesser 变 setter：对局作废回 WAITING（设密权与座位绑定）
      if (room.phase !== 'WAITING') this.resetToWaiting(room)
    }
  }

  /** 对局回 WAITING：清空对局数据（不销毁房） */
  resetToWaiting(room) {
    room.phase = 'WAITING'
    room.secret = null
    room.guesses = []
    room.triesMax = DUEL_TRIES
    room.triesLeft = DUEL_TRIES
    room.hintsUsed = 0
    room.hintsLeft = 2
    room.hintOffer = null
    room.result = null
    room.settleAck = new Set()
    room.lastActiveAt = this.now()
    this.pushRoomState(room)
  }

  // ---------- 对局动作 ----------

  /** 设密方锁定密码（仅 SETTING 阶段、seat 0）。提交即锁定，无回退 */
  setSecret(token, secret, mode = 'classic') {
    const room = this.roomOf(token)
    if (!room) return { error: { code: 'SEQ_NOT_IN_ROOM', message: '不在此房间' } }
    const me = this.memberByToken(room, token)
    if (!me) return { error: { code: 'SEQ_NOT_IN_ROOM', message: '不在此房间' } }
    if (room.phase !== 'WAITING' && room.phase !== 'SETTING') {
      return { error: { code: 'SEQ_BAD_STATE', message: '当前不可设置密码' } }
    }
    if (me.seat !== 0) return { error: { code: 'SEQ_NOT_SETTER', message: '只有设密方能设置密码' } }
    const L = Number.isInteger(room.L) ? room.L : 4
    const chk = validateSeq(secret, L, '密码')
    if (!chk.ok) return { error: { code: 'SEQ_BAD_SECRET', message: chk.reason } }
    room.mode = mode === 'variant' ? 'variant' : 'classic'
    room.secret = [...secret]
    room.phase = 'GUESSING'
    room.guesses = []
    room.triesMax = DUEL_TRIES
    room.triesLeft = DUEL_TRIES
    room.hintsUsed = 0
    room.hintsLeft = 2
    room.hintOffer = null
    room.result = null
    room.settleAck = new Set()
    room.lastActiveAt = this.now()
    this.pushRoomState(room)
    this.pushRoundState(room)
    return { ok: true }
  }

  /** 猜方提交（仅 GUESSING、seat 1） */
  guess(token, guessArr) {
    const room = this.roomOf(token)
    if (!room) return { error: { code: 'SEQ_NOT_IN_ROOM', message: '不在此房间' } }
    const me = this.memberByToken(room, token)
    if (!me) return { error: { code: 'SEQ_NOT_IN_ROOM', message: '不在此房间' } }
    if (room.phase !== 'GUESSING') return { error: { code: 'SEQ_BAD_STATE', message: '非猜谜阶段' } }
    if (me.seat !== 1) return { error: { code: 'SEQ_NOT_GUESSER', message: '只有猜方能提交' } }
    const L = room.secret.length
    const chk = validateSeq(guessArr, L, '猜想')
    if (!chk.ok) return { error: { code: 'SEQ_BAD_GUESS', message: chk.reason } }
    const fb = room.mode === 'variant'
      ? (() => { const r = feedbackVariant(room.secret, guessArr); return { asc: r.run, desc: 0, solved: r.solved } })()
      : feedback(room.secret, guessArr)
    const hits = guessArr.filter((v) => room.secret.includes(v)).length
    const row = { seq: [...guessArr], asc: fb.asc, desc: fb.desc, hits, solved: fb.solved }
    room.guesses.unshift(row)
    room.triesLeft -= 1
    room.hintOffer = null
    room.lastActiveAt = this.now()
    if (fb.solved) {
      room.result = { winner: 'guesser', revive: true }
      room.phase = 'ROUND_OVER'
    } else if (room.triesLeft <= 0) {
      room.result = { winner: 'setter', revive: true }
      room.phase = 'ROUND_OVER'
    }
    this.pushRoundState(room)
    if (room.phase === 'ROUND_OVER') this.pushRoomState(room)
    return { ok: true, solved: fb.solved }
  }

  /** 救援提示（双人局由猜方触发，服务端生成，同单人口径） */
  askHint(token) {
    const room = this.roomOf(token)
    if (!room) return { error: { code: 'SEQ_NOT_IN_ROOM', message: '不在此房间' } }
    const me = this.memberByToken(room, token)
    if (!me || me.seat !== 1) return { error: { code: 'SEQ_NOT_GUESSER', message: '只有猜方能求提示' } }
    if (room.phase !== 'GUESSING') return { error: { code: 'SEQ_BAD_STATE', message: '非猜谜阶段' } }
    if (room.hintsLeft <= 0) return { error: { code: 'SEQ_NO_HINT', message: '提示已用完' } }
    // 位置级已确认集合（历史猜想在对应位命中）
    const confirmed = new Set()
    for (const g of room.guesses) {
      for (let i = 0; i < room.L; i++) {
        if (g.seq[i] === room.secret[i]) confirmed.add(i)
      }
    }
    const candidates = []
    for (let i = 0; i < room.L; i++) if (!confirmed.has(i)) candidates.push(i)
    if (candidates.length === 0) return { error: { code: 'SEQ_NO_HINT', message: '没有可提示的位置' } }
    const slot = candidates[Math.floor(Math.random() * candidates.length)]
    const truth = room.secret[slot]
    const bag = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== truth)
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }
    room.hintOffer = { slot, values: [truth, bag[0], bag[1]].sort((a, b) => a - b) }
    room.hintsUsed += 1
    room.hintsLeft -= 1
    room.lastActiveAt = this.now()
    this.pushRoundState(room)
    return { ok: true }
  }

  /** ROUND_OVER 双方确认再来一局：全员确认（或 30s 超时）后回 SETTING */
  settleContinue(token) {
    const room = this.roomOf(token)
    if (!room) return { error: { code: 'SEQ_NOT_IN_ROOM', message: '不在此房间' } }
    if (room.phase !== 'ROUND_OVER') return { error: { code: 'SEQ_BAD_STATE', message: '非结算阶段' } }
    const me = this.memberByToken(room, token)
    if (!me) return { error: { code: 'SEQ_NOT_IN_ROOM', message: '不在此房间' } }
    room.settleAck.add(me.seat)
    const active = room.members.filter((m) => !m.gone)
    if (room.settleAck.size >= active.length || active.length === 0) {
      this.resetToSetting(room)
    } else if (!room.settleTimer) {
      const t = setTimeout(() => {
        room.timers.delete(t)
        if (room.phase === 'ROUND_OVER') this.resetToSetting(room)
      }, 30_000)
      room.timers.add(t)
      room.settleTimer = t
    }
    this.pushRoomState(room)
    return { ok: true }
  }

  /** 回设密阶段（换先手：上局猜方当设密方，需求未定先手轮换——v1 固定 seat0 设密） */
  resetToSetting(room) {
    if (room.settleTimer) {
      clearTimeout(room.settleTimer)
      room.timers.delete(room.settleTimer)
      room.settleTimer = null
    }
    room.phase = 'SETTING'
    room.secret = null
    room.guesses = []
    room.triesMax = DUEL_TRIES
    room.triesLeft = DUEL_TRIES
    room.hintsUsed = 0
    room.hintsLeft = 2
    room.hintOffer = null
    room.result = null
    room.settleAck = new Set()
    room.lastActiveAt = this.now()
    this.pushRoomState(room)
    this.pushRoundState(room)
  }

  // ---------- 断线/重连/清理 ----------

  onConnClose(conn) {
    const found = this.findByConn(conn)
    if (found) this.leave(found.member.token)
  }

  /** 会话预检 */
  checkSession(token) {
    const room = this.roomOf(token)
    if (!room) return null
    const me = this.memberByToken(room, token)
    if (!me || me.gone) return null
    return { roomId: room.roomId, phase: room.phase }
  }

  /** 断线重连：恢复身份并下发完整快照 */
  reconnect(conn, token) {
    const room = this.roomOf(token)
    if (!room) return { error: { code: 'SEQ_ROOM_GONE', message: '房间已解散' } }
    const me = this.memberByToken(room, token)
    if (!me || me.gone) return { error: { code: 'SEQ_ROOM_GONE', message: '房间已解散' } }
    if (me.conn && me.conn !== conn) { try { me.conn.close() } catch { /* 旧连接已死 */ } }
    me.conn = conn
    me.connected = true
    if (me.graceTimer) { clearTimeout(me.graceTimer); me.graceTimer = null }
    conn.send({ type: 'seq.room.state', payload: { room: this.roomState(room) } })
    conn.send({ type: 'seq.round.state', payload: { view: this.roundView(room, me) } })
    this.pushRoomState(room, token)
    return { room, seat: me.seat }
  }

  /** 对局中掉线超时：判对方胜并回 SETTING（房内仅剩一人时） */
  onGoneDuringPlay(room, member) {
    this.pushRoomState(room)
    if (room.phase === 'WAITING') {
      this.removeMember(room, member)
      return
    }
    // 设密方掉线：猜方直接胜（密码未揭晓不回显）；猜方掉线：设密方胜
    room.result = { winner: member.seat === 0 ? 'guesser' : 'setter', revive: false }
    room.phase = 'ROUND_OVER'
    this.pushRoundState(room)
    this.pushRoomState(room)
  }

  /** 定时清理（30s 周期，模式照抄 rooms.js sweep） */
  sweep() {
    for (const room of [...this.rooms.values()]) {
      const alive = room.members.some((m) => m.connected && !m.gone)
      if (!alive) {
        this.destroyRoom(room.roomId)
        continue
      }
      if (room.phase === 'WAITING' && this.now() - room.lastActiveAt >= ROOM_IDLE_MS) {
        this.destroyRoom(room.roomId)
      }
    }
  }
}
