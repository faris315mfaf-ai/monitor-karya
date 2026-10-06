import type * as React from 'react';

/** Status kerja. on = Sesuai jadwal, risk = Perlu perhatian, late = Terlambat, done = Selesai. */
export type Status = 'on' | 'risk' | 'late' | 'done' | 'info' | 'neutral';
/** Warna seri/identitas: accent mengikuti aksen aktif; data-1…6 = divisi. */
export type Tone = 'accent' | 'data-1' | 'data-2' | 'data-3' | 'data-4' | 'data-5' | 'data-6';
/** Nada grafik: aksen, status, hue, seri data, atau putih (di atas gradien). */
export type ChartTone = Tone | 'on' | 'risk' | 'late' | 'done' | 'info' | 'neutral' | 'merah' | 'biru' | 'hijau' | 'ungu' | 'oranye' | 'grafit' | 'putih';
export type Accent = 'merah' | 'biru' | 'hijau' | 'ungu' | 'oranye' | 'grafit';
export type IconName = 'ringkasan' | 'proyek' | 'tim' | 'persetujuan' | 'aktivitas' | 'kehadiran' | 'waktu' | 'kalender' | 'laporan' | 'cari' | 'notifikasi' | 'gelap' | 'terang' | 'kanan' | 'kiri' | 'bawah' | 'tutup' | 'peringatan' | 'selesai' | 'info' | 'titik' | 'tambah' | 'naik' | 'turun' | 'unduh' | 'catatan' | 'pengaturan' | 'lainnya' | 'unggah' | 'dokumen' | 'target' | 'pengguna' | 'kunci' | 'gedung' | 'kirim' | 'alur';

export interface IconProps { name: IconName; size?: number; strokeWidth?: number; label?: string; className?: string; style?: React.CSSProperties }
export declare function Icon(props: IconProps): React.ReactElement;

export interface LogoMarkProps { size?: number; label?: string; className?: string }
export declare function LogoMark(props: LogoMarkProps): React.ReactElement;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'plain' | 'destructive'; size?: 'sm' | 'md' | 'lg'; icon?: IconName; iconAfter?: IconName; full?: boolean }
export declare function Button(props: ButtonProps): React.ReactElement;

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { icon: IconName; label: string; variant?: 'plain' | 'filled'; badge?: boolean | number | string }
export declare function IconButton(props: IconButtonProps): React.ReactElement;

export interface SegmentedControlProps { options: { value: string; label: string }[]; value?: string; defaultValue?: string; onChange?: (value: string) => void; label?: string; size?: 'sm' | 'md'; full?: boolean; className?: string }
export declare function SegmentedControl(props: SegmentedControlProps): React.ReactElement;

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { selected?: boolean; count?: number | string; status?: Status }
export declare function Chip(props: ChipProps): React.ReactElement;

export interface SearchFieldProps { id?: string; label?: string; placeholder?: string; value?: string; defaultValue?: string; onChange?: (value: string) => void; shortcut?: string; className?: string }
export declare function SearchField(props: SearchFieldProps): React.ReactElement;

export interface AccentPickerProps { value?: Accent; defaultValue?: Accent; onChange?: (accent: Accent) => void; label?: string; className?: string }
export declare function AccentPicker(props: AccentPickerProps): React.ReactElement;

export interface StatusBadgeProps { status: Status; size?: 'sm' | 'md'; children?: React.ReactNode; className?: string }
export declare function StatusBadge(props: StatusBadgeProps): React.ReactElement;

export interface AvatarProps { initials: string; name?: string; tone?: Tone; size?: number; className?: string }
export declare function Avatar(props: AvatarProps): React.ReactElement;

export interface ProgressBarProps { value: number; status?: Status | 'accent'; size?: 'md' | 'lg'; showValue?: boolean; label?: string; className?: string }
export declare function ProgressBar(props: ProgressBarProps): React.ReactElement;

export interface ProgressRingProps { value: number; size?: number; stroke?: number; label?: React.ReactNode; sublabel?: string; status?: Status | 'accent'; ariaLabel?: string; className?: string }
export declare function ProgressRing(props: ProgressRingProps): React.ReactElement;

export interface StatTileProps { label: string; value: number | string; delta?: string; trend?: 'up' | 'down' | 'flat'; tone?: Status; variant?: 'default' | 'surface' | 'gradient'; spark?: number[]; sparkTone?: ChartTone; className?: string }
export declare function StatTile(props: StatTileProps): React.ReactElement;

export interface BarChartProps { data: { label: string; value: number }[]; selectedIndex?: number; defaultSelectedIndex?: number; onSelect?: (index: number) => void; height?: number; unit?: string; formatValue?: (v: number) => string; className?: string }
export declare function BarChart(props: BarChartProps): React.ReactElement;

export interface ActivityRingsProps { rings: { label: string; value: number; tone?: ChartTone; display?: string; sub?: string }[]; size?: number; thickness?: number; gap?: number; center?: React.ReactNode; showLegend?: boolean; layout?: 'row' | 'stack'; className?: string }
export declare function ActivityRings(props: ActivityRingsProps): React.ReactElement;

export interface SparklineProps { data: number[]; height?: number; tone?: ChartTone; area?: boolean; label?: string; className?: string }
export declare function Sparkline(props: SparklineProps): React.ReactElement;

export interface AreaChartProps { data: { label: string; value: number }[]; compare?: number[]; compareLabel?: string; seriesLabel?: string; height?: number; tone?: ChartTone; unit?: string; zero?: boolean; selectedIndex?: number; defaultSelectedIndex?: number; onSelect?: (index: number) => void; formatValue?: (v: number) => string; className?: string }
export declare function AreaChart(props: AreaChartProps): React.ReactElement;

