/**
 * 高阶变体（需求 §6.2）：反馈改为「最长连续升序段长度」。
 *
 * 对排名序列 R（猜想数字在密码中的下标排列，与主模式同口径、同 skip 语义）：
 * 最长连续递增段 = 最长的 R[i], R[i+1], …, R[j] 满足逐项 +1（连续升序，
 * 即这些猜想数字在密码中依次相邻且升序）。段长以元素个数计。
 *
 * 反馈空间只有 L 种（段长 1..L），信息量更小，救援提示必开（关卡配置负责）。
 * 猜中 ⟺ 段长 = L（R = 0..L-1 严格连续递增，充要）。
 */
import { validateSeq } from './feedback.js'

/** 对排列 R 计算最长连续递增段（逐项 +1）长度，至少为 1（R 非空） */
export function longestRun(R) {
  if (R.length === 0) return 0
  let best = 1
  let cur = 1
  for (let i = 1; i < R.length; i++) {
    if (R[i] === R[i - 1] + 1) {
      cur += 1
      if (cur > best) best = cur
    } else {
      cur = 1
    }
  }
  return best
}

/**
 * 变体反馈：返回 { run, solved }。
 * guess 非法（长度/取值/重复）时 throw TypeError——变体模式下猜想仍须为
 * 完整合法序列（与主模式同一 validateSeq 校验），skip 语义仅作用于「数字
 * 是否在密码中」：R 只收录猜对数字的名次（与 feedback.js 同口径）。
 */
export function feedbackVariant(secret, guess) {
  if (!Array.isArray(secret) || !Array.isArray(guess)) throw new TypeError('secret/guess 必须是数组')
  if (secret.length !== guess.length) throw new TypeError('secret 与 guess 长度必须相同')
  const L = secret.length
  const chk = validateSeq(guess, L, 'guess')
  if (!chk.ok) throw new TypeError(chk.reason)
  const chkS = validateSeq(secret, L, 'secret')
  if (!chkS.ok) throw new TypeError(chkS.reason)
  const posOf = new Map()
  secret.forEach((v, i) => posOf.set(v, i))
  const R = []
  for (const v of guess) {
    const pos = posOf.get(v)
    if (pos !== undefined) R.push(pos)
  }
  const run = longestRun(R)
  return { run, solved: R.length === L && run === L }
}
