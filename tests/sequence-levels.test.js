import { describe, it, expect } from 'vitest'
import { LEVELS, ENDLESS, levelOf, isDefinedLevel, starOf, isUnlocked } from '../src/core/sequence/levels.js'
import { recordWin, loadProgress, saveProgress, emptyProgress } from '../src/core/sequence/store.js'
import { feedback, validateSeq } from '../src/core/sequence/feedback.js'
import { pickLevelSecret } from '../src/core/sequence/generator.js'

describe('LEVELS 关卡表', () => {
  it('关卡号连续、长度递增、次数合法', () => {
    LEVELS.forEach((l, i) => {
      expect(l.no).toBe(i + 1)
      expect([4, 5, 6]).toContain(l.L)
      expect(l.tries).toBeGreaterThanOrEqual(5)
      expect(l.tries).toBeLessThanOrEqual(12)
    })
  })
  it('入门关（tries ≥ 10）避开极端结构 ascending/descending', () => {
    for (const l of LEVELS.filter((x) => x.tries >= 10)) {
      expect(['ascending', 'descending']).not.toContain(l.pool)
    }
  })
  it('levelOf / isDefinedLevel', () => {
    expect(levelOf(1).pool).toBe('teach')
    expect(levelOf(999)).toBeNull()
    expect(isDefinedLevel(20)).toBe(true)
    expect(isDefinedLevel(21)).toBe(false)
  })
  it('每关密码生成合法（含结构约束样本抽查）', () => {
    for (const l of LEVELS) {
      const s = pickLevelSecret(l)
      expect(validateSeq(s, l.L).ok).toBe(true)
    }
  })
  it('无尽模式配置合法', () => {
    expect(validateSeq(pickLevelSecret({ L: ENDLESS.L, pool: ENDLESS.pool }), ENDLESS.L).ok).toBe(true)
  })
})

describe('starOf 星级（需求 §5.2）', () => {
  const std = { no: 9, L: 4, tries: 8, pool: 'random' }
  it('3 星：未用提示 且 剩余 ≥ 1/3 上限', () => {
    expect(starOf(std, 1, 0)).toBe(3) // 剩 7 ≥ 2
    expect(starOf(std, 5, 0)).toBe(3) // 剩 3 ≥ 2
  })
  it('2 星：剩余 < 1/3 或用了提示', () => {
    expect(starOf(std, 7, 0)).toBe(2) // 剩 1 < 2
    expect(starOf(std, 8, 0)).toBe(2) // 最后一次猜中
    expect(starOf(std, 1, 1)).toBe(2) // 用提示封顶 2 星
    expect(starOf(std, 1, 2)).toBe(2)
  })
  it('0 星：未通关/轮数非法', () => {
    expect(starOf(std, 0, 0)).toBe(0)
    expect(starOf(std, 9, 0)).toBe(0)
  })
  it('入门 12 次：剩余 ≥ 4 为 3 星', () => {
    const easy = { no: 1, L: 4, tries: 12, pool: 'teach' }
    expect(starOf(easy, 8, 0)).toBe(3) // 剩 4 ≥ 4
    expect(starOf(easy, 9, 0)).toBe(2) // 剩 3 < 4
  })
})

describe('isUnlocked 解锁链', () => {
  it('第 1 关恒解锁', () => {
    expect(isUnlocked(emptyProgress(), 1)).toBe(true)
    expect(isUnlocked(null, 1)).toBe(true)
  })
  it('第 N 关需通关 N-1', () => {
    expect(isUnlocked({ cleared: 2 }, 3)).toBe(true)
    expect(isUnlocked({ cleared: 2 }, 4)).toBe(false)
  })
})

describe('store 进度持久化', () => {
  it('recordWin：星级取最好、cleared 单调递增', () => {
    let p = emptyProgress()
    p = recordWin(p, 3, 2)
    expect(p.stars[3]).toBe(2)
    expect(p.cleared).toBe(3)
    p = recordWin(p, 3, 1) // 更差星级不覆盖
    expect(p.stars[3]).toBe(2)
    p = recordWin(p, 3, 3) // 更好覆盖
    expect(p.stars[3]).toBe(3)
    p = recordWin(p, 2, 3) // 低于 cleared 不回退
    expect(p.cleared).toBe(3)
  })
  it('save/load roundtrip（注入 mock storage）', () => {
    const mem = new Map()
    const storage = { get: (k) => mem.get(k) ?? null, set: (k, v) => mem.set(k, v) }
    let p = recordWin(emptyProgress(), 5, 3)
    saveProgress(p, storage)
    expect(loadProgress(storage)).toEqual(p)
  })
  it('损坏数据回退空进度', () => {
    const storage = { get: () => '{oops', set: () => {} }
    expect(loadProgress(storage)).toEqual(emptyProgress())
  })
  it('normalize 剥离非法字段', () => {
    const storage = {
      get: () => JSON.stringify({ stars: { 1: 3, 2: 9, x: 2 }, cleared: -5, junk: 1 }),
      set: () => {},
    }
    const p = loadProgress(storage)
    expect(p).toEqual({ stars: { 1: 3 }, cleared: 0, achievements: [], endlessCleared: 0, variantStars: {}, variantCleared: 0 })
  })
})

describe('全流程烟雾：生成→交互反馈→星级→进度', () => {
  it('模拟一局完整对局', () => {
    const level = levelOf(1) // teach：(2,7,3,9)，12 次
    const secret = pickLevelSecret(level)
    expect(secret).toEqual([2, 7, 3, 9])
    const guesses = [[1, 2, 3, 4], [2, 7, 9, 3], [2, 7, 3, 9]]
    let used = 0
    let solved = false
    for (const g of guesses) {
      used += 1
      if (feedback(secret, g).solved) { solved = true; break }
    }
    expect(solved).toBe(true)
    expect(used).toBe(3)
    expect(starOf(level, used, 0)).toBe(3)
    const p = recordWin(emptyProgress(), level.no, starOf(level, used, 0))
    expect(p.cleared).toBe(1)
    expect(isUnlocked(p, 2)).toBe(true)
  })
})
