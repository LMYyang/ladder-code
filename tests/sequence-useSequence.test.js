import { describe, it, expect, vi, beforeEach } from 'vitest'

// uni 全局 mock（useSequence 走注入 storage，这里只 mock toast）
globalThis.uni = { showToast: vi.fn() }

import { useSequence } from '../src/composables/useSequence.js'
import { emptyProgress } from '../src/core/sequence/store.js'

/** 内存 storage + 密码覆写可控的 useSequence 实例 */
function makeGame() {
  const mem = new Map()
  const storage = { get: (k) => mem.get(k) ?? null, set: (k, v) => mem.set(k, v) }
  const g = useSequence(storage)
  return { g, mem, storage }
}

/** 开局并覆写密码为指定序列（直接改 state.secret，绕过随机性） */
function startWith(g, no, secret) {
  g.start(no)
  g.state.secret.splice(0, g.state.secret.length, ...secret)
}

function fill(g, seq) {
  for (const d of seq) g.pickDigit(d)
}

describe('useSequence 基础流程', () => {
  it('教学关开局：密码 (2,7,3,9)、12 次、提示 2 次', () => {
    const { g } = makeGame()
    g.start(1)
    expect(g.level.no).toBe(1)
    expect(g.state.secret).toEqual([2, 7, 3, 9])
    expect(g.state.triesLeft).toBe(12)
    expect(g.state.hintsLeft).toBe(2)
    expect(g.state.phase).toBe('PLAYING')
  })

  it('数字键盘：入槽自动右移、已用数字禁用、覆盖当前位', () => {
    const { g } = makeGame()
    g.start(1)
    fill(g, [2, 7])
    expect(g.state.slots).toEqual([2, 7, null, null])
    expect(g.state.selectedSlot).toBe(2)
    expect(g.digitEnabled(2)).toBe(false)
    expect(g.digitEnabled(3)).toBe(true)
    // 回选第 0 位换数字：2 腾出后 3 可用
    g.selectSlot(0)
    g.pickDigit(3)
    expect(g.state.slots).toEqual([3, 7, null, null])
    expect(g.digitEnabled(2)).toBe(true)
  })

  it('clearSlot：清选中位；选中位为空时清最后已填位', () => {
    const { g } = makeGame()
    g.start(1)
    fill(g, [2, 7, 3])
    g.clearSlot() // 选中位=3（下一个空位），空 → 清最后已填位 3
    expect(g.state.slots).toEqual([2, 7, null, null])
    g.selectSlot(1)
    g.clearSlot() // 清选中位 7
    expect(g.state.slots).toEqual([2, null, null, null])
  })

  it('未填满提交被拒，不扣次数', () => {
    const { g } = makeGame()
    g.start(1)
    fill(g, [2, 7])
    const r = g.submit()
    expect(r.ok).toBe(false)
    expect(g.state.triesLeft).toBe(12)
  })
})

