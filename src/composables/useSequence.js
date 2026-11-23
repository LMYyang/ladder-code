import { reactive, computed } from 'vue'
import { validateSeq, feedback } from '../core/sequence/feedback.js'
import { feedbackVariant } from '../core/sequence/variant.js'
import { pickLevelSecret } from '../core/sequence/generator.js'
import {
  LEVELS, ENDLESS, levelOf, starOf, endlessCfg,
  ACHIEVEMENTS, roundAchievements, progressAchievements,
} from '../core/sequence/levels.js'
import {
  loadProgress, saveProgress, grantAchievements, emptyProgress,
} from '../core/sequence/store.js'

/**
 * 单人局状态机（M2：纯前端闭环，不走服务器；M4 扩展变体模式 + 成就）。
 * state: 'IDLE' | 'PLAYING' | 'WON' | 'LOST'
 * 反馈口径 v2：asc = 相邻升序对、desc = 逆序对（skip 语义），见 feedback.js。
 * 变体模式（需求 §6.2）：反馈为单一指标「最长连续升序段长度」，asc 字段复用为段长。
 */

export function useSequence(storage) {
  const progress = reactive(loadProgress(storage)) // { stars, cleared, achievements, endlessCleared, variantStars, variantCleared }

  const level = reactive({ no: 1, L: 4, tries: 12, pool: 'teach' })
  const state = reactive({
    mode: 'classic', // 'classic' | 'variant'（升序段变体）
    phase: 'IDLE',
    secret: [],
    slots: [], // 当前输入（长度 L，未填位为 null）
    selectedSlot: 0,
    guesses: [], // [{ seq, asc, desc, hits, solved }]
    triesLeft: 0,
    hintsUsed: 0,
    hintsLeft: 0,
    hintOffer: null, // { slot, values } 救援提示内容
    repeatOf: null, // 与第 N 次猜想重复（toast 提示用，不拦截）
    lastFeedback: null, // 最新一轮 { asc, desc, hits, solved }（动效用）
  })

  const isVariant = computed(() => state.mode === 'variant')
  const triesMax = computed(() => level.tries)
  const canSubmit = computed(() =>
    state.phase === 'PLAYING' &&
    state.slots.length === level.L &&
    state.slots.every((v) => v !== null)
  )
  const usedDigits = computed(() => new Set(state.slots.filter((v) => v !== null)))

  /** 每个数字是否可点：未在本轮使用 */
  function digitEnabled(d) {
    return !usedDigits.value.has(d)
  }

  /**
   * 开始关卡。mode: 'classic'（默认）| 'variant'。
   * - classic：no ≤ LEVELS.length 走关卡表；超出走无尽模式（endlessCfg 阶段次数）。
   * - variant：复用 LEVELS 表密码配置，反馈口径换成升序段；变体进度独立。
   */
  function start(no, mode = 'classic') {
    let cfg
    if (mode === 'variant') {
      const base = levelOf(no) || { no, ...ENDLESS }
      cfg = { ...base, no }
    } else {
      cfg = levelOf(no) || endlessCfg(no)
    }
    Object.assign(level, cfg)
    state.mode = mode
    state.phase = 'PLAYING'
    state.secret = pickLevelSecret(cfg)
    state.slots = new Array(cfg.L).fill(null)
    state.selectedSlot = 0
    state.guesses = []
    state.triesLeft = cfg.tries
    state.hintsUsed = 0
    state.hintsLeft = 2
    state.hintOffer = null
    state.repeatOf = null
    state.lastFeedback = null
    return state.phase
  }

  /** 选位：点击密码槽切换当前填入位置 */
  function selectSlot(i) {
    if (state.phase !== 'PLAYING') return
    state.selectedSlot = Math.max(0, Math.min(level.L - 1, i))
  }

  /** 数字入槽：填到当前选中位（若已占用则覆盖），并自动右移到下一个空位 */
  function pickDigit(d) {
    if (state.phase !== 'PLAYING') return { ok: false }
    if (usedDigits.value.has(d)) return { ok: false, reason: '数字已使用' }
    const i = state.selectedSlot
    if (i >= level.L) return { ok: false }
    state.slots[i] = d
    // 自动跳到下一个空位
    let next = state.slots.findIndex((v, idx) => idx > i && v === null)
    if (next === -1) next = state.slots.findIndex((v) => v === null)
    state.selectedSlot = next === -1 ? level.L : next
    return { ok: true }
  }

  /** 清空当前选中位（回退一位） */
  function clearSlot() {
    if (state.phase !== 'PLAYING') return
    // 优先清选中位；若选中位为空则清最后一个已填位
    let i = state.selectedSlot < state.slots.length ? state.selectedSlot : state.slots.length - 1
    if (state.slots[i] === null) {
      for (let k = state.slots.length - 1; k >= 0; k--) {
        if (state.slots[k] !== null) { i = k; break }
      }
    }
    state.slots[i] = null
    state.selectedSlot = i
  }

  function resetSlots() {
    state.slots = new Array(level.L).fill(null)
    state.selectedSlot = 0
  }

  /**
   * 救援提示（需求 §2.8）：随机揭一个未确定位置的取值区间（3 个候选值）。
   * 「未确定」= 该位置的数字未在历史猜想的对应位置命中过。
   */
  function askHint() {
    if (state.phase !== 'PLAYING') return { ok: false }
    if (state.hintsLeft <= 0) return { ok: false, reason: '提示已用完' }
    // 位置级命中重算：逐历史猜想与密码比对（仅前端本地，无泄露面）
    const confirmed = new Set()
    for (const g of state.guesses) {
      for (let i = 0; i < level.L; i++) {
        if (g.seq[i] === state.secret[i]) confirmed.add(i)
      }
    }
    const candidates = []
    for (let i = 0; i < level.L; i++) {
      if (!confirmed.has(i)) candidates.push(i)
    }
    if (candidates.length === 0) return { ok: false, reason: '没有可提示的位置' }
    const slot = candidates[Math.floor(Math.random() * candidates.length)]
    // 该位的真实值 + 随机凑 2 个干扰值，升序展示为 3 候选区间
    const truth = state.secret[slot]
    const bag = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== truth)
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }
    const values = [truth, bag[0], bag[1]].sort((a, b) => a - b)
    state.hintOffer = { slot, values }
    state.hintsUsed += 1
    state.hintsLeft -= 1
    return { ok: true }
  }

  /** 本局反馈：经典 (asc/desc)；变体 run 复用 asc 字段、desc 恒 0 */
  function calcFeedback(guess) {
    if (isVariant.value) {
      const r = feedbackVariant(state.secret, guess)
      return { asc: r.run, desc: 0, solved: r.solved }
    }
    return feedback(state.secret, guess)
  }

  /** 结算后写入进度 + 判定成就。返回本局新达成成就 id 数组 */
  function settleProgress(star) {
    const usedTries = level.tries - state.triesLeft
    // —— 进度写入（星级取历史最好、cleared 单调递增，口径同 store.recordXxx）——
    if (isVariant.value) {
      const prevV = progress.variantStars[level.no] || 0
      if (star > prevV) progress.variantStars[level.no] = star
      if (level.no > progress.variantCleared) progress.variantCleared = level.no
    } else if (level.no > LEVELS.length) {
      const stage = level.no - LEVELS.length
      if (stage > progress.endlessCleared) progress.endlessCleared = stage
    } else {
      const prev = progress.stars[level.no] || 0
      if (star > prev) progress.stars[level.no] = star
      if (level.no > progress.cleared) progress.cleared = level.no
    }
    // —— 成就判定：单局事件 + 进度型 ——
    const ctx = {
      mode: state.mode,
      no: level.no,
      usedTries,
      hintsUsed: state.hintsUsed,
      star,
      solved: true,
    }
    const ids = [...roundAchievements(ctx), ...progressAchievements(progress)]
    const { newIds } = grantAchievements({ ...progress, achievements: [...progress.achievements] }, ids)
    if (newIds.length) progress.achievements = [...progress.achievements, ...newIds]
    saveProgress(progress, storage)
    return newIds
  }

  /**
   * 提交猜想：校验 → 反馈 → 判定 WON/LOST → 写进度。
   * 返回 { ok, reason?, solved?, star?, newAchievements? }；toast 由页面层负责。
   */
  function submit() {
    if (state.phase !== 'PLAYING') return { ok: false, reason: '非对局中' }
    if (!canSubmit.value) return { ok: false, reason: '请先填满全部密码槽' }
    const guess = [...state.slots]
    const chk = validateSeq(guess, level.L, '猜想')
    if (!chk.ok) return { ok: false, reason: chk.reason }
    // 重复猜想提示（不拦截）
    const key = guess.join(',')
    const dupIdx = state.guesses.findIndex((g) => g.seq.join(',') === key)
    state.repeatOf = dupIdx === -1 ? null : dupIdx + 1
    const fb = calcFeedback(guess)
    const hits = guess.filter((v) => state.secret.includes(v)).length
    const row = { seq: guess, asc: fb.asc, desc: fb.desc, hits, solved: fb.solved }
    state.guesses.unshift(row) // 最新在上
    state.lastFeedback = { asc: fb.asc, desc: fb.desc, hits, solved: fb.solved }
    state.triesLeft -= 1
    state.hintOffer = null // 提示一次性展示，提交后收回
    resetSlots()
    if (fb.solved) {
      state.phase = 'WON'
      const star = starOf(level, level.tries - state.triesLeft, state.hintsUsed)
      const newAchievements = settleProgress(star)
      return { ok: true, solved: true, star, newAchievements }
    }
    if (state.triesLeft <= 0) {
      state.phase = 'LOST'
      return { ok: true, solved: false }
    }
    return { ok: true, solved: false }
  }

  /** 失败重试：同关卡同模式重新生成密码 */
  function retry() {
    return start(level.no, state.mode)
  }

  function backToLevels() {
    state.phase = 'IDLE'
    state.secret = []
  }

  return {
    progress, level, state, triesMax, canSubmit, usedDigits, isVariant,
    LEVELS, ENDLESS, ACHIEVEMENTS,
    start, selectSlot, pickDigit, clearSlot, resetSlots, digitEnabled,
    askHint, submit, retry, backToLevels,
    emptyProgress,
  }
}
