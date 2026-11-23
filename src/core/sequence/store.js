/**
 * 进度持久化（需求 FR-09）。uni storage 封装，storage 可注入便于单测。
 *
 * M4 扩展（向后兼容：旧 key 数据照常读取，缺省字段补零）：
 * shape: {
 *   stars: { [levelNo]: 1|2|3 },   // 各关历史最好星级（经典模式）
 *   cleared: number,               // 最高通过关卡号（0 = 未通关）
 *   achievements: string[],        // 已达成成就 id
 *   endlessCleared: number,        // 无尽模式累计通过关数（历史最远）
 *   variantStars: { [levelNo]: 1|2|3 }, // 变体模式（升序段）各关最好星级
 *   variantCleared: number,        // 变体模式最高通过关卡号
 * }
 */

const KEY = 'sequence_progress_v1'

export function emptyProgress() {
  return { stars: {}, cleared: 0, achievements: [], endlessCleared: 0, variantStars: {}, variantCleared: 0 }
}

function normStars(raw) {
  const out = {}
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      const no = Number(k)
      const star = Number(v)
      if (Number.isInteger(no) && no >= 1 && star >= 1 && star <= 3) out[no] = star
    }
  }
  return out
}

function normalize(raw) {
  const p = emptyProgress()
  if (!raw || typeof raw !== 'object') return p
  p.stars = normStars(raw.stars)
  if (Number.isInteger(raw.cleared) && raw.cleared >= 0) p.cleared = raw.cleared
  if (Array.isArray(raw.achievements)) {
    p.achievements = [...new Set(raw.achievements.filter((x) => typeof x === 'string' && x))]
  }
  if (Number.isInteger(raw.endlessCleared) && raw.endlessCleared >= 0) p.endlessCleared = raw.endlessCleared
  p.variantStars = normStars(raw.variantStars)
  if (Number.isInteger(raw.variantCleared) && raw.variantCleared >= 0) p.variantCleared = raw.variantCleared
  return p
}

/** 读取进度（storage 注入：{ get(key): string|null, set(key, val) }；缺省用 uni） */
export function loadProgress(storage) {
  const st = storage || uni
  try {
    return normalize(JSON.parse(st.get(KEY)))
  } catch {
    return emptyProgress()
  }
}

export function saveProgress(progress, storage) {
  const st = storage || uni
  st.set(KEY, JSON.stringify(normalize(progress)))
}

/** 通关写入：星级取历史最好；cleared 单调递增。返回更新后的进度 */
export function recordWin(progress, levelNo, star) {
  const p = normalize(progress)
  const prev = p.stars[levelNo] || 0
  if (star > prev) p.stars[levelNo] = star
  if (levelNo > p.cleared) p.cleared = levelNo
  return p
}

/** 变体模式通关写入：写 variantStars / variantCleared（经典 stars 不动） */
export function recordVariantWin(progress, levelNo, star) {
  const p = normalize(progress)
  const prev = p.variantStars[levelNo] || 0
  if (star > prev) p.variantStars[levelNo] = star
  if (levelNo > p.variantCleared) p.variantCleared = levelNo
  return p
}

/** 无尽模式推进：endlessCleared 取历史最远 */
export function recordEndless(progress, stage) {
  const p = normalize(progress)
  if (stage > p.endlessCleared) p.endlessCleared = stage
  return p
}

/** 合并新达成成就（去重）。返回 { progress, newIds } */
export function grantAchievements(progress, ids) {
  const p = normalize(progress)
  const fresh = ids.filter((id) => !p.achievements.includes(id))
  if (fresh.length) p.achievements = [...p.achievements, ...fresh]
  return { progress: p, newIds: fresh }
}
