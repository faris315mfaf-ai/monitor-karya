'use client'

import { AppProvider, useApp, type Branding, type SessionUser } from '@/components/app-provider'
import { AppFrame } from '@/components/shell'
import { SplashScreen } from '@/components/splash-screen'
import { EmptyNote } from '@/components/mk'
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
import { ApprovalsView } from '@/components/oversight/approvals-view' // [F2-DIREKTUR]
import { canSeeTab } from '@/lib/rbac'

function MainContent() {
  const { activeTab, user } = useApp()

  // Nav sudah menyembunyikan modul yang tidak boleh dibuka; ini penahan untuk
  // tab tersimpan yang kedaluwarsa. API menegakkan aturan yang sama.
  if (!canSeeTab(user.role, activeTab)) {
    return <EmptyNote icon="kunci">Modul ini tidak tersedia untuk peran Anda.</EmptyNote>
  }

  return (
    <div className="mk-app__inner" key={activeTab}>
      {activeTab === 'dashboard' && <DashboardView />}
      {activeTab === 'companies' && <CompaniesView />}
      {activeTab === 'work-desk' && <WorkDeskView />}
      {activeTab === 'daily-input' && <DailyInputView />}
      {activeTab === 'weekly-input' && <WeeklyInputView />}
      {activeTab === 'inbox' && <InboxView />}
      {activeTab === 'projects' && <ProjectsView />}
      {activeTab === 'divisions' && <DivisionsView />}
      {activeTab === 'escalations' && <EscalationsView />}
      {activeTab === 'approvals' && <ApprovalsView />}
      {activeTab === 'entities' && <EntitiesView />}
      {activeTab === 'audit' && <AuditView />}
      {activeTab === 'system' && <SystemView />}
    </div>
  )
}

export function AppShell({ user, branding }: { user: SessionUser; branding?: Branding }) {
  return (
    <AppProvider user={user} branding={branding}>
      {/* Layar pembuka sekali per masuk: inisiator (holding) & perusahaan si pengguna. */}
      <SplashScreen />
      <AppFrame>
        <MainContent />
      </AppFrame>
    </AppProvider>
  )
}
