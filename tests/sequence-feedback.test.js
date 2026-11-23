import { describe, it, expect } from 'vitest'
import { feedback, statOf, validateSeq } from '../src/core/sequence/feedback.js'

/**
 * 反馈统计测试。修订口径 v2（与用户确认例 1 后锁定，2026-11-20）：
 * R = 猜对数字在密码中的下标子序列（skip 语义）；
 * asc = R 中相邻升序对个数；desc = R 中逆序对个数（经典定义）。
 * solved ⟺ asc = L-1 && desc = 0 ⟺ G === S（充要）。
 */

describe('statOf（对序列自身统计）', () => {
  it('规则原文权威例 1：2 7 3 9 → (2,1)', () => {
    // 相邻升序对 (2→7)(3→9) = 2；逆序对 (7,3) = 1
    expect(statOf([2, 7, 3, 9])).toEqual({ asc: 2, desc: 1 })
  })
  it('全升序 → (L-1, 0)', () => {
    expect(statOf([1, 2, 3, 4])).toEqual({ asc: 3, desc: 0 })
    expect(statOf([1, 2, 3, 4, 5, 6])).toEqual({ asc: 5, desc: 0 })
  })
  it('全降序 → (0, C(L,2))', () => {
    expect(statOf([9, 8, 7, 6])).toEqual({ asc: 0, desc: 6 })
    expect(statOf([6, 5, 4, 3, 2, 1])).toEqual({ asc: 0, desc: 15 })
  })
  it('山形 1 4 7 5 2 → 相邻升 2 对，逆序对 (7,5)(7,2)(5,2)(4,2)=4', () => {
    expect(statOf([1, 4, 7, 5, 2])).toEqual({ asc: 2, desc: 4 })
  })
  it('5 9 1 7 → 相邻升 (5→9)(1→7)=2，逆序 (5,1)(9,1)(9,7)=3', () => {
    expect(statOf([5, 9, 1, 7])).toEqual({ asc: 2, desc: 3 })
  })
})

describe('feedback（修订口径 v2）', () => {
  it('AC-01：猜中密码 → (L-1, 0) 且 solved', () => {
    expect(feedback([2, 7, 3, 9], [2, 7, 3, 9])).toEqual({ asc: 3, desc: 0, solved: true })
  })
  it('猜错 → 非 solved；R 按密码下标替换', () => {
    // S=(2,7,3,9)：下标 2→0, 7→1, 3→2, 9→3。G=(9,3,7,2) → R=(3,2,1,0)：相邻无升 asc=0，逆序对 C(4,2)=6
    expect(feedback([2, 7, 3, 9], [9, 3, 7, 2])).toEqual({ asc: 0, desc: 6, solved: false })
    // G=(7,2,9,3)：R=(1,0,3,2)：相邻升 0→3 一处 asc=1；逆序 (1,0)(3,2)=2
    expect(feedback([2, 7, 3, 9], [7, 2, 9, 3])).toEqual({ asc: 1, desc: 2, solved: false })
  })
  it('skip 语义：猜错的数字不参与统计（不在密码中的数字是合法猜想）', () => {
    // S=(2,7,3,9)，G=(1,7,3,9)：1 猜错跳过，R=(1,2,3) → asc=2, desc=0 → 非 solved
    expect(feedback([2, 7, 3, 9], [1, 7, 3, 9])).toEqual({ asc: 2, desc: 0, solved: false })
    // G=(2,7,3,1)：R=(0,1,2) → asc=2, desc=0 → 非 solved（R 未收满 L 位）
    expect(feedback([2, 7, 3, 9], [2, 7, 3, 1])).toEqual({ asc: 2, desc: 0, solved: false })
    // 部分命中：(asc, desc) 相同但命中位数不同是不同信号（solver 分区依赖此点）
    expect(feedback([2, 7, 3, 9], [1, 7, 3, 4])).toEqual({ asc: 1, desc: 0, solved: false })
  })
  it('solved 充要：asc=L-1 且 desc=0 只在 G===S 时出现（随机 1000 对性质测试）', () => {
    let seed = 12345
    const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648, seed / 2147483648)
    for (let t = 0; t < 1000; t++) {
      const L = 4 + Math.floor(rng() * 3) // 4~6
      const bag = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[bag[i], bag[j]] = [bag[j], bag[i]]
      }
      const S = bag.slice(0, L)
      const G = bag.slice(0, L)
      if (rng() < 0.5) [G[0], G[L - 1]] = [G[L - 1], G[0]] // 一半打乱首尾
      const r = feedback(S, G)
      expect(r.solved).toBe(S.join() === G.join())
      if (r.solved) {
        expect(r.asc).toBe(L - 1)
        expect(r.desc).toBe(0)
      } else {
        expect(r.asc === L - 1 && r.desc === 0).toBe(false)
      }
      expect(r.desc).toBeLessThanOrEqual((L * (L - 1)) / 2)
    }
  })
  it('非法输入 throw TypeError', () => {
    expect(() => feedback([2, 7, 3, 9], [2, 7, 3])).toThrow(TypeError)
    expect(() => feedback([2, 7, 3, 9], [2, 7, 3, 9, 1])).toThrow(TypeError)
    expect(() => feedback('2739', [2, 7, 3, 9])).toThrow(TypeError)
  })
})

describe('validateSeq', () => {
  it('AC-03：重复数字拒绝', () => {
    expect(validateSeq([2, 2, 3, 4], 4).ok).toBe(false)
  })
  it('AC-04：长度不符拒绝', () => {
    expect(validateSeq([2, 7, 3], 4).ok).toBe(false)
    expect(validateSeq([2, 7, 3, 9, 1], 4).ok).toBe(false)
  })
  it('取值范围拒绝', () => {
    expect(validateSeq([0, 7, 3, 9], 4).ok).toBe(false)
    expect(validateSeq([2, 7, 3, 10], 4).ok).toBe(false)
    expect(validateSeq([2, 7, 3, 4.5], 4).ok).toBe(false)
    expect(validateSeq('2739', 4).ok).toBe(false)
  })
  it('合法序列通过', () => {
    expect(validateSeq([2, 7, 3, 9], 4).ok).toBe(true)
    expect(validateSeq([1, 2, 3, 4, 5, 6], 6).ok).toBe(true)
  })
})
