import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SequenceRoomManager } from '../server/sequenceRooms.js'

/**
 * 双人对局服务器测试（仿顶牛子 server-rooms.test.js 假连接模式）。
 * 关键验收：AC-09 设密不回显、AC-12 全程下行无密码、结算/确认/断线宽限。
 */

let mgr
beforeEach(() => {
  mgr = new SequenceRoomManager()
  mgr.now = () => 1000
})

function conn(name) {
  const sent = []
  return {
    sent,
    name,
    send(msg) { sent.push(msg) },
    // 测试辅助：收取某类型首个/最新 payload
    first(type) {
      const m = sent.find((x) => x.type === type)
      return m ? m.payload : null
    },
    last(type) {
      const m = [...sent].reverse().find((x) => x.type === type)
      return m ? m.payload : null
    },
  }
}

/** 标准开局：建房（setter）+ 加入（guesser）+ 设密 */
function setupDuel(secret = [2, 7, 3, 9]) {
  const setter = conn('甲')
  const guesser = conn('乙')
  const created = mgr.createRoom(setter, '甲')
  const roomId = created.room.roomId
  const joined = mgr.joinRoom(guesser, '乙', roomId)
  expect(joined.error).toBeUndefined()
  const res = mgr.setSecret(created.token, secret)
  expect(res.error).toBeUndefined()
  return { setter, guesser, roomId, setterToken: created.token, guesserToken: joined.token }
}

describe('建房与加入', () => {
  it('建房者 seat0 房主；加入者 seat1', () => {
    const setter = conn('甲')
    const guesser = conn('乙')
    const created = mgr.createRoom(setter, '甲')
    expect(created.seat).toBe(0)
    const joined = mgr.joinRoom(guesser, '乙', created.room.roomId)
    expect(joined.seat).toBe(1)
    expect(joined.room.members).toHaveLength(2)
  })
  it('满员拒绝第三人', () => {
    const { roomId } = setupDuel()
    const third = conn('丙')
    expect(mgr.joinRoom(third, '丙', roomId).error.code).toBe('SEQ_ROOM_FULL')
  })
  it('不存在的房间拒绝', () => {
    expect(mgr.joinRoom(conn('甲'), '甲', 999999).error.code).toBe('SEQ_ROOM_GONE')
  })
})

describe('设密阶段（AC-09 防回显）', () => {
  it('setSecret 后进入 GUESSING，双方快照均不含密码', () => {
    const { setter, guesser } = setupDuel()
    for (const c of [setter, guesser]) {
      const p = c.first('seq.round.state')
      expect(p).toBeTruthy()
      expect(p.view.secret).toBeNull()
      expect(JSON.stringify(p)).not.toContain('"secret":[2,7,3,9]')
    }
  })
  it('非法密码拒绝：重复/长度/取值', () => {
    const setter = conn('甲')
    const created = mgr.createRoom(setter, '甲')
    expect(mgr.setSecret(created.token, [2, 2, 3, 4]).error.code).toBe('SEQ_BAD_SECRET')
    expect(mgr.setSecret(created.token, [2, 7, 3]).error.code).toBe('SEQ_BAD_SECRET')
    expect(mgr.setSecret(created.token, [0, 7, 3, 11]).error.code).toBe('SEQ_BAD_SECRET')
  })
  it('猜方不能设密', () => {
    const setter = conn('甲')
    const g2 = conn('乙')
    const created = mgr.createRoom(setter, '甲')
    const joined2 = mgr.joinRoom(g2, '乙', created.room.roomId)
    expect(mgr.setSecret(joined2.token, [1, 2, 3, 4]).error.code).toBe('SEQ_NOT_SETTER')
  })
})

