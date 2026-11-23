import { describe, it, expect, vi } from 'vitest'

// uni 全局 mock（useSequence 走注入 storage，这里只 mock toast）
globalThis.uni = { showToast: vi.fn() }

import { useSequence } from '../src/composables/useSequence.js'
import { LEVELS, endlessCfg } from '../src/core/sequence/levels.js'

/** 内存 storage + 密码覆写可控的 useSequence 实例 */
function makeGame() {
  const mem = new Map()
  const storage = { get: (k) => mem.get(k) ?? null, set: (k, v) => mem.set(k, v) }
  const g = useSequence(storage)
  return { g, mem }
}

function fill(g, seq) {
  for (const d of seq) g.pickDigit(d)
}

describe('M4 变体模式（useSequence）', () => {
  it('start(no, variant)：level 配置复用关卡表、secret 合法、hintOffer 重置', () => {
    const { g } = makeGame()
    g.start(1, 'variant')
    expect(g.level.no).toBe(1)
    expect(g.level.tries).toBe(12)
    expect(g.state.secret).toEqual([2, 7, 3, 9]) // 教学关固定密码在变体下同样生效
    expect(g.state.mode).toBe('variant')
    expect(g.isVariant.value).toBe(true)
    expect(g.state.hintsLeft).toBe(2)
    expect(g.state.phase).toBe('PLAYING')
  })

  it('变体反馈：asc 字段承载 run（S=(2,7,3,9) G=(7,2,3,9) → 段 2）', () => {
    const { g } = makeGame()
    g.start(1, 'variant')
    g.state.secret.splice(0, 4, 2, 7, 3, 9)
    fill(g, [7, 2, 3, 9])
    const r = g.submit()
    expect(r.ok).toBe(true)
    // R=(1,0,2,3)：最长连续段 [2,3] → 2
    expect(g.state.guesses[0]).toEqual({ seq: [7, 2, 3, 9], asc: 2, desc: 0, hits: 4, solved: false })
    expect(g.state.lastFeedback.asc).toBe(2)
  })

  it('变体猜中：WON + 星级写入 variantStars（不污染经典 stars）', () => {
    const { g, mem } = makeGame()
    // 预置经典进度：第 1 关 0 星记录 + 第 2 关 3 星，验证互不干扰
    g.progress.stars[2] = 3
    g.start(1, 'variant')
    g.state.secret.splice(0, 4, 2, 7, 3, 9)
    fill(g, [2, 7, 3, 9])
    const r = g.submit()
    expect(r.solved).toBe(true)
    expect(r.star).toBe(3) // 1/12 次猜中
    expect(g.state.phase).toBe('WON')
    expect(g.progress.variantStars[1]).toBe(3)
    expect(g.progress.variantCleared).toBe(1)
    expect(g.progress.stars[1]).toBeUndefined()
    expect(g.progress.stars[2]).toBe(3)
    const saved = JSON.parse(mem.get('sequence_progress_v1'))
    expect(saved.variantStars[1]).toBe(3)
    expect(saved.variantCleared).toBe(1)
    expect(saved.stars[2]).toBe(3)
  })

  it('变体模式通关写入变体解锁链（第 2 关变体解锁）', () => {
    const { g } = makeGame()
    g.start(1, 'variant')
    g.state.secret.splice(0, 4, 2, 7, 3, 9)
    fill(g, [2, 7, 3, 9])
    g.submit()
    expect(g.progress.variantCleared).toBe(1)
    // 经典进度不受影响
    expect(g.progress.cleared).toBe(0)
  })

  it('变体失败重试保持变体模式', () => {
    const { g } = makeGame()
    g.start(1, 'variant')
    g.state.secret.splice(0, 4, 9, 8, 7, 6)
    for (let i = 0; i < 12; i++) {
      fill(g, [1, 2, 3, 4])
      g.submit()
      g.resetSlots()
      if (g.state.phase === 'LOST') break
    }
    expect(g.state.phase).toBe('LOST')
    g.retry()
    expect(g.state.mode).toBe('variant')
    expect(g.isVariant.value).toBe(true)
    expect(g.state.phase).toBe('PLAYING')
  })
})

