<template>
  <view class="page">
    <view class="navbar">
      <text class="back" @click="goBack">‹ 返回</text>
      <text class="nav-title">玩法说明</text>
      <text class="nav-right" />
    </view>
    <scroll-view class="help-scroll" scroll-y>
      <view class="section">
        <text class="sec-title">目标</text>
        <text class="sec-body">系统藏了一个 L 位密码（4~6 位）：数字取自 1~9、互不重复。在限定次数内推出完整密码即通关。</text>
      </view>
      <view class="section">
        <text class="sec-title">每轮反馈两个数字</text>
        <text class="sec-body">把你的猜想中「猜对的数字」替换为它在密码中的位置（猜错的不参与），得到一串排名，然后统计：</text>
        <view class="rule-card">
          <text class="rule-line">定序数 = 相邻升序对的个数（排名中后者比前者大的相邻对）</text>
          <text class="rule-line">逆序数 = 逆序对的个数（排名中前面比后面大的组合数）</text>
        </view>
      </view>
      <view class="section">
        <text class="sec-title">例：密码 2 7 3 9</text>
        <view class="rule-card">
          <text class="rule-line">相邻升序对：(2→7)、(3→9) → 定序 = 2</text>
          <text class="rule-line">逆序对：(7,3) → 逆序 = 1</text>
          <text class="rule-line">反馈 = (2, 1)</text>
        </view>
        <text class="sec-body">若你猜中密码，反馈必为「定序 L-1、逆序 0」，且命中数 L/L。</text>
      </view>
      <view class="section">
        <text class="sec-title">关键提示</text>
        <view class="rule-card">
          <text class="rule-line">· 反馈不含位置信息——「命中 n」只告诉你猜对了几个数字</text>
          <text class="rule-line">· 同一 (定序， 逆序) 可来自不同序列，别被表面迷惑</text>
          <text class="rule-line">· 优先提交区分度高的猜想，让每轮反馈砍掉尽量多的候选</text>
        </view>
      </view>
      <view class="section">
        <text class="sec-title">无尽模式</text>
        <text class="sec-body">通关全部 20 个常规关后解锁：6 位密码、前 5 关 6 次机会、之后仅 5 次，密码纯随机，看你能连过多远。</text>
      </view>
      <view class="section">
        <text class="sec-title">变体模式（高阶）</text>
        <text class="sec-body">通关全部经典关后解锁。反馈从两个数字变成一个——「最长连续升序段」：把猜对的数字换成密码中的排名，找最长的「逐项 +1」连续段，段长以元素个数计。</text>
        <view class="rule-card">
          <text class="rule-line">· 段长 = L ⟺ 猜中密码（充要）</text>
          <text class="rule-line">· 段长只描述「猜对的数字中连续相邻的部分」，剩余数字位置完全失明</text>
          <text class="rule-line">· 信息量骤减，救援提示是你的主力工具</text>
        </view>
      </view>
      <view class="section">
        <text class="sec-title">成就</text>
        <view class="rule-card">
          <text class="rule-line">🎯 一击必中：第 1 次提交即猜中</text>
          <text class="rule-line">✨ 零提示满星：不用提示并 3 星通关</text>
          <text class="rule-line">🏆 通关全部进阶：通过全部 20 关</text>
          <text class="rule-line">♾️ 无尽行者：无尽模式累计通过 10 关</text>
          <text class="rule-line">🧩 变体宗师：变体模式通关全部常规关</text>
        </view>
      </view>
      <view class="section">
        <text class="sec-title">救援提示</text>
        <text class="sec-body">连续 3 轮反馈相同时可求提示：揭开某一位的 3 个候选值。每关最多 2 次，用了提示星级封顶 2 星。</text>
      </view>
      <view class="section">
        <text class="sec-title">星级</text>
        <view class="rule-card">
          <text class="rule-line">★★★ 未用提示 且 剩余次数 ≥ 上限的 1/3</text>
          <text class="rule-line">★★ 其余通关情况</text>
          <text class="rule-line">★ 保底通关</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
function goBack() {
  uni.navigateBack()
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
  min-width: 80rpx;
}
.nav-title {
  font-size: 34rpx;
  font-weight: bold;
  color: #f5f0e1;
}
.help-scroll {
  flex: 1;
  padding: 0 32rpx 64rpx;
  box-sizing: border-box;
}
.section {
  margin-bottom: 36rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.sec-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #c9a227;
}
.sec-body {
  font-size: 26rpx;
  color: #d8cfb8;
  line-height: 1.7;
}
.rule-card {
  background: rgba(90, 74, 50, 0.6);
  border-radius: 14rpx;
  padding: 20rpx 24rpx;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}
.rule-line {
  font-size: 26rpx;
  color: #f5f0e1;
  line-height: 1.6;
}
</style>