describe('猜谜与结算', () => {
  it('猜错扣次数、双方同步历史；猜中 guesser 胜并揭晓密码', () => {
    const { setter, guesser, guesserToken } = setupDuel([2, 7, 3, 9])
    const r1 = mgr.guess(guesserToken, [1, 2, 3, 4])
    expect(r1.ok).toBe(true)
    expect(r1.solved).toBe(false)
    // 双方都收到同一份历史（不含密码）
    for (const c of [setter, guesser]) {
      const p = c.last('seq.round.state')
      expect(p.view.guesses).toHaveLength(1)
      expect(p.view.guesses[0]).toEqual({ seq: [1, 2, 3, 4], asc: 1, desc: 0, hits: 2, solved: false })
      expect(p.view.secret).toBeNull()
    }
    // 猜中
    const r2 = mgr.guess(guesserToken, [2, 7, 3, 9])
    expect(r2.solved).toBe(true)
    const p = guesser.last('seq.round.state')
    expect(p.view.phase).toBe('ROUND_OVER')
    expect(p.view.result.winner).toBe('guesser')
    expect(p.view.secret).toEqual([2, 7, 3, 9]) // 结算揭晓（revive: true）
  })

  it('8 次用尽未中：setter 胜', () => {
    const { guesserToken } = setupDuel([9, 8, 7, 6])
    let solved = false
    for (let i = 0; i < 8; i++) {
      const r = mgr.guess(guesserToken, [1, 2, 3, 4])
      solved = r.solved
    }
    expect(solved).toBe(false)
    expect(mgr.roomOf(guesserToken).result.winner).toBe('setter')
  })

  it('AC-03/04：非法猜想拒绝且不扣次数', () => {
    const { guesserToken } = setupDuel([2, 7, 3, 9])
    expect(mgr.guess(guesserToken, [2, 2, 3, 4]).error.code).toBe('SEQ_BAD_GUESS')
    expect(mgr.guess(guesserToken, [2, 7, 3]).error.code).toBe('SEQ_BAD_GUESS')
    expect(mgr.roomOf(guesserToken).triesLeft).toBe(8)
  })

  it('setter 不能提交猜想；GUESSING 之外不能猜', () => {
    const { setterToken, guesserToken } = setupDuel()
    expect(mgr.guess(setterToken, [1, 2, 3, 4]).error.code).toBe('SEQ_NOT_GUESSER')
    // 结算后不能继续猜
    for (let i = 0; i < 8; i++) mgr.guess(guesserToken, [1, 2, 3, 4])
    expect(mgr.guess(guesserToken, [1, 2, 3, 4]).error.code).toBe('SEQ_BAD_STATE')
  })
})

describe('救援提示（双人）', () => {
  it('猜方可求提示、扣次数；setter 不能求', () => {
    const { setterToken, guesserToken } = setupDuel([2, 7, 3, 9])
    expect(mgr.askHint(setterToken).error.code).toBe('SEQ_NOT_GUESSER')
    const r = mgr.askHint(guesserToken)
    expect(r.ok).toBe(true)
    const room = mgr.roomOf(guesserToken)
    expect(room.hintsLeft).toBe(1)
    expect(room.hintOffer.values).toHaveLength(3)
    expect(room.hintOffer.values).toContain(room.secret[room.hintOffer.slot])
    // 提示推送给双方且不含完整密码
    for (const c of [mgr.memberByToken(room, setterToken).conn, mgr.memberByToken(room, guesserToken).conn]) {
      const p = c.last('seq.round.state')
      expect(p.view.hintOffer).toBeTruthy()
      expect(p.view.secret).toBeNull()
    }
  })
})

describe('再来一局', () => {
  it('双方确认后回 SETTING、密码清空', () => {
    const { setterToken, guesserToken } = setupDuel([2, 7, 3, 9])
    mgr.guess(guesserToken, [2, 7, 3, 9]) // 猜中进 ROUND_OVER
    mgr.settleContinue(setterToken)
    mgr.settleContinue(guesserToken)
    const room = mgr.roomOf(guesserToken)
    expect(room.phase).toBe('SETTING')
    expect(room.secret).toBeNull()
    expect(room.guesses).toHaveLength(0)
  })
  it('单方确认不切换（等待对方/超时）', () => {
    const { setterToken, guesserToken } = setupDuel()
    mgr.guess(guesserToken, [2, 7, 3, 9])
    mgr.settleContinue(setterToken)
    expect(mgr.roomOf(setterToken).phase).toBe('ROUND_OVER')
  })
})

