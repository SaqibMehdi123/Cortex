// One-shot codemod: lucide-react → Font Awesome 6 (react-icons/fa6)
// Swaps imports + identifiers only — classNames/props untouched.
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = '/home/z/my-project'
const DTS = fs.readFileSync(path.join(ROOT, 'node_modules/react-icons/fa6/index.d.ts'), 'utf8')
const fa6Names = new Set([...DTS.matchAll(/export declare const (\w+):/g)].map((m) => m[1]))

// lucide name → FA6 name
const MAP = {
  AlertTriangle: 'FaTriangleExclamation',
  ArrowLeft: 'FaArrowLeft',
  ArrowRight: 'FaArrowRight',
  ArrowUpRight: 'FaUpRightFromSquare',
  AtSign: 'FaAt',
  Bell: 'FaBell',
  BookOpen: 'FaBookOpen',
  Bookmark: 'FaRegBookmark', // unsaved → outline
  BookmarkCheck: 'FaBookmark', // saved → solid
  BookmarkPlus: 'FaRegBookmark', // save action → outline
  BrainCircuit: 'FaBrain',
  Briefcase: 'FaBriefcase',
  CalendarCheck2: 'FaCalendarCheck',
  CalendarClock: 'FaCalendarDay',
  CalendarDays: 'FaCalendarDays',
  CalendarPlus: 'FaCalendarPlus',
  CalendarRange: 'FaCalendarWeek',
  ChartLine: 'FaChartLine',
  Check: 'FaCheck',
  CheckCircle2: 'FaCircleCheck',
  ChevronDown: 'FaChevronDown',
  ChevronLeft: 'FaChevronLeft',
  ChevronRight: 'FaChevronRight',
  ChevronUp: 'FaChevronUp',
  Chrome: 'FaChrome',
  CircleCheck: 'FaCircleCheck',
  ClipboardPaste: 'FaPaste',
  Clock: 'FaClock',
  Clock3: 'FaClock',
  Command: 'FaTerminal',
  Copy: 'FaCopy',
  CornerDownRight: 'FaTurnDown',
  Crosshair: 'FaCrosshairs',
  Download: 'FaDownload',
  ExternalLink: 'FaUpRightFromSquare',
  FileCode: 'FaFileCode',
  FileJson: 'FaFileCode',
  FileText: 'FaFileLines',
  FileUp: 'FaFileArrowUp',
  FileWarning: 'FaFileCircleExclamation',
  Flame: 'FaFire',
  FlaskConical: 'FaFlask',
  GraduationCap: 'FaGraduationCap',
  GripVertical: 'FaGripVertical',
  Highlighter: 'FaHighlighter',
  Inbox: 'FaInbox',
  Info: 'FaInfo',
  KanbanSquare: 'FaTableColumns',
  KeyRound: 'FaKey',
  Landmark: 'FaLandmark',
  Layers: 'FaLayerGroup',
  LayoutDashboard: 'FaGaugeHigh',
  LayoutGrid: 'FaBorderAll',
  LayoutList: 'FaList',
  Library: 'FaBook',
  LibraryBig: 'FaBook',
  Lightbulb: 'FaLightbulb',
  Link2: 'FaLink',
  List: 'FaList',
  ListTodo: 'FaListCheck',
  Loader2: 'FaSpinner',
  Lock: 'FaLock',
  LogOut: 'FaRightFromBracket',
  Mail: 'FaEnvelope',
  MailCheck: 'FaEnvelopeCircleCheck',
  MailWarning: 'FaTriangleExclamation',
  MapPin: 'FaLocationDot',
  Maximize: 'FaExpand',
  Menu: 'FaBars',
  Mic: 'FaMicrophone',
  Monitor: 'FaDesktop',
  Moon: 'FaMoon',
  MoreHorizontal: 'FaEllipsis',
  Newspaper: 'FaNewspaper',
  Palette: 'FaPalette',
  PanelLeftClose: 'FaOutdent',
  PanelLeftOpen: 'FaIndent',
  PanelRightOpen: 'FaTableColumns',
  Pause: 'FaPause',
  Pencil: 'FaPencil',
  Play: 'FaPlay',
  Plus: 'FaPlus',
  Quote: 'FaQuoteLeft',
  Radar: 'FaTowerBroadcast',
  RefreshCw: 'FaRotate',
  RotateCcw: 'FaRotateLeft',
  ScanSearch: 'FaMagnifyingGlass',
  Search: 'FaMagnifyingGlass',
  Send: 'FaPaperPlane',
  Settings: 'FaGear',
  Settings2: 'FaSliders',
  Share2: 'FaShareNodes',
  ShieldCheck: 'FaShieldHalved',
  Sparkles: 'FaWandMagicSparkles',
  Square: 'FaSquare',
  StickyNote: 'FaNoteSticky',
  Sun: 'FaSun',
  Sunset: 'FaCloudSun',
  Target: 'FaBullseye',
  Timer: 'FaStopwatch',
  Trash2: 'FaTrashCan',
  TrendingUp: 'FaArrowTrendUp',
  User: 'FaUser',
  Wand2: 'FaWandMagicSparkles',
  WifiOff: 'FaTriangleExclamation',
  Wrench: 'FaWrench',
  X: 'FaXmark',
  XIcon: 'FaXmark',
  CheckIcon: 'FaCheck',
  ChevronDownIcon: 'FaChevronDown',
  ChevronUpIcon: 'FaChevronUp',
  ChevronLeftIcon: 'FaChevronLeft',
  ChevronRightIcon: 'FaChevronRight',
  MinusIcon: 'FaMinus',
  SearchIcon: 'FaMagnifyingGlass',
  PanelLeftIcon: 'FaIndent',
  CircleIcon: 'FaCircle',
  GripVerticalIcon: 'FaGripVertical',
  MoreHorizontalIcon: 'FaEllipsis',
  Zap: 'FaBolt',
  ZoomIn: 'FaMagnifyingGlassPlus',
  ZoomOut: 'FaMagnifyingGlassMinus',
}

