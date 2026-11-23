// 用 CDP 驱动 Chrome 无头复现：打开 game 页 → 点击数字键 → 抓 console 错误栈
const http = require('http');
const { execFile, spawn } = require('child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA = 'C:\\Users\\Administrator\\AppData\\Local\\Temp\\claude-chrome-debug-profile';
const DEBUG_PORT = 9223;
const PAGE_URL = 'http://127.0.0.1:5180/#/pages/sequence/game?no=1';

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function cdpSend(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e6);
    const handler = (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.id === id) { ws.removeEventListener('message', handler); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result || {}); }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

(async () => {
  // 启动 chrome headless
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${USER_DATA}`, '--no-first-run', '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill(); } catch {} });

  // 等 CDP 就绪
  let targets = null;
  for (let i = 0; i < 30; i++) {
    try { targets = await httpGetJson(`http://127.0.0.1:${DEBUG_PORT}/json`); break; }
    catch { await new Promise((r) => setTimeout(r, 300)); }
  }
  if (!targets) { console.log('CDP-NOT-READY'); process.exit(1); }
  const page = targets.find((t) => t.type === 'page');
  const WebSocket = require('ws');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));

  await cdpSend(ws, 'Runtime.enable');
  await cdpSend(ws, 'Page.enable');
  const logs = [];
  ws.addEventListener('message', (ev) => {
    let m;
    try { m = JSON.parse(ev.data.toString()); } catch { return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      logs.push(`[${m.params.type}] ${text}`);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push(`[EXC] ${d.text} ${d.exception && d.exception.description || ''}`);
    }
  });

  await cdpSend(ws, 'Page.navigate', { url: PAGE_URL });
  await new Promise((r) => setTimeout(r, 4000));

  // 页面里点击一个数字键：找到 .key 元素 dispatch click
  const clickRes = await cdpSend(ws, 'Runtime.evaluate', {
    expression: `(async () => {
      const out = [];
      await new Promise(r => setTimeout(r, 500));
      // uni h5 渲染数字键为 uni-view / div.key
      const keys = [...document.querySelectorAll('.key')];
      out.push('keys=' + keys.length);
      if (!keys.length) return out.join('; ');
      // 取第一个可用的数字
      const target = keys.find(k => !k.className.includes('disabled')) || keys[0];
      out.push('target=' + target.textContent.trim());
      out.push('class=' + target.className);
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 500));
      const slot = document.querySelector('.slot.filled');
      out.push('filledSlot=' + (slot ? slot.textContent.trim() : 'none'));
      return out.join('; ');
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('EVAL:', clickRes.result && clickRes.result.value);
  await new Promise((r) => setTimeout(r, 800));
  console.log('--- console/exceptions ---');
  for (const l of logs) console.log(l);
  ws.close();
  try { chrome.kill(); } catch {}
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
