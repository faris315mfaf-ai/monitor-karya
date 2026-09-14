'use client'

import { AppProvider, useApp, type Branding, type SessionUser } from '@/components/app-provider'
import { Navbar } from '@/components/navbar'
import { SplashScreen } from '@/components/splash-screen'
import { TabNav } from '@/components/tab-nav'
import { Footer } from '@/components/footer'
import { DashboardView } from '@/components/views/dashboard-view'
import { WorkDeskView } from '@/components/views/work-desk-view'
import { ProjectsView } from '@/components/views/projects-view'
import { DivisionsView } from '@/components/views/divisions-view'
import { EscalationsView } from '@/components/views/escalations-view'
import { EntitiesView } from '@/components/views/entities-view'
import { AuditView } from '@/components/views/audit-view'
import { DailyInputView } from '@/components/views/daily-input-view'
import { WeeklyInputView } from '@/components/views/weekly-input-view'
import { InboxView } from '@/components/views/inbox-view'
import { SystemView } from '@/components/views/system-view'
import { CompaniesView } from '@/components/views/companies-view'
import { canSeeTab } from '@/lib/rbac'

function MainContent() {
  const { activeTab, user } = useApp()

  // The nav already hides what a role cannot open; this is the backstop for a
  // stale stored tab. The API enforces the same rules independently.
  if (!canSeeTab(user.role, activeTab)) {
    return (
      <main className="flex-1 px-3 sm:px-4 lg:px-6 py-10 max-w-[1600px] mx-auto w-full">
        <p className="text-base text-slate-500 dark:text-slate-400 text-center">
          Modul ini tidak tersedia untuk peran Anda.
        </p>
      </main>
    )
  }

  return (
    <main className="flex-1 px-3 sm:px-4 lg:px-6 py-4 lg:pb-6 max-w-[1600px] mx-auto w-full">
      {activeTab === 'dashboard' && <DashboardView />}
      {activeTab === 'companies' && <CompaniesView />}
      {activeTab === 'work-desk' && <WorkDeskView />}
      {activeTab === 'daily-input' && <DailyInputView />}
      {activeTab === 'weekly-input' && <WeeklyInputView />}
      {activeTab === 'inbox' && <InboxView />}
      {activeTab === 'projects' && <ProjectsView />}
      {activeTab === 'divisions' && <DivisionsView />}
      {activeTab === 'escalations' && <EscalationsView />}
      {activeTab === 'entities' && <EntitiesView />}
      {activeTab === 'audit' && <AuditView />}
      {activeTab === 'system' && <SystemView />}
    </main>
  )
}

export function AppShell({ user, branding }: { user: SessionUser; branding?: Branding }) {
  return (
    <AppProvider user={user} branding={branding}>
      {/* Layar pembuka sekali per masuk: inisiator (holding) & perusahaan si pengguna. */}
      <SplashScreen />
      {/* Below lg the tab bar is fixed to the bottom of the viewport, so the
          page reserves its height — otherwise the footer sits underneath it. */}
      <div className="min-h-screen flex flex-col pb-14 lg:pb-0">
        <Navbar />
        {/* TabNav picks its own layout per breakpoint: an inline bar on lg and
            up, a fixed bottom bar below that. The wrapper only supplies the
            desktop gutter, so it must not hide the subtree on small screens —
            display:none here would take the mobile bottom bar down with it. */}
        <div className="px-3 sm:px-4 lg:px-6 lg:pt-3 max-w-[1600px] mx-auto w-full">
          <TabNav />
        </div>
        <MainContent />
        <Footer />
      </div>
    </AppProvider>
  )
}
