<template>
  <view class="page">
    <view class="navbar">
      <text class="back" @click="goBack">‹ 退出</text>
      <text class="nav-title">{{ navTitle }}</text>
      <text class="nav-right">剩 {{ state.triesLeft }}/{{ triesMax }}</text>
    </view>

    <!-- 变体模式徽标 -->
    <view v-if="game.isVariant.value" class="variant-badge">
      <text class="vb-text">变体 · 反馈只看「最长连续升序段」</text>
    </view>

    <!-- 密码槽 -->
    <view class="slots-row">
      <view
        v-for="(v, i) in state.slots"
        :key="i"
        class="slot"
        :class="{ selected: state.selectedSlot === i, filled: v !== null }"
        @click="game.selectSlot(i)"
      >
        <text v-if="v !== null" class="slot-digit">{{ v }}</text>
      </view>
    </view>

    <!-- 最新反馈 -->
    <view v-if="state.lastFeedback" class="feedback-card" :class="{ solved: state.lastFeedback.solved }">
      <view class="fb-item">
        <text class="fb-label">{{ game.isVariant.value ? '升序段' : '定序' }}</text>
        <text class="fb-num">{{ state.lastFeedback.asc }}</text>
      </view>
      <view v-if="!game.isVariant.value" class="fb-item">
        <text class="fb-label">逆序</text>
        <text class="fb-num">{{ state.lastFeedback.desc }}</text>
      </view>
      <view class="fb-item">
        <text class="fb-label">命中</text>
        <text class="fb-num">{{ state.lastFeedback.hits }}/{{ level.L }}</text>
      </view>
    </view>
    <view v-else class="feedback-card empty">
      <text class="fb-hint">{{ emptyHint }}</text>
    </view>

    <!-- 救援提示 -->
    <view v-if="state.hintOffer" class="hint-card">
      <text class="hint-text">提示：第 {{ state.hintOffer.slot + 1 }} 位 ∈ { {{ state.hintOffer.values.join('，') }} }</text>
    </view>

    <!-- 历史列表 -->
    <scroll-view class="history" scroll-y>
      <view v-for="(g, idx) in state.guesses" :key="state.guesses.length - idx" class="history-row" :class="{ top: idx === 0, repeat: state.repeatOf === state.guesses.length - idx }">
        <text class="h-seq">{{ g.seq.join(' ') }}</text>
        <text class="h-fb">{{ fbText(g) }}</text>
        <text v-if="g.solved" class="h-flag win">✓</text>
      </view>
      <view v-if="state.guesses.length === 0" class="history-empty">还没有猜想记录</view>
    </scroll-view>

    <!-- 底部操作区 -->
    <view class="ops-row">
      <button class="btn-ghost" :disabled="state.hintsLeft <= 0" @click="onHint">提示({{ state.hintsLeft }})</button>
      <button class="btn-ghost" @click="game.clearSlot">删除</button>
      <button class="btn-ghost" @click="game.resetSlots">清空</button>
      <button class="btn-submit" :disabled="!game.canSubmit.value" @click="onSubmit">提交</button>
    </view>

    <!-- 数字键盘 -->
    <view class="keypad">
      <view
        v-for="d in 9"
        :key="d"
        class="key"
        :class="{ disabled: !game.digitEnabled(d) }"
        @click="onDigit(d)"
      >{{ d }}</view>
    </view>

    <!-- 终局弹窗 -->
    <view v-if="state.phase === 'WON' || state.phase === 'LOST'" class="overlay">
      <view class="result-modal">
        <template v-if="state.phase === 'WON'">
          <text class="result-title win">{{ winTitle }}</text>
          <view class="result-stars">
            <text v-for="s in 3" :key="s" class="star" :class="{ on: lastStar >= s }">★</text>
          </view>
          <text class="result-sub">{{ level.tries - state.triesLeft }} 次猜中{{ state.hintsUsed > 0 ? ` · 用了 ${state.hintsUsed} 次提示` : '' }}</text>
          <text v-if="lastStar >= 3" class="result-sub gold">零提示满星，漂亮！</text>
          <button class="btn-primary" @click="nextAction">{{ nextLabel }}</button>
          <button class="btn-secondary" @click="goLevelsBack">返回选关</button>
        </template>
        <template v-else>
          <text class="result-title lose">次数用尽</text>
          <text class="result-sub">密码是：{{ state.secret.join(' ') }}</text>
          <button class="btn-primary" @click="onRetry">再试一次</button>
          <button class="btn-secondary" @click="goLevelsBack">返回选关</button>
        </template>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useSequence } from '../../composables/useSequence.js'
