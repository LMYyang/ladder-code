<template>
  <view class="page">
    <view class="navbar">
      <text class="back" @click="goBack">‹ 返回</text>
      <text class="nav-title">选择关卡</text>
      <text class="nav-right" @click="goHelp">说明</text>
    </view>

    <!-- 模式切换 -->
    <view class="mode-tabs">
      <view class="tab" :class="{ on: !variantMode }" @click="variantMode = false">经典模式</view>
      <view class="tab" :class="{ on: variantMode }" @click="switchVariant">变体模式</view>
    </view>

    <scroll-view class="level-scroll" scroll-y>
      <!-- 变体模式说明 -->
      <view v-if="variantMode" class="variant-tip">
        <text class="vt-text">变体模式：反馈只有「最长连续升序段」一个数字（1~L），信息更少、推理更难。星级独立记录。</text>
      </view>

      <view class="level-grid">
        <view
          v-for="lv in LEVELS"
          :key="lv.no"
          class="level-card"
          :class="{ locked: !unlocked(lv.no), cleared: currentStars[lv.no] > 0 }"
          @click="enterLevel(lv)"
        >
          <text class="level-no">{{ lv.no }}</text>
          <view class="level-stars">
            <text v-for="s in 3" :key="s" class="star" :class="{ on: (currentStars[lv.no] || 0) >= s }">★</text>
          </view>
          <text class="level-meta">{{ lv.L }} 位 · {{ lv.tries }} 次</text>
          <text v-if="!unlocked(lv.no)" class="level-lock">🔒</text>
        </view>

        <!-- 无尽模式（仅经典）：通关全部常规关后解锁 -->
        <view v-if="!variantMode" class="level-card endless" :class="{ locked: !endlessUnlocked }" @click="enterEndless">
          <text class="level-no">∞</text>
          <text class="level-meta">无尽模式</text>
          <text class="level-meta sub">{{ ENDLESS.L }} 位 · {{ endlessTriesLabel }}</text>
          <text class="level-meta sub best">最远 {{ progress.endlessCleared || 0 }} 关</text>
          <text v-if="!endlessUnlocked" class="level-lock">🔒</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useSequence } from '../../composables/useSequence.js'

const game = useSequence()
const { progress, LEVELS, ENDLESS } = game

const variantMode = ref(false)

const currentStars = computed(() => (variantMode.value ? progress.variantStars : progress.stars))

function unlocked(no) {
  return no === 1 || (variantMode.value ? progress.variantCleared : progress.cleared) >= no - 1
}
const endlessUnlocked = progress.cleared >= LEVELS.length
const endlessTriesLabel = computed(() => `前 5 关 ${ENDLESS.tries} 次后 5 次`)

function switchVariant() {
  if (variantMode.value) return
  if (!endlessUnlocked) {
    uni.showToast({ title: '通关全部经典关解锁变体模式', icon: 'none' })
    return
  }
  variantMode.value = true
}

function goBack() {
  uni.navigateBack()
}
function goHelp() {
  uni.navigateTo({ url: '/pages/sequence/help' })
}
function enterLevel(lv) {
  if (!unlocked(lv.no)) {
    const cleared = variantMode.value ? progress.variantCleared : progress.cleared
    uni.showToast({ title: `先通过第 ${cleared + 1} 关解锁`, icon: 'none' })
    return
  }
  if (variantMode.value) {
    game.start(lv.no, 'variant')
    uni.navigateTo({ url: `/pages/sequence/game?no=${lv.no}&mode=variant` })
  } else {
    game.start(lv.no)
    uni.navigateTo({ url: `/pages/sequence/game?no=${lv.no}` })
  }
}
function enterEndless() {
  if (!endlessUnlocked) {
    uni.showToast({ title: '通关全部常规关解锁无尽模式', icon: 'none' })
    return
  }
  game.start(LEVELS.length + 1)
  uni.navigateTo({ url: `/pages/sequence/game?no=${LEVELS.length + 1}` })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 88rpx 32rpx 24rpx;
}
.back, .nav-right {
  font-size: 28rpx;
  color: #c9a227;
  padding: 8rpx 16rpx;
}
.nav-title {
  font-size: 34rpx;
  font-weight: bold;
  color: #f5f0e1;
}
/* 模式切换 */
.mode-tabs {
  display: flex;
  gap: 16rpx;
  padding: 0 32rpx 12rpx;
}
.tab {
  flex: 1;
  text-align: center;
  padding: 14rpx 0;
  border-radius: 14rpx;
  background: rgba(90, 74, 50, 0.5);
  color: #b8a888;
  font-size: 28rpx;
}
.tab.on {
  background: linear-gradient(180deg, #c9a227, #a5821a);
  color: #fff;
  font-weight: bold;
}
/* 变体说明 */
.variant-tip {
  margin-bottom: 20rpx;
  background: rgba(140, 100, 200, 0.2);
  border: 1rpx solid rgba(180, 140, 240, 0.35);
  border-radius: 14rpx;
  padding: 16rpx 20rpx;
}
.vt-text {
  font-size: 24rpx;
  color: #cbb8ee;
  line-height: 1.6;
}
.level-scroll {
  flex: 1;
  padding: 16rpx 32rpx 64rpx;
  box-sizing: border-box;
}
.level-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24rpx;
}
.level-card {
  position: relative;
  width: calc((100% - 48rpx) / 3);
  background: rgba(90, 74, 50, 0.6);
  border-radius: 20rpx;
  padding: 28rpx 0 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  box-sizing: border-box;
}
.level-card.cleared {
  background: rgba(201, 162, 39, 0.25);
}
.level-card.locked {
  opacity: 0.45;
}
.level-no {
  font-size: 44rpx;
  font-weight: bold;
  color: #f5f0e1;
}
.level-stars {
  display: flex;
  gap: 4rpx;
}
.star {
  font-size: 24rpx;
  color: rgba(245, 240, 225, 0.25);
}
.star.on {
  color: #c9a227;
}
.level-meta {
  font-size: 20rpx;
  color: #b8a888;
}
.level-meta.sub {
  font-size: 18rpx;
}
.level-meta.best {
  color: #c9a227;
}
.level-lock {
  position: absolute;
  top: 12rpx;
  right: 16rpx;
  font-size: 22rpx;
}
</style>
