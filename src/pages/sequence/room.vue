<template>
  <view class="page">
    <view class="navbar">
      <text class="back" @click="goHome">‹ 返回</text>
      <text class="nav-title">双人对战</text>
      <text class="nav-right" />
    </view>

    <!-- 未连接/未入房：建房 / 加入 -->
    <view v-if="!inRoom" class="lobby">
      <view class="panel">
        <text class="panel-title">创建房间</text>
        <text class="panel-desc">建房后把 6 位房间号告诉好友</text>
        <input v-model="myName" class="name-input" maxlength="12" placeholder="你的昵称" />
        <button class="btn-primary" :disabled="net.busy.value" @click="onCreate">{{ net.busy.value ? '创建中…' : '创建房间' }}</button>
      </view>
      <view class="panel">
        <text class="panel-title">加入房间</text>
        <input v-model="joinId" class="name-input" type="number" maxlength="6" placeholder="输入 6 位房间号" />
        <input v-model="joinName" class="name-input" maxlength="12" placeholder="你的昵称" />
        <button class="btn-secondary" :disabled="net.busy.value || !joinId" @click="onJoin">{{ net.busy.value ? '加入中…' : '加入' }}</button>
      </view>
    </view>

    <!-- 房间内 -->
    <view v-else class="room">
      <view class="room-head">
        <text class="room-id">房间号 {{ net.room.roomId }}</text>
        <text class="room-phase">{{ phaseLabel }}</text>
      </view>

      <!-- 成员卡 -->
      <view class="members">
        <view class="member-card" :class="{ me: net.mySeat.value === 0 }">
          <text class="m-role">设密方</text>
          <text class="m-name">{{ net.setterName.value }}</text>
          <text v-if="memberGone(0)" class="m-gone">掉线 {{ goneLeft(0) }}s</text>
        </view>
        <text class="vs">VS</text>
        <view class="member-card" :class="{ me: net.mySeat.value === 1 }">
          <text class="m-role">猜方</text>
          <text class="m-name">{{ net.guesserName.value }}</text>
          <text v-if="memberGone(1)" class="m-gone">掉线 {{ goneLeft(1) }}s</text>
        </view>
      </view>

      <!-- 剩余次数 -->
      <view v-if="net.view.phase === 'GUESSING'" class="tries-line">
        <text>剩余次数 {{ net.view.triesLeft }}/{{ net.view.triesMax }} · 提示 {{ net.view.hintsLeft }}</text>
      </view>

      <!-- 密码槽 -->
      <view class="slots-row">
        <view
          v-for="(v, i) in net.slots.value"
          :key="i"
          class="slot"
          :class="{ selected: net.selectedSlot.value === i, filled: v !== null }"
          @click="net.selectSlot(i)"
        >
          <text v-if="v !== null" class="slot-digit">{{ v }}</text>
        </view>
      </view>

      <!-- 提示卡 -->
      <view v-if="net.view.hintOffer" class="hint-card">
        <text class="hint-text">提示：第 {{ net.view.hintOffer.slot + 1 }} 位 ∈ { {{ net.view.hintOffer.values.join('，') }} }</text>
      </view>

      <!-- 历史列表 -->
      <scroll-view class="history" scroll-y>
        <view v-for="(g, idx) in net.view.guesses" :key="net.view.guesses.length - idx" class="history-row" :class="{ top: idx === 0 }">
          <text class="h-seq">{{ g.seq.join(' ') }}</text>
          <text class="h-fb">定{{ g.asc }} · 逆{{ g.desc }} · 中{{ g.hits }}</text>
          <text v-if="g.solved" class="h-flag win">✓</text>
        </view>
        <view v-if="net.view.guesses.length === 0" class="history-empty">{{ historyEmptyText }}</view>
      </scroll-view>

      <!-- 操作区 -->
      <view class="ops-row">
        <button v-if="net.view.phase === 'GUESSING' && !net.isSetter.value" class="btn-ghost" :disabled="net.view.hintsLeft <= 0" @click="onHint">提示({{ net.view.hintsLeft }})</button>
        <button class="btn-ghost" @click="net.clearSlot">删除</button>
        <button class="btn-ghost" @click="net.resetSlots">清空</button>
        <button class="btn-submit" :disabled="!submitEnabled" @click="onSubmit">{{ submitLabel }}</button>
      </view>

      <!-- 数字键盘 -->
      <view class="keypad">
        <view
          v-for="d in 9"
          :key="d"
          class="key"
          :class="{ disabled: !net.digitEnabled(d) }"
          @click="onDigit(d)"
        >{{ d }}</view>
      </view>

      <!-- 结算弹窗 -->
      <view v-if="net.view.phase === 'ROUND_OVER'" class="overlay">
        <view class="result-modal">
          <text class="result-title" :class="iWin ? 'win' : 'lose'">{{ iWin ? '你赢了！' : '你输了' }}</text>
          <text class="result-sub">密码是：{{ (net.view.secret || []).join(' ') || '——（对方掉线判负，不揭晓）' }}</text>
          <button class="btn-primary" @click="onAgain">{{ net.ackedLocal.value ? '已确认，等待对方…' : '再来一局' }}</button>
          <button class="btn-secondary" @click="goHome">退出房间</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useSeqNetGame } from '../../composables/useSeqNetGame.js'
