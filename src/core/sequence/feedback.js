/**
 * 反馈统计（修订口径 v2，2026-11-20 与用户确认例 1 后锁定）。
 *
 * —— 口径 ——
 * 设序列 seq（数字 1..9 互不重复，长度 L）：
 *  1. 排名序列 R：seq 中每个数字替换为它在密码 S 中的下标；猜错数字（不在 S 中）
 *     不参与统计（skip 语义）。R 保持 seq 中的相对顺序。
 *  2. 定序数 asc = R 中**相邻升序对**的个数（R[i+1] > R[i] 的 i 数，0..L-1）。
 *  3. 逆序数 desc = R 中**逆序对**的个数（经典定义：i<j 且 R[j] < R[i]，0..C(L,2)）。
 *  4. solved ⟺ asc === L-1 && desc === 0
 *     （相邻全升 ⟺ R 严格递增 ⟺ R = (0,1,…,L-1) ⟺ 猜想与密码完全一致，充要。
 *      注意 asc = L-1 已蕴含无相邻逆序，但 desc=0 需 R 全局无逆序对——两者联合
 *      才是充要；asc=L-1 时 R 相邻全升，此时 desc 必为 0，故判 asc 即可，
 *      保留 desc 条件为防御性冗余。）
 *
 * —— 与规则原文例 1 的对齐 ——
 * 原文唯一权威演算例：密码 2 7 3 9 → 定序 2、逆序 1。
 *  本口径：相邻升序对 (2→7)(3→9) = 2 ✓；逆序对 (7,3) = 1 ✓。
 * 原文文字定义（「右侧存在更大/更小数字的元素个数」）与例 1 演算矛盾
 * （元素计给 asc=3：2 的右侧同样有更小的 3）。以例 1 演算为准。
 *
 * statOf(seq) 对任意互不重复数字序列自身统计（教学示例/高阶变体复用）。
 * 复杂度 O(L²)，L ≤ 9，无性能问题。
 */

export const DIGIT_MIN = 1
export const DIGIT_MAX = 9

/** 序列合法性：长度 L、取值 1..9、互不重复。返回 { ok, reason? } */
export function validateSeq(seq, L, what = '序列') {
  if (!Array.isArray(seq)) return { ok: false, reason: `${what}必须是数组` }
  if (seq.length !== L) return { ok: false, reason: `${what}长度必须为 ${L}` }
  const seen = new Set()
  for (const v of seq) {
    if (!Number.isInteger(v) || v < DIGIT_MIN || v > DIGIT_MAX) {
      return { ok: false, reason: `${what}数字必须为 ${DIGIT_MIN}~${DIGIT_MAX} 的整数` }
    }
    if (seen.has(v)) return { ok: false, reason: `${what}数字不能重复` }
    seen.add(v)
  }
  return { ok: true }
}

/** 对任意互不重复数字序列自身统计 (asc, desc)：相邻升序对数 + 逆序对数 */
export function statOf(seq) {
  let asc = 0
  let desc = 0
  for (let i = 0; i < seq.length; i++) {
    if (i < seq.length - 1 && seq[i + 1] > seq[i]) asc += 1
    for (let j = i + 1; j < seq.length; j++) {
      if (seq[j] < seq[i]) desc += 1
    }
  }
  return { asc, desc }
}

/**
 * 核心反馈（修订口径 v2）。非数组/长度不一致 throw TypeError（编程错误）；
 * 猜想中不存在于密码的数字是合法输入，按 skip 语义不参与排名序列 R。
 * 返回 { asc, desc, solved }。
 */
export function feedback(secret, guess) {
  if (!Array.isArray(secret) || !Array.isArray(guess)) {
    throw new TypeError('secret/guess 必须是数组')
  }
  if (secret.length !== guess.length) {
    throw new TypeError('secret 与 guess 长度必须相同')
  }
  const L = secret.length
  const posOf = new Map()
  secret.forEach((v, i) => posOf.set(v, i))
  // 排名序列 R：仅收录猜对数字（存在于密码中）的名次，保持猜想中的相对顺序
  const R = []
  for (const v of guess) {
    const pos = posOf.get(v)
    if (pos !== undefined) R.push(pos)
  }
  const { asc, desc } = statOf(R)
  // solved ⟺ R 恰为 (0,1,…,L-1) ⟺ 猜想与密码完全一致（充要）：
  // R.length === L 时 R 是 0..L-1 的排列，相邻全升（asc = L-1）⟺ 严格递增。
  return { asc, desc, solved: R.length === L && asc === L - 1 && desc === 0 }
}