describe('submit 反馈与判定', () => {
  it('猜中：WON + 星级 3 + 进度写入 + 解锁下一关', () => {
    const { g, mem } = makeGame()
    startWith(g, 1, [2, 7, 3, 9])
    fill(g, [1, 2, 3, 4])
    let r = g.submit()
    expect(r.solved).toBe(false)
    // S=(2,7,3,9)：G=(1,2,3,4) → 1/4 猜错 skip，R=(0,2) → asc=1（相邻升 0→2），desc=0，命中 2
    expect(g.state.guesses[0]).toEqual({ seq: [1, 2, 3, 4], asc: 1, desc: 0, hits: 2, solved: false })
    expect(g.state.triesLeft).toBe(11)
    fill(g, [2, 7, 3, 9])
    r = g.submit()
    expect(r.solved).toBe(true)
    expect(r.star).toBe(3) // 用 2/12，剩 10 ≥ 4
    expect(g.state.phase).toBe('WON')
    const saved = JSON.parse(mem.get('sequence_progress_v1'))
    expect(saved.cleared).toBe(1)
    expect(saved.stars[1]).toBe(3)
  })

  it('提示封顶 2 星；星级边界（剩 < 1/3 为 2 星）', () => {
    const { g } = makeGame()
    startWith(g, 1, [2, 7, 3, 9])
    g.state.hintsUsed = 1 // 直接模拟已用提示
    fill(g, [2, 7, 3, 9])
    const r = g.submit()
    expect(r.star).toBe(2)
    // 边界：不用提示但用到第 9 次（剩 3 < 4）
    const g2 = makeGame().g
    startWith(g2, 1, [2, 7, 3, 9])
    for (let i = 0; i < 8; i++) {
      fill(g2, [1, 2, 3, 4])
      g2.submit()
      if (g2.state.phase !== 'PLAYING') break
      g2.resetSlots()
    }
    fill(g2, [2, 7, 3, 9])
    const r2 = g2.submit()
    expect(r2.star).toBe(2)
  })

  it('次数耗尽：LOST、重试后同关卡重新开局', () => {
    const { g } = makeGame()
    startWith(g, 1, [9, 8, 7, 6])
    for (let i = 0; i < 12; i++) {
      fill(g, [1, 2, 3, 4])
      const r = g.submit()
      g.resetSlots()
      if (g.state.phase === 'LOST') {
        expect(r.solved).toBe(false)
        break
      }
    }
    expect(g.state.phase).toBe('LOST')
    expect(g.state.triesLeft).toBe(0)
    g.retry()
    expect(g.state.phase).toBe('PLAYING')
    expect(g.level.no).toBe(1)
    expect(g.state.triesLeft).toBe(12)
    expect(g.state.guesses).toHaveLength(0)
  })

  it('重复猜想：repeatOf 标记但正常受理', () => {
    const { g } = makeGame()
    startWith(g, 1, [2, 7, 3, 9])
    fill(g, [1, 2, 3, 4])
    g.submit()
    fill(g, [1, 2, 3, 4])
    g.submit()
    expect(g.state.repeatOf).toBe(1)
    expect(g.state.guesses).toHaveLength(2)
  })

  it('进度持久化：星级取最好、cleared 单调（连续两关）', () => {
    const { g, mem } = makeGame()
    startWith(g, 1, [2, 7, 3, 9])
    fill(g, [2, 7, 3, 9])
    g.submit()
    // 第 2 关（需覆写随机密码）
    g.start(2)
    g.state.secret.splice(0, g.state.secret.length, 4, 5, 6, 8)
    fill(g, [4, 5, 6, 8])
    g.submit()
    const saved = JSON.parse(mem.get('sequence_progress_v1'))
    expect(saved.cleared).toBe(2)
    expect(saved.stars[1]).toBe(3)
    expect(saved.stars[2]).toBe(3)
  })
})

describe('救援提示', () => {
  it('提示给出未确定位的 3 候选（含真值），扣次数', () => {
    const { g } = makeGame()
    startWith(g, 1, [2, 7, 3, 9])
    const r = g.askHint()
    expect(r.ok).toBe(true)
    expect(g.state.hintsLeft).toBe(1)
    expect(g.state.hintOffer.values).toHaveLength(3)
    expect(g.state.hintOffer.values).toContain(g.state.secret[g.state.hintOffer.slot])
    // 再用一次后用尽
    g.askHint()
    expect(g.state.hintsLeft).toBe(0)
    expect(g.askHint().ok).toBe(false)
  })

  it('已确定位不再给提示：全部位命中后返回不可提示', () => {
    const { g } = makeGame()
    startWith(g, 1, [2, 7, 3, 9])
    // 直接把历史写满命中（模拟逐位确认）
    g.state.guesses.push({ seq: [2, 7, 3, 9], asc: 3, desc: 0, hits: 4, solved: true })
    expect(g.askHint().ok).toBe(false)
  })
})

describe('无尽模式与非法关卡', () => {
  it('超出关卡表走无尽配置（L=6、6 次、随机密码）', () => {
    const { g } = makeGame()
    g.start(21)
    expect(g.level.L).toBe(6)
    expect(g.level.tries).toBe(6)
    expect(g.state.secret).toHaveLength(6)
    expect(new Set(g.state.secret).size).toBe(6)
  })
})

describe('进度损坏容错', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  it('坏 JSON 回退空进度，不抛错', () => {
    const storage = { get: () => '{oops', set: () => {} }
    const g = useSequence(storage)
    expect(g.progress).toEqual(emptyProgress())
  })
})
