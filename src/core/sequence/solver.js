/**
 * 求解器（仅开发/CI 用，验证关卡可解性；不进客户端/服务端产物）。
 *
 * 候选集 = P(9, L) 全排列（L=4: 3024；L=5: 15120；L=6: 60480）。
 * 策略：贪心最大信息增益——每轮选使反馈分区熵最大的猜想；首猜固定 (1,2,…,L)。
 *
 * 反馈与玩家同口径（feedback.js skip 语义）：猜错数字不参与排名序列 R 统计，
 * 分区键必须含命中位数（不同 R 长度的同 (asc,desc) 是不同反馈）。
 *
 * solveAll(L, maxTries)：一次构建整棵反馈决策树，同时得到全部 P(9,L) 个密码
 * 的所需轮数——避免逐密码求解的重复计算（成本 = Σ每层节点候选数 ≈ n × 深度）。
 * 猜想池 > 200 时等距抽样，控制每层熵计算成本 ≤ 200 × n。
 */

const permCache = new Map() // L -> 全排列数组（进程内缓存，多次 solveAll 共享）

/** 枚举 1..9 中取 L 个的全部排列（字典序） */
export function allPermutations(L) {
  if (permCache.has(L)) return permCache.get(L)
  const result = []
  const used = new Array(10).fill(false)
  const cur = new Array(L)
  function backtrack(d) {
    if (d === L) {
      result.push([...cur])
      return
    }
    for (let v = 1; v <= 9; v++) {
      if (used[v]) continue
      used[v] = true
      cur[d] = v
      backtrack(d + 1)
      used[v] = false
    }
  }
  backtrack(0)
  permCache.set(L, result)
  return result
}

// 复用缓冲区避免每次 fkey 分配（单线程，重入安全：函数内一次性使用）
const posBuf = new Int16Array(10)
const rankBuf = new Int16Array(9)

/**
 * 反馈数值键：hits*10000 + asc*100 + desc（hits ≤ 6, asc ≤ 5, desc ≤ C(6,2)=15，
 * 编码无碰撞）。口径与 feedback.js v2 一致：asc = 相邻升序对数，desc = 逆序对数。
 * secret/guess 均为长度 L 的互不重复数字数组（本模块输入自 allPermutations，免校验）。
 */
function fkeyNum(secret, guess) {
  const L = secret.length
  for (let v = 1; v <= 9; v++) posBuf[v] = -1
  for (let i = 0; i < L; i++) posBuf[secret[i]] = i
  let m = 0
  for (let i = 0; i < L; i++) {
    const pos = posBuf[guess[i]]
    if (pos !== -1) rankBuf[m++] = pos // skip 语义：猜错数字不进 R
  }
  let asc = 0
  let desc = 0
  for (let i = 0; i < m; i++) {
    if (i < m - 1 && rankBuf[i + 1] > rankBuf[i]) asc += 1 // 相邻升序对
    for (let j = i + 1; j < m; j++) {
      if (rankBuf[j] < rankBuf[i]) desc += 1 // 逆序对
    }
  }
  return m * 10000 + asc * 100 + desc
}

const seqKey = (seq) => seq.join(',')

/** 等距抽样 n 个（确定性） */
function strideSample(arr, n) {
  const out = []
  const step = arr.length / n
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)])
  return out
}

const GUESS_POOL_MAX = 200

/** 在候选集中选分区熵最大的猜想（候选本身即合法猜想） */
function chooseGuess(cands) {
  if (cands.length === 1) return cands[0]
  const pool = cands.length > GUESS_POOL_MAX ? strideSample(cands, GUESS_POOL_MAX) : cands
  let best = null
  let bestH = -1
  for (const g of pool) {
    const counts = new Map()
    for (const c of cands) {
      const k = fkeyNum(c, g)
      counts.set(k, (counts.get(k) || 0) + 1)
    }
    let h = 0
    for (const v of counts.values()) {
      const p = v / cands.length
      h -= p * Math.log2(p)
    }
    if (h > bestH + 1e-12) {
      bestH = h
      best = g
    }
  }
  return best
}

/**
 * 全量求解：返回 { rounds, unsolvable, avgRounds, maxRounds }。
 *  - rounds: Map<seqKey, 所需轮数>（覆盖全部 P(9,L) 密码；超出 maxTries 的进 unsolvable）；
 *  - 决策树按分区递归：同分区的密码共享后续路径，天然去重。
 */
export function solveAll(L, maxTries) {
  const all = allPermutations(L)
  const firstGuess = Array.from({ length: L }, (_, i) => i + 1)
  const solvedKey = L * 10000 + (L - 1) * 100 // hits=L, asc=L-1, desc=0 ⟺ 猜中（该分区仅含猜想自身）
  const rounds = new Map()
  const unsolvable = []

  function process(cands, depth) {
    if (depth > maxTries) {
      for (const c of cands) unsolvable.push(c)
      return
    }
    const guess = depth === 1 ? firstGuess : chooseGuess(cands)
    const groups = new Map()
    for (const c of cands) {
      const k = fkeyNum(c, guess)
      const arr = groups.get(k)
      if (arr) arr.push(c)
      else groups.set(k, [c])
    }
    for (const [k, group] of groups) {
      if (k === solvedKey) {
        for (const s of group) rounds.set(seqKey(s), depth)
      } else {
        process(group, depth + 1)
      }
    }
  }

  process(all, 1)
  let sum = 0
  let maxR = 0
  for (const r of rounds.values()) {
    sum += r
    if (r > maxR) maxR = r
  }
  return {
    rounds,
    unsolvable,
    avgRounds: rounds.size ? sum / rounds.size : Infinity,
    maxRounds: maxR,
  }
}
