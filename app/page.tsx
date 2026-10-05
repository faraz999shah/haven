'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ActivityPage } from '@/components/haven/activity-page'
import { CaregiverDashboard } from '@/components/haven/caregiver-dashboard'
import { RulesPage } from '@/components/haven/rules-page'
import { SeniorHome } from '@/components/haven/senior-home'
import { SeniorList } from '@/components/haven/senior-list'
import { Sidebar } from '@/components/haven/sidebar'
import { Topbar } from '@/components/haven/topbar'
import type { Role } from '@/components/haven/types'

export default function Haven() {
  const [role, setRole] = useState<Role>('caregiver')
  const [page, setPage] = useState('dashboard')
  const content =
    role === 'senior' ? (
      page === 'history' ? (
        <SeniorList onBack={() => setPage('home')} />
      ) : page === 'contacts' ? (
        <SeniorList contactsView onBack={() => setPage('home')} />
      ) : (
        <SeniorHome setRole={setRole} setPage={setPage} />
      )
    ) : page === 'rules' ? (
      <RulesPage />
    ) : page === 'activity' ? (
      <ActivityPage />
    ) : (
      <CaregiverDashboard setPage={setPage} />
    )
  return (
    <div className="flex min-h-screen bg-[#f4f7f2] text-[#26352c]">
      <Sidebar page={page} setPage={setPage} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          role={role}
          setRole={(r) => {
            setRole(r)
            setPage(r === 'senior' ? 'home' : 'dashboard')
          }}
        />
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-5 sm:p-8">
          {role === 'senior' ? (
            <div className="mb-6">
              <h2 className="text-3xl font-semibold text-[#1f3026]">Good morning, Margaret</h2>
            </div>
          ) : (
            <div className="mb-7">
              <p className="text-sm font-medium text-[#6c7d72]">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f3026]">Good morning, Sarah</h2>
            </div>
          )}
          {content}
        </main>
      </div>
    </div>
  )
}
