import { defineConfig } from 'vite'
import uniPkg from '@dcloudio/vite-plugin-uni'
// CJS/ESM 互操作：default 可能是 { default: fn }（嵌套），统一解出函数
const uni = typeof uniPkg === 'function' ? uniPkg : uniPkg.default
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    uni(),
  ],
})
