// src/composables/useSeqNetGame.js
import { reactive, computed, ref, watch, getCurrentInstance, onUnmounted } from 'vue'
import { sharedNet } from '../utils/net.js'

/**
 * 阶梯密码联网局管理（双人 1v1）：数据源为服务器 seq.* 推送。
 * 安全铁律：secret 只在 ROUND_OVER && revive 时由服务器下发，本地不做任何回显。
 * token 存 storage key 'laddercoded_seq_token'，reconnect 握手恢复身份。
 */

const TOKEN_KEY = 'laddercoded_seq_token'

export function useSeqNetGame(net = sharedNet()) {
  const room = reactive({ roomId: null, phase: '', members: [] })
  const view = reactive({
    phase: '', L: 4, triesMax: 8, triesLeft: 8, role: '',
    guesses: [], hintsUsed: 0, hintsLeft: 2, hintOffer: null,
    secret: null, result: null, mode: 'classic',
  })
  // 本地输入槽（SETTING 设密 / GUESSING 猜测共用）
  const slots = ref([null, null, null, null])
  const selectedSlot = ref(0)
  const connection = net.status
  const mySeat = ref(0)
  const busy = ref(false)
  let stopWatch = null

  // ---------- 推送订阅 ----------
  const offRoom = net.on('seq.room.state', ({ room: r }) => {
    if (!r) return
    room.roomId = r.roomId
    room.phase = r.phase
    room.members = r.members || []
    // 房间态里的成员含各自 token：找回自己座位
    const myToken = uni.getStorageSync(TOKEN_KEY)
    const me = (r.members || []).find((m) => m.token === myToken)
    if (me) mySeat.value = me.seat
  })
  const offRound = net.on('seq.round.state', ({ view: v }) => {
    if (!v) return
    Object.keys(v).forEach((k) => { view[k] = v[k] })
    // 长度变化时重置输入槽
    const L = v.L || 4
    if (slots.value.length !== L) {
      slots.value = Array.from({ length: L }, () => null)
      selectedSlot.value = 0
    }
  })

  if (getCurrentInstance()) onUnmounted(() => { offRoom(); offRound(); stopWatch?.() })

  // ---------- 快照/重连握手 ----------
  async function fetchSnapshot() {
    try {
      if (net.status.value !== 'open') await net.connect()
      const token = uni.getStorageSync(TOKEN_KEY)
      if (!token) return
      const res = await net.request('reconnect', { token })
      if (res.type === 'error') {
        // 会话失效：清 token（房间已解散）
        uni.removeStorageSync(TOKEN_KEY)
      }
    } catch { /* 快照缺失仅表现为空界面 */ }
  }
  fetchSnapshot()
  if (getCurrentInstance()) {
    stopWatch = watch(connection, (s) => { if (s === 'open') fetchSnapshot() })
    onUnmounted(() => stopWatch?.())
  }

  // ---------- 派生状态 ----------
  const members = computed(() => room.members || [])
  const setterName = computed(() => members.value.find((m) => m.seat === 0)?.name || '等待加入…')
  const guesserName = computed(() => members.value.find((m) => m.seat === 1)?.name || '虚位以待')
  const isSetter = computed(() => mySeat.value === 0)
  const amHost = computed(() => members.value.find((m) => m.seat === 0)?.isHost && mySeat.value === 0)

  /** 数字键是否可选：已填或已在本次输入中出现过的置灰（互不重复） */
  function digitEnabled(d) {
    if (view.phase !== 'SETTING' && view.phase !== 'GUESSING') return false
    if (view.phase === 'SETTING' && !isSetter.value) return false
    if (view.phase === 'GUESSING' && isSetter.value) return false
    return !slots.value.includes(d)
  }
  const canSubmit = computed(() => slots.value.every((v) => v !== null))

  // ---------- 输入操作 ----------
  function selectSlot(i) {
    if (i >= 0 && i < slots.value.length) selectedSlot.value = i
  }
  function pickDigit(d) {
    const i = selectedSlot.value
    if (!digitEnabled(d) || i == null) return { ok: false }
    slots.value[i] = d
    // 自动跳到下一个空槽
    const next = slots.value.findIndex((v, idx) => v === null && idx !== i)
    if (next >= 0) selectedSlot.value = next
    return { ok: true }
  }
  function clearSlot() {
    const i = selectedSlot.value
    if (i == null) return
    slots.value[i] = null
    selectedSlot.value = i
  }
  function resetSlots() {
    slots.value = slots.value.map(() => null)
    selectedSlot.value = 0
  }

  // ---------- 网络动作 ----------
  async function call(type, payload) {
    try {
      const res = await net.request(type, payload)
      if (res && res.type === 'error') {
        return { ok: false, reason: res.payload?.message || '操作失败', code: res.payload?.code }
      }
      return { ok: true, ...res.payload }
    } catch (e) {
      return { ok: false, reason: e.message }
    }
  }

  /** 建房（联网大厅入口） */
  async function createRoom(name) {
    busy.value = true
    try {
      if (net.status.value !== 'open') await net.connect()
      const res = await call('seq.room.create', { name })
      if (res.ok && res.token) uni.setStorageSync(TOKEN_KEY, res.token)
      return res
    } finally { busy.value = false }
  }

  /** 加入房间 */
  async function joinRoom(name, roomId) {
    busy.value = true
    try {
      if (net.status.value !== 'open') await net.connect()
      const res = await call('seq.room.join', { name, roomId: Number(roomId) })
      if (res.ok && res.token) uni.setStorageSync(TOKEN_KEY, res.token)
      return res
    } finally { busy.value = false }
  }

  /** 设密方锁定密码（SETTING 阶段） */
  async function setSecret(mode = 'classic') {
    if (!canSubmit.value) return { ok: false, reason: '请先填满密码' }
    const res = await call('seq.round.setSecret', { secret: [...slots.value], mode })
    if (res.ok) resetSlots()
    return res
  }

  /** 猜方提交猜想 */
  async function submitGuess() {
    if (!canSubmit.value) return { ok: false, reason: '请先填满猜想' }
    const res = await call('seq.guess', { guess: [...slots.value] })
    if (res.ok) resetSlots()
    return res
  }

  /** 救援提示 */
  async function askHint() {
    return call('seq.round.hint', {})
  }

  /** 再来一局确认 */
  async function settleContinue() {
    return call('seq.round.again', {})
  }

  /** 我是否已确认再来一局（服务器不回显 ack 明细，用 room.settleAck 不行——快照无此字段，
   *  由本地标记 + phase 变化兜底：确认后按钮置 loading 文案） */
  const ackedLocal = ref(false)
  async function ackAgain() {
    ackedLocal.value = true
    const res = await settleContinue()
    if (!res.ok) ackedLocal.value = false
    return res
  }

  /** 离开房间：清 token 回大厅 */
  async function leave() {
    try { await net.request('seq.room.leave', {}) } catch { /* 服务器宽限兜底 */ }
    uni.removeStorageSync(TOKEN_KEY)
  }

  return {
    room, view, slots, selectedSlot, connection, mySeat, busy,
    members, setterName, guesserName, isSetter, amHost,
    digitEnabled, canSubmit, selectSlot, pickDigit, clearSlot, resetSlots,
    createRoom, joinRoom, setSecret, submitGuess, askHint, ackAgain, ackedLocal, leave, fetchSnapshot,
  }
}