// 1) validate every FA name exists
const missing = [...new Set(Object.values(MAP))].filter((n) => !fa6Names.has(n))
if (missing.length) {
  console.error('MISSING IN fa6:', missing.join(', '))
  process.exit(1)
}

// 2) files that import lucide-react
const files = execSync(`rg -l "lucide-react" ${ROOT}/src`, { encoding: 'utf8' })
  .trim()
  .split('\n')

let totalSwaps = 0
const problems = []

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8')
  const importRe = /import\s*\{([\s\S]*?)\}\s*from\s*['"]lucide-react['"]\n?/g
  const stmts = [...src.matchAll(importRe)]
  if (!stmts.length) continue

  // parse names + aliases across all import statements
  const entries = [] // { srcName, alias, fa }
  for (const m of stmts) {
    for (const raw of m[1].split(',')) {
      const t = raw.trim()
      if (!t) continue
      const am = t.match(/^(\w+)(?:\s+as\s+(\w+))?$/)
      if (!am) problems.push(`${file}: unparseable import "${t}"`)
      else entries.push({ srcName: am[1], alias: am[2] || am[1], fa: MAP[am[1]] })
    }
  }
  const unknown = entries.filter((e) => !e.fa)
  if (unknown.length) {
    problems.push(`${file}: unmapped icons ${unknown.map((e) => e.srcName).join(', ')}`)
    continue
  }

  // remove all lucide import statements
  src = src.replace(importRe, '')

  // replace identifiers (alias is what the file body uses)
  const usedFa = new Set()
  for (const e of entries) {
    const re = new RegExp(`\\b${e.alias}\\b`, 'g')
    let n = 0
    src = src.replace(re, () => {
      n++
      return e.fa
    })
    if (n === 0) problems.push(`${file}: ${e.alias} imported but never used`)
    usedFa.add(e.fa)
    totalSwaps += n
  }

  // insert the single new FA import after the last existing top-of-file import
  const faImport = `import { ${[...usedFa].sort().join(', ')} } from 'react-icons/fa6'\n`
  const lastStd = src.search(/^(import|'use client'|"use client")/m)
  const firstImport = src.match(/^import .*$/m)
  if (firstImport) {
    const idx = src.indexOf(firstImport[0])
    src = src.slice(0, idx) + faImport + src.slice(idx)
  } else {
    src = faImport + src
  }

  fs.writeFileSync(file, src)
  console.log(`${path.relative(ROOT, file)}: ${entries.length} icons`)
}

console.log(`\nDONE — ${files.length} files, ${totalSwaps} identifier swaps`)
if (problems.length) {
  console.log('\nPROBLEMS:')
  for (const p of problems) console.log('  ' + p)
}