export interface DonutChartProps { data: { label: string; value: number; tone?: ChartTone }[]; size?: number; thickness?: number; gap?: number; centerLabel?: React.ReactNode; centerSub?: string; label?: string; showLegend?: boolean; layout?: 'row' | 'stack'; selectedIndex?: number | null; onSelect?: (index: number | null) => void; formatValue?: (v: number) => string; className?: string }
export declare function DonutChart(props: DonutChartProps): React.ReactElement;

export interface HeatmapProps { data: (number | null)[][]; rowLabels?: string[]; colLabels?: string[]; max?: number; cell?: number; tone?: ChartTone; label?: string; lowLabel?: string; highLabel?: string; showLegend?: boolean; formatCell?: (v: number) => string; className?: string }
export declare function Heatmap(props: HeatmapProps): React.ReactElement;

export interface TimelineProps { rows: { id: string; label: string; sub?: string; start: number; end: number; progress?: number; status?: Status; milestone?: number; range?: string }[]; span: number; ticks?: { label: string; at: number }[]; today?: number; todayLabel?: string; title?: string; selectedId?: string | null; onSelect?: (id: string | null) => void; className?: string }
export declare function Timeline(props: TimelineProps): React.ReactElement;

export interface FlowDiagramProps { steps: { title: string; sub?: string; status?: 'done' | 'current' | 'todo' | 'blocked'; icon?: IconName; meta?: string }[]; orientation?: 'horizontal' | 'vertical'; label?: string; className?: string }
export declare function FlowDiagram(props: FlowDiagramProps): React.ReactElement;

export interface DivisionBarProps { name: string; value: number; tone?: Tone; target?: number; meta?: string; className?: string }
export declare function DivisionBar(props: DivisionBarProps): React.ReactElement;

export interface AttentionItemProps { title: string; reason?: string; status?: Status; meta?: string; onClick?: () => void; className?: string }
export declare function AttentionItem(props: AttentionItemProps): React.ReactElement;

export interface ProjectRowProps { name: string; division: string; divisionTone?: Tone; pic: string; initials: string; progress: number; due: string; status: Status; selected?: boolean; compact?: boolean; onClick?: () => void; className?: string }
export declare function ProjectRow(props: ProjectRowProps): React.ReactElement;

export interface ApprovalItemProps { title: string; /** Nama pengaju. */ requester: string; initials: string; tone?: Tone; time: string; amount?: string; state?: 'pending' | 'approved' | 'rejected'; onStateChange?: (s: 'approved' | 'rejected') => void; onApprove?: () => void; onReject?: () => void; size?: 'sm' | 'md'; approveLabel?: string; rejectLabel?: string; approvedLabel?: string; rejectedLabel?: string; className?: string }
export declare function ApprovalItem(props: ApprovalItemProps): React.ReactElement;

export interface ActivityItemProps { who: string; initials: string; tone?: Tone; action: string; time: string; last?: boolean; className?: string }
export declare function ActivityItem(props: ActivityItemProps): React.ReactElement;

export interface CardProps { title?: string; subtitle?: string; action?: React.ReactNode; variant?: 'default' | 'hero' | 'inset' | 'aurora' | 'gradient' | 'malam' | 'glass'; id?: string; ariaLabel?: string; children?: React.ReactNode; className?: string }
export declare function Card(props: CardProps): React.ReactElement;

export interface SheetProps { title: string; subtitle?: string; eyebrow?: React.ReactNode; variant?: 'side' | 'form' | 'bottom'; modal?: boolean; onClose?: () => void; footer?: React.ReactNode; children?: React.ReactNode; className?: string }
export declare function Sheet(props: SheetProps): React.ReactElement;

export interface NavItemProps { icon: IconName; label: string; href?: string; active?: boolean; count?: number | string; countTone?: 'muted' | 'accent'; onClick?: (e: React.MouseEvent) => void; className?: string }
export declare function NavItem(props: NavItemProps): React.ReactElement;

export interface TabBarProps { items: { value: string; label: string; icon: IconName; badge?: number | string }[]; value?: string; onChange?: (value: string) => void; floating?: boolean; label?: string; className?: string }
export declare function TabBar(props: TabBarProps): React.ReactElement;

declare global {
  interface Window {
    MonitorKarya: {
      Icon: typeof Icon; LogoMark: typeof LogoMark; Button: typeof Button; IconButton: typeof IconButton; SegmentedControl: typeof SegmentedControl;
      Chip: typeof Chip; SearchField: typeof SearchField; AccentPicker: typeof AccentPicker; StatusBadge: typeof StatusBadge;
      Avatar: typeof Avatar; ProgressBar: typeof ProgressBar; ProgressRing: typeof ProgressRing; StatTile: typeof StatTile;
      BarChart: typeof BarChart; AreaChart: typeof AreaChart; Sparkline: typeof Sparkline; DonutChart: typeof DonutChart; ActivityRings: typeof ActivityRings; Heatmap: typeof Heatmap; Timeline: typeof Timeline; FlowDiagram: typeof FlowDiagram; DivisionBar: typeof DivisionBar; AttentionItem: typeof AttentionItem; ProjectRow: typeof ProjectRow;
      ApprovalItem: typeof ApprovalItem; ActivityItem: typeof ActivityItem; Card: typeof Card; Sheet: typeof Sheet;
      NavItem: typeof NavItem; TabBar: typeof TabBar;
    };
  }
}
