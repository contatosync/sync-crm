'use client'
import { createContext, useContext } from 'react'
interface Ctx { unreadCount: number; markAsRead: (tel: string) => void }
export const UnreadContext = createContext<Ctx>({ unreadCount: 0, markAsRead: () => {} })
export const useUnread = () => useContext(UnreadContext)
