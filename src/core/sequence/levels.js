/**
 * 关卡表与星级（需求 §5.2 / §6.1）。
 */

import { statOf } from './feedback.js'

/**
 * 前期关卡表。pool: 'teach' | 池结构名 | 'any' | null（纯随机，无尽模式）。
 * 入门关（tries ≥ 10）避开 ascending/descending 极端结构（开局即满反馈会让新手困惑）。
 */
export const LEVELS = [
  { no: 1, L: 4, tries: 12, pool: 'teach' }, // 教学关：固定 (2,7,3,9)
  { no: 2, L: 4, tries: 12, pool: 'mountain1' },
  { no: 3, L: 4, tries: 12, pool: 'valley1' },
  { no: 4, L: 4, tries: 12, pool: 'mountain2' },
  { no: 5, L: 4, tries: 12, pool: 'valley2' },
  { no: 6, L: 4, tries: 12, pool: 'random' },
  { no: 7, L: 4, tries: 10, pool: 'random' },
  { no: 8, L: 4, tries: 10, pool: 'any' },
  { no: 9, L: 4, tries: 8, pool: 'random' },
  { no: 10, L: 4, tries: 8, pool: 'any' },
  { no: 11, L: 4, tries: 8, pool: 'descending' },
  { no: 12, L: 4, tries: 8, pool: 'ascending' },
  { no: 13, L: 5, tries: 8, pool: 'random' },
  { no: 14, L: 5, tries: 8, pool: 'mountain1' },
  { no: 15, L: 5, tries: 8, pool: 'valley2' },
  { no: 16, L: 5, tries: 8, pool: 'any' },
  { no: 17, L: 6, tries: 8, pool: 'random' },
  { no: 18, L: 6, tries: 8, pool: 'mountain1' },
  { no: 19, L: 6, tries: 8, pool: 'valley1' },
  { no: 20, L: 6, tries: 8, pool: 'any' },
]

/** 无尽模式基础配置；具体关卡由 endlessCfg(no) 按阶段生成 */
export const ENDLESS = { L: 6, tries: 6, pool: null }

/** 变体模式（升序段，需求 §6.2）：复用 LEVELS 配置，独立进度，通关全部常规关后解锁 */
export const VARIANT_MAX = LEVELS.length

/** 无尽模式关卡配置：stage = no - LEVELS.length（1 起），前 5 关 6 次、之后 5 次（§6.1「6~5」） */
export function endlessCfg(no) {
  const stage = no - LEVELS.length
  return { no, L: ENDLESS.L, tries: stage <= 5 ? ENDLESS.tries : 5, pool: null }
}

export function levelOf(no) {
  return LEVELS.find((l) => l.no === no) || null
}

/** 关卡是否有效配置（解锁链/测试用） */
export function isDefinedLevel(no) {
  return no >= 1 && no <= LEVELS.length
}

/**
 * 星级（需求 §5.2）：
 *  3 星：未用提示 且 剩余次数 ≥ 上限的 1/3（向下取整；tries=12 时剩余 ≥ 4）
 *  2 星：未用提示但剩余 < 1/3，或用了提示
 *  1 星：通关
 * usedTries: 消耗轮数；hintsUsed: 提示次数（>0 封顶 2 星）
 */
export function starOf(level, usedTries, hintsUsed) {
  if (usedTries < 1 || usedTries > level.tries) return 0 // 未通关
  const left = level.tries - usedTries
  if (hintsUsed > 0) return 2
  return left >= Math.floor(level.tries / 3) ? 3 : 2
}

/** 顺序解锁：第 no 关解锁 ⟺ 前一关已通关（progress.cleared ≥ no - 1） */
export function isUnlocked(progress, no) {
  return no === 1 || (progress && progress.cleared >= no - 1)
}

/** 关卡密码的 (asc, desc) 结构（调试/关卡设计报告用） */
export function levelSecretShape(secret) {
  return statOf(secret)
}

// ==================== 成就系统（需求 §5.4，M4） ====================

/**
 * 成就定义。type:
 *  - 'first-guess' 一击必中：第 1 次提交即猜中
 *  - 'no-hint-full-stars' 零提示满星：不用提示且 3 星通关任意关
 *  - 'clear-all' 通关全部进阶：常规 20 关全部通关（cleared ≥ LEVELS.length）
 *  - 'endless-10' 无尽行者：无尽模式累计通过 10 关
 *  - 'variant-master' 变体宗师：变体模式通关全部常规关
 * check(ctx) 纯函数判定：本局结算数据 → 是否达成（与历史无关系的不重复发）。
 */
export const ACHIEVEMENTS = [
  { id: 'first-guess', name: '一击必中', desc: '第 1 次提交即猜中密码', icon: '🎯' },
  { id: 'no-hint-full-stars', name: '零提示满星', desc: '不用提示并以 3 星通关任意关卡', icon: '✨' },
  { id: 'clear-all', name: '通关全部进阶', desc: '通过全部 20 个常规关卡', icon: '🏆' },
  { id: 'endless-10', name: '无尽行者', desc: '无尽模式累计通过 10 关', icon: '♾️' },
  { id: 'variant-master', name: '变体宗师', desc: '变体模式通关全部常规关卡', icon: '🧩' },
]

/**
 * 本局结算时判定的成就（全局型 clear-all / endless-10 由调用方按进度字段判定，
 * 此处只处理「单局事件型」成就）。
 * ctx: { mode: 'classic'|'variant', no, usedTries, hintsUsed, star, solved }
 * 返回达成的成就 id 数组。
 */
export function roundAchievements(ctx) {
  if (!ctx || !ctx.solved) return []
  const ids = []
  if (ctx.usedTries === 1) ids.push('first-guess')
  if (ctx.hintsUsed === 0 && ctx.star >= 3) ids.push('no-hint-full-stars')
  return ids
}

/** 进度型成就判定：progress = { cleared, endlessCleared, variantCleared } */
export function progressAchievements(progress) {
  const ids = []
  if (!progress) return ids
  if ((progress.cleared || 0) >= LEVELS.length) ids.push('clear-all')
  if ((progress.endlessCleared || 0) >= 10) ids.push('endless-10')
  if ((progress.variantCleared || 0) >= VARIANT_MAX) ids.push('variant-master')
  return ids
}
