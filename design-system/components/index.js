// Pintu masuk ESM untuk implementasi acuan Monitor Karya.
// Urutan impor penting: react-global harus dievaluasi sebelum bundle.
// Hanya untuk sisi klien (bundle membaca window saat dimuat). Di Next.js, impor dari komponen 'use client'.
import './react-global.js';
import './bundle.js';

const MK = window.MonitorKarya;
export const {
  Icon, LogoMark, Button, IconButton, SegmentedControl, Chip, SearchField, AccentPicker,
  StatusBadge, Avatar, ProgressBar, ProgressRing, ActivityRings, StatTile, Sparkline,
  BarChart, AreaChart, DonutChart, Heatmap, Timeline, FlowDiagram, DivisionBar,
  AttentionItem, ProjectRow, ApprovalItem, ActivityItem, Card, Sheet, NavItem, TabBar,
} = MK;
export default MK;
