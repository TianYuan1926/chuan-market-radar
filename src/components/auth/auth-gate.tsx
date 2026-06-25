'use client'

import { useEffect, useState } from 'react'
import { LoginTerminal } from '@/components/auth/login-terminal'
import { FrontendLiveEventBridge } from '@/components/frontend-live-event-bridge'

// 与 LoginTerminal 写入的登录态标记保持一致
const AUTH_KEY = 'chuan_operator'

function readAuthed() {
  try {
    return !!(
      window.localStorage.getItem(AUTH_KEY) ||
      window.sessionStorage.getItem(AUTH_KEY)
    )
  } catch {
    return false
  }
}

async function readServerAuth() {
  const response = await fetch('/api/auth/session', {
    cache: 'no-store',
    credentials: 'same-origin',
  })

  if (!response.ok) return null

  const body = await response.json()
  const privateModeEnabled = Boolean(body?.privateMode?.enabled)
  const authenticated = Boolean(body?.authenticated)

  return privateModeEnabled ? authenticated : true
}

/**
 * 全站身份门禁：
 * 1. 未登录只渲染登录终端，无法浏览任何页面内容；
 * 2. 登录成功后放行站点内容与实时事件桥。
 *
 * 注意：后端私有模式关闭时直接放行；开启后以 /api/auth/session 的
 * 服务端会话为准。本地登录态只作为接口不可达时的临时兜底。
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  // null = 尚未在客户端确定登录态（启动动画期间），避免 SSR 闪烁
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    const refresh = () => {
      void readServerAuth()
        .then((serverAuthed) => {
          if (!active) return
          setAuthed(serverAuthed ?? readAuthed())
        })
        .catch(() => {
          if (active) setAuthed(readAuthed())
        })
    }
    refresh()
    window.addEventListener('chuan:auth', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      active = false
      window.removeEventListener('chuan:auth', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return (
    <>
      {authed === null ? null : authed ? (
        <>
          {children}
          <FrontendLiveEventBridge />
        </>
      ) : (
        <LoginTerminal />
      )}
    </>
  )
}
