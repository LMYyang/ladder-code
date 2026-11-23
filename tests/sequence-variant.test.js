import { describe, it, expect } from 'vitest'
import { longestRun, feedbackVariant } from '../src/core/sequence/variant.js'

/**
 * 高阶变体（需求 §6.2）：反馈 = 排名序列 R 中最长连续递增段（逐项 +1）长度。
 * solved ⟺ run = L（充要）。
 */

describe('longestRun', () => {
  it('空序列 → 0', () => {
    expect(longestRun([])).toBe(0)
  })
  it('严格递增连续 → L', () => {
    expect(longestRun([0, 1, 2, 3])).toBe(4)
  })
  it('严格递减 → 每段长 1', () => {
    expect(longestRun([3, 2, 1, 0])).toBe(1)
  })
  it('升序但不连续（+2）→ 每段长 1', () => {
    expect(longestRun([0, 2, 4, 6])).toBe(1)
  })
  it('混合段取最长', () => {
    expect(longestRun([3, 0, 1, 2])).toBe(3) // 段 [3],[0,1,2] → 3
    expect(longestRun([2, 5, 0, 1, 3, 4])).toBe(2) // 段 [2],[5],[0,1],[3,4] → 2
    expect(longestRun([4, 0, 1, 3, 2])).toBe(2) // 段 [4],[0,1],[3],[2] → 2
  })
})

describe('feedbackVariant', () => {
  it('猜中 → run = L 且 solved', () => {
    expect(feedbackVariant([2, 7, 3, 9], [2, 7, 3, 9])).toEqual({ run: 4, solved: true })
  })
  it('未猜中 → run < L 且非 solved', () => {
    // S=(2,7,3,9)：2→0,7→1,3→2,9→3。G=(7,2,3,9) → R=(1,0,2,3)：段 [1],[0,2,3]？0→2 不是+1 → 段 [0],[2,3] → 最长 2
    expect(feedbackVariant([2, 7, 3, 9], [7, 2, 3, 9])).toEqual({ run: 2, solved: false })
  })
  it('非法输入 throw', () => {
    expect(() => feedbackVariant([2, 7, 3, 9], [2, 7, 3])).toThrow(TypeError)
    expect(() => feedbackVariant([2, 7, 3, 9], [2, 2, 3, 9])).toThrow(TypeError)
    expect(() => feedbackVariant('2739', [2, 7, 3, 9])).toThrow(TypeError)
  })
})