describe('M4 无尽模式（useSequence）', () => {
  it('无尽开局走 endlessCfg：第 21 关 6 次、第 26 关 5 次', () => {
    const { g } = makeGame()
    g.start(LEVELS.length + 1)
    expect(g.level.L).toBe(6)
    expect(g.level.tries).toBe(6)
    g.start(LEVELS.length + 6)
    expect(g.level.tries).toBe(5)
    expect(endlessCfg(LEVELS.length + 6).tries).toBe(5)
  })

  it('无尽通关：endlessCleared 记录阶段数、经典 cleared 不动', () => {
    const { g, mem } = makeGame()
    g.start(LEVELS.length + 1)
    const secret = [...g.state.secret]
    fill(g, secret)
    const r = g.submit()
    expect(r.solved).toBe(true)
    expect(g.progress.endlessCleared).toBe(1)
    expect(g.progress.cleared).toBe(0)
    expect(g.progress.stars[LEVELS.length + 1]).toBeUndefined()
    const saved = JSON.parse(mem.get('sequence_progress_v1'))
    expect(saved.endlessCleared).toBe(1)
  })

  it('无尽成就 endless-10：第 10 关通关时达成', () => {
    const { g } = makeGame()
    for (let i = 1; i <= 10; i++) {
      g.start(LEVELS.length + i)
      fill(g, [...g.state.secret])
      const r = g.submit()
      expect(r.solved).toBe(true)
    }
    expect(g.progress.endlessCleared).toBe(10)
    expect(g.progress.achievements).toContain('endless-10')
  })
})

describe('M4 成就系统（useSequence）', () => {
  it('一击必中：首次提交即猜中', () => {
    const { g } = makeGame()
    g.start(1)
    fill(g, [2, 7, 3, 9])
    const r = g.submit()
    expect(r.solved).toBe(true)
    expect(r.newAchievements).toContain('first-guess')
    expect(g.progress.achievements).toContain('first-guess')
  })

  it('零提示满星：不用提示 3 星通关', () => {
    const { g } = makeGame()
    g.start(1)
    fill(g, [2, 7, 3, 9])
    const r = g.submit()
    expect(r.star).toBe(3)
    expect(r.newAchievements).toContain('no-hint-full-stars')
  })

  it('用提示后不再发零提示满星（成就不重复发）', () => {
    const { g } = makeGame()
    g.start(1)
    // 预置：一击必中已达成
    g.progress.achievements.push('first-guess', 'no-hint-full-stars')
    g.state.hintsUsed = 1
    fill(g, [2, 7, 3, 9])
    const r = g.submit()
    expect(r.star).toBe(2) // 提示封顶 2 星
    expect(r.newAchievements).not.toContain('no-hint-full-stars')
    expect(r.newAchievements).not.toContain('first-guess')
  })

  it('通关全部进阶：cleared 满 20 时达成 clear-all', () => {
    const { g } = makeGame()
    for (let no = 1; no <= LEVELS.length; no++) {
      g.start(no)
      fill(g, [...g.state.secret])
      g.submit()
    }
    expect(g.progress.cleared).toBe(LEVELS.length)
    expect(g.progress.achievements).toContain('clear-all')
  })

  it('变体宗师：变体模式通关全部常规关', () => {
    const { g } = makeGame()
    for (let no = 1; no <= LEVELS.length; no++) {
      g.start(no, 'variant')
      fill(g, [...g.state.secret])
      g.submit()
    }
    expect(g.progress.variantCleared).toBe(LEVELS.length)
    expect(g.progress.achievements).toContain('variant-master')
  })

  it('成就持久化：存储中的 achievements 保留', () => {
    const { g, mem } = makeGame()
    g.start(1)
    fill(g, [2, 7, 3, 9])
    g.submit()
    const saved = JSON.parse(mem.get('sequence_progress_v1'))
    expect(saved.achievements).toContain('first-guess')
    expect(saved.achievements).toContain('no-hint-full-stars')
  })

  it('旧版进度数据（无新字段）读取兼容', () => {
    const storage = { get: () => JSON.stringify({ stars: { 3: 2 }, cleared: 3 }), set: () => {} }
    const g = useSequence(storage)
    expect(g.progress.cleared).toBe(3)
    expect(g.progress.stars[3]).toBe(2)
    expect(g.progress.achievements).toEqual([])
    expect(g.progress.endlessCleared).toBe(0)
    expect(g.progress.variantCleared).toBe(0)
  })
})
