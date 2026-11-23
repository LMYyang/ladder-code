# Ladder Code（阶梯密码）

序列推理益智游戏。系统生成一个数字互不重复的秘密序列，玩家每轮提交猜想，服务端只返回两个统计量——定序数（asc）与逆序数（desc）——玩家在限定次数内推出完整序列。

文档与完整方案见 `top-cow-card-game/docs/阶梯密码/`。

## 开发

```bash
npm install
npm run test        # Vitest 单元测试（core 纯逻辑）
```

## 结构

```
src/core/sequence/   纯逻辑：反馈统计 / 生成器 / 求解器 / 关卡 / 持久化
tests/               Vitest 测试
```
