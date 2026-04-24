'use client'
import { createContext, useContext } from 'react'
interface UnreadCtx { unreadCount: number; markAsRead: (tel: string) => void }
export const UnreadContext = createContext<UnreadCtx>({ unreadCount: 0, markAsRead: () => {} })
export const useUnread = () => useContext(UnreadContext)
