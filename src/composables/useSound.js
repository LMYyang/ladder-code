// 阶梯密码音效：复用顶牛子体系的事件映射（音频文件随 static/sounds 同步过来）。
import { ref } from 'vue'

let ctxPool = null
let lastPlayAt = {}
let muted = null

export function _resetForTest() {
  ctxPool = null
  lastPlayAt = {}
  muted = null
}

const NAMES = ['click', 'turn', 'win', 'lose', 'shuffle']

function getCtx(name) {
  if (!ctxPool) ctxPool = {}
  if (!ctxPool[name]) {
    const ctx = uni.createInnerAudioContext()
    ctx.src = name === 'win' ? `/static/sounds/${name}.mp3` : `/static/sounds/${name}.wav`
    ctx.onError?.(() => {})
    ctxPool[name] = ctx
  }
  return ctxPool[name]
}

export function useSound() {
  if (muted === null) {
    muted = ref(uni.getStorageSync('laddercoded_muted') === true)
  }
  function play(name) {
    if (muted.value || !NAMES.includes(name)) return
    const now = Date.now()
    if (lastPlayAt[name] && now - lastPlayAt[name] < 50) return
    lastPlayAt[name] = now
    try {
      const ctx = getCtx(name)
      ctx.stop?.()
      ctx.play()
    } catch { /* 音频不可用：静默 */ }
  }
  function toggleMuted() {
    muted.value = !muted.value
    try { uni.setStorageSync('laddercoded_muted', muted.value) } catch { /* 存储失败可忽略 */ }
  }
  return { play, muted, toggleMuted }
}