import { useSound } from '../../composables/useSound.js'

const game = useSequence()
const { state, level, triesMax } = game
const sound = useSound()
const lastStar = ref(0)

// 页面可直开（分享/刷新）：onLoad 参数带关卡号且本地未开局时自动开局
const instance = getCurrentPages()
const cur = instance[instance.length - 1]
const routeNo = Number(cur?.options?.no || 0)
const routeMode = cur?.options?.mode === 'variant' ? 'variant' : 'classic'
if (state.phase !== 'PLAYING' && routeNo > 0) game.start(routeNo, routeMode)

const isEndless = computed(() => !game.isVariant.value && level.no > game.LEVELS.length)

const navTitle = computed(() => {
  if (game.isVariant.value) return `变体 · 第 ${level.no} 关 · ${level.L} 位`
  if (isEndless.value) return `无尽 · 第 ${level.no - game.LEVELS.length} 关 · ${level.L} 位`
  return `第 ${level.no} 关 · ${level.L} 位`
})

const emptyHint = computed(() => game.isVariant.value
  ? `填满 ${level.L} 位后提交，反馈只有「最长连续升序段」一个数字`
  : `填满 ${level.L} 位后提交，观察「定序 / 逆序」两个数字`)

const winTitle = computed(() => {
  if (game.isVariant.value) return '变体通关！'
  if (isEndless.value) return '无尽推进！'
  return '通关！'
})

const nextLabel = computed(() => {
  if (game.isVariant.value) return level.no < game.LEVELS.length ? '下一关' : '返回选关'
  return isEndless.value ? '继续无尽' : (level.no < game.LEVELS.length ? '下一关' : '返回选关')
})

function fbText(g) {
  return game.isVariant.value ? `段${g.asc} · 中${g.hits}` : `定${g.asc} · 逆${g.desc} · 中${g.hits}`
}

function onDigit(d) {
  if (!game.digitEnabled(d)) return
  const r = game.pickDigit(d)
  if (r.ok) sound.play('click')
}
function onHint() {
  const r = game.askHint()
  if (r.ok) sound.play('shuffle')
  else uni.showToast({ title: r.reason || '无法提示', icon: 'none' })
}
function onSubmit() {
  const r = game.submit()
  if (!r.ok) {
    uni.showToast({ title: r.reason, icon: 'none' })
    return
  }
  if (state.repeatOf) uni.showToast({ title: `与第 ${state.repeatOf} 次猜想相同`, icon: 'none' })
  if (r.solved) {
    lastStar.value = r.star
    sound.play('win')
    // 成就 toast（逐条提示，避免重叠：串行间隔）
    const ids = r.newAchievements || []
    ids.forEach((id, i) => {
      const ach = game.ACHIEVEMENTS.find((a) => a.id === id)
      if (!ach) return
      setTimeout(() => uni.showToast({ title: `${ach.icon} 成就达成：${ach.name}`, icon: 'none', duration: 2200 }), 600 + i * 2400)
    })
  } else if (state.phase === 'LOST') {
    sound.play('lose')
  } else {
    sound.play('turn')
  }
}
function nextAction() {
  const more = level.no < game.LEVELS.length
  if (game.isVariant.value) {
    if (more) {
      game.start(level.no + 1, 'variant')
      lastStar.value = 0
    } else {
      goLevelsBack()
    }
    return
  }
  if (isEndless.value) {
    game.start(level.no + 1)
    lastStar.value = 0
    return
  }
  if (more) {
    game.start(level.no + 1)
    lastStar.value = 0
  } else {
    goLevelsBack()
  }
}
function onRetry() {
  game.retry()
  lastStar.value = 0
}
function goLevelsBack() {
  game.backToLevels()
  uni.navigateBack()
}
function goBack() {
  goLevelsBack()
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 88rpx 32rpx 16rpx;
}
.back, .nav-right {
  font-size: 28rpx;
  color: #c9a227;
  padding: 8rpx 12rpx;
  flex-shrink: 0;
  white-space: nowrap;
}
.nav-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #f5f0e1;
  flex: 1;
  min-width: 0;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 变体徽标 */
