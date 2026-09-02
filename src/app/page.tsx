'use client'

import { AppProvider, useApp } from '@/components/app-provider'
import { Navbar } from '@/components/navbar'
import { TabNav } from '@/components/tab-nav'
import { Footer } from '@/components/footer'
import { DashboardView } from '@/components/views/dashboard-view'
import { WorkDeskView } from '@/components/views/work-desk-view'
import { ProjectsView } from '@/components/views/projects-view'
import { DivisionsView } from '@/components/views/divisions-view'
import { EscalationsView } from '@/components/views/escalations-view'
import { EntitiesView } from '@/components/views/entities-view'
import { AuditView } from '@/components/views/audit-view'

function MainContent() {
  const { activeTab } = useApp()
  return (
    <main className="flex-1 px-3 sm:px-4 lg:px-6 py-4 pb-24 lg:pb-6 max-w-[1600px] mx-auto w-full">
      {activeTab === 'dashboard' && <DashboardView />}
      {activeTab === 'work-desk' && <WorkDeskView />}
      {activeTab === 'projects' && <ProjectsView />}
      {activeTab === 'divisions' && <DivisionsView />}
      {activeTab === 'escalations' && <EscalationsView />}
      {activeTab === 'entities' && <EntitiesView />}
      {activeTab === 'audit' && <AuditView />}
    </main>
  )
}

export default function Home() {
  return (
    <AppProvider>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="hidden lg:block px-3 sm:px-4 lg:px-6 pt-3 max-w-[1600px] mx-auto w-full">
          <TabNav />
        </div>
        <MainContent />
        <Footer />
      </div>
    </AppProvider>
  )
}
