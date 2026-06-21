import type { Metadata } from 'next'
import { LoginTerminal } from '@/components/auth/login-terminal'

export const metadata: Metadata = {
  title: '身份核验 · 川 CHUANSCAN',
  description: '雷达身份核验终端 — 验证操作员身份后进入异动雷达系统。',
}

export default function LoginPage() {
  return <LoginTerminal />
}
