'use client'

import { useEffect, useState } from 'react'
import { SiteLoader } from '@/components/site-loader'
import { PetRobot } from '@/components/pet-robot'
import { GlobalSignalFeed } from '@/components/global-signal-feed'
import { EasterEggSystem } from '@/components/easter-egg-system'
import { LoginTerminal } from '@/components/auth/login-terminal'

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

/**
 * 全站身份门禁：
 * 1. 启动动画（SiteLoader）始终最先播放，盖在最上层；
 * 2. 动画消失后，未登录则只渲染登录终端，无法浏览任何页面内容；
 * 3. 登录成功后才放行站点内容与川宝 / 信号流 / 彩蛋等全局装饰。
 *
 * 注意：当前为前端占位门禁，真实校验由后端会话接入后替代
 * （监听 window 上的 'chuan:auth' 事件刷新登录态）。
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  // null = 尚未在客户端确定登录态（启动动画期间），避免 SSR 闪烁
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    setAuthed(readAuthed())
    const refresh = () => setAuthed(readAuthed())
    window.addEventListener('chuan:auth', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('chuan:auth', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return (
    <>
      {/* 启动动画始终最先播放，z-index 最高，盖住下方的登录/内容 */}
      <SiteLoader />

      {authed === null ? null : authed ? (
        <>
          {children}
          <GlobalSignalFeed />
          <PetRobot />
          <EasterEggSystem />
        </>
      ) : (
        // 未登录：启动动画结束后只显示登录终端，强制登录
        <LoginTerminal />
      )}
    </>
  )
}
