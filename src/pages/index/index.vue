<template>
  <view class="menu">
    <view class="logo-area">
      <view class="logo-slots">
        <view v-for="(d, i) in demoSeq" :key="i" class="logo-slot" :class="{ on: true }">{{ d }}</view>
      </view>
      <text class="title">阶梯密码</text>
      <text class="subtitle">序列推理 · 4~6 位 · 互不重复</text>
    </view>
    <view class="menu-buttons">
      <button class="btn-primary" @click="goLevels">单人闯关</button>
      <button class="btn-secondary" @click="goDuel">双人对战</button>
      <button class="btn-secondary" @click="goHelp">玩法说明</button>
      <view class="stats-card">
        <view class="stats-cols">
          <view class="stats-block">
            <text class="stats-label">已通关</text>
            <text class="stats-score">{{ progress.cleared }} / {{ LEVELS.length }}</text>
          </view>
          <view class="stats-divider" />
          <view class="stats-block">
            <text class="stats-label">总星数</text>
            <text class="stats-score">{{ totalStars }} / {{ LEVELS.length * 3 }}</text>
          </view>
          <view class="stats-divider" />
          <view class="stats-block">
            <text class="stats-label">成就</text>
            <text class="stats-score">{{ progress.achievements.length }} / {{ ACHIEVEMENTS.length }}</text>
          </view>
        </view>
      </view>
      <!-- 成就墙 -->
      <view class="ach-card">
        <text class="ach-title">成就墙</text>
        <view class="ach-grid">
          <view v-for="a in ACHIEVEMENTS" :key="a.id" class="ach-item" :class="{ got: progress.achievements.includes(a.id) }">
            <text class="ach-icon">{{ a.icon }}</text>
            <text class="ach-name">{{ a.name }}</text>
            <text class="ach-desc">{{ a.desc }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { useSequence } from '../../composables/useSequence.js'

const game = useSequence()
const { ACHIEVEMENTS } = game
const demoSeq = [2, 7, 3, 9]
const totalStars = computed(() => Object.values(game.progress.stars).reduce((s, v) => s + v, 0))

function goLevels() {
  uni.navigateTo({ url: '/pages/sequence/levels' })
}
function goDuel() {
  uni.navigateTo({ url: '/pages/sequence/room' })
}
function goHelp() {
  uni.navigateTo({ url: '/pages/sequence/help' })
}
</script>

<style scoped>
.menu {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
}
.logo-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 80rpx;
}
.logo-slots {
  display: flex;
  gap: 16rpx;
  margin-bottom: 32rpx;
}
.logo-slot {
  width: 96rpx;
  height: 120rpx;
  border-radius: 16rpx;
  background: linear-gradient(180deg, #f5f0e1, #d8cfb8);
  color: #3a2410;
  font-size: 48rpx;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, 0.4);
  transform: rotate(-3deg);
}
.logo-slot:nth-child(2n) { transform: rotate(3deg); }
.title {
  font-size: 64rpx;
  font-weight: bold;
  color: #f5f0e1;
  letter-spacing: 8rpx;
}
.subtitle {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: #b8a888;
}
.menu-buttons {
  width: 100%;
  max-width: 560rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  align-items: center;
}
.stats-card {
  margin-top: 48rpx;
  width: 100%;
  background: rgba(90, 74, 50, 0.6);
  border-radius: 20rpx;
  padding: 28rpx 0;
}
.stats-cols {
  display: flex;
  align-items: center;
}
.stats-block {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}
.stats-divider {
  width: 1rpx;
  height: 64rpx;
  background: rgba(245, 240, 225, 0.2);
}
.stats-label {
  font-size: 24rpx;
  color: #b8a888;
}
.stats-score {
  font-size: 40rpx;
  font-weight: bold;
  color: #f5f0e1;
}
/* 成就墙 */
.ach-card {
  margin-top: 24rpx;
  width: 100%;
  background: rgba(90, 74, 50, 0.4);
  border-radius: 20rpx;
  padding: 24rpx;
  box-sizing: border-box;
}
.ach-title {
  font-size: 26rpx;
  color: #c9a227;
  font-weight: bold;
  display: block;
  margin-bottom: 16rpx;
}
.ach-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.ach-item {
  width: calc((100% - 32rpx) / 3);
  background: rgba(0, 0, 0, 0.2);
  border-radius: 14rpx;
  padding: 16rpx 8rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  opacity: 0.4;
  box-sizing: border-box;
}
.ach-item.got {
  opacity: 1;
  background: rgba(201, 162, 39, 0.18);
  border: 1rpx solid rgba(201, 162, 39, 0.5);
}
.ach-icon {
  font-size: 36rpx;
}
.ach-name {
  font-size: 22rpx;
  color: #f5f0e1;
  font-weight: bold;
}
.ach-desc {
  font-size: 18rpx;
  color: #b8a888;
  text-align: center;
  line-height: 1.4;
}
</style>