import { useSound } from '../../composables/useSound.js'

const net = useSeqNetGame()
const sound = useSound()
const myName = ref('')
const joinId = ref('')
const joinName = ref('')

const inRoom = computed(() => !!net.room.roomId)

const phaseLabel = computed(() => ({
  WAITING: '等待玩家加入',
  SETTING: '设密阶段',
  GUESSING: '猜谜进行中',
  ROUND_OVER: '本局结束',
}[net.view.phase] || net.room.phase || ''))

const historyEmptyText = computed(() => {
  if (net.view.phase === 'WAITING') return '等待玩家加入…'
  if (net.view.phase === 'SETTING') return net.isSetter.value ? '请设置密码（互相不重复的数字）' : '等待对方设置密码…'
  return '还没有猜想记录'
})

/** 可提交：当前阶段轮到我的输入动作 */
const submitEnabled = computed(() => {
  if (net.view.phase === 'SETTING' && net.isSetter.value) return net.canSubmit.value
  if (net.view.phase === 'GUESSING' && !net.isSetter.value) return net.canSubmit.value
  return false
})
const submitLabel = computed(() => {
  if (net.view.phase === 'SETTING') return net.isSetter.value ? '锁定密码' : '等待设密…'
  if (net.view.phase === 'GUESSING') return net.isSetter.value ? '等待对方猜…' : '提交猜想'
  return '…'
})

function memberGone(seat) {
  const m = net.members.value.find((x) => x.seat === seat)
  return !!(m && m.gone)
}
function goneLeft(seat) {
  return '—'
}

function onDigit(d) {
  if (!net.digitEnabled(d)) return
  const r = net.pickDigit(d)
  if (r.ok) sound.play('click')
}
async function onCreate() {
  const r = await net.createRoom(myName.value || '玩家')
  if (!r.ok) uni.showToast({ title: r.reason || '创建失败', icon: 'none' })
}
async function onJoin() {
  const r = await net.joinRoom(joinName.value || '玩家', joinId.value)
  if (!r.ok) uni.showToast({ title: r.reason || '加入失败', icon: 'none' })
  else sound.play('shuffle')
}
async function onSubmit() {
  if (net.view.phase === 'SETTING') {
    const r = await net.setSecret()
    if (!r.ok) uni.showToast({ title: r.reason, icon: 'none' })
    else sound.play('turn')
    return
  }
  const r = await net.submitGuess()
  if (!r.ok) {
    uni.showToast({ title: r.reason, icon: 'none' })
    return
  }
  if (net.view.phase === 'ROUND_OVER') sound.play('win')
  else sound.play('turn')
}
async function onHint() {
  const r = await net.askHint()
  if (r.ok) sound.play('shuffle')
  else uni.showToast({ title: r.reason || '无法提示', icon: 'none' })
}
async function onAgain() {
  if (net.ackedLocal.value) return
  const r = await net.ackAgain()
  if (!r.ok) uni.showToast({ title: r.reason, icon: 'none' })
}
function goHome() {
  net.leave()
  uni.reLaunch({ url: '/pages/index/index' })
}
</script>

