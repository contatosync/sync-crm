'use client'
import { createContext, useContext } from 'react'

export interface UnreadContextType {
  unreadCount: number
  markAsRead: (telefone: string) => void
}

export const UnreadContext = createContext<UnreadContextType>({
  unreadCount: 0,
  markAsRead: () => {},
})

export const useUnread = () => useContext(UnreadContext)
