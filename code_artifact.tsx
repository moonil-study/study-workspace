import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Menu,
  X,
  LogOut,
  Eye,
  EyeOff,
  Calendar as CalendarIcon,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Edit3,
  FileText,
  Download,
  Play,
  Layers,
  CheckSquare,
  Square,
  Printer,
  Shield,
  Lock,
  Search,
  KeyRound,
  Bell,
  HelpCircle,
  UserCheck,
  Award,
  SlidersHorizontal,
} from 'lucide-react';

// ============================================================================
// 1. 상수 및 기본 데이터 구조 정의
// ============================================================================
const SUBJECTS = [
  '공통국어2',
  '통합사회2',
  '통합과학2',
  '한국사2',
  '공통수학2',
  '공통영어2',
];

const STORAGE_KEY = 'minimal_study_dashboard_v2';
const SESSION_KEY = 'minimal_study_session_user_v2';
const ADMIN_AUTH_KEY = 'minimal_study_admin_unlocked_v2';

// 날짜 헬퍼 함수 (로컬 YYYY-MM-DD 포맷)
const formatDateLocal = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getRelativeDateStr = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return formatDateLocal(d);
};

// 시험 범위 구간 정리 및 병합 유틸리티 (중간 끊김 구간을 깔끔한 구간 배열로 정렬/병합)
function normalizeRanges(ranges) {
  if (!Array.isArray(ranges) || ranges.length === 0) return [];
  const valid = ranges
    .map((r) => ({
      start: Math.min(Number(r.start), Number(r.end)),
      end: Math.max(Number(r.start), Number(r.end)),
    }))
    .filter((r) => !Number.isNaN(r.start) && !Number.isNaN(r.end) && r.start > 0 && r.end >= r.start)
    .sort((a, b) => a.start - b.start);

  if (valid.length === 0) return [];
  const merged = [{ ...valid[0] }];
  for (let i = 1; i < valid.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = valid[i];
    // 연속되거나 겹치는 구간만 합치고, 중간에 끊긴 구간은 분리 유지
    if (curr.start <= prev.end + 1) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

// 시험 범위 구간 포맷팅 (예: "12–38p · 54–82p")
function formatExamRangesClean(ranges) {
  const merged = normalizeRanges(ranges);
  if (merged.length === 0) return '등록된 시험 범위 없음';
  return merged.map((r) => (r.start === r.end ? `${r.start}p` : `${r.start}–${r.end}p`)).join(' · ');
}

// 시험 범위 총 페이지 수 계산
function getTotalScopePages(ranges) {
  const merged = normalizeRanges(ranges);
  return merged.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
}

// 입력한 [start, end] 구간이 시험 범위 안에 완전히 포함되는지 검증
function validatePageRangeInScope(start, end, ranges) {
  const merged = normalizeRanges(ranges);
  if (merged.length === 0) {
    return {
      valid: false,
      reason: '해당 과목의 시험 범위가 아직 등록되지 않았습니다.',
    };
  }
  for (let p = start; p <= end; p++) {
    const inside = merged.some((r) => p >= r.start && p <= r.end);
    if (!inside) {
      return {
        valid: false,
        reason: `입력한 ${start}~${end}p 중 ${p}p는 시험 범위(${formatExamRangesClean(merged)})에 포함되지 않습니다.`,
      };
    }
  }
  return { valid: true };
}

// 유효 학습 페이지(중복 제외) 기반 성취도(%) 계산
function calculateSubjectAchievement(logs, ranges) {
  const merged = normalizeRanges(ranges);
  const totalPages = getTotalScopePages(merged);
  if (totalPages === 0) return { percentage: 0, studiedCount: 0, totalPages: 0 };

  const studiedSet = new Set();
  logs.forEach((log) => {
    for (let p = log.startPage; p <= log.endPage; p++) {
      if (merged.some((r) => p >= r.start && p <= r.end)) {
        studiedSet.add(p);
      }
    }
  });

  const studiedCount = studiedSet.size;
  const percentage = Math.min(100, Math.round((studiedCount / totalPages) * 100));
  return { percentage, studiedCount, totalPages };
}

// 단원 자동 정렬 함수 (기준 시작 페이지 우선순위에 따라 대/중/소단원 모두 자동 정렬)
function sortSubjectUnits(subjectUnitTree) {
  const majors = [...(subjectUnitTree || [])]
    .sort((a, b) => (a.startPage ?? 9999) - (b.startPage ?? 9999))
    .map((maj) => ({
      ...maj,
      middles: [...(maj.middles || [])]
        .sort((a, b) => (a.startPage ?? 9999) - (b.startPage ?? 9999))
        .map((mid) => ({
          ...mid,
          minors: [...(mid.minors || [])].sort(
            (a, b) => (a.startPage ?? 9999) - (b.startPage ?? 9999)
          ),
        })),
    }));
  return majors;
}

// ============================================================================
// 2. 초기 시드 데이터 생성 함수
// ============================================================================
function createInitialData() {
  return {
    adminPasscode: '2026', // UI에는 절대 노출하지 않음
    users: [
      {
        id: 'kimdanu',
        password: '1213',
        name: '김단우',
        createdAt: getRelativeDateStr(-10),
      },
    ],
    notices: [
      {
        id: 'notice-1',
        title: '2학기 기말고사 공동 스터디 주간 운영 안내',
        content:
          '매일 자정 전까지 오늘 공부한 교과서 및 부교재 페이지를 기록해주세요. 시험 범위를 벗어난 페이지는 자동 차단됩니다.\n\n주말에는 기출문제 자료실에서 OMR 모의평가를 응시하고 오답 노트를 정리해 봅시다.',
        createdAt: getRelativeDateStr(-2),
        important: true,
      },
      {
        id: 'notice-2',
        title: '과목별 최신 시험 범위 및 중단원 업데이트 완료',
        content:
          '공통국어2, 통합사회2, 통합과학2, 한국사2, 공통수학2, 공통영어2의 시험 범위 구간과 시험 시간표가 최신화되었습니다. 캘린더에서 초록색 시험일을 확인하세요.',
        createdAt: getRelativeDateStr(-1),
        important: false,
      },
    ],
    examConfigs: {
      공통국어2: {
        examDate: getRelativeDateStr(12),
        timetable: '1일차 1교시 (08:40 ~ 09:30)',
        ranges: [
          { start: 12, end: 42 },
          { start: 68, end: 94 },
        ],
      },
      통합사회2: {
        examDate: getRelativeDateStr(12),
        timetable: '1일차 3교시 (11:00 ~ 11:50)',
        ranges: [
          { start: 18, end: 52 },
          { start: 70, end: 88 },
        ],
      },
      통합과학2: {
        examDate: getRelativeDateStr(13),
        timetable: '2일차 1교시 (08:40 ~ 09:30)',
        ranges: [
          { start: 10, end: 46 },
          { start: 60, end: 85 },
        ],
      },
      한국사2: {
        examDate: getRelativeDateStr(13),
        timetable: '2일차 3교시 (11:00 ~ 11:50)',
        ranges: [{ start: 24, end: 76 }],
      },
      공통수학2: {
        examDate: getRelativeDateStr(14),
        timetable: '3일차 1교시 (08:40 ~ 09:30)',
        ranges: [
          { start: 14, end: 58 },
          { start: 80, end: 112 },
        ],
      },
      공통영어2: {
        examDate: getRelativeDateStr(14),
        timetable: '3일차 2교시 (09:50 ~ 10:40)',
        ranges: [{ start: 15, end: 64 }],
      },
    },
    // 단원 구조 (대단원 -> 중단원 -> 소단원[선택적])
    units: {
      공통국어2: [
        {
          id: 'kor-maj-1',
          name: '1. 문학의 갈래와 표현',
          startPage: 12,
          middles: [
            {
              id: 'kor-mid-1',
              name: '01. 현대시의 운율과 심상',
              startPage: 12,
              minors: [
                { id: 'kor-min-1', name: '가. 청산도 (박두진)', startPage: 14 },
                { id: 'kor-min-2', name: '나. 쉽게 씌어진 시 (윤동주)', startPage: 22 },
              ],
            },
            {
              id: 'kor-mid-2',
              name: '02. 고전 산문의 서사 구조',
              startPage: 30,
              minors: [], // 소단원이 없는 중단원 예시
            },
          ],
        },
        {
          id: 'kor-maj-2',
          name: '2. 매체와 국어 생활',
          startPage: 68,
          middles: [
            {
              id: 'kor-mid-3',
              name: '01. 중세 국어의 특징',
              startPage: 68,
              minors: [{ id: 'kor-min-3', name: '가. 훈민정음 언해본 분석', startPage: 70 }],
            },
          ],
        },
      ],
      통합사회2: [
        {
          id: 'soc-maj-1',
          name: '1. 인권 보장과 헌법',
          startPage: 18,
          middles: [
            {
              id: 'soc-mid-1',
              name: '01. 인권의 의미와 변화 양상',
              startPage: 18,
              minors: [],
            },
            {
              id: 'soc-mid-2',
              name: '02. 헌법의 역할과 기본권 구제',
              startPage: 34,
              minors: [{ id: 'soc-min-1', name: '가. 헌법소원 심판 제도', startPage: 40 }],
            },
          ],
        },
      ],
      통합과학2: [
        {
          id: 'sci-maj-1',
          name: '1. 변화와 다양성',
          startPage: 10,
          middles: [
            {
              id: 'sci-mid-1',
              name: '01. 산화 환원 반응과 산 염기',
              startPage: 10,
              minors: [
                { id: 'sci-min-1', name: '가. 전자의 이동과 산화수', startPage: 12 },
                { id: 'sci-min-2', name: '나. 중화 반응의 양적 관계', startPage: 28 },
              ],
            },
          ],
        },
      ],
      한국사2: [
        {
          id: 'his-maj-1',
          name: '1. 일제 식민지 지배와 민족 운동',
          startPage: 24,
          middles: [
            {
              id: 'his-mid-1',
              name: '01. 3·1 운동과 대한민국 임시 정부',
              startPage: 24,
              minors: [],
            },
          ],
        },
      ],
      공통수학2: [
        {
          id: 'math-maj-1',
          name: '1. 도형의 방정식',
          startPage: 14,
          middles: [
            {
              id: 'math-mid-1',
              name: '01. 직선의 방정식과 위치 관계',
              startPage: 14,
              minors: [
                { id: 'math-min-1', name: '가. 점과 직선 사이의 거리', startPage: 22 },
              ],
            },
            {
              id: 'math-mid-2',
              name: '02. 원의 방정식과 접선',
              startPage: 36,
              minors: [],
            },
          ],
        },
        {
          id: 'math-maj-2',
          name: '2. 집합과 명제',
          startPage: 80,
          middles: [
            {
              id: 'math-mid-3',
              name: '01. 집합의 연산 법칙',
              startPage: 80,
              minors: [],
            },
          ],
        },
      ],
      공통영어2: [
        {
          id: 'eng-maj-1',
          name: 'Lesson 3. Technology & Empathy',
          startPage: 15,
          middles: [
            {
              id: 'eng-mid-1',
              name: 'Reading: Designing for Everyone',
              startPage: 18,
              minors: [],
            },
          ],
        },
      ],
    },
    studyLogs: [
      {
        id: 'slog-1',
        userId: 'kimdanu',
        subject: '공통국어2',
        startPage: 12,
        endPage: 26,
        date: getRelativeDateStr(-1),
        memo: '현대시 작품 2편 핵심 표현법 정리 완료',
      },
      {
        id: 'slog-2',
        userId: 'kimdanu',
        subject: '공통수학2',
        startPage: 14,
        endPage: 32,
        date: getRelativeDateStr(0),
        memo: '점과 직선 사이의 거리 공식 증명 및 대표유형',
      },
    ],
    flashcards: [
      {
        id: 'fc-1',
        subject: '공통국어2',
        majorId: 'kor-maj-2',
        middleId: 'kor-mid-3',
        minorId: 'kor-min-3',
        front: '중세 국어에서 체언 뒤에 붙어 주어를 나타내는 주격 조사 3가지 형태는?',
        back: "1) 자음 뒤: '이'\n2) '이' 모음이나 반모음 'ㅣ' 이외의 모음 뒤: 'ㅣ'\n3) '이' 모음이나 반모음 'ㅣ' 뒤: 영형태(Ø)",
      },
      {
        id: 'fc-2',
        subject: '공통수학2',
        majorId: 'math-maj-1',
        middleId: 'math-mid-1',
        minorId: 'math-min-1',
        front: '점 (x₁, y₁)과 직선 ax + by + c = 0 사이의 거리 d 공식은?',
        back: 'd = |ax₁ + by₁ + c| / √(a² + b²)',
      },
      {
        id: 'fc-3',
        subject: '통합과학2',
        majorId: 'sci-maj-1',
        middleId: 'sci-mid-1',
        minorId: 'sci-min-1',
        front: '산화와 환원을 전자의 이동 관점에서 정의하면?',
        back: '• 산화: 물질이 전자를 잃는 반응 (산화수 증가)\n• 환원: 물질이 전자를 얻는 반응 (산화수 감소)',
      },
    ],
    questions: [
      {
        id: 'q-1',
        subject: '공통수학2',
        majorId: 'math-maj-1',
        middleId: 'math-mid-1',
        minorId: 'math-min-1',
        type: 'multiple',
        prompt: '원점 (0, 0)과 직선 3x - 4y + 10 = 0 사이의 거리는 얼마인가?',
        options: ['1', '2', '3', '4', '5'],
        answer: '2',
        explanation: 'd = |3(0) - 4(0) + 10| / √(3² + (-4)²) = 10 / 5 = 2 입니다.',
      },
      {
        id: 'q-2',
        subject: '공통국어2',
        majorId: 'kor-maj-2',
        middleId: 'kor-mid-3',
        minorId: '',
        type: 'short',
        prompt: '세종 어제 훈민정음에서 "나라의 말이 중국과 달라"에 쓰인 비교 부사격 조사는 무엇인가? (한 글자)',
        options: [],
        answer: '에',
        explanation: "'듕귁에 달아'에서 '에'는 현대 국어의 '~와/과'에 해당하는 비교 부사격 조사입니다.",
      },
    ],
    questionAttempts: [],
    videos: [
      {
        id: 'vid-1',
        subject: '공통수학2',
        majorId: 'math-maj-1',
        middleId: 'math-mid-1',
        minorId: 'math-min-1',
        title: '[개념완성] 점과 직선 사이의 거리 10분 핵심 증명',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        duration: '11:24',
      },
      {
        id: 'vid-2',
        subject: '통합과학2',
        majorId: 'sci-maj-1',
        middleId: 'sci-mid-1',
        minorId: 'sci-min-2',
        title: '[핵심특강] 중화 반응 양적 관계 그래프 해석법',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        duration: '15:40',
      },
    ],
    planners: [
      {
        id: 'plan-1',
        userId: 'kimdanu',
        date: getRelativeDateStr(0),
        subject: '공통수학2',
        task: '원의 방정식 교과서 중단원 마무리 1~12번 풀기',
        completed: true,
      },
      {
        id: 'plan-2',
        userId: 'kimdanu',
        date: getRelativeDateStr(0),
        subject: '통합과학2',
        task: '산화 환원 반응 프린트 오답 3회독',
        completed: false,
      },
      {
        id: 'plan-3',
        userId: 'kimdanu',
        date: getRelativeDateStr(2),
        subject: '공통영어2',
        task: 'Lesson 3 본문 빈칸 워크북 암기',
        completed: false,
      },
    ],
    pastExams: [
      {
        id: 'pe-1',
        subject: '공통수학2',
        majorId: 'math-maj-1',
        middleId: 'math-mid-1',
        minorId: '',
        title: '2025학년도 2학기 기말 대비 도형의 방정식 실전 기출',
        fileName: '2025_공통수학2_도형의방정식_기출.txt',
        fileContent:
          '[2025학년도 2학기 기말 대비 공통수학2 실전 기출]\n\n1. 두 점 A(1, 2), B(5, 6)을 잇는 선분 AB의 수직이등분선의 방정식이 x + y - k = 0일 때, 상수 k의 값은?\n① 5   ② 6   ③ 7   ④ 8   ⑤ 9\n\n2. 직선 (k+1)x + (2k-1)y - 3k = 0이 실수 k의 값에 관계없이 항상 지나는 점의 좌표가 (a, b)일 때, a + b의 값을 구하시오. (주관식)\n\n3. 원 x² + y² = 4 위의 점 (1, √3)에서의 접선의 y절편은?\n① 4/√3   ② 2√3   ③ 3   ④ 4   ⑤ 2',
        rubric: [
          { qNum: 1, type: 'multiple', answer: '3', points: 30 },
          { qNum: 2, type: 'short', answer: '2', points: 40 },
          { qNum: 3, type: 'multiple', answer: '1', points: 30 },
        ],
      },
    ],
    omrSubmissions: [],
    activityLogs: [
      {
        id: 'act-init',
        timestamp: new Date().toISOString(),
        actorId: 'system',
        action: '시스템 초기화',
        detail: '스터디 대시보드 워크스페이스가 준비되었습니다.',
      },
    ],
  };
}

// ============================================================================
// 3. 공용 UI 헬퍼 컴포넌트 (단원 선택기, 토스트 알림)
// ============================================================================
function UnitSelector({
  units,
  subject,
  majorId,
  middleId,
  minorId,
  onChange,
  allowAll = true,
  compact = false,
}) {
  const subjectMajors = useMemo(() => {
    if (!subject || subject === 'ALL' || !units[subject]) return [];
    return sortSubjectUnits(units[subject]);
  }, [units, subject]);

  const selectedMajor = useMemo(
    () => subjectMajors.find((m) => m.id === majorId) || null,
    [subjectMajors, majorId]
  );

  const middles = selectedMajor ? selectedMajor.middles || [] : [];
  const selectedMiddle = useMemo(
    () => middles.find((m) => m.id === middleId) || null,
    [middles, middleId]
  );

  // 소단원은 선택적(없을 수 있음)
  const minors = selectedMiddle ? selectedMiddle.minors || [] : [];
  const disabled = !subject || subject === 'ALL' || subjectMajors.length === 0;

  const baseSelectCls = compact
    ? 'px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-900 disabled:bg-slate-50 disabled:text-slate-400'
    : 'px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-slate-900 disabled:bg-slate-50 disabled:text-slate-400';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 대단원 */}
      <select
        disabled={disabled}
        value={majorId || ''}
        onChange={(e) => {
          onChange({
            majorId: e.target.value,
            middleId: '',
            minorId: '',
          });
        }}
        className={baseSelectCls}
      >
        <option value="">{allowAll ? '전체 대단원' : '대단원 선택'}</option>
        {subjectMajors.map((maj) => (
          <option key={maj.id} value={maj.id}>
            {maj.name}
          </option>
        ))}
      </select>

      {/* 중단원 */}
      <select
        disabled={disabled || !majorId || middles.length === 0}
        value={middleId || ''}
        onChange={(e) => {
          onChange({
            majorId,
            middleId: e.target.value,
            minorId: '',
          });
        }}
        className={baseSelectCls}
      >
        <option value="">{allowAll ? '전체 중단원' : '중단원 선택'}</option>
        {middles.map((mid) => (
          <option key={mid.id} value={mid.id}>
            {mid.name}
          </option>
        ))}
      </select>

      {/* 소단원 (소단원이 없는 중단원이면 비활성화 안내 표시, 중단원까지만 선택해도 진행 가능) */}
      <select
        disabled={disabled || !middleId || minors.length === 0}
        value={minorId || ''}
        onChange={(e) => {
          onChange({
            majorId,
            middleId,
            minorId: e.target.value,
          });
        }}
        className={baseSelectCls}
      >
        <option value="">
          {middleId && minors.length === 0
            ? '소단원 없음 (중단원 적용)'
            : allowAll
            ? '전체 소단원 (선택)'
            : '소단원 (선택)'}
        </option>
        {minors.map((min) => (
          <option key={min.id} value={min.id}>
            {min.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// 단원 ID를 사람이 읽을 수 있는 경로 문자열로 변환
function getUnitBreadcrumb(units, subject, majorId, middleId, minorId) {
  if (!subject || !units[subject]) return '';
  const maj = units[subject].find((m) => m.id === majorId);
  if (!maj) return '단원 미지정';
  const parts = [maj.name];
  const mid = (maj.middles || []).find((m) => m.id === middleId);
  if (mid) {
    parts.push(mid.name);
    const min = (mid.minors || []).find((m) => m.id === minorId);
    if (min) parts.push(min.name);
  }
  return parts.join(' > ');
}

// ============================================================================
// 4. 메인 애플리케이션 컴포넌트 (App)
// ============================================================================
export default function App() {
  // 영구 상태 로드
  const [appData, setAppData] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to parse saved study data:', e);
    }
    return createInitialData();
  });

  // 로그인 세션 유지
  const [currentUserId, setCurrentUserId] = useState(() => {
    try {
      return localStorage.getItem(SESSION_KEY) || '';
    } catch {
      return '';
    }
  });

  // 숨겨진 관리자 세션 상태
  const [isAdminMode, setIsAdminMode] = useState(() => {
    try {
      return sessionStorage.getItem(ADMIN_AUTH_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // 숨겨진 관리자 인증 모달 & 시크릿 트리거 카운트
  const [showSecretAdminModal, setShowSecretAdminModal] = useState(false);
  const [adminSecretInput, setAdminSecretInput] = useState('');
  const [adminSecretError, setAdminSecretError] = useState('');
  const secretClickCountRef = useRef(0);
  const secretClickTimerRef = useRef(null);

  // 반응형 좌측 메뉴 상태: 화면 너비가 충분하면(>= 1200px) 기본 펼침 유지, 좁으면 접힘
  const [isWideDesktop, setIsWideDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1200 : true
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1200 : true
  );

  // 네비게이션 탭 & 전역 과목 필터 ('ALL' = '모든 과목')
  const [activeTab, setActiveTab] = useState('dashboard');
  const [globalSubjectFilter, setGlobalSubjectFilter] = useState('ALL');

  // 알림 토스트 메시지 (alert() 대체)
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'info') => {
    setToast({ id: Date.now(), message, type });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  // 상태 변경 시 localStorage 자동 저장
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    } catch (e) {
      console.error('Failed to persist study data:', e);
    }
  }, [appData]);

  // 뷰포트 크기 변화 감지 -> 넓은 화면에서는 사이드바 자동 고정, 좁은 화면에서는 접힘
  useEffect(() => {
    const handleResize = () => {
      const wide = window.innerWidth >= 1200;
      setIsWideDesktop(wide);
      if (wide) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 숨겨진 관리자 단축키 (Ctrl + Shift + A 또는 Cmd + Shift + A)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        setAdminSecretInput('');
        setAdminSecretError('');
        setShowSecretAdminModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 활동 로그 기록 헬퍼
  const recordActivity = (actorId, action, detail) => {
    setAppData((prev) => ({
      ...prev,
      activityLogs: [
        {
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          actorId,
          action,
          detail,
        },
        ...(prev.activityLogs || []),
      ],
    }));
  };

  // 현재 로그인된 사용자 객체 조회 (관리자가 아이디를 변경했거나 계정을 삭제한 경우까지 동기화)
  const currentUser = useMemo(
    () => appData.users.find((u) => u.id === currentUserId) || null,
    [appData.users, currentUserId]
  );

  // 계정이 삭제되어 유효하지 않은 세션이면 로그아웃 처리
  useEffect(() => {
    if (currentUserId && !currentUser) {
      setCurrentUserId('');
      localStorage.removeItem(SESSION_KEY);
    }
  }, [currentUserId, currentUser]);

  // 로그인 처리
  const handleLogin = (idInput, pwInput) => {
    const found = appData.users.find(
      (u) => u.id.trim() === idInput.trim() && u.password === pwInput
    );
    if (!found) {
      return false;
    }
    setCurrentUserId(found.id);
    localStorage.setItem(SESSION_KEY, found.id);
    recordActivity(found.id, '로그인', `${found.name}(${found.id}) 계정으로 로그인했습니다.`);
    showToast(`${found.name}님, 환영합니다.`, 'success');
    return true;
  };

  // 로그아웃 처리
  const handleLogout = () => {
    if (currentUser) {
      recordActivity(currentUser.id, '로그아웃', `${currentUser.name}(${currentUser.id}) 로그아웃`);
    }
    setCurrentUserId('');
    setIsAdminMode(false);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    setActiveTab('dashboard');
  };

  // 브랜드 워드마크 연속 5회 클릭 시 숨겨진 관리자 인증 창 호출
  const handleSecretBrandTap = () => {
    secretClickCountRef.current += 1;
    if (secretClickTimerRef.current) clearTimeout(secretClickTimerRef.current);
    secretClickTimerRef.current = setTimeout(() => {
      secretClickCountRef.current = 0;
    }, 1800);

    if (secretClickCountRef.current >= 5) {
      secretClickCountRef.current = 0;
      setAdminSecretInput('');
      setAdminSecretError('');
      setShowSecretAdminModal(true);
    }
  };

  // 숨겨진 관리자 인증 검증
  const handleAdminUnlockSubmit = (e) => {
    e.preventDefault();
    if (adminSecretInput === appData.adminPasscode) {
      setIsAdminMode(true);
      sessionStorage.setItem(ADMIN_AUTH_KEY, 'true');
      setShowSecretAdminModal(false);
      setAdminSecretInput('');
      setAdminSecretError('');
      recordActivity(currentUser?.id || 'admin', '관리자 인증', '관리자 패널에 진입했습니다.');
      showToast('관리자 권한이 활성화되었습니다.', 'success');
    } else {
      setAdminSecretError('인증 코드가 일치하지 않습니다.');
    }
  };

  // 로그인되지 않은 최초 진입 시 로그인 화면 렌더링
  if (!currentUser) {
    return (
      <>
        <LoginScreen
          onLogin={handleLogin}
          onSecretBrandTap={handleSecretBrandTap}
        />
        {showSecretAdminModal && (
          <SecretAdminModal
            value={adminSecretInput}
            error={adminSecretError}
            onChange={setAdminSecretInput}
            onSubmit={handleAdminUnlockSubmit}
            onClose={() => setShowSecretAdminModal(false)}
          />
        )}
      </>
    );
  }

  const navItems = [
    { id: 'dashboard', label: '대시보드 · 캘린더', icon: CalendarIcon },
    { id: 'study_progress', label: '학습 페이지 · 성취도', icon: BookOpen },
    { id: 'cards_quiz', label: '클래스 카드 · 문제 풀이', icon: Layers },
    { id: 'videos', label: '추천 개념 영상', icon: Play },
    { id: 'planner', label: '공부 플래너', icon: CheckSquare },
    { id: 'past_exams', label: '기출문제 · OMR 채점', icon: FileText },
    { id: 'account', label: '내 계정 · 비밀번호', icon: KeyRound },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-900 flex flex-col font-sans antialiased selection:bg-slate-900 selection:text-white">
      {/* 상단 미니멀 헤더 */}
      <header className="sticky top-0 z-30 h-16 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* 좌측 상단 짝대기 3개(햄버거) 메뉴 버튼 */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            aria-label="메뉴 열기/닫기"
            className="p-2.5 rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-200/70 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* 미니멀 브랜드 타이틀 (5회 연속 클릭 시 숨겨진 관리자 진입) */}
          <div
            onClick={handleSecretBrandTap}
            className="select-none cursor-default flex items-center gap-2.5"
          >
            <span className="w-2 h-2 rounded-full bg-slate-900" />
            <span className="font-semibold tracking-tight text-slate-900 text-base sm:text-lg">
              STUDY
            </span>
          </div>
        </div>

        {/* 우측 컨트롤: 전역 과목 필터 & 사용자 정보 & 로그아웃 */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* 필터/조회용 과목 선택 드롭다운 (초기값: '모든 과목') */}
          <select
            value={globalSubjectFilter}
            onChange={(e) => setGlobalSubjectFilter(e.target.value)}
            aria-label="과목 필터"
            className="px-3 py-1.5 text-xs sm:text-sm font-medium bg-slate-50 border border-slate-200/90 rounded-xl text-slate-800 focus:outline-none focus:border-slate-900 transition-colors"
          >
            <option value="ALL">모든 과목</option>
            {SUBJECTS.map((subj) => (
              <option key={subj} value={subj}>
                {subj}
              </option>
            ))}
          </select>

          {isAdminMode && (
            <button
              type="button"
              onClick={() => setActiveTab('admin_panel')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'admin_panel'
                  ? 'bg-slate-900 text-white'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              관리자 콘솔
            </button>
          )}

          <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-200">
            <span className="text-xs text-slate-500">
              {currentUser.name}{' '}
              <span className="text-slate-400">(@{currentUser.id})</span>
            </span>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">로그아웃</span>
          </button>
        </div>
      </header>

      {/* 메인 레이아웃: 좌측 사이드바 + 본문 영역 */}
      <div className="flex-1 flex relative">
        {/* 모바일/좁은 화면 오버레이 백드롭 */}
        {!isWideDesktop && isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 top-16 z-20 bg-slate-900/20 backdrop-blur-[1px]"
          />
        )}

        {/* 좌측 네비게이션 메뉴 (넓은 화면에서는 본문과 간섭 없이 고정 표시, 좁은 화면에서는 드로어) */}
        {isSidebarOpen && (
          <aside
            className={
              isWideDesktop
                ? 'w-64 shrink-0 bg-white border-r border-slate-200/80 min-h-[calc(100vh-4rem)] p-4 flex flex-col justify-between'
                : 'fixed top-16 left-0 bottom-0 z-30 w-68 max-w-[82vw] bg-white border-r border-slate-200 shadow-xl p-4 flex flex-col justify-between overflow-y-auto'
            }
          >
            <nav className="space-y-1">
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Study Workspace
              </div>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      if (!isWideDesktop) setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}

              {isAdminMode && (
                <div className="pt-4 mt-4 border-t border-slate-100">
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
                    Administrator
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('admin_panel');
                      if (!isWideDesktop) setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'admin_panel'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    <Shield className="w-4 h-4 shrink-0" />
                    <span>관리자 통합 설정</span>
                  </button>
                </div>
              )}
            </nav>

            <div className="pt-4 mt-6 border-t border-slate-100 px-3">
              <div className="text-xs text-slate-400">접속 계정</div>
              <div className="text-sm font-semibold text-slate-800 mt-0.5">
                {currentUser.name} (@{currentUser.id})
              </div>
            </div>
          </aside>
        )}

        {/* 본문 메인 컨테이너 (충분한 여백과 미니멀 카드 레이아웃) */}
        <main className="flex-1 min-w-0 px-4 sm:px-8 lg:px-12 py-6 sm:py-8 max-w-6xl mx-auto w-full">
          {activeTab === 'dashboard' && (
            <DashboardOverviewTab
              appData={appData}
              currentUser={currentUser}
              globalSubjectFilter={globalSubjectFilter}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'study_progress' && (
            <StudyProgressTab
              appData={appData}
              setAppData={setAppData}
              currentUser={currentUser}
              globalSubjectFilter={globalSubjectFilter}
              recordActivity={recordActivity}
              showToast={showToast}
            />
          )}

          {activeTab === 'cards_quiz' && (
            <CardsAndQuizTab
              appData={appData}
              setAppData={setAppData}
              currentUser={currentUser}
              globalSubjectFilter={globalSubjectFilter}
              recordActivity={recordActivity}
              showToast={showToast}
            />
          )}

          {activeTab === 'videos' && (
            <RecommendedVideosTab
              appData={appData}
              globalSubjectFilter={globalSubjectFilter}
            />
          )}

          {activeTab === 'planner' && (
            <StudyPlannerTab
              appData={appData}
              setAppData={setAppData}
              currentUser={currentUser}
              globalSubjectFilter={globalSubjectFilter}
              recordActivity={recordActivity}
              showToast={showToast}
            />
          )}

          {activeTab === 'past_exams' && (
            <PastExamsOmrTab
              appData={appData}
              setAppData={setAppData}
              currentUser={currentUser}
              globalSubjectFilter={globalSubjectFilter}
              recordActivity={recordActivity}
              showToast={showToast}
            />
          )}

          {activeTab === 'account' && (
            <UserAccountTab
              appData={appData}
              setAppData={setAppData}
              currentUser={currentUser}
              recordActivity={recordActivity}
              showToast={showToast}
            />
          )}

          {activeTab === 'admin_panel' && isAdminMode && (
            <AdminConsoleTab
              appData={appData}
              setAppData={setAppData}
              recordActivity={recordActivity}
              showToast={showToast}
              onCloseAdmin={() => {
                setIsAdminMode(false);
                sessionStorage.removeItem(ADMIN_AUTH_KEY);
                setActiveTab('dashboard');
              }}
            />
          )}
        </main>
      </div>

      {/* 토스트 알림 배너 */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm animate-fade-in">
          <div
            className={`px-4 py-3 rounded-2xl shadow-lg border text-sm font-medium flex items-center gap-2.5 ${
              toast.type === 'error'
                ? 'bg-rose-950 text-rose-50 border-rose-800'
                : toast.type === 'success'
                ? 'bg-slate-900 text-white border-slate-800'
                : 'bg-white text-slate-900 border-slate-200'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* 숨겨진 관리자 인증 모달 */}
      {showSecretAdminModal && (
        <SecretAdminModal
          value={adminSecretInput}
          error={adminSecretError}
          onChange={setAdminSecretInput}
          onSubmit={handleAdminUnlockSubmit}
          onClose={() => setShowSecretAdminModal(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// 5. 로그인 화면 (빠른 테스트 계정/초기 번호 안내 일절 없음)
// ============================================================================
function LoginScreen({ onLogin, onSecretBrandTap }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!userId.trim() || !password) {
      setErrorMsg('아이디와 비밀번호를 모두 입력해주세요.');
      return;
    }
    const ok = onLogin(userId, password);
    if (!ok) {
      setErrorMsg('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-3xl p-8 sm:p-10 shadow-xs">
        <div
          onClick={onSecretBrandTap}
          className="select-none cursor-default flex items-center gap-2.5 mb-8"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-slate-900" />
          <span className="text-lg font-semibold tracking-tight text-slate-900">
            STUDY
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          스터디 워크스페이스 로그인
        </h1>
        <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
          발급받은 개인 계정으로 로그인하여 시험 대비 진도와 학습 계획을 관리하세요.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              아이디
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setErrorMsg('');
              }}
              placeholder="아이디를 입력하세요"
              autoComplete="username"
              className="w-full px-4 py-3 text-sm bg-slate-50/70 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-900 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              비밀번호
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="비밀번호를 입력하세요"
                autoComplete="current-password"
                className="w-full px-4 py-3 pr-11 text-sm bg-slate-50/70 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-900 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPw((prev) => !prev)}
                aria-label="비밀번호 표시 전환"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200/80 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 px-4 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 active:scale-[0.99] transition-all"
          >
            로그인
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// 6. 숨겨진 관리자 인증 모달 (일반 화면에 노출되지 않는 커맨드/터치 진입)
// ============================================================================
function SecretAdminModal({ value, error, onChange, onSubmit, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
            <Lock className="w-4 h-4" />
            <span>System Access Verification</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="관리자 보안 코드를 입력하세요"
            className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-800"
            >
              인증 확인
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// 7. 재사용 월간 캘린더 컴포넌트 (일반 사용자 & 관리자 열람 화면 공통)
// ============================================================================
function StudyMonthlyCalendar({
  examConfigs,
  planners,
  studyLogs,
  subjectFilter,
  currentMonth,
  onChangeMonth,
  selectedDate,
  onSelectDate,
}) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }

  // 날짜별 시험 과목 목록 & 학습/플래너 과목 목록 집계 ('계획' 글자 없이 과목 이름만 표시)
  const getDayMetadata = (dateStr) => {
    const examSubjects = [];
    const studySubjectsSet = new Set();

    SUBJECTS.forEach((subj) => {
      if (subjectFilter !== 'ALL' && subjectFilter !== subj) return;
      const cfg = examConfigs[subj];
      if (cfg && cfg.examDate === dateStr) {
        examSubjects.push(subj);
      }
    });

    (planners || []).forEach((p) => {
      if (p.date === dateStr) {
        if (subjectFilter === 'ALL' || p.subject === subjectFilter) {
          studySubjectsSet.add(p.subject);
        }
      }
    });

    (studyLogs || []).forEach((l) => {
      if (l.date === dateStr) {
        if (subjectFilter === 'ALL' || l.subject === subjectFilter) {
          studySubjectsSet.add(l.subject);
        }
      }
    });

    return {
      examSubjects,
      studySubjects: Array.from(studySubjectsSet),
    };
  };

  const todayStr = formatDateLocal(new Date());
  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6">
      {/* 캘린더 상단 컨트롤 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-slate-900">
            {year}년 {month + 1}월 학습 · 시험 캘린더
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            초록색 강조 날짜는 시험일이며, 과목명만 간결하게 표시됩니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChangeMonth(new Date(year, month - 1, 1))}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="이전 달"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onChangeMonth(new Date())}
            className="px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => onChangeMonth(new Date(year, month + 1, 1))}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="다음 달"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-slate-100 pb-2 mb-2">
        {weekDays.map((w, idx) => (
          <div
            key={w}
            className={`text-center text-xs font-semibold ${
              idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-blue-500' : 'text-slate-400'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 달력 그리드 */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {cells.map((dateObj, idx) => {
          if (!dateObj) {
            return <div key={`empty-${idx}`} className="min-h-[78px] sm:min-h-[96px]" />;
          }

          const dateStr = formatDateLocal(dateObj);
          const { examSubjects, studySubjects } = getDayMetadata(dateStr);
          const isExamDay = examSubjects.length > 0;
          const isSelected = selectedDate === dateStr;
          const isToday = todayStr === dateStr;

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelectDate && onSelectDate(dateStr)}
              className={`min-h-[78px] sm:min-h-[96px] p-1.5 sm:p-2 rounded-xl border text-left flex flex-col justify-start transition-all ${
                isExamDay
                  ? 'bg-emerald-50/90 border-emerald-300 hover:bg-emerald-100/70'
                  : isSelected
                  ? 'bg-slate-50 border-slate-900'
                  : 'bg-white border-slate-100 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span
                  className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday
                      ? 'bg-slate-900 text-white'
                      : isExamDay
                      ? 'text-emerald-800'
                      : 'text-slate-700'
                  }`}
                >
                  {dateObj.getDate()}
                </span>
                {isExamDay && (
                  <span className="text-[10px] font-bold text-emerald-700 px-1 rounded bg-emerald-200/70">
                    시험
                  </span>
                )}
              </div>

              {/* 과목 이름 표시 (2개 이상이면 줄바꿈으로 한 줄씩 깔끔하게 배치) */}
              <div className="w-full space-y-0.5 overflow-hidden">
                {examSubjects.map((subj) => (
                  <div
                    key={`exam-${subj}`}
                    className="block w-full truncate text-[10px] sm:text-[11px] font-semibold text-emerald-800 bg-emerald-100/90 px-1.5 py-0.5 rounded"
                  >
                    {subj}
                  </div>
                ))}
                {studySubjects.map((subj) => (
                  <div
                    key={`study-${subj}`}
                    className="block w-full truncate text-[10px] sm:text-[11px] font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded"
                  >
                    {subj}
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 8. 탭 1: 대시보드 · 공지사항 · 시험 D-Day & 범위 · 월간 캘린더
// ============================================================================
function DashboardOverviewTab({ appData, currentUser, globalSubjectFilter, setActiveTab }) {
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => getRelativeDateStr(0));
  const [selectedNotice, setSelectedNotice] = useState(null);

  const userPlanners = useMemo(
    () => appData.planners.filter((p) => p.userId === currentUser.id),
    [appData.planners, currentUser.id]
  );

  const userStudyLogs = useMemo(
    () => appData.studyLogs.filter((l) => l.userId === currentUser.id),
    [appData.studyLogs, currentUser.id]
  );

  // D-Day 계산기
  const getDDayBadge = (examDateStr) => {
    if (!examDateStr) return { label: '일정 미정', diff: 999 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(examDateStr + 'T00:00:00');
    const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));
    if (diff === 0) return { label: 'D-Day', diff };
    if (diff > 0) return { label: `D-${diff}`, diff };
    return { label: `D+${Math.abs(diff)}`, diff };
  };

  const visibleSubjects =
    globalSubjectFilter === 'ALL' ? SUBJECTS : [globalSubjectFilter];

  // 선택된 날짜의 세부 일정
  const selectedDayDetails = useMemo(() => {
    const exams = visibleSubjects
      .filter((s) => appData.examConfigs[s]?.examDate === selectedDate)
      .map((s) => ({ subject: s, timetable: appData.examConfigs[s]?.timetable }));
    const plans = userPlanners.filter(
      (p) =>
        p.date === selectedDate &&
        (globalSubjectFilter === 'ALL' || p.subject === globalSubjectFilter)
    );
    const logs = userStudyLogs.filter(
      (l) =>
        l.date === selectedDate &&
        (globalSubjectFilter === 'ALL' || l.subject === globalSubjectFilter)
    );
    return { exams, plans, logs };
  }, [visibleSubjects, appData.examConfigs, selectedDate, userPlanners, userStudyLogs, globalSubjectFilter]);

  return (
    <div className="space-y-8">
      {/* 인사말 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Overview & Schedule
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 mt-1">
            오늘도 차분하게 목표를 채워보세요, {currentUser.name}님
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('study_progress')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-medium hover:bg-slate-800 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>공부한 페이지 기록하기</span>
        </button>
      </div>

      {/* 공지사항 섹션 (헤드라인만 표시, 클릭 시 상세 내용 모달 열림) */}
      {appData.notices.length > 0 && (
        <section className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-semibold text-slate-900">스터디 공지사항</h3>
            </div>
            <span className="text-[11px] text-slate-400">
              제목을 클릭하면 상세 내용을 확인할 수 있습니다
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {appData.notices.map((notice) => (
              <button
                key={notice.id}
                type="button"
                onClick={() => setSelectedNotice(notice)}
                className="w-full py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 text-left group hover:bg-slate-50/80 px-2 -mx-2 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {notice.important && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-slate-900 text-white shrink-0">
                      중요
                    </span>
                  )}
                  <h4 className="text-sm font-medium text-slate-900 truncate group-hover:text-slate-700">
                    {notice.title}
                  </h4>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-400">{notice.createdAt}</span>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 공지사항 상세 보기 모달 */}
      {selectedNotice && (
        <div
          onClick={() => setSelectedNotice(null)}
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  {selectedNotice.important && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-slate-900 text-white">
                      중요 공지
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{selectedNotice.createdAt}</span>
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900 leading-snug">
                  {selectedNotice.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNotice(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line min-h-[96px]">
              {selectedNotice.content}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedNotice(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6개 과목 시험 D-Day, 시간표, 시험 범위 & 성취도 카드 그리드 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900">
            과목별 시험 D-Day · 시험 범위 · 성취도
          </h2>
          <span className="text-xs text-slate-400">중간 제외 구간이 정리된 범위 기준</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleSubjects.map((subj) => {
            const cfg = appData.examConfigs[subj] || {
              examDate: '',
              timetable: '',
              ranges: [],
            };
            const dday = getDDayBadge(cfg.examDate);
            const subjLogs = userStudyLogs.filter((l) => l.subject === subj);
            const { percentage, studiedCount, totalPages } = calculateSubjectAchievement(
              subjLogs,
              cfg.ranges
            );

            return (
              <div
                key={subj}
                className="bg-white border border-slate-200/80 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{subj}</h3>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        dday.diff <= 7 && dday.diff >= 0
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {dday.label}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <CalendarIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        {cfg.examDate || '날짜 미정'}{' '}
                        {cfg.timetable ? `· ${cfg.timetable}` : ''}
                      </span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="text-slate-700 font-medium">
                        범위: {formatExamRangesClean(cfg.ranges)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 성취도 프로그레스 바 */}
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-500">
                      학습 성취도 ({studiedCount}/{totalPages}p)
                    </span>
                    <span className="font-semibold text-slate-900">{percentage}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-900 rounded-full transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 월간 캘린더 + 선택 날짜 상세 */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <StudyMonthlyCalendar
            examConfigs={appData.examConfigs}
            planners={userPlanners}
            studyLogs={userStudyLogs}
            subjectFilter={globalSubjectFilter}
            currentMonth={calendarMonth}
            onChangeMonth={setCalendarMonth}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </div>

        {/* 선택한 날짜의 상세 내역 */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="pb-4 border-b border-slate-100">
              <span className="text-xs font-medium text-slate-400">선택된 날짜</span>
              <h3 className="text-lg font-semibold text-slate-900 mt-0.5">{selectedDate}</h3>
            </div>

            <div className="mt-4 space-y-5">
              {selectedDayDetails.exams.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-emerald-700 mb-2">시험 일정</h4>
                  <div className="space-y-2">
                    {selectedDayDetails.exams.map((ex) => (
                      <div
                        key={ex.subject}
                        className="p-3 rounded-xl bg-emerald-50 border border-emerald-200/80 text-xs"
                      >
                        <div className="font-semibold text-emerald-900">{ex.subject}</div>
                        {ex.timetable && (
                          <div className="text-emerald-700 mt-0.5">{ex.timetable}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold text-slate-500 mb-2">플래너 항목</h4>
                {selectedDayDetails.plans.length === 0 ? (
                  <p className="text-xs text-slate-400">등록된 플래너 항목이 없습니다.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedDayDetails.plans.map((p) => (
                      <li
                        key={p.id}
                        className="p-2.5 rounded-xl bg-slate-50 text-xs flex items-start gap-2"
                      >
                        <span className="font-semibold text-slate-800 shrink-0">
                          [{p.subject}]
                        </span>
                        <span className={p.completed ? 'line-through text-slate-400' : 'text-slate-700'}>
                          {p.task}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-500 mb-2">공부한 페이지 기록</h4>
                {selectedDayDetails.logs.length === 0 ? (
                  <p className="text-xs text-slate-400">해당 날짜의 학습 페이지 기록이 없습니다.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedDayDetails.logs.map((l) => (
                      <li key={l.id} className="p-2.5 rounded-xl bg-slate-50 text-xs">
                        <div className="font-semibold text-slate-800">
                          {l.subject} · {l.startPage}~{l.endPage}p
                        </div>
                        {l.memo && <p className="text-slate-500 mt-0.5">{l.memo}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// 9. 탭 2: 공부한 페이지 입력 (범위 검증) & 과목별 성취도(%)
// ============================================================================
function StudyProgressTab({
  appData,
  setAppData,
  currentUser,
  globalSubjectFilter,
  recordActivity,
  showToast,
}) {
  // 특정 과목을 지정해야 하는 입력 드롭다운의 초기값은 반드시 '과목을 선택해주세요' (빈 값)
  const [selectedSubject, setSelectedSubject] = useState('');
  const [startPage, setStartPage] = useState('');
  const [endPage, setEndPage] = useState('');
  const [studyDate, setStudyDate] = useState(() => getRelativeDateStr(0));
  const [memo, setMemo] = useState('');
  const [validationError, setValidationError] = useState('');

  const userLogs = useMemo(
    () =>
      appData.studyLogs
        .filter((l) => l.userId === currentUser.id)
        .filter((l) => globalSubjectFilter === 'ALL' || l.subject === globalSubjectFilter),
    [appData.studyLogs, currentUser.id, globalSubjectFilter]
  );

  const handleAddStudyLog = (e) => {
    e.preventDefault();
    setValidationError('');

    // 과목 미선택 시 경고문 표시 및 등록 차단
    if (!selectedSubject) {
      const msg = '과목을 선택해주세요';
      setValidationError(msg);
      showToast(msg, 'error');
      return;
    }

    const sPage = Number(startPage);
    const ePage = Number(endPage);
    if (!startPage || !endPage || Number.isNaN(sPage) || Number.isNaN(ePage) || sPage <= 0 || ePage < sPage) {
      const msg = '올바른 시작 페이지와 끝 페이지를 입력해주세요.';
      setValidationError(msg);
      showToast(msg, 'error');
      return;
    }

    // 해당 과목의 시험 범위 포함 여부 엄격 검증
    const examRanges = appData.examConfigs[selectedSubject]?.ranges || [];
    const check = validatePageRangeInScope(sPage, ePage, examRanges);
    if (!check.valid) {
      setValidationError(check.reason);
      showToast(check.reason, 'error');
      return;
    }

    const newLog = {
      id: `slog-${Date.now()}`,
      userId: currentUser.id,
      subject: selectedSubject,
      startPage: sPage,
      endPage: ePage,
      date: studyDate || getRelativeDateStr(0),
      memo: memo.trim(),
    };

    setAppData((prev) => ({
      ...prev,
      studyLogs: [newLog, ...prev.studyLogs],
    }));

    recordActivity(
      currentUser.id,
      '학습 페이지 입력',
      `${selectedSubject} ${sPage}~${ePage}p 학습 기록 등록`
    );
    showToast(`${selectedSubject} ${sPage}~${ePage}p 학습 기록이 반영되었습니다.`, 'success');

    setStartPage('');
    setEndPage('');
    setMemo('');
  };

  const handleDeleteLog = (logId) => {
    setAppData((prev) => ({
      ...prev,
      studyLogs: prev.studyLogs.filter((l) => l.id !== logId),
    }));
    showToast('학습 기록이 삭제되었습니다.', 'info');
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Page Tracking & Mastery
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">
          공부한 페이지 입력 및 과목별 성취도
        </h1>
      </div>

      {/* 공부한 페이지 입력 폼 */}
      <form
        onSubmit={handleAddStudyLog}
        className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">오늘 공부한 페이지 기록</h2>
          {selectedSubject && (
            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-lg">
              {selectedSubject} 시험 범위:{' '}
              {formatExamRangesClean(appData.examConfigs[selectedSubject]?.ranges)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              과목 선택 <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => {
                setSelectedSubject(e.target.value);
                setValidationError('');
              }}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-slate-900"
            >
              <option value="">과목을 선택해주세요</option>
              {SUBJECTS.map((subj) => (
                <option key={subj} value={subj}>
                  {subj}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              시작 페이지 (p)
            </label>
            <input
              type="number"
              min="1"
              value={startPage}
              onChange={(e) => {
                setStartPage(e.target.value);
                setValidationError('');
              }}
              placeholder="예: 12"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              끝 페이지 (p)
            </label>
            <input
              type="number"
              min="1"
              value={endPage}
              onChange={(e) => {
                setEndPage(e.target.value);
                setValidationError('');
              }}
              placeholder="예: 28"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              학습 날짜
            </label>
            <input
              type="date"
              value={studyDate}
              onChange={(e) => setStudyDate(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="공부한 단원이나 핵심 요약 메모를 남겨보세요 (선택)"
            className="flex-1 px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
          />
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors shrink-0"
          >
            학습 페이지 등록
          </button>
        </div>

        {validationError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}
      </form>

      {/* 과목별 성취도 요약 바 */}
      <section className="bg-white border border-slate-200/80 rounded-2xl p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">
          과목별 시험 범위 대비 성취도 (%)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SUBJECTS.map((subj) => {
            const cfg = appData.examConfigs[subj] || { ranges: [] };
            const logs = appData.studyLogs.filter(
              (l) => l.userId === currentUser.id && l.subject === subj
            );
            const { percentage, studiedCount, totalPages } = calculateSubjectAchievement(
              logs,
              cfg.ranges
            );
            return (
              <div key={subj} className="p-4 rounded-xl bg-slate-50/80 border border-slate-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-900">{subj}</span>
                  <span className="font-bold text-slate-900">{percentage}%</span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5 mb-2">
                  범위: {formatExamRangesClean(cfg.ranges)} ({studiedCount}p / {totalPages}p 완료)
                </div>
                <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-900 rounded-full transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 누적 학습 기록 목록 */}
      <section className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            내 학습 페이지 기록 ({userLogs.length}건)
          </h3>
        </div>
        {userLogs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            표시할 학습 페이지 기록이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {userLogs.map((log) => (
              <div
                key={log.id}
                className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/60"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white text-xs font-medium">
                      {log.subject}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">
                      {log.startPage}p ~ {log.endPage}p
                    </span>
                    <span className="text-xs text-slate-400">({log.date})</span>
                  </div>
                  {log.memo && <p className="text-xs text-slate-500 mt-1">{log.memo}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteLog(log.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 rounded-lg"
                  aria-label="기록 삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ============================================================================
// 10. 탭 3: 클래스 카드 (앞/뒷면 명암 구분) & 문제 풀기 (단원별 필터)
// ============================================================================
function CardsAndQuizTab({
  appData,
  setAppData,
  currentUser,
  globalSubjectFilter,
  recordActivity,
  showToast,
}) {
  const [subMode, setSubMode] = useState('cards'); // 'cards' | 'quiz'
  // 통합 보기 상태에서도 내부에서 과목별 선택 가능 (초기값은 전역 필터 동기화)
  const [localSubject, setLocalSubject] = useState(globalSubjectFilter);
  const [unitFilter, setUnitFilter] = useState({ majorId: '', middleId: '', minorId: '' });

  // 클래스 카드 작성 & 뒤집기 상태
  const [flippedIds, setFlippedIds] = useState({});
  const [cardSubject, setCardSubject] = useState('');
  const [cardUnit, setCardUnit] = useState({ majorId: '', middleId: '', minorId: '' });
  const [cardFront, setCardFront] = useState('');
  const [cardBack, setCardBack] = useState('');

  // 문제 풀이 답안 입력 상태
  const [quizInputs, setQuizInputs] = useState({});
  const [quizFeedback, setQuizFeedback] = useState({});

  useEffect(() => {
    setLocalSubject(globalSubjectFilter);
    setUnitFilter({ majorId: '', middleId: '', minorId: '' });
  }, [globalSubjectFilter]);

  const filterBySubjectAndUnit = (item) => {
    if (localSubject !== 'ALL' && item.subject !== localSubject) return false;
    if (unitFilter.majorId && item.majorId !== unitFilter.majorId) return false;
    if (unitFilter.middleId && item.middleId !== unitFilter.middleId) return false;
    if (unitFilter.minorId && item.minorId !== unitFilter.minorId) return false;
    return true;
  };

  const filteredCards = useMemo(
    () => appData.flashcards.filter(filterBySubjectAndUnit),
    [appData.flashcards, localSubject, unitFilter]
  );

  const filteredQuestions = useMemo(
    () => appData.questions.filter(filterBySubjectAndUnit),
    [appData.questions, localSubject, unitFilter]
  );

  // 클래스 카드 등록 (소단원은 없어도 중단원까지만 선택해도 등록 가능)
  const handleCreateCard = (e) => {
    e.preventDefault();
    if (!cardSubject) {
      showToast('과목을 선택해주세요', 'error');
      return;
    }
    if (!cardFront.trim() || !cardBack.trim()) {
      showToast('앞면 질문과 뒷면 정답을 모두 입력해주세요.', 'error');
      return;
    }
    const newCard = {
      id: `fc-${Date.now()}`,
      subject: cardSubject,
      majorId: cardUnit.majorId,
      middleId: cardUnit.middleId,
      minorId: cardUnit.minorId,
      front: cardFront.trim(),
      back: cardBack.trim(),
    };
    setAppData((prev) => ({
      ...prev,
      flashcards: [newCard, ...prev.flashcards],
    }));
    recordActivity(currentUser.id, '클래스 카드 생성', `${cardSubject} 클래스 카드 추가`);
    showToast('새 클래스 카드가 등록되었습니다.', 'success');
    setCardFront('');
    setCardBack('');
  };

  // 문제 제출 및 기록 저장 (관리자가 사용자별 풀이 기록·선택한 답·점수 조회 가능)
  const handleSubmitQuestionAttempt = (q) => {
    const userAns = (quizInputs[q.id] || '').trim();
    if (!userAns) {
      showToast('정답을 선택하거나 입력해주세요.', 'error');
      return;
    }

    const normalizedUser = userAns.replace(/\s+/g, '').toLowerCase();
    const normalizedCorrect = q.answer.trim().replace(/\s+/g, '').toLowerCase();
    const isCorrect = normalizedUser === normalizedCorrect;

    const attemptRecord = {
      id: `att-${Date.now()}`,
      userId: currentUser.id,
      questionId: q.id,
      subject: q.subject,
      prompt: q.prompt,
      selectedAnswer: userAns,
      correctAnswer: q.answer,
      isCorrect,
      score: isCorrect ? 100 : 0,
      attemptedAt: new Date().toISOString(),
    };

    setAppData((prev) => ({
      ...prev,
      questionAttempts: [attemptRecord, ...(prev.questionAttempts || [])],
    }));

    setQuizFeedback((prev) => ({
      ...prev,
      [q.id]: { isCorrect, selectedAnswer: userAns },
    }));

    recordActivity(
      currentUser.id,
      '문제 풀이 제출',
      `${q.subject} 문항 풀이 (${isCorrect ? '정답' : '오답'})`
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Active Recall & Practice
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">
            클래스 카드 · 단원별 문제 풀이
          </h1>
        </div>

        {/* 서브 모드 전환 */}
        <div className="inline-flex p-1 bg-slate-100 rounded-xl self-start">
          <button
            type="button"
            onClick={() => setSubMode('cards')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              subMode === 'cards'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            클래스 카드 ({filteredCards.length})
          </button>
          <button
            type="button"
            onClick={() => setSubMode('quiz')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              subMode === 'quiz'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            문제 풀기 ({filteredQuestions.length})
          </button>
        </div>
      </div>

      {/* 과목 및 대/중/소단원 통합 필터 바 */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center gap-3">
        <select
          value={localSubject}
          onChange={(e) => {
            setLocalSubject(e.target.value);
            setUnitFilter({ majorId: '', middleId: '', minorId: '' });
          }}
          className="px-3 py-2 text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-900"
        >
          <option value="ALL">모든 과목</option>
          {SUBJECTS.map((subj) => (
            <option key={subj} value={subj}>
              {subj}
            </option>
          ))}
        </select>

        <UnitSelector
          units={appData.units}
          subject={localSubject}
          majorId={unitFilter.majorId}
          middleId={unitFilter.middleId}
          minorId={unitFilter.minorId}
          onChange={setUnitFilter}
          allowAll={true}
        />
      </div>

      {/* 모드 A: 클래스 카드 */}
      {subMode === 'cards' && (
        <div className="space-y-8">
          {/* 새 클래스 카드 만들기 */}
          <form
            onSubmit={handleCreateCard}
            className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-4"
          >
            <h3 className="text-sm font-semibold text-slate-900">새 클래스 카드 추가</h3>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={cardSubject}
                onChange={(e) => {
                  setCardSubject(e.target.value);
                  setCardUnit({ majorId: '', middleId: '', minorId: '' });
                }}
                className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-900"
              >
                <option value="">과목을 선택해주세요</option>
                {SUBJECTS.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>

              <UnitSelector
                units={appData.units}
                subject={cardSubject}
                majorId={cardUnit.majorId}
                middleId={cardUnit.middleId}
                minorId={cardUnit.minorId}
                onChange={setCardUnit}
                allowAll={false}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <textarea
                rows={2}
                value={cardFront}
                onChange={(e) => setCardFront(e.target.value)}
                placeholder="앞면 (질문 또는 개념 키워드)"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
              />
              <textarea
                rows={2}
                value={cardBack}
                onChange={(e) => setCardBack(e.target.value)}
                placeholder="뒷면 (정답 및 핵심 해설 - 뒤집으면 어두운 배경으로 전환됩니다)"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-medium hover:bg-slate-800"
              >
                카드 등록
              </button>
            </div>
          </form>

          {/* 클래스 카드 목록 (앞면: 밝은 화이트 / 뒷면: 다크 슬레이트로 명확히 구분) */}
          {filteredCards.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center text-sm text-slate-400">
              선택한 과목/단원에 등록된 클래스 카드가 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredCards.map((card) => {
                const isFlipped = !!flippedIds[card.id];
                const breadcrumb = getUnitBreadcrumb(
                  appData.units,
                  card.subject,
                  card.majorId,
                  card.middleId,
                  card.minorId
                );

                return (
                  <div
                    key={card.id}
                    onClick={() =>
                      setFlippedIds((prev) => ({ ...prev, [card.id]: !prev[card.id] }))
                    }
                    className={`cursor-pointer select-none min-h-[210px] rounded-2xl p-6 border transition-all duration-200 flex flex-col justify-between ${
                      isFlipped
                        ? 'bg-slate-900 text-white border-slate-800 shadow-md'
                        : 'bg-white text-slate-900 border-slate-200/90 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md ${
                          isFlipped
                            ? 'bg-slate-800 text-emerald-300'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {card.subject} · {isFlipped ? '뒷면 (정답)' : '앞면 (질문)'}
                      </span>
                      <span
                        className={`text-[11px] ${
                          isFlipped ? 'text-slate-400' : 'text-slate-400'
                        }`}
                      >
                        클릭하여 뒤집기
                      </span>
                    </div>

                    <div className="my-4">
                      <p
                        className={`text-base font-medium leading-relaxed whitespace-pre-line ${
                          isFlipped ? 'text-slate-100' : 'text-slate-900'
                        }`}
                      >
                        {isFlipped ? card.back : card.front}
                      </p>
                    </div>

                    <div
                      className={`text-[11px] pt-3 border-t ${
                        isFlipped
                          ? 'border-slate-800 text-slate-400'
                          : 'border-slate-100 text-slate-400'
                      }`}
                    >
                      {breadcrumb}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 모드 B: 문제 풀기 (문제 제작/등록/수정은 관리자 전용) */}
      {subMode === 'quiz' && (
        <div className="space-y-4">
          {filteredQuestions.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center text-sm text-slate-400">
              선택한 과목/단원에 등록된 문제가 없습니다.
            </div>
          ) : (
            filteredQuestions.map((q, idx) => {
              const fb = quizFeedback[q.id];
              const breadcrumb = getUnitBreadcrumb(
                appData.units,
                q.subject,
                q.majorId,
                q.middleId,
                q.minorId
              );

              return (
                <div
                  key={q.id}
                  className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white text-xs font-semibold">
                        Q{idx + 1} · {q.subject}
                      </span>
                      <span className="text-xs text-slate-400">{breadcrumb}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-500">
                      {q.type === 'multiple' ? '객관식' : '주관식'}
                    </span>
                  </div>

                  <p className="text-base font-medium text-slate-900 leading-relaxed">
                    {q.prompt}
                  </p>

                  {q.type === 'multiple' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(q.options || []).map((opt, oIdx) => {
                        const choiceNum = String(oIdx + 1);
                        const selected = quizInputs[q.id] === choiceNum;
                        return (
                          <button
                            key={choiceNum}
                            type="button"
                            onClick={() =>
                              setQuizInputs((prev) => ({ ...prev, [q.id]: choiceNum }))
                            }
                            className={`p-3 rounded-xl border text-left text-sm flex items-center gap-3 transition-all ${
                              selected
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-slate-50/70 text-slate-800 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                selected
                                  ? 'bg-white text-slate-900'
                                  : 'bg-white border border-slate-300 text-slate-700'
                              }`}
                            >
                              {choiceNum}
                            </span>
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={quizInputs[q.id] || ''}
                      onChange={(e) =>
                        setQuizInputs((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      placeholder="주관식 정답을 입력하세요"
                      className="w-full max-w-md px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
                    />
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => handleSubmitQuestionAttempt(q)}
                      className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-medium hover:bg-slate-800"
                    >
                      정답 제출 및 채점
                    </button>
                  </div>

                  {fb && (
                    <div
                      className={`p-4 rounded-xl border text-xs sm:text-sm ${
                        fb.isCorrect
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-rose-50 border-rose-200 text-rose-900'
                      }`}
                    >
                      <div className="font-semibold">
                        {fb.isCorrect
                          ? '정답입니다! 풀이 기록이 저장되었습니다.'
                          : `오답입니다. (제출: ${fb.selectedAnswer} / 정답: ${q.answer})`}
                      </div>
                      {q.explanation && <p className="mt-1 opacity-90">{q.explanation}</p>}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 11. 탭 4: 추천 개념 영상 (과목별 · 대/중/소단원별 필터링)
// ============================================================================
function RecommendedVideosTab({ appData, globalSubjectFilter }) {
  const [localSubject, setLocalSubject] = useState(globalSubjectFilter);
  const [unitFilter, setUnitFilter] = useState({ majorId: '', middleId: '', minorId: '' });

  useEffect(() => {
    setLocalSubject(globalSubjectFilter);
    setUnitFilter({ majorId: '', middleId: '', minorId: '' });
  }, [globalSubjectFilter]);

  const filteredVideos = useMemo(() => {
    return appData.videos.filter((v) => {
      if (localSubject !== 'ALL' && v.subject !== localSubject) return false;
      if (unitFilter.majorId && v.majorId !== unitFilter.majorId) return false;
      if (unitFilter.middleId && v.middleId !== unitFilter.middleId) return false;
      if (unitFilter.minorId && v.minorId !== unitFilter.minorId) return false;
      return true;
    });
  }, [appData.videos, localSubject, unitFilter]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Curated Concept Lectures
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">
          과목별 · 단원별 추천 개념 영상
        </h1>
      </div>

      {/* 과목 및 단원 필터 */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center gap-3">
        <select
          value={localSubject}
          onChange={(e) => {
            setLocalSubject(e.target.value);
            setUnitFilter({ majorId: '', middleId: '', minorId: '' });
          }}
          className="px-3 py-2 text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-900"
        >
          <option value="ALL">모든 과목</option>
          {SUBJECTS.map((subj) => (
            <option key={subj} value={subj}>
              {subj}
            </option>
          ))}
        </select>

        <UnitSelector
          units={appData.units}
          subject={localSubject}
          majorId={unitFilter.majorId}
          middleId={unitFilter.middleId}
          minorId={unitFilter.minorId}
          onChange={setUnitFilter}
          allowAll={true}
        />
      </div>

      {filteredVideos.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center text-sm text-slate-400">
          해당 과목/단원에 등록된 추천 개념 영상이 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredVideos.map((vid) => {
            const breadcrumb = getUnitBreadcrumb(
              appData.units,
              vid.subject,
              vid.majorId,
              vid.middleId,
              vid.minorId
            );
            return (
              <div
                key={vid.id}
                className="bg-white border border-slate-200/80 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white text-xs font-medium">
                      {vid.subject}
                    </span>
                    {vid.duration && (
                      <span className="text-xs text-slate-400">{vid.duration}</span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 leading-snug">
                    {vid.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1.5">{breadcrumb}</p>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-400 truncate max-w-[200px]">
                    {vid.url}
                  </span>
                  <a
                    href={vid.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>영상 시청하기</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 12. 탭 5: 공부 플래너
// ============================================================================
function StudyPlannerTab({
  appData,
  setAppData,
  currentUser,
  globalSubjectFilter,
  recordActivity,
  showToast,
}) {
  const [planSubject, setPlanSubject] = useState('');
  const [planDate, setPlanDate] = useState(() => getRelativeDateStr(0));
  const [planTask, setPlanTask] = useState('');

  const myPlans = useMemo(() => {
    return appData.planners
      .filter((p) => p.userId === currentUser.id)
      .filter((p) => globalSubjectFilter === 'ALL' || p.subject === globalSubjectFilter)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [appData.planners, currentUser.id, globalSubjectFilter]);

  const handleAddPlan = (e) => {
    e.preventDefault();
    if (!planSubject) {
      showToast('과목을 선택해주세요', 'error');
      return;
    }
    if (!planTask.trim()) {
      showToast('학습 계획 내용을 입력해주세요.', 'error');
      return;
    }

    const newPlan = {
      id: `plan-${Date.now()}`,
      userId: currentUser.id,
      date: planDate || getRelativeDateStr(0),
      subject: planSubject,
      task: planTask.trim(),
      completed: false,
    };

    setAppData((prev) => ({
      ...prev,
      planners: [newPlan, ...prev.planners],
    }));

    recordActivity(
      currentUser.id,
      '플래너 작성',
      `${planSubject} (${newPlan.date}): ${planTask.trim()}`
    );
    showToast('공부 플래너에 일정이 추가되었습니다.', 'success');
    setPlanTask('');
  };

  const togglePlanCompleted = (planId) => {
    setAppData((prev) => ({
      ...prev,
      planners: prev.planners.map((p) =>
        p.id === planId ? { ...p, completed: !p.completed } : p
      ),
    }));
  };

  const deletePlan = (planId) => {
    setAppData((prev) => ({
      ...prev,
      planners: prev.planners.filter((p) => p.id !== planId),
    }));
    showToast('플래너 항목이 삭제되었습니다.', 'info');
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Daily Study Planner
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">
          나만의 공부 플래너
        </h1>
      </div>

      {/* 플래너 작성 폼 */}
      <form
        onSubmit={handleAddPlan}
        className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4"
      >
        <h2 className="text-sm font-semibold text-slate-900">새 학습 목표 추가</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <select
            value={planSubject}
            onChange={(e) => setPlanSubject(e.target.value)}
            className="px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-slate-900"
          >
            <option value="">과목을 선택해주세요</option>
            {SUBJECTS.map((subj) => (
              <option key={subj} value={subj}>
                {subj}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={planDate}
            onChange={(e) => setPlanDate(e.target.value)}
            className="px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
          />

          <input
            type="text"
            value={planTask}
            onChange={(e) => setPlanTask(e.target.value)}
            placeholder="구체적인 공부 목표를 입력하세요"
            className="sm:col-span-2 px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-medium hover:bg-slate-800"
          >
            플래너 등록
          </button>
        </div>
      </form>

      {/* 플래너 체크리스트 */}
      <div className="bg-white border border-slate-200/80 rounded-2xl divide-y divide-slate-100">
        {myPlans.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            등록된 공부 플래너가 없습니다.
          </div>
        ) : (
          myPlans.map((plan) => (
            <div
              key={plan.id}
              className="p-4 sm:px-6 flex items-center justify-between gap-4 hover:bg-slate-50/60"
            >
              <button
                type="button"
                onClick={() => togglePlanCompleted(plan.id)}
                className="flex items-center gap-3.5 text-left flex-1 min-w-0"
              >
                {plan.completed ? (
                  <CheckSquare className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <Square className="w-5 h-5 text-slate-300 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                      {plan.subject}
                    </span>
                    <span className="text-xs text-slate-400">{plan.date}</span>
                  </div>
                  <p
                    className={`text-sm mt-1 truncate ${
                      plan.completed ? 'line-through text-slate-400' : 'text-slate-900 font-medium'
                    }`}
                  >
                    {plan.task}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => deletePlan(plan.id)}
                className="p-2 text-slate-400 hover:text-rose-600 rounded-lg shrink-0"
                aria-label="삭제"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 13. 탭 6: 기출문제 다운로드 & OMR / 주관식 자동 채점 (제출 후 잠금)
// ============================================================================
function PastExamsOmrTab({
  appData,
  setAppData,
  currentUser,
  globalSubjectFilter,
  recordActivity,
  showToast,
}) {
  const [localSubject, setLocalSubject] = useState(globalSubjectFilter);
  const [unitFilter, setUnitFilter] = useState({ majorId: '', middleId: '', minorId: '' });
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [omrDraft, setOmrDraft] = useState({});

  useEffect(() => {
    setLocalSubject(globalSubjectFilter);
    setUnitFilter({ majorId: '', middleId: '', minorId: '' });
  }, [globalSubjectFilter]);

  // 과목만 선택하면 해당 과목 기출문제 표시, 단원까지 선택하면 해당 단원 기준으로 좁혀서 표시
  const filteredExams = useMemo(() => {
    return appData.pastExams.filter((ex) => {
      if (localSubject !== 'ALL' && ex.subject !== localSubject) return false;
      if (unitFilter.majorId && ex.majorId !== unitFilter.majorId) return false;
      if (unitFilter.middleId && ex.middleId !== unitFilter.middleId) return false;
      if (unitFilter.minorId && ex.minorId !== unitFilter.minorId) return false;
      return true;
    });
  }, [appData.pastExams, localSubject, unitFilter]);

  const activeExam = useMemo(
    () =>
      filteredExams.find((e) => e.id === selectedExamId) || filteredExams[0] || null,
    [filteredExams, selectedExamId]
  );

  // 현재 사용자의 해당 기출문제 OMR 제출 내역 확인 (제출 완료 시 잠금)
  const existingSubmission = useMemo(() => {
    if (!activeExam) return null;
    return (
      appData.omrSubmissions.find(
        (s) => s.examId === activeExam.id && s.userId === currentUser.id
      ) || null
    );
  }, [appData.omrSubmissions, activeExam, currentUser.id]);

  // 기출문제 파일 다운로드 핸들러
  const handleDownloadExamFile = (exam) => {
    if (exam.fileDataUrl) {
      const a = document.createElement('a');
      a.href = exam.fileDataUrl;
      a.download = exam.fileName || `${exam.title}.pdf`;
      a.click();
      return;
    }
    const blob = new Blob([exam.fileContent || `${exam.title}\n기출문제 자료`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exam.fileName || `${exam.title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('기출문제 파일 다운로드를 시작합니다.', 'success');
  };

  // OMR 및 주관식 자동 채점 제출 (제출 후 수정 잠금)
  const handleSubmitOmr = () => {
    if (!activeExam || existingSubmission) return;
    const rubric = activeExam.rubric || [];
    if (rubric.length === 0) {
      showToast('이 기출문제에는 아직 채점 기준이 등록되지 않았습니다.', 'error');
      return;
    }

    const currentAnswers = omrDraft[activeExam.id] || {};
    let totalScore = 0;
    let maxScore = 0;

    const details = rubric.map((item) => {
      const pts = Number(item.points) || 0;
      maxScore += pts;
      const userVal = String(currentAnswers[item.qNum] || '').trim();
      const correctVal = String(item.answer || '').trim();
      const isCorrect =
        userVal.replace(/\s+/g, '').toLowerCase() ===
        correctVal.replace(/\s+/g, '').toLowerCase();
      if (isCorrect) totalScore += pts;

      return {
        qNum: item.qNum,
        type: item.type,
        userAnswer: userVal || '(미입력)',
        correctAnswer: correctVal,
        points: pts,
        earned: isCorrect ? pts : 0,
        isCorrect,
      };
    });

    const submission = {
      id: `omr-${Date.now()}`,
      examId: activeExam.id,
      examTitle: activeExam.title,
      subject: activeExam.subject,
      userId: currentUser.id,
      totalScore,
      maxScore,
      details,
      submittedAt: new Date().toISOString(),
    };

    setAppData((prev) => ({
      ...prev,
      omrSubmissions: [submission, ...prev.omrSubmissions],
    }));

    recordActivity(
      currentUser.id,
      'OMR 자동 채점 제출',
      `${activeExam.title} (${totalScore}/${maxScore}점)`
    );
    showToast(`자동 채점이 완료되었습니다. (${totalScore} / ${maxScore}점)`, 'success');
  };

  const omrBubbles = ['1', '2', '3', '4', '5'];
  const bubbleSymbols = ['①', '②', '③', '④', '⑤'];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Past Exams & Auto-Grading OMR
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">
          기출문제 다운로드 · OMR / 주관식 자동 채점
        </h1>
      </div>

      {/* 과목 및 단원 탐색 필터 */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center gap-3">
        <select
          value={localSubject}
          onChange={(e) => {
            setLocalSubject(e.target.value);
            setUnitFilter({ majorId: '', middleId: '', minorId: '' });
            setSelectedExamId(null);
          }}
          className="px-3 py-2 text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-slate-900"
        >
          <option value="ALL">모든 과목</option>
          {SUBJECTS.map((subj) => (
            <option key={subj} value={subj}>
              {subj}
            </option>
          ))}
        </select>

        <UnitSelector
          units={appData.units}
          subject={localSubject}
          majorId={unitFilter.majorId}
          middleId={unitFilter.middleId}
          minorId={unitFilter.minorId}
          onChange={setUnitFilter}
          allowAll={true}
        />
      </div>

      {filteredExams.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center text-sm text-slate-400">
          선택한 조건에 해당하는 기출문제가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 좌측: 기출문제 목록 */}
          <div className="space-y-3">
            {filteredExams.map((ex) => {
              const submitted = appData.omrSubmissions.find(
                (s) => s.examId === ex.id && s.userId === currentUser.id
              );
              const isSelected = activeExam?.id === ex.id;
              return (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => setSelectedExamId(ex.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-900 border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                        isSelected ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {ex.subject}
                    </span>
                    {submitted && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500 text-white">
                        채점완료 ({submitted.totalScore}점)
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-semibold leading-snug">{ex.title}</div>
                  <div
                    className={`text-[11px] mt-1.5 ${
                      isSelected ? 'text-slate-400' : 'text-slate-400'
                    }`}
                  >
                    {getUnitBreadcrumb(
                      appData.units,
                      ex.subject,
                      ex.majorId,
                      ex.middleId,
                      ex.minorId
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 우측: 선택된 기출문제 다운로드 + OMR 답안 카드 */}
          {activeExam && (
            <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                <div>
                  <span className="text-xs font-semibold text-slate-500">
                    {activeExam.subject}
                  </span>
                  <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
                    {activeExam.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownloadExamFile(activeExam)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs sm:text-sm font-medium shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>기출문제 다운로드</span>
                </button>
              </div>

              {/* 제출 완료 잠금 안내 배너 */}
              {existingSubmission ? (
                <div className="p-4 rounded-2xl bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Lock className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-sm font-semibold">
                        답안 제출 및 자동 채점이 완료되어 수정이 잠금 처리되었습니다.
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        제출 일시: {new Date(existingSubmission.submittedAt).toLocaleString('ko-KR')}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400">최종 점수</span>
                    <div className="text-xl font-bold text-emerald-400">
                      {existingSubmission.totalScore} / {existingSubmission.maxScore}점
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    OMR 및 주관식 답안을 제출하여 채점을 완료하면 이후 답안을 수정할 수 없습니다.
                  </span>
                </div>
              )}

              {/* OMR 답안 마킹 / 결과 테이블 */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  OMR 답안지 ({(activeExam.rubric || []).length}문항)
                </h3>

                {(activeExam.rubric || []).length === 0 ? (
                  <p className="text-xs text-slate-400 py-4">
                    등록된 문항 채점 기준이 없습니다.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-2xl overflow-hidden">
                    {(activeExam.rubric || []).map((item) => {
                      const lockedDetail = existingSubmission?.details?.find(
                        (d) => d.qNum === item.qNum
                      );
                      const currentVal = existingSubmission
                        ? lockedDetail?.userAnswer
                        : omrDraft[activeExam.id]?.[item.qNum] || '';

                      return (
                        <div
                          key={item.qNum}
                          className="p-4 flex flex-wrap items-center justify-between gap-4 bg-white"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center">
                              {item.qNum}번
                            </span>
                            <div>
                              <span className="text-xs font-medium text-slate-500">
                                {item.type === 'multiple' ? '객관식' : '주관식'} · 배점{' '}
                                {item.points}점
                              </span>
                              {lockedDetail && (
                                <div className="text-xs mt-0.5">
                                  <span
                                    className={`font-semibold ${
                                      lockedDetail.isCorrect
                                        ? 'text-emerald-600'
                                        : 'text-rose-600'
                                    }`}
                                  >
                                    {lockedDetail.isCorrect
                                      ? `정답 (+${lockedDetail.earned}점)`
                                      : `오답 (정답: ${lockedDetail.correctAnswer})`}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 객관식 ①~⑤ OMR 버블 또는 주관식 입력란 */}
                          {item.type === 'multiple' ? (
                            <div className="flex items-center gap-2">
                              {omrBubbles.map((val, bIdx) => {
                                const isChecked = currentVal === val;
                                return (
                                  <button
                                    key={val}
                                    type="button"
                                    disabled={!!existingSubmission}
                                    onClick={() =>
                                      setOmrDraft((prev) => ({
                                        ...prev,
                                        [activeExam.id]: {
                                          ...(prev[activeExam.id] || {}),
                                          [item.qNum]: val,
                                        },
                                      }))
                                    }
                                    className={`w-9 h-9 rounded-full text-sm font-bold transition-all border ${
                                      isChecked
                                        ? 'bg-slate-900 text-white border-slate-900'
                                        : 'bg-white text-slate-700 border-slate-300 hover:border-slate-900 disabled:opacity-50'
                                    }`}
                                  >
                                    {bubbleSymbols[bIdx]}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <input
                              type="text"
                              disabled={!!existingSubmission}
                              value={currentVal}
                              onChange={(e) =>
                                setOmrDraft((prev) => ({
                                  ...prev,
                                  [activeExam.id]: {
                                    ...(prev[activeExam.id] || {}),
                                    [item.qNum]: e.target.value,
                                  },
                                }))
                              }
                              placeholder="주관식 답안 입력"
                              className="px-3.5 py-2 text-sm border border-slate-200 rounded-xl w-48 focus:outline-none focus:border-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {!existingSubmission && (activeExam.rubric || []).length > 0 && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSubmitOmr}
                    className="px-6 py-3 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
                  >
                    OMR 제출 및 자동 채점 완료
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 14. 탭 7: 내 계정 · 비밀번호 변경 (아이디 변경은 관리자만 가능)
// ============================================================================
function UserAccountTab({ appData, setAppData, currentUser, recordActivity, showToast }) {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);

  const handlePasswordChange = (e) => {
    e.preventDefault();
    if (currentPw !== currentUser.password) {
      showToast('현재 비밀번호가 일치하지 않습니다.', 'error');
      return;
    }
    if (!newPw.trim() || newPw.length < 4) {
      showToast('새 비밀번호는 4자 이상 입력해주세요.', 'error');
      return;
    }
    if (newPw !== confirmPw) {
      showToast('새 비밀번호 확인이 일치하지 않습니다.', 'error');
      return;
    }

    setAppData((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === currentUser.id ? { ...u, password: newPw } : u
      ),
    }));

    recordActivity(
      currentUser.id,
      '비밀번호 변경',
      `${currentUser.name}(${currentUser.id}) 사용자가 비밀번호를 변경했습니다.`
    );
    showToast('비밀번호가 즉시 변경되었습니다.', 'success');
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
  };

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Account Security
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">
          내 계정 정보 및 비밀번호 변경
        </h1>
      </div>

      {/* 계정 정보 요약 (아이디는 읽기 전용) */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400">사용자 이름</span>
            <p className="text-base font-semibold text-slate-900">{currentUser.name}</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400">아이디 (관리자 전용 변경)</span>
            <p className="text-base font-mono font-semibold text-slate-900">
              @{currentUser.id}
            </p>
          </div>
        </div>
      </div>

      {/* 비밀번호 변경 폼 */}
      <form
        onSubmit={handlePasswordChange}
        className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4"
      >
        <h2 className="text-base font-semibold text-slate-900">비밀번호 변경</h2>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            현재 비밀번호
          </label>
          <div className="relative">
            <input
              type={showCurrentPw ? 'text' : 'password'}
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
            />
            <button
              type="button"
              onClick={() => setShowCurrentPw((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            새 비밀번호
          </label>
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            새 비밀번호 확인
          </label>
          <input
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
          />
        </div>

        <button
          type="submit"
          className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
        >
          비밀번호 변경 적용
        </button>
      </form>
    </div>
  );
}

// ============================================================================
// 15. 탭 8: 관리자 통합 콘솔 (숨겨진 인증 통과 시에만 렌더링)
// ============================================================================
function AdminConsoleTab({
  appData,
  setAppData,
  recordActivity,
  showToast,
  onCloseAdmin,
}) {
  const [adminSubTab, setAdminSubTab] = useState('users');

  const adminTabs = [
    { id: 'users', label: '\uACC4\uC815 \u00B7 \uBE44\uBC00\uBC88\uD638 \uAD00\uB9AC' },
    { id: 'student_monitor', label: '\uC0AC\uC6A9\uC790 \uCE98\uB9B0\uB354 \u00B7 \uD559\uC2B5/\uD50C\uB798\uB108 \uC5F4\uB78C' },
    { id: 'curriculum', label: '\uACF5\uC9C0 \u00B7 \uC2DC\uD5D8\uC77C\uC815/\uBC94\uC704 \u00B7 \uB2E8\uC6D0' },
    { id: 'content_manage', label: '\uBB38\uC81C \uCD9C\uC81C \u00B7 \uCD94\uCC9C \uC601\uC0C1 \uAD00\uB9AC' },
    { id: 'past_exam_admin', label: '\uAE30\uCD9C\uBB38\uC81C \u00B7 \uCC44\uC810\uAE30\uC900 \u00B7 OMR \uACB0\uACFC' },
    { id: 'logs', label: '\uD65C\uB3D9 \uB85C\uADF8 \u00B7 \uCD9C\uB825' },
  ];

  return (
    <div className="space-y-6">
      {/* 관리자 상단 바 */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">관리자 통합 제어 패널</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              계정 권한, 교육과정 단원/범위, 문제 및 영상 등록, 사용자별 OMR 채점 기록 관리
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseAdmin}
          className="px-4 py-2 rounded-xl bg-white text-slate-900 text-xs font-semibold hover:bg-slate-100 self-start sm:self-auto"
        >
          일반 학습 화면으로 복귀
        </button>
      </div>

      {/* 관리자 서브 탭 네비게이션 */}
      <div className="flex flex-wrap gap-2">
        {adminTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setAdminSubTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors border ${
              adminSubTab === t.id
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {adminSubTab === 'users' && (
        <AdminUsersSection
          appData={appData}
          setAppData={setAppData}
          recordActivity={recordActivity}
          showToast={showToast}
        />
      )}

      {adminSubTab === 'student_monitor' && (
        <AdminStudentMonitorSection appData={appData} />
      )}

      {adminSubTab === 'curriculum' && (
        <AdminCurriculumSection
          appData={appData}
          setAppData={setAppData}
          recordActivity={recordActivity}
          showToast={showToast}
        />
      )}

      {adminSubTab === 'content_manage' && (
        <AdminContentSection
          appData={appData}
          setAppData={setAppData}
          recordActivity={recordActivity}
          showToast={showToast}
        />
      )}

      {adminSubTab === 'past_exam_admin' && (
        <AdminPastExamSection
          appData={appData}
          setAppData={setAppData}
          recordActivity={recordActivity}
          showToast={showToast}
        />
      )}

      {adminSubTab === 'logs' && <AdminActivityLogsSection appData={appData} />}
    </div>
  );
}

// [관리자 1] 계정 생성/삭제, 아이디 변경(관리자 전용), 비밀번호 눈 아이콘 조회 & 즉시 변경
function AdminUsersSection({ appData, setAppData, recordActivity, showToast }) {
  const [newName, setNewName] = useState('');
  const [newId, setNewId] = useState('');
  const [newPw, setNewPw] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [editingIds, setEditingIds] = useState({});
  const [editingPws, setEditingPws] = useState({});

  const handleCreateUser = (e) => {
    e.preventDefault();
    const trimmedId = newId.trim();
    if (!newName.trim() || !trimmedId || !newPw.trim()) {
      showToast('이름, 아이디, 비밀번호를 모두 입력해주세요.', 'error');
      return;
    }
    if (appData.users.some((u) => u.id === trimmedId)) {
      showToast('이미 존재하는 아이디입니다.', 'error');
      return;
    }
    const created = {
      id: trimmedId,
      name: newName.trim(),
      password: newPw.trim(),
      createdAt: formatDateLocal(new Date()),
    };
    setAppData((prev) => ({
      ...prev,
      users: [...prev.users, created],
    }));
    recordActivity('ADMIN', '계정 생성', `${created.name}(${created.id}) 계정 생성`);
    showToast(`${created.name}(@${created.id}) 계정이 생성되었습니다.`, 'success');
    setNewName('');
    setNewId('');
    setNewPw('');
  };

  // 관리자 전용 아이디 변경 (연관 데이터 userId도 일괄 동기화)
  const handleChangeUserId = (oldId) => {
    const nextId = (editingIds[oldId] || '').trim();
    if (!nextId || nextId === oldId) return;
    if (appData.users.some((u) => u.id === nextId)) {
      showToast('이미 사용 중인 아이디입니다.', 'error');
      return;
    }

    setAppData((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === oldId ? { ...u, id: nextId } : u)),
      studyLogs: prev.studyLogs.map((l) => (l.userId === oldId ? { ...l, userId: nextId } : l)),
      planners: prev.planners.map((p) => (p.userId === oldId ? { ...p, userId: nextId } : p)),
      omrSubmissions: prev.omrSubmissions.map((s) =>
        s.userId === oldId ? { ...s, userId: nextId } : s
      ),
      questionAttempts: (prev.questionAttempts || []).map((a) =>
        a.userId === oldId ? { ...a, userId: nextId } : a
      ),
    }));

    recordActivity('ADMIN', '아이디 변경', `${oldId} → ${nextId} 아이디 변경`);
    showToast(`아이디가 '${nextId}'로 변경되었습니다.`, 'success');
  };

  // 관리자 비밀번호 즉시 변경
  const handleAdminResetPassword = (targetId) => {
    const nextPw = (editingPws[targetId] || '').trim();
    if (!nextPw) {
      showToast('새 비밀번호를 입력해주세요.', 'error');
      return;
    }
    setAppData((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === targetId ? { ...u, password: nextPw } : u)),
    }));
    recordActivity('ADMIN', '비밀번호 재설정', `@${targetId} 계정의 비밀번호를 변경했습니다.`);
    showToast(`@${targetId} 계정의 비밀번호가 즉시 반영되었습니다.`, 'success');
    setEditingPws((prev) => ({ ...prev, [targetId]: '' }));
  };

  const handleRemoveUser = (targetUser) => {
    if (appData.users.length <= 1) {
      showToast('최소 1개의 사용자 계정은 유지해야 합니다.', 'error');
      return;
    }
    setAppData((prev) => ({
      ...prev,
      users: prev.users.filter((u) => u.id !== targetUser.id),
    }));
    recordActivity('ADMIN', '계정 삭제', `${targetUser.name}(@${targetUser.id}) 계정 삭제`);
    showToast(`@${targetUser.id} 계정이 삭제되었습니다.`, 'info');
  };

  return (
    <div className="space-y-6">
      {/* 계정 생성 */}
      <form
        onSubmit={handleCreateUser}
        className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
      >
        <h3 className="text-sm font-semibold text-slate-900">새 사용자 계정 생성</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="이름 (예: 이서연)"
            className="px-3.5 py-2 text-sm border border-slate-200 rounded-xl"
          />
          <input
            type="text"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder="아이디 (영문/숫자)"
            className="px-3.5 py-2 text-sm border border-slate-200 rounded-xl"
          />
          <input
            type="text"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="초기 비밀번호"
            className="px-3.5 py-2 text-sm border border-slate-200 rounded-xl"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
          >
            + 계정 추가
          </button>
        </div>
      </form>

      {/* 등록 계정 목록 (비밀번호 마스킹 + 눈 아이콘 조회 + 아이디/비밀번호 변경) */}
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {appData.users.map((u) => {
          const isPwShown = !!visiblePasswords[u.id];
          return (
            <div key={u.id} className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-slate-900">{u.name}</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      @{u.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-600">
                    <span>현재 비밀번호:</span>
                    <span className="font-mono font-semibold text-slate-900 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                      {isPwShown ? u.password : '••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setVisiblePasswords((prev) => ({ ...prev, [u.id]: !prev[u.id] }))
                      }
                      aria-label="비밀번호 보기/숨기기"
                      className="p-1 text-slate-500 hover:text-slate-900 rounded"
                    >
                      {isPwShown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveUser(u)}
                  className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 text-xs font-medium hover:bg-rose-50"
                >
                  계정 제거
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {/* 관리자 전용 아이디 변경 */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editingIds[u.id] ?? u.id}
                    onChange={(e) =>
                      setEditingIds((prev) => ({ ...prev, [u.id]: e.target.value }))
                    }
                    placeholder="새 아이디"
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => handleChangeUserId(u.id)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium shrink-0"
                  >
                    아이디 변경
                  </button>
                </div>

                {/* 관리자 비밀번호 임의 변경 */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editingPws[u.id] || ''}
                    onChange={(e) =>
                      setEditingPws((prev) => ({ ...prev, [u.id]: e.target.value }))
                    }
                    placeholder="변경할 새 비밀번호 입력"
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => handleAdminResetPassword(u.id)}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 shrink-0"
                  >
                    비밀번호 변경
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// [관리자 2] 사용자별 캘린더(실제 화면 동일 뷰) · 학습 현황 · 플래너 · 문제 풀이 기록 열람
function AdminStudentMonitorSection({ appData }) {
  const [selectedUserId, setSelectedUserId] = useState(appData.users[0]?.id || '');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => getRelativeDateStr(0));

  const targetUser = appData.users.find((u) => u.id === selectedUserId) || appData.users[0];
  const targetLogs = useMemo(
    () => appData.studyLogs.filter((l) => l.userId === targetUser?.id),
    [appData.studyLogs, targetUser]
  );
  const targetPlanners = useMemo(
    () => appData.planners.filter((p) => p.userId === targetUser?.id),
    [appData.planners, targetUser]
  );
  const targetAttempts = useMemo(
    () => (appData.questionAttempts || []).filter((a) => a.userId === targetUser?.id),
    [appData.questionAttempts, targetUser]
  );

  if (!targetUser) return null;

  return (
    <div className="space-y-6">
      {/* 대상 사용자 선택 바 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <UserCheck className="w-5 h-5 text-slate-700" />
          <span className="text-sm font-semibold text-slate-900">열람할 사용자 선택:</span>
          <select
            value={targetUser.id}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="px-3.5 py-2 text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl"
          >
            {appData.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} (@{u.id})
              </option>
            ))}
          </select>
        </div>
        <span className="text-xs text-slate-400">
          실제 사용자가 보는 달력 형태와 학습 통계를 동일하게 확인합니다.
        </span>
      </div>

      {/* 실제 사용자 캘린더와 동일한 월간 달력 뷰 */}
      <StudyMonthlyCalendar
        examConfigs={appData.examConfigs}
        planners={targetPlanners}
        studyLogs={targetLogs}
        subjectFilter="ALL"
        currentMonth={calendarMonth}
        onChangeMonth={setCalendarMonth}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />

      {/* 과목별 성취도 & 입력한 학습 페이지 상세 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {targetUser.name}님의 과목별 성취도 및 학습 페이지 내역
          </h3>
          <div className="space-y-2.5">
            {SUBJECTS.map((subj) => {
              const cfg = appData.examConfigs[subj] || { ranges: [] };
              const logs = targetLogs.filter((l) => l.subject === subj);
              const { percentage, studiedCount, totalPages } = calculateSubjectAchievement(
                logs,
                cfg.ranges
              );
              return (
                <div key={subj} className="p-3 rounded-xl bg-slate-50">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>{subj}</span>
                    <span>
                      {percentage}% ({studiedCount}/{totalPages}p)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-slate-900 rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2 max-h-48 overflow-y-auto">
            {targetLogs.map((l) => (
              <div key={l.id} className="text-xs p-2.5 rounded-lg bg-slate-50/70">
                <strong>[{l.subject}]</strong> {l.startPage}~{l.endPage}p ({l.date}){' '}
                {l.memo && `- ${l.memo}`}
              </div>
            ))}
          </div>
        </div>

        {/* 사용자별 플래너 및 문제 풀이 기록 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">
            공부 플래너 ({targetPlanners.length}건) & 문제 풀이 기록 ({targetAttempts.length}건)
          </h3>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {targetPlanners.length === 0 ? (
              <p className="text-xs text-slate-400">작성된 플래너가 없습니다.</p>
            ) : (
              targetPlanners.map((p) => (
                <div
                  key={p.id}
                  className="text-xs p-2.5 rounded-lg bg-slate-50 flex items-center justify-between"
                >
                  <span>
                    <strong>[{p.subject}]</strong> {p.task} ({p.date})
                  </span>
                  <span
                    className={`font-semibold ${
                      p.completed ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    {p.completed ? '완료' : '진행중'}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-2 max-h-48 overflow-y-auto">
            <h4 className="text-xs font-semibold text-slate-600">문제 풀이 상세 기록</h4>
            {targetAttempts.length === 0 ? (
              <p className="text-xs text-slate-400">문제 풀이 기록이 없습니다.</p>
            ) : (
              targetAttempts.map((att) => (
                <div key={att.id} className="text-xs p-2.5 rounded-lg bg-slate-50">
                  <div className="flex justify-between font-semibold">
                    <span>[{att.subject}] {att.prompt}</span>
                    <span className={att.isCorrect ? 'text-emerald-600' : 'text-rose-600'}>
                      {att.isCorrect ? '정답 (100점)' : '오답 (0점)'}
                    </span>
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    선택한 답: {att.selectedAnswer} · 정답: {att.correctAnswer}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// [관리자 3] 공지사항 관리, 시험일정/중간 끊김 시험범위 구간 관리, 대/중/소단원 관리(페이지 자동 정렬)
function AdminCurriculumSection({ appData, setAppData, recordActivity, showToast }) {
  // 공지사항 상태
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeImportant, setNoticeImportant] = useState(false);
  const [editingNoticeId, setEditingNoticeId] = useState(null);
  const noticeTextareaRef = useRef(null);

  const resizeNoticeTextarea = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(72, el.scrollHeight)}px`;
  };

  useEffect(() => {
    resizeNoticeTextarea(noticeTextareaRef.current);
  }, [noticeContent, editingNoticeId]);

  // 시험 범위 & 시간표 관리
  const [cfgSubject, setCfgSubject] = useState(SUBJECTS[0]);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  // 단원 관리 상태
  const [unitSubject, setUnitSubject] = useState(SUBJECTS[0]);
  const [newMajorName, setNewMajorName] = useState('');
  const [newMajorPage, setNewMajorPage] = useState('');
  const [targetMajorId, setTargetMajorId] = useState('');
  const [newMiddleName, setNewMiddleName] = useState('');
  const [newMiddlePage, setNewMiddlePage] = useState('');
  const [targetMiddleId, setTargetMiddleId] = useState('');
  const [newMinorName, setNewMinorName] = useState('');
  const [newMinorPage, setNewMinorPage] = useState('');

  const handleAddNotice = (e) => {
    e.preventDefault();
    if (!noticeTitle.trim() || !noticeContent.trim()) {
      showToast('공지 제목과 내용을 모두 입력해주세요.', 'error');
      return;
    }

    if (editingNoticeId) {
      const updatedTitle = noticeTitle.trim();
      const updatedContent = noticeContent.trim();
      setAppData((prev) => ({
        ...prev,
        notices: prev.notices.map((n) =>
          n.id === editingNoticeId
            ? {
                ...n,
                title: updatedTitle,
                content: updatedContent,
                important: noticeImportant,
                updatedAt: formatDateLocal(new Date()),
              }
            : n
        ),
      }));
      recordActivity('ADMIN', '공지사항 수정', updatedTitle);
      showToast('공지사항이 수정되었습니다.', 'success');
      setEditingNoticeId(null);
      setNoticeTitle('');
      setNoticeContent('');
      setNoticeImportant(false);
      return;
    }

    const created = {
      id: `notice-${Date.now()}`,
      title: noticeTitle.trim(),
      content: noticeContent.trim(),
      createdAt: formatDateLocal(new Date()),
      important: noticeImportant,
    };
    setAppData((prev) => ({
      ...prev,
      notices: [created, ...prev.notices],
    }));
    recordActivity('ADMIN', '공지사항 등록', created.title);
    showToast('공지사항이 게시되었습니다.', 'success');
    setNoticeTitle('');
    setNoticeContent('');
    setNoticeImportant(false);
  };

  const handleStartEditNotice = (notice) => {
    setEditingNoticeId(notice.id);
    setNoticeTitle(notice.title);
    setNoticeContent(notice.content);
    setNoticeImportant(!!notice.important);
    requestAnimationFrame(() => resizeNoticeTextarea(noticeTextareaRef.current));
  };

  const handleCancelEditNotice = () => {
    setEditingNoticeId(null);
    setNoticeTitle('');
    setNoticeContent('');
    setNoticeImportant(false);
  };

  const handleDeleteNotice = (id) => {
    if (editingNoticeId === id) {
      handleCancelEditNotice();
    }
    setAppData((prev) => ({
      ...prev,
      notices: prev.notices.filter((n) => n.id !== id),
    }));
  };

  // 시험 범위 구간 추가 (중간 끊김 구간 개별 등록 가능)
  const handleAddScopeRange = () => {
    const s = Number(rangeStart);
    const e = Number(rangeEnd);
    if (!s || !e || e < s) {
      showToast('올바른 시작/끝 페이지를 입력해주세요.', 'error');
      return;
    }
    setAppData((prev) => {
      const curr = prev.examConfigs[cfgSubject] || { examDate: '', timetable: '', ranges: [] };
      const updatedRanges = normalizeRanges([...curr.ranges, { start: s, end: e }]);
      return {
        ...prev,
        examConfigs: {
          ...prev.examConfigs,
          [cfgSubject]: { ...curr, ranges: updatedRanges },
        },
      };
    });
    recordActivity('ADMIN', '시험 범위 추가', `${cfgSubject} ${s}~${e}p 구간 추가`);
    showToast(`${cfgSubject} 시험 범위 구간이 반영되었습니다.`, 'success');
    setRangeStart('');
    setRangeEnd('');
  };

  const handleRemoveScopeRange = (idx) => {
    setAppData((prev) => {
      const curr = prev.examConfigs[cfgSubject];
      const nextRanges = curr.ranges.filter((_, i) => i !== idx);
      return {
        ...prev,
        examConfigs: {
          ...prev.examConfigs,
          [cfgSubject]: { ...curr, ranges: nextRanges },
        },
      };
    });
  };

  // 대/중/소단원 추가 (기준 페이지 우선순위 자동 배열)
  const subjectUnits = sortSubjectUnits(appData.units[unitSubject] || []);
  const selectedMajor = subjectUnits.find((m) => m.id === targetMajorId) || subjectUnits[0];
  const selectedMiddle =
    (selectedMajor?.middles || []).find((m) => m.id === targetMiddleId) ||
    selectedMajor?.middles?.[0];

  const handleAddMajor = () => {
    if (!newMajorName.trim()) return;
    const newMaj = {
      id: `maj-${Date.now()}`,
      name: newMajorName.trim(),
      startPage: Number(newMajorPage) || 9999,
      middles: [],
    };
    setAppData((prev) => ({
      ...prev,
      units: {
        ...prev.units,
        [unitSubject]: sortSubjectUnits([...(prev.units[unitSubject] || []), newMaj]),
      },
    }));
    setNewMajorName('');
    setNewMajorPage('');
    showToast('대단원이 추가되고 페이지 순으로 정렬되었습니다.', 'success');
  };

  const handleAddMiddle = () => {
    if (!selectedMajor || !newMiddleName.trim()) return;
    const newMid = {
      id: `mid-${Date.now()}`,
      name: newMiddleName.trim(),
      startPage: Number(newMiddlePage) || 9999,
      minors: [],
    };
    setAppData((prev) => ({
      ...prev,
      units: {
        ...prev.units,
        [unitSubject]: sortSubjectUnits(
          (prev.units[unitSubject] || []).map((maj) =>
            maj.id === selectedMajor.id
              ? { ...maj, middles: [...(maj.middles || []), newMid] }
              : maj
          )
        ),
      },
    }));
    setNewMiddleName('');
    setNewMiddlePage('');
    showToast('중단원이 추가되고 페이지 순으로 정렬되었습니다.', 'success');
  };

  const handleAddMinor = () => {
    if (!selectedMajor || !selectedMiddle || !newMinorName.trim()) return;
    const newMin = {
      id: `min-${Date.now()}`,
      name: newMinorName.trim(),
      startPage: Number(newMinorPage) || 9999,
    };
    setAppData((prev) => ({
      ...prev,
      units: {
        ...prev.units,
        [unitSubject]: sortSubjectUnits(
          (prev.units[unitSubject] || []).map((maj) =>
            maj.id === selectedMajor.id
              ? {
                  ...maj,
                  middles: (maj.middles || []).map((mid) =>
                    mid.id === selectedMiddle.id
                      ? { ...mid, minors: [...(mid.minors || []), newMin] }
                      : mid
                  ),
                }
              : maj
          )
        ),
      },
    }));
    setNewMinorName('');
    setNewMinorPage('');
    showToast('소단원이 추가되고 페이지 순으로 정렬되었습니다.', 'success');
  };

  const handleDeleteUnitNode = (level, majId, midId, minId) => {
    setAppData((prev) => {
      let tree = [...(prev.units[unitSubject] || [])];
      if (level === 'major') {
        tree = tree.filter((m) => m.id !== majId);
      } else if (level === 'middle') {
        tree = tree.map((maj) =>
          maj.id === majId
            ? { ...maj, middles: (maj.middles || []).filter((m) => m.id !== midId) }
            : maj
        );
      } else if (level === 'minor') {
        tree = tree.map((maj) =>
          maj.id === majId
            ? {
                ...maj,
                middles: (maj.middles || []).map((mid) =>
                  mid.id === midId
                    ? { ...mid, minors: (mid.minors || []).filter((m) => m.id !== minId) }
                    : mid
                ),
              }
            : maj
        );
      }
      return {
        ...prev,
        units: { ...prev.units, [unitSubject]: sortSubjectUnits(tree) },
      };
    });
  };

  const activeCfg = appData.examConfigs[cfgSubject] || {
    examDate: '',
    timetable: '',
    ranges: [],
  };

  return (
    <div className="space-y-6">
      {/* 1. 공지사항 작성 및 관리 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">공지사항 작성 · 수정 · 관리</h3>
          {editingNoticeId && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-md">
              공지 수정 중
            </span>
          )}
        </div>
        <form onSubmit={handleAddNotice} className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={noticeTitle}
              onChange={(e) => setNoticeTitle(e.target.value)}
              placeholder="공지 제목"
              className="flex-1 px-3.5 py-2 text-sm border border-slate-200 rounded-xl"
            />
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 px-3 py-2 bg-slate-50 rounded-xl">
              <input
                type="checkbox"
                checked={noticeImportant}
                onChange={(e) => setNoticeImportant(e.target.checked)}
              />
              중요 공지 표시
            </label>
          </div>
          <textarea
            ref={noticeTextareaRef}
            rows={3}
            value={noticeContent}
            onChange={(e) => {
              setNoticeContent(e.target.value);
              resizeNoticeTextarea(e.target);
            }}
            placeholder="공지 본문 내용 (줄바꿈 및 길이에 맞춰 자동으로 늘어납니다)"
            className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl leading-relaxed resize-none overflow-hidden focus:outline-none focus:border-slate-900"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
            >
              {editingNoticeId ? '공지 수정 저장' : '공지 등록'}
            </button>
            {editingNoticeId && (
              <button
                type="button"
                onClick={handleCancelEditNotice}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50"
              >
                수정 취소
              </button>
            )}
          </div>
        </form>

        <div className="divide-y divide-slate-100 pt-2">
          {appData.notices.map((n) => (
            <div key={n.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-semibold text-slate-900">{n.title}</span>
                <span className="text-slate-400 ml-2">({n.createdAt})</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => handleStartEditNotice(n)}
                  className="text-slate-700 hover:text-slate-900 font-medium hover:underline"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteNotice(n.id)}
                  className="text-rose-600 hover:underline"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. 과목별 시험일, 시간표 & 끊김 구간 시험 범위 설정 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">
            과목별 시험 일자 · 시간표 · 시험 범위 구간 관리
          </h3>
          <select
            value={cfgSubject}
            onChange={(e) => setCfgSubject(e.target.value)}
            className="px-3 py-1.5 text-sm font-semibold bg-slate-50 border border-slate-200 rounded-xl"
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">시험 일자</label>
            <input
              type="date"
              value={activeCfg.examDate || ''}
              onChange={(e) =>
                setAppData((prev) => ({
                  ...prev,
                  examConfigs: {
                    ...prev.examConfigs,
                    [cfgSubject]: { ...activeCfg, examDate: e.target.value },
                  },
                }))
              }
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">시험 시간표 안내</label>
            <input
              type="text"
              value={activeCfg.timetable || ''}
              onChange={(e) =>
                setAppData((prev) => ({
                  ...prev,
                  examConfigs: {
                    ...prev.examConfigs,
                    [cfgSubject]: { ...activeCfg, timetable: e.target.value },
                  },
                }))
              }
              placeholder="예: 1일차 2교시 (09:50 ~ 10:40)"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
            />
          </div>
        </div>

        {/* 시험 범위 페이지 구간 추가 (중간 끊김 구간 지원) */}
        <div className="pt-2">
          <label className="block text-xs font-semibold text-slate-700 mb-2">
            시험 범위 페이지 구간 등록 (중간에 제외되는 페이지는 구간을 나누어 추가하세요)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min="1"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              placeholder="시작 p"
              className="w-28 px-3 py-2 text-sm border border-slate-200 rounded-xl"
            />
            <span className="text-slate-400">~</span>
            <input
              type="number"
              min="1"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              placeholder="끝 p"
              className="w-28 px-3 py-2 text-sm border border-slate-200 rounded-xl"
            />
            <button
              type="button"
              onClick={handleAddScopeRange}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium"
            >
              구간 추가
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {normalizeRanges(activeCfg.ranges).map((r, idx) => (
              <span
                key={`${r.start}-${r.end}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-xs font-semibold text-slate-800"
              >
                {r.start}–{r.end}p
                <button
                  type="button"
                  onClick={() => handleRemoveScopeRange(idx)}
                  className="text-slate-400 hover:text-rose-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 3. 대단원 · 중단원 · 소단원(선택적) 관리 및 페이지 순 자동 정렬 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              단원 구조 관리 (기준 페이지 순 자동 정렬 · 소단원 선택적)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              소단원이 없는 과목/단원은 대단원·중단원만 등록하면 자동으로 중단원까지만 선택됩니다.
            </p>
          </div>
          <select
            value={unitSubject}
            onChange={(e) => {
              setUnitSubject(e.target.value);
              setTargetMajorId('');
              setTargetMiddleId('');
            }}
            className="px-3 py-1.5 text-sm font-semibold bg-slate-50 border border-slate-200 rounded-xl"
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 대단원 추가 */}
          <div className="p-4 rounded-xl bg-slate-50 space-y-2.5">
            <div className="text-xs font-semibold text-slate-800">1) 대단원 추가</div>
            <input
              type="text"
              value={newMajorName}
              onChange={(e) => setNewMajorName(e.target.value)}
              placeholder="대단원명"
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            />
            <input
              type="number"
              value={newMajorPage}
              onChange={(e) => setNewMajorPage(e.target.value)}
              placeholder="기준 시작 페이지 (정렬용)"
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            />
            <button
              type="button"
              onClick={handleAddMajor}
              className="w-full py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium"
            >
              + 대단원 등록
            </button>
          </div>

          {/* 중단원 추가 */}
          <div className="p-4 rounded-xl bg-slate-50 space-y-2.5">
            <div className="text-xs font-semibold text-slate-800">2) 중단원 추가</div>
            <select
              value={selectedMajor?.id || ''}
              onChange={(e) => setTargetMajorId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            >
              {subjectUnits.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newMiddleName}
              onChange={(e) => setNewMiddleName(e.target.value)}
              placeholder="중단원명"
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            />
            <input
              type="number"
              value={newMiddlePage}
              onChange={(e) => setNewMiddlePage(e.target.value)}
              placeholder="기준 시작 페이지"
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            />
            <button
              type="button"
              onClick={handleAddMiddle}
              className="w-full py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium"
            >
              + 중단원 등록
            </button>
          </div>

          {/* 소단원 추가 (선택사항) */}
          <div className="p-4 rounded-xl bg-slate-50 space-y-2.5">
            <div className="text-xs font-semibold text-slate-800">3) 소단원 추가 (선택)</div>
            <select
              value={selectedMiddle?.id || ''}
              onChange={(e) => setTargetMiddleId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            >
              {(selectedMajor?.middles || []).map((mid) => (
                <option key={mid.id} value={mid.id}>
                  {mid.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newMinorName}
              onChange={(e) => setNewMinorName(e.target.value)}
              placeholder="소단원명"
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            />
            <input
              type="number"
              value={newMinorPage}
              onChange={(e) => setNewMinorPage(e.target.value)}
              placeholder="기준 시작 페이지"
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            />
            <button
              type="button"
              onClick={handleAddMinor}
              className="w-full py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium"
            >
              + 소단원 등록
            </button>
          </div>
        </div>

        {/* 현재 정렬된 단원 트리 미리보기 */}
        <div className="space-y-3 pt-2">
          {subjectUnits.map((maj) => (
            <div key={maj.id} className="p-3.5 rounded-xl border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                <span>
                  {maj.name} <span className="text-slate-400 font-normal">({maj.startPage}p~)</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteUnitNode('major', maj.id)}
                  className="text-rose-500 hover:underline font-normal"
                >
                  대단원 삭제
                </button>
              </div>
              <div className="pl-4 space-y-1.5">
                {(maj.middles || []).map((mid) => (
                  <div key={mid.id} className="text-xs">
                    <div className="flex items-center justify-between text-slate-700 font-medium">
                      <span>
                        └ {mid.name}{' '}
                        <span className="text-slate-400 font-normal">({mid.startPage}p~)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteUnitNode('middle', maj.id, mid.id)}
                        className="text-slate-400 hover:text-rose-500"
                      >
                        삭제
                      </button>
                    </div>
                    {(mid.minors || []).length > 0 && (
                      <div className="pl-5 mt-1 space-y-1 text-slate-500">
                        {mid.minors.map((min) => (
                          <div key={min.id} className="flex items-center justify-between">
                            <span>
                              · {min.name} ({min.startPage}p~)
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteUnitNode('minor', maj.id, mid.id, min.id)
                              }
                              className="text-slate-400 hover:text-rose-500"
                            >
                              삭제
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// [관리자 4] 수동 문제 등록 + 추천 영상 등록(과목/단원 연동)
function AdminContentSection({ appData, setAppData, recordActivity, showToast }) {
  // 수동 문제 등록 상태
  const [qSubject, setQSubject] = useState(SUBJECTS[0]);
  const [qUnits, setQUnits] = useState({ majorId: '', middleId: '', minorId: '' });
  const [qType, setQType] = useState('multiple');
  const [qPrompt, setQPrompt] = useState('');
  const [qOpts, setQOpts] = useState(['', '', '', '', '']);
  const [qAnswer, setQAnswer] = useState('');
  const [qExp, setQExp] = useState('');

  // 추천 개념 영상 등록 상태 (과목 변경 시 단원 상태 초기화로 중복 엉킴 방지)
  const [vSubject, setVSubject] = useState(SUBJECTS[0]);
  const [vUnits, setVUnits] = useState({ majorId: '', middleId: '', minorId: '' });
  const [vTitle, setVTitle] = useState('');
  const [vUrl, setVUrl] = useState('');
  const [vDuration, setVDuration] = useState('');

  // 수동 문제 등록
  const handleAddManualQuestion = (e) => {
    e.preventDefault();
    if (!qPrompt.trim() || !qAnswer.trim()) {
      showToast('문제 지문과 정답을 입력해주세요.', 'error');
      return;
    }
    const created = {
      id: `q-${Date.now()}`,
      subject: qSubject,
      ...qUnits,
      type: qType,
      prompt: qPrompt.trim(),
      options: qType === 'multiple' ? qOpts : [],
      answer: qAnswer.trim(),
      explanation: qExp.trim(),
    };
    setAppData((prev) => ({ ...prev, questions: [created, ...prev.questions] }));
    recordActivity('ADMIN', '문제 등록', `${qSubject} 신규 문항 등록`);
    showToast('문제가 등록되었습니다.', 'success');
    setQPrompt('');
    setQAnswer('');
    setQExp('');
  };

  // 추천 개념 영상 등록
  const handleAddVideo = (e) => {
    e.preventDefault();
    if (!vTitle.trim() || !vUrl.trim()) {
      showToast('영상 제목과 유튜브 링크를 입력해주세요.', 'error');
      return;
    }
    const newVideo = {
      id: `v-${Date.now()}`,
      subject: vSubject,
      ...vUnits,
      title: vTitle.trim(),
      url: vUrl.trim(),
      duration: vDuration.trim() || '개념강의',
    };
    setAppData((prev) => ({ ...prev, videos: [newVideo, ...prev.videos] }));
    recordActivity('ADMIN', '추천 영상 등록', `${vSubject}: ${vTitle.trim()}`);
    showToast('추천 개념 영상이 등록되었습니다.', 'success');
    setVTitle('');
    setVUrl('');
    setVDuration('');
  };

  return (
    <div className="space-y-6">
      {/* 1. 관리자 직접 문제 등록 */}
      <form
        onSubmit={handleAddManualQuestion}
        className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
      >
        <h3 className="text-sm font-semibold text-slate-900">문제 직접 등록 (관리자 전용)</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={qSubject}
            onChange={(e) => {
              setQSubject(e.target.value);
              setQUnits({ majorId: '', middleId: '', minorId: '' });
            }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold"
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="md:col-span-3">
            <UnitSelector
              units={appData.units}
              subject={qSubject}
              majorId={qUnits.majorId}
              middleId={qUnits.middleId}
              minorId={qUnits.minorId}
              onChange={setQUnits}
              allowAll={true}
              compact={true}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <select
            value={qType}
            onChange={(e) => setQType(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs"
          >
            <option value="multiple">객관식</option>
            <option value="short">주관식</option>
          </select>
          <input
            type="text"
            value={qPrompt}
            onChange={(e) => setQPrompt(e.target.value)}
            placeholder="문제 지문을 입력하세요"
            className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
          />
        </div>

        {qType === 'multiple' && (
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {qOpts.map((opt, i) => (
              <input
                key={i}
                type="text"
                value={opt}
                onChange={(e) => {
                  const next = [...qOpts];
                  next[i] = e.target.value;
                  setQOpts(next);
                }}
                placeholder={`${i + 1}번 보기`}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
              />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            value={qAnswer}
            onChange={(e) => setQAnswer(e.target.value)}
            placeholder={qType === 'multiple' ? '정답 번호 (1~5)' : '주관식 정답'}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs"
          />
          <input
            type="text"
            value={qExp}
            onChange={(e) => setQExp(e.target.value)}
            placeholder="해설 (선택)"
            className="sm:col-span-2 px-3 py-2 border border-slate-200 rounded-xl text-xs"
          />
        </div>

        <button
          type="submit"
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium"
        >
          문제 등록
        </button>
      </form>

      {/* 2. 추천 개념 영상 등록 (과목 선택 시 하위 단원 상태 명확 연동) */}
      <form
        onSubmit={handleAddVideo}
        className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
      >
        <h3 className="text-sm font-semibold text-slate-900">추천 개념 영상 등록</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={vSubject}
            onChange={(e) => {
              setVSubject(e.target.value);
              // 과목 변경 시 단원 드롭다운 초기화 (중복 엉킴 방지)
              setVUnits({ majorId: '', middleId: '', minorId: '' });
            }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold"
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <div className="md:col-span-3">
            <UnitSelector
              units={appData.units}
              subject={vSubject}
              majorId={vUnits.majorId}
              middleId={vUnits.middleId}
              minorId={vUnits.minorId}
              onChange={setVUnits}
              allowAll={true}
              compact={true}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            value={vTitle}
            onChange={(e) => setVTitle(e.target.value)}
            placeholder="강의 영상 제목"
            className="sm:col-span-2 px-3 py-2 border border-slate-200 rounded-xl text-xs"
          />
          <input
            type="url"
            value={vUrl}
            onChange={(e) => setVUrl(e.target.value)}
            placeholder="유튜브 URL (https://youtube.com/...)"
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs"
          />
          <button
            type="submit"
            className="py-2 px-4 rounded-xl bg-slate-900 text-white text-xs font-medium"
          >
            + 영상 등록
          </button>
        </div>
      </form>
    </div>
  );
}

// [관리자 5] 기출문제 등록, 정답/배점 기준('추가' 버튼) 등록 & 사용자별 OMR 결과 조회/삭제
function AdminPastExamSection({ appData, setAppData, recordActivity, showToast }) {
  const [examTitle, setExamTitle] = useState('');
  const [examSubject, setExamSubject] = useState(SUBJECTS[0]);
  const [examUnits, setExamUnits] = useState({ majorId: '', middleId: '', minorId: '' });
  const [examTextContent, setExamTextContent] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedDataUrl, setUploadedDataUrl] = useState('');

  // 채점 기준 등록 UI 상태 (객관식/주관식 선택, 문항 번호, 정답, 배점 입력 후 '추가')
  const [targetExamId, setTargetExamId] = useState(appData.pastExams[0]?.id || '');
  const [rType, setRType] = useState('multiple');
  const [rQNum, setRQNum] = useState('');
  const [rAnswer, setRAnswer] = useState('');
  const [rPoints, setRPoints] = useState('');

  // 사용자별 OMR 결과 조회 필터 및 상세 펼침 상태
  const [omrUserFilter, setOmrUserFilter] = useState('ALL');
  const [expandedSubmissionIds, setExpandedSubmissionIds] = useState({});

  const toggleSubmissionDetail = (subId) => {
    setExpandedSubmissionIds((prev) => ({ ...prev, [subId]: !prev[subId] }));
  };

  const filteredOmrSubmissions = useMemo(() => {
    return (appData.omrSubmissions || []).filter((sub) => {
      if (omrUserFilter !== 'ALL' && sub.userId !== omrUserFilter) return false;
      return true;
    });
  }, [appData.omrSubmissions, omrUserFilter]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedDataUrl(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const handleCreatePastExam = (e) => {
    e.preventDefault();
    if (!examTitle.trim()) {
      showToast('기출문제 제목을 입력해주세요.', 'error');
      return;
    }
    const created = {
      id: `pe-${Date.now()}`,
      subject: examSubject,
      ...examUnits,
      title: examTitle.trim(),
      fileName: uploadedFileName || `${examTitle.trim()}.txt`,
      fileDataUrl: uploadedDataUrl,
      fileContent: examTextContent.trim() || `${examTitle.trim()} 기출문제 자료`,
      rubric: [],
    };
    setAppData((prev) => ({
      ...prev,
      pastExams: [created, ...prev.pastExams],
    }));
    setTargetExamId(created.id);
    recordActivity('ADMIN', '기출문제 등록', `${examSubject}: ${created.title}`);
    showToast('기출문제가 등록되었습니다. 아래에서 채점 기준을 추가하세요.', 'success');
    setExamTitle('');
    setExamTextContent('');
    setUploadedFileName('');
    setUploadedDataUrl('');
  };

  // '추가' 버튼을 눌러 문항 채점 기준 등록
  const handleAddRubricItem = () => {
    const examId = targetExamId || appData.pastExams[0]?.id;
    if (!examId) {
      showToast('먼저 기출문제를 등록해주세요.', 'error');
      return;
    }
    const qNum = Number(rQNum);
    const pts = Number(rPoints);
    if (!qNum || qNum <= 0 || !rAnswer.trim() || !pts || pts <= 0) {
      showToast('문항 번호, 정답, 배점을 올바르게 입력해주세요.', 'error');
      return;
    }

    setAppData((prev) => ({
      ...prev,
      pastExams: prev.pastExams.map((ex) => {
        if (ex.id !== examId) return ex;
        const filtered = (ex.rubric || []).filter((item) => item.qNum !== qNum);
        const nextRubric = [
          ...filtered,
          { qNum, type: rType, answer: rAnswer.trim(), points: pts },
        ].sort((a, b) => a.qNum - b.qNum);
        return { ...ex, rubric: nextRubric };
      }),
    }));

    showToast(`${qNum}번 문항 채점 기준이 추가되었습니다.`, 'success');
    setRQNum(String(qNum + 1));
    setRAnswer('');
    setRPoints('');
  };

  const handleRemoveRubricItem = (examId, qNum) => {
    setAppData((prev) => ({
      ...prev,
      pastExams: prev.pastExams.map((ex) =>
        ex.id === examId
          ? { ...ex, rubric: (ex.rubric || []).filter((item) => item.qNum !== qNum) }
          : ex
      ),
    }));
  };

  // 사용자 OMR 기록 삭제 (삭제 즉시 점수·잠금 상태 실시간 반영)
  const handleDeleteOmrSubmission = (sub) => {
    setAppData((prev) => ({
      ...prev,
      omrSubmissions: prev.omrSubmissions.filter((s) => s.id !== sub.id),
    }));
    recordActivity(
      'ADMIN',
      'OMR 기록 삭제',
      `@${sub.userId} 사용자의 '${sub.examTitle}' OMR 채점 기록 삭제`
    );
    showToast('OMR 기록이 삭제되어 즉시 초기화되었습니다.', 'info');
  };

  const selectedExamForRubric =
    appData.pastExams.find((e) => e.id === (targetExamId || appData.pastExams[0]?.id)) || null;

  return (
    <div className="space-y-6">
      {/* 1. 새 기출문제 등록 */}
      <form
        onSubmit={handleCreatePastExam}
        className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
      >
        <h3 className="text-sm font-semibold text-slate-900">기출문제 등록 및 파일 첨부</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={examSubject}
            onChange={(e) => {
              setExamSubject(e.target.value);
              setExamUnits({ majorId: '', middleId: '', minorId: '' });
            }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold"
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="md:col-span-3">
            <UnitSelector
              units={appData.units}
              subject={examSubject}
              majorId={examUnits.majorId}
              middleId={examUnits.middleId}
              minorId={examUnits.minorId}
              onChange={setExamUnits}
              allowAll={true}
              compact={true}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={examTitle}
            onChange={(e) => setExamTitle(e.target.value)}
            placeholder="기출문제 시험지 제목"
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs"
          />
          <input
            type="file"
            onChange={handleFileUpload}
            className="text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-800 file:font-medium"
          />
        </div>

        <textarea
          rows={2}
          value={examTextContent}
          onChange={(e) => setExamTextContent(e.target.value)}
          placeholder="텍스트 기출문제 본문 (파일 미첨부 시 다운로드 내용으로 제공됩니다)"
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
        />

        <button
          type="submit"
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium"
        >
          기출문제 등록
        </button>
      </form>

      {/* 2. 자동 채점 기준 등록 (객관식/주관식 선택, 문항 번호, 정답, 배점 입력 후 '추가') */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">
            문항별 자동 채점 기준(정답 · 배점) 등록
          </h3>
          <select
            value={selectedExamForRubric?.id || ''}
            onChange={(e) => setTargetExamId(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold"
          >
            {appData.pastExams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                [{ex.subject}] {ex.title}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <select
            value={rType}
            onChange={(e) => setRType(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium"
          >
            <option value="multiple">객관식</option>
            <option value="short">주관식</option>
          </select>

          <input
            type="number"
            min="1"
            value={rQNum}
            onChange={(e) => setRQNum(e.target.value)}
            placeholder="문항 번호"
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs"
          />

          <input
            type="text"
            value={rAnswer}
            onChange={(e) => setRAnswer(e.target.value)}
            placeholder={rType === 'multiple' ? '정답 (1~5)' : '주관식 정답'}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs"
          />

          <input
            type="number"
            min="1"
            value={rPoints}
            onChange={(e) => setRPoints(e.target.value)}
            placeholder="배점 (점)"
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs"
          />

          <button
            type="button"
            onClick={handleAddRubricItem}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
          >
            추가
          </button>
        </div>

        {/* 추가된 문항 채점 기준 목록 */}
        {selectedExamForRubric && (
          <div className="flex flex-wrap gap-2 pt-2">
            {(selectedExamForRubric.rubric || []).map((item) => (
              <div
                key={item.qNum}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-xs text-slate-800"
              >
                <span className="font-bold">{item.qNum}번</span>
                <span>({item.type === 'multiple' ? '객관식' : '주관식'})</span>
                <span>정답: {item.answer}</span>
                <span className="text-slate-500">[{item.points}점]</span>
                <button
                  type="button"
                  onClick={() => handleRemoveRubricItem(selectedExamForRubric.id, item.qNum)}
                  className="text-slate-400 hover:text-rose-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. 사용자별 OMR / 채점 결과 조회 및 삭제 (삭제 즉시 실시간 반영) */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-900">
              사용자별 OMR 제출 및 채점 결과 ({filteredOmrSubmissions.length}건)
            </h3>
            <select
              value={omrUserFilter}
              onChange={(e) => setOmrUserFilter(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 bg-slate-50 focus:outline-none focus:border-slate-900"
            >
              <option value="ALL">모든 사용자</option>
              {appData.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} (@{u.id})
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-slate-400">
            기록 삭제 시 사용자의 잠금이 해제되고 점수가 즉시 초기화됩니다.
          </span>
        </div>

        {filteredOmrSubmissions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            선택한 조건에 해당하는 OMR 제출 기록이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredOmrSubmissions.map((sub) => {
              const userObj = appData.users.find((u) => u.id === sub.userId);
              const isExpanded = !!expandedSubmissionIds[sub.id];

              return (
                <div key={sub.id} className="p-4 sm:px-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white text-[11px] font-semibold">
                          {userObj ? `${userObj.name} (@${sub.userId})` : `@${sub.userId}`}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                          {sub.subject}
                        </span>
                        <span className="text-xs font-semibold text-slate-900">{sub.examTitle}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5">
                        총점:{' '}
                        <strong className="text-slate-900 text-sm">{sub.totalScore}</strong> /{' '}
                        {sub.maxScore}점 · 제출일시:{' '}
                        {new Date(sub.submittedAt).toLocaleString('ko-KR')}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleSubmissionDetail(sub.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50"
                      >
                        <span>{isExpanded ? '문항별 답안 접기' : '문항별 답안 보기'}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOmrSubmission(sub)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>기록 삭제</span>
                      </button>
                    </div>
                  </div>

                  {/* 문항별 채점 상세 내역 */}
                  {isExpanded && sub.details && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                      {sub.details.map((d) => (
                        <div
                          key={d.qNum}
                          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                            d.isCorrect
                              ? 'bg-emerald-50/60 border-emerald-200/80 text-emerald-950'
                              : 'bg-rose-50/60 border-rose-200/80 text-rose-950'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold">{d.qNum}번</span>
                              <span className="text-[11px] opacity-70">
                                ({d.type === 'multiple' ? '객관식' : '주관식'} · {d.points}점)
                              </span>
                            </div>
                            <p className="text-[11px]">
                              제출: <strong>{d.userAnswer}</strong> / 정답:{' '}
                              <strong>{d.correctAnswer}</strong>
                            </p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-xs ${
                              d.isCorrect
                                ? 'bg-emerald-600 text-white'
                                : 'bg-rose-600 text-white'
                            }`}
                          >
                            {d.isCorrect ? `O (+${d.points})` : 'X (0)'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// [관리자 6] 활동 로그 조회 및 출력 (인쇄 & CSV 파일 내보내기)
function AdminActivityLogsSection({ appData }) {
  const [filterActor, setFilterActor] = useState('ALL');

  const filteredLogs = useMemo(() => {
    return (appData.activityLogs || []).filter(
      (log) => filterActor === 'ALL' || log.actorId === filterActor
    );
  }, [appData.activityLogs, filterActor]);

  // CSV 출력(다운로드)
  const handleExportCsv = () => {
    const header = '시각,계정ID,활동유형,상세내용\n';
    const rows = filteredLogs
      .map(
        (l) =>
          `"${new Date(l.timestamp).toLocaleString('ko-KR')}","${l.actorId}","${
            l.action
          }","${(l.detail || '').replace(/"/g, '""')}"`
      )
      .join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study_activity_logs_${formatDateLocal(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-900">
            전체 시스템 활동 로그 ({filteredLogs.length}건)
          </h3>
          <select
            value={filterActor}
            onChange={(e) => setFilterActor(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs"
          >
            <option value="ALL">전체 사용자</option>
            {appData.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} (@{u.id})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV 내보내기</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>로그 인쇄 출력</span>
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
        {filteredLogs.map((log) => (
          <div
            key={log.id}
            className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-2.5">
              <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-700">
                @{log.actorId}
              </span>
              <span className="font-semibold text-slate-900">{log.action}</span>
              <span className="text-slate-600">{log.detail}</span>
            </div>
            <span className="text-slate-400">
              {new Date(log.timestamp).toLocaleString('ko-KR')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}