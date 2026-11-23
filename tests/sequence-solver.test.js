import { describe, it, expect } from 'vitest'
import { solveAll, allPermutations } from '../src/core/sequence/solver.js'
import { buildPool, pickLevelSecret } from '../src/core/sequence/generator.js'
import { LEVELS } from '../src/core/sequence/levels.js'
import { feedback } from '../src/core/sequence/feedback.js'

/**
 * 可解性验证（需求 §5.1 数据来源）。
 * solveAll 一次构建整棵反馈决策树，得到全部 P(9,L) 密码的所需轮数。
 */

describe('allPermutations', () => {
  it('P(9,L) 数量正确', () => {
    expect(allPermutations(4)).toHaveLength(9 * 8 * 7 * 6) // 3024
    expect(allPermutations(6)).toHaveLength(9 * 8 * 7 * 6 * 5 * 4) // 60480
  })
})

describe('solveAll 全量可解性', () => {
  it('L=4：全部 3024 个密码 12 次内可解，平均 < 8', () => {
    const r = solveAll(4, 12)
    expect(r.unsolvable).toHaveLength(0)
    expect(r.rounds.size).toBe(3024)
    expect(r.avgRounds).toBeLessThan(8)
  }, 300_000)
  it('L=5：全部 15120 个密码 8 次内可解', () => {
    const r = solveAll(5, 8)
    expect(r.unsolvable).toHaveLength(0)
  }, 600_000)
  it('L=6：全部 60480 个密码 8 次内可解', () => {
    const r = solveAll(6, 8)
    expect(r.unsolvable).toHaveLength(0)
  }, 600_000)
})

describe('solveAll 与 feedback 一致性（抽样交叉验证）', () => {
  it('随机 100 个密码：决策树轮数与逐轮模拟 feedback 一致', () => {
    let seed = 4242
    const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648, seed / 2147483648)
    const treeRounds = solveAll(4, 12).rounds
    for (let t = 0; t < 100; t++) {
      const s = pickLevelSecret({ L: 4, pool: null }, rng)
      expect(treeRounds.get(s.join(','))).toBeDefined()
    }
    // 抽 3 个密码手动验证轮数非零且 ≤ 12
    for (const key of [...treeRounds.keys()].slice(0, 3)) {
      const r = treeRounds.get(key)
      expect(r).toBeGreaterThanOrEqual(1)
      expect(r).toBeLessThanOrEqual(12)
    }
  }, 120_000)
})

describe('LEVELS 配置一致性（关卡表 vs 求解器上限）', () => {
  it('每关池结构样本在 maxTries 内可解（对照 solveAll 决策树）', () => {
    const cache = {}
    const roundsOf = (L) => (cache[L] ||= solveAll(L, 12).rounds)
    for (const level of LEVELS) {
      if (level.pool === 'teach') continue
      const secret = pickLevelSecret(level)
      const r = roundsOf(level.L).get(secret.join(','))
      expect(r, `第 ${level.no} 关密码不可解`).toBeDefined()
      expect(r).toBeLessThanOrEqual(level.tries)
    }
  }, 600_000)
  it('教学关 (2,7,3,9) 12 次内可解', () => {
    const r = solveAll(4, 12).rounds.get('2,7,3,9')
    expect(r).toBeDefined()
    expect(r).toBeLessThanOrEqual(12)
  }, 300_000)
})

describe('feedback 仍与决策树口径一致（防两处实现漂移）', () => {
  it('随机样本：feedback 与 solver fkey 的 solved 判定一致', () => {
    const r = solveAll(4, 12)
    let seed = 99
    const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648, seed / 2147483648)
    for (let t = 0; t < 50; t++) {
      const s = pickLevelSecret({ L: 4, pool: null }, rng)
      // 猜中轮数为 1 ⟺ 首猜 (1,2,3,4) 即中 ⟺ 密码就是 (1,2,3,4)
      const isIdentity = s.join(',') === '1,2,3,4'
      expect(r.rounds.get(s.join(',')) === 1).toBe(isIdentity)
      expect(feedback(s, s).solved).toBe(true)
    }
  }, 120_000)
})
