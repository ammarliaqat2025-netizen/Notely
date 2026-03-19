'use client'
import dynamic from 'next/dynamic'

const NotelyApp = dynamic(() => import('@/components/NotelyApp'), { ssr: false })

export default function Home() {
  return <NotelyApp />
}
