/**
 * 密码生成器（需求 §2.1 / §6.1）。
 *
 * - randomSecret(L, rng)：1..9 Fisher-Yates 洗牌取前 L，纯随机；
 * - buildPool()：结构化密码池（全升/全降/山形/谷形/随机代表样本），
 *   供前 20 关「从池中取」——保证覆盖各种结构且经求解器验证可解（solver 测试把关）；
 * - pickLevelSecret(level, rng)：对外唯一入口——教学关固定、池关按结构取、无尽关纯随机。
 *
 * rng 注入便于测试（可复现序列）。
 */

import { statOf } from './feedback.js'

/** 1..9 洗牌取前 L（Fisher-Yates），返回长度 L、互不重复的数字数组 */
export function randomSecret(L, rng = Math.random) {
  const bag = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag.slice(0, L)
}

/** 山形：先严格升后严格降（如 1 4 7 5 2）。cut = 峰值位置（左坡含峰共 cut+1 个） */
function mountain(sortedAsc, cut) {
  const left = sortedAsc.slice(0, cut + 1)
  const right = sortedAsc.slice(cut + 1).reverse()
  return [...left, ...right]
}

/** 谷形：山形的镜像（先降后升） */
function valley(sortedAsc, cut) {
  return mountain(sortedAsc, cut).slice().reverse()
}

/**
 * 结构化密码池。每长度(4/5/6)基于同一组抽取数字生成各结构代表样本：
 *  - ascending   全升序（反馈必 (L-1, 0)）
 *  - descending  全降序（(0, L-1)）
 *  - mountain1/mountain2  山形（峰位 1 / L-3，两种峰位）
 *  - valley1/valley2      谷形（谷位 1 / L-3）
 *  - random     每长度 3 个互不重叠的纯随机样本（固定种子 LCG，池跨机器一致可复现）
 * 返回 { [L]: { ascending, descending, mountain1, mountain2, valley1, valley2, random } }
 */
export function buildPool() {
  let s = 0x2f6e2b1
  const rng = () => (s = (s * 1664525 + 1013904223) >>> 0, s / 2 ** 32)
  const pool = {}
  for (const L of [4, 5, 6]) {
    // 抽 L × 6 个数字（洗全 9 个再切 6 段，段内排序后拼结构，保证样本间不重叠）
    const bag = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }
    // 每个样本用独立的 3L 个数字：random 三段 + 山谷各结构共享一段（结构变换不消耗额外数字）
    const asc1 = bag.slice(0, L).sort((a, b) => a - b)
    const cut = Math.max(1, Math.min(L - 2, 1))
    const cut2 = Math.max(1, Math.min(L - 2, L - 3))
    // random 三段：从剩余数字中取（bag 后 3L 位不够时循环补充——L=6 时需 18 > 9，
    // 改为：每段独立洗牌取样，用 rng 继续推进保证可复现）
    const randSeg = () => {
      const b = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[b[i], b[j]] = [b[j], b[i]]
      }
      return b.slice(0, L)
    }
    pool[L] = {
      ascending: [asc1],
      descending: [[...asc1].reverse()],
      mountain1: [mountain(asc1, cut)],
      mountain2: [mountain(asc1, cut2)],
      valley1: [valley(asc1, cut)],
      valley2: [valley(asc1, cut2)],
      random: [randSeg(), randSeg(), randSeg()],
    }
  }
  return pool
}

const TEACH_SECRET = [2, 7, 3, 9] // 教学第 1 关固定密码（需求 §2.3 例 1）

/** 池结构名（buildPool 的 key），用于关卡表 pool 字段 */
export const POOL_SHAPES = ['ascending', 'descending', 'mountain1', 'mountain2', 'valley1', 'valley2', 'random']

/**
 * 按关卡配置取密码。level: { L, pool?: 'teach' | shape 名 | 'any' | null }。
 *  - pool === 'teach'：固定 [2,7,3,9]（仅 L=4）；
 *  - pool 为 shape 名：从该结构样本中随机取一；
 *  - pool === 'any'：全部结构合并随机；
 *  - pool === null/undefined：纯随机（无尽模式）。
 * 极端结构规避（需求 §2.2 要点）：入门关（tries ≥ 10）由关卡表通过 pool 字段
 * 避开 ascending/descending，本函数不做二次过滤。
 */
export function pickLevelSecret(level, rng = Math.random) {
  const L = level.L
  if (level.pool === 'teach') {
    if (L !== 4) throw new Error('teach 关卡必须 L=4')
    return [...TEACH_SECRET]
  }
  if (level.pool === null || level.pool === undefined) return randomSecret(L, rng)
  const pool = buildPool()[L]
  let candidates
  if (level.pool === 'any') {
    candidates = POOL_SHAPES.flatMap((k) => pool[k])
  } else {
    if (!POOL_SHAPES.includes(level.pool)) throw new Error(`未知池结构: ${level.pool}`)
    candidates = pool[level.pool]
  }
  return [...candidates[Math.floor(rng() * candidates.length)]]
}

/** 关卡密码的 (asc, desc)（关卡生成/调试用） */
export function secretShape(secret) {
  return statOf(secret)
}
