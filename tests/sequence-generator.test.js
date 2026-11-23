import { describe, it, expect } from 'vitest'
import { randomSecret, buildPool, pickLevelSecret, POOL_SHAPES } from '../src/core/sequence/generator.js'
import { validateSeq } from '../src/core/sequence/feedback.js'

describe('randomSecret', () => {
  it('长度正确、数字 1..9 互不重复', () => {
    for (const L of [1, 4, 5, 6, 9]) {
      const s = randomSecret(L)
      expect(s).toHaveLength(L)
      expect(validateSeq(s, L).ok).toBe(true)
    }
  })
  it('rng 注入可复现', () => {
    const mk = () => {
      let s = 42
      return () => (s = (s * 1103515245 + 12345) % 2147483648, s / 2147483648)
    }
    expect(randomSecret(4, mk())).toEqual(randomSecret(4, mk()))
  })
})

describe('buildPool', () => {
  const pool = buildPool()
  it('覆盖 4/5/6 三种长度 × 全部结构', () => {
    for (const L of [4, 5, 6]) {
      expect(Object.keys(pool[L]).sort()).toEqual([...POOL_SHAPES].sort())
      for (const shape of POOL_SHAPES) {
        for (const s of pool[L][shape]) {
          expect(validateSeq(s, L).ok).toBe(true)
        }
      }
    }
  })
  it('ascending/descending 结构正确', () => {
    for (const L of [4, 5, 6]) {
      const asc = pool[L].ascending[0]
      expect([...asc].sort((a, b) => a - b)).toEqual(asc)
      expect(pool[L].descending[0]).toEqual([...asc].reverse())
    }
  })
  it('山形/谷形确实是先升后降/先降后升', () => {
    for (const L of [4, 5, 6]) {
      for (const key of ['mountain1', 'mountain2', 'valley1', 'valley2']) {
        const s = pool[L][key][0]
        const diffs = s.slice(1).map((v, i) => v - s[i])
        const sign = (x) => Math.sign(x)
        const turns = diffs.map(sign).filter((v, i, a) => i === 0 || v !== a[i - 1]).length
        expect(turns).toBe(2) // 恰好一次方向翻转（升→降 或 降→升）
      }
    }
  })
})

describe('pickLevelSecret', () => {
  it('教学关固定密码 (2,7,3,9)', () => {
    expect(pickLevelSecret({ no: 1, L: 4, pool: 'teach' })).toEqual([2, 7, 3, 9])
  })
  it('teach 配置错误长度报错', () => {
    expect(() => pickLevelSecret({ no: 1, L: 5, pool: 'teach' })).toThrow()
  })
  it('pool=null 纯随机', () => {
    const s = pickLevelSecret({ no: 21, L: 6, pool: null })
    expect(validateSeq(s, 6).ok).toBe(true)
  })
  it('pool=shape 名从对应结构取（ascending 全升）', () => {
    const s = pickLevelSecret({ no: 12, L: 4, pool: 'ascending' })
    expect(s).toEqual([...s].sort((a, b) => a - b))
  })
  it('未知结构报错', () => {
    expect(() => pickLevelSecret({ no: 2, L: 4, pool: 'nope' })).toThrow()
  })
})