<style scoped>
.page {
  /* 确定高度，否则超短视口/记录变多时键盘被顶出可视区 */
  height: 100vh;
  height: 100dvh;
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
.back {
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
.nav-right { min-width: 80rpx; flex-shrink: 0; }

/* 大厅 */
.lobby {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 28rpx;
  padding: 24rpx 40rpx;
}
.panel {
  background: rgba(90, 74, 50, 0.6);
  border-radius: 20rpx;
  padding: 32rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.panel-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #c9a227;
}
.panel-desc {
  font-size: 24rpx;
  color: #b8a888;
}
.name-input {
  background: rgba(0, 0, 0, 0.25);
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  color: #f5f0e1;
  font-size: 28rpx;
}
.btn-primary, .btn-secondary {
  border: none;
  margin: 0;
  border-radius: 14rpx;
  font-size: 28rpx;
  padding: 16rpx 0;
}
.btn-primary {
  background: linear-gradient(180deg, #c9a227, #a5821a);
  color: #fff;
  font-weight: bold;
}
.btn-secondary {
  background: #5a4a32;
  color: #f5f0e1;
}
.btn-primary[disabled], .btn-secondary[disabled] { opacity: 0.4; }

/* 房间 */
.room {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.room-head {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 32rpx;
}
.room-id {
  color: #c9a227;
  font-size: 30rpx;
  font-weight: bold;
  letter-spacing: 2rpx;
}
.room-phase {
  color: #b8a888;
  font-size: 26rpx;
}
.members {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 8rpx 32rpx;
}
.member-card {
  flex: 1;
  background: rgba(90, 74, 50, 0.6);
  border-radius: 14rpx;
  padding: 14rpx 18rpx;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.member-card.me {
  border: 2rpx solid #c9a227;
}
.m-role { font-size: 20rpx; color: #b8a888; }
.m-name { font-size: 30rpx; color: #f5f0e1; font-weight: bold; }
.m-gone { font-size: 20rpx; color: #d08060; }
.vs { color: #c9a227; font-weight: bold; }
.tries-line {
  text-align: center;
  color: #b8a888;
  font-size: 24rpx;
  padding: 4rpx 0;
}

/* 槽位/提示/历史/键盘样式与单人 game.vue 一致 */
.slots-row {
  display: flex;
  justify-content: center;
  gap: 18rpx;
  padding: 16rpx 0 8rpx;
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
}
.slot.selected {
  border-color: #c9a227;
  box-shadow: 0 0 12rpx rgba(201, 162, 39, 0.5);
}
.slot.filled { background: linear-gradient(180deg, #f5f0e1, #d8cfb8); }
.slot-digit { font-size: 52rpx; font-weight: bold; color: #3a2410; }
.hint-card {
  margin: 0 32rpx 8rpx;
  background: rgba(90, 160, 90, 0.25);
  border-radius: 12rpx;
  padding: 12rpx 20rpx;
}
.hint-text { font-size: 26rpx; color: #a8d8a0; }
.history {
  /* 只占剩余空间，记录再多也不外扩 */
  flex: 1 1 0;
  min-height: 0;
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
.history-row.top { background: rgba(201, 162, 39, 0.12); border-radius: 8rpx; }
.h-seq {
  font-size: 30rpx;
  letter-spacing: 6rpx;
  color: #f5f0e1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.h-fb { font-size: 24rpx; color: #b8a888; flex-shrink: 0; white-space: nowrap; }
.h-flag.win { color: #c9a227; font-weight: bold; flex-shrink: 0; }
.history-empty { text-align: center; color: #8a7a60; font-size: 24rpx; padding: 24rpx 0; }
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
.btn-ghost[disabled] { opacity: 0.4; }
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
.btn-submit[disabled] { opacity: 0.4; }
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
.key.disabled { opacity: 0.25; }
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
.result-title { font-size: 52rpx; font-weight: bold; }
.result-title.win { color: #c9a227; }
.result-title.lose { color: #b8a888; }
.result-sub { font-size: 26rpx; color: #b8a888; }
</style>