.variant-badge {
  margin: 0 32rpx 4rpx;
  background: rgba(140, 100, 200, 0.25);
  border: 1rpx solid rgba(180, 140, 240, 0.4);
  border-radius: 12rpx;
  padding: 8rpx 16rpx;
  text-align: center;
}
.vb-text {
  font-size: 22rpx;
  color: #cbb8ee;
}
/* 密码槽 */
.slots-row {
  display: flex;
  justify-content: center;
  gap: 18rpx;
  padding: 24rpx 0 8rpx;
}
.slot {
  width: 92rpx;
  height: 116rpx;
  border-radius: 16rpx;
  border: 3rpx solid rgba(245, 240, 225, 0.3);
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s;
}
.slot.selected {
  border-color: #c9a227;
  box-shadow: 0 0 12rpx rgba(201, 162, 39, 0.5);
}
.slot.filled {
  background: linear-gradient(180deg, #f5f0e1, #d8cfb8);
}
.slot-digit {
  font-size: 52rpx;
  font-weight: bold;
  color: #3a2410;
}
/* 反馈卡 */
.feedback-card {
  margin: 16rpx 32rpx;
  background: rgba(90, 74, 50, 0.6);
  border-radius: 16rpx;
  display: flex;
  justify-content: space-around;
  padding: 20rpx 0;
}
.feedback-card.solved {
  background: rgba(201, 162, 39, 0.45);
}
.feedback-card.empty {
  justify-content: center;
}
.fb-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}
.fb-label {
  font-size: 22rpx;
  color: #b8a888;
}
.fb-num {
  font-size: 44rpx;
  font-weight: bold;
  color: #f5f0e1;
}
.fb-hint {
  font-size: 24rpx;
  color: #b8a888;
}
/* 提示 */
.hint-card {
  margin: 0 32rpx 8rpx;
  background: rgba(90, 160, 90, 0.25);
  border-radius: 12rpx;
  padding: 12rpx 20rpx;
}
.hint-text {
  font-size: 26rpx;
  color: #a8d8a0;
}
/* 历史 */
.history {
  flex: 1;
  min-height: 160rpx;
  margin: 8rpx 32rpx;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12rpx;
  padding: 8rpx 16rpx;
  box-sizing: border-box;
}
.history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10rpx 4rpx;
  border-bottom: 1rpx solid rgba(245, 240, 225, 0.08);
}
.history-row.top {
  background: rgba(201, 162, 39, 0.12);
  border-radius: 8rpx;
}
.history-row.repeat {
  opacity: 0.55;
}
.h-seq {
  font-size: 30rpx;
  letter-spacing: 6rpx;
  color: #f5f0e1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.h-fb {
  font-size: 24rpx;
  color: #b8a888;
  flex-shrink: 0;
  white-space: nowrap;
}
.h-flag.win {
  color: #c9a227;
  font-weight: bold;
  flex-shrink: 0;
}
.history-empty {
  text-align: center;
  color: #8a7a60;
  font-size: 24rpx;
  padding: 24rpx 0;
}
/* 操作行 */
.ops-row {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 32rpx 8rpx;
}
.btn-ghost {
  flex: 1;
  background: #5a4a32;
  color: #f5f0e1;
  border-radius: 14rpx;
  font-size: 26rpx;
  padding: 14rpx 0;
  border: none;
  margin: 0;
}
.btn-ghost[disabled] {
  opacity: 0.4;
}
.btn-submit {
  flex: 1.4;
  background: linear-gradient(180deg, #c9a227, #a5821a);
  color: #fff;
  border-radius: 14rpx;
  font-size: 28rpx;
  font-weight: bold;
  padding: 14rpx 0;
  border: none;
  margin: 0;
}
.btn-submit[disabled] {
  opacity: 0.4;
}
/* 键盘 */
.keypad {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  padding: 8rpx 32rpx calc(24rpx + env(safe-area-inset-bottom));
}
.key {
  width: calc((100% - 48rpx) / 5);
  height: 92rpx;
  border-radius: 14rpx;
  background: rgba(245, 240, 225, 0.12);
  color: #f5f0e1;
  font-size: 40rpx;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
}
.key.disabled {
  opacity: 0.25;
}
/* 终局弹窗 */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.result-modal {
  width: 560rpx;
  background: #4a3a26;
  border-radius: 24rpx;
  padding: 48rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
}
.result-title {
  font-size: 52rpx;
  font-weight: bold;
}
.result-title.win { color: #c9a227; }
.result-title.lose { color: #b8a888; }
.result-stars { display: flex; gap: 8rpx; }
.star {
  font-size: 48rpx;
  color: rgba(245, 240, 225, 0.2);
}
.star.on { color: #c9a227; }
.result-sub {
  font-size: 26rpx;
  color: #b8a888;
}
.result-sub.gold {
  color: #c9a227;
}
.btn-secondary {
  background: #5a4a32;
  color: #f5f0e1;
  border: none;
  margin: 0;
  border-radius: 14rpx;
  font-size: 26rpx;
  padding: 14rpx 0;
  width: 100%;
}
</style>