describe('断线与重连', () => {
  it('重连恢复身份并补发快照', () => {
    const { guesser, roomId } = setupDuel()
    const reConn = conn('乙新连接')
    const token = mgr.memberByToken(mgr.rooms.get(roomId), guesser === null ? '' : mgr.rooms.get(roomId).members[1].token).token
    const res = mgr.reconnect(reConn, token)
    expect(res.error).toBeUndefined()
    expect(res.seat).toBe(1)
    expect(reConn.first('seq.round.state')).toBeTruthy()
  })

  it('对局中断线 60s 宽限：期内不判负，超时判对方胜', () => {
    vi.useFakeTimers()
    try {
      const { guesser, guesserToken } = setupDuel([2, 7, 3, 9])
      // 模拟猜方断线：member.conn 即 setupDuel 里的 guesser 连接
      mgr.onConnClose(guesser)
      // 宽限期内：仍在房、未判负
      expect(mgr.roomOf(guesserToken)).toBeTruthy()
      expect(mgr.roomOf(guesserToken).result).toBeNull()
      vi.advanceTimersByTime(60_000)
      // 超时后：猜方 gone、判 setter 胜、不揭晓密码（revive=false）
      const room = [...mgr.rooms.values()].find((x) => x.members.some((m) => m.token === guesserToken))
      expect(room).toBeTruthy()
      expect(room.result.winner).toBe('setter')
      expect(room.result.revive).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('WAITING 阶段掉线直接移除', () => {
    const setter = conn('甲')
    const created = mgr.createRoom(setter, '甲')
    mgr.leave(created.token)
    expect(mgr.rooms.size).toBe(0)
  })
})

describe('AC-12 泄题断言（全程下行消息扫描）', () => {
  it('GUESSING 阶段所有下行消息的 JSON 都不含密码数字串', () => {
    const secret = [3, 8, 1, 5]
    const { setter, guesser, guesserToken } = setupDuel(secret)
    void setter
    mgr.guess(guesserToken, [1, 2, 3, 4])
    mgr.guess(guesserToken, [3, 8, 1, 9]) // 部分命中
    mgr.askHint(guesserToken)
    const secretStr = JSON.stringify(secret)
    for (const c of [setter, guesser]) {
      for (const msg of c.sent) {
        const s = JSON.stringify(msg)
        if (msg.type === 'seq.round.state') {
          // ROUND_OVER 前不允许出现密码
          expect(s.includes(secretStr), `消息 ${msg.type} 泄露密码: ${s}`).toBe(false)
        }
      }
    }
  })
  it('sweep：全员掉线销毁房间', () => {
    vi.useFakeTimers()
    try {
      const { setter, guesserToken } = setupDuel()
      mgr.leave(guesserToken) // 猜方离开（WAITING? 否，已 GUESSING → 宽限）
      // 全员掉线（setter 也关连接）
      mgr.onConnClose(setter)
      mgr.sweep()
      expect(mgr.rooms.size).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('变体模式（最长升序段）', () => {
  it('variant 反馈以 run 作为 asc 下发、solved 判定正确', () => {
    const setter = conn('甲')
    const guesser = conn('乙')
    const created = mgr.createRoom(setter, '甲')
    const joined = mgr.joinRoom(guesser, '乙', created.room.roomId)
    mgr.setSecret(created.token, [2, 7, 3, 9], 'variant')
    // G=(7,2,3,9)：命中 7→1,2→0,3→2,9→3 → R=(1,0,2,3)：连续段 [0,2,3]→2? 0→2 非+1；段=[2,3] → run=2
    const r = mgr.guess(joined.token, [7, 2, 3, 9])
    expect(r.ok).toBe(true)
    const room = mgr.roomOf(joined.token)
    expect(room.guesses[0].asc).toBe(2)
    expect(room.guesses[0].desc).toBe(0)
    // 猜中：run=4
    const r2 = mgr.guess(joined.token, [2, 7, 3, 9])
    expect(r2.solved).toBe(true)
  })
})
