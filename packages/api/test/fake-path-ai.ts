import { Injectable } from '@nestjs/common';
import type { Level, Preferences } from '../src/modules/learning-paths/dto/learning-path.dto.js';
import {
  PathAi,
  type Categorized,
  type ChatOutput,
  type ChatTurnInput,
  type ExtendInput,
  type ExtendOutput,
  type PathOutput,
} from '../src/modules/learning-paths/path-ai.js';
import type { LessonInput, LessonOutput, QuizInput, QuizOutput } from '../src/modules/lessons/lesson-output.js';

const LEVEL_REPLIES = ['Cơ bản', 'Trung cấp', 'Nâng cao'];

function parseLevel(text: string): Level | undefined {
  const t = text.toLowerCase();
  if (/cơ bản|mới|beginner/.test(t)) return 'beginner';
  if (/trung|intermediate/.test(t)) return 'intermediate';
  if (/nâng cao|advanced/.test(t)) return 'advanced';
}

/** Test-only fake of PathAi (no model, no network): deterministic slot filling: topic, then level, then an optional goal. */
@Injectable()
export class FakePathAi extends PathAi {
  /** Category name returned by generate and categorize; differs in case from the seeded "Lập trình" on purpose. */
  category = 'Lập Trình';

  /** extend(): answer "complete" instead of a new chapter. */
  extendComplete = false;

  async extend(input: ExtendInput): Promise<ExtendOutput> {
    if (this.extendComplete) return { complete: true, modules: [] };
    const n = input.modules.length + 1;
    const next = input.scope?.findIndex((a) => !a.covered) ?? -1;
    return {
      complete: false,
      modules: [
        {
          title: `Mở rộng ${n}`,
          lessons: [{ title: `Bài ${n}.1` }, { title: `Bài ${n}.2` }],
          covers: next >= 0 ? [next] : [],
        },
      ],
    };
  }

  async categorize(): Promise<Categorized> {
    return { category: this.category, tags: ['sql', 'cơ sở dữ liệu'] };
  }

  async chat({ history, preferences }: ChatTurnInput): Promise<ChatOutput> {
    const p = { ...preferences };
    const last = history.findLast((m) => m.role === 'user')?.content.trim() ?? '';
    // The goal question is asked once the required fields are known; any answer to it (a goal or a skip) completes the brief.
    const goalAnswered = !!(last && p.topic && p.level);
    if (last) {
      if (!p.topic) p.topic = last.slice(0, 200);
      else if (!p.level) p.level = parseLevel(last);
      else if (!p.goal && !/^(không|bỏ qua)/i.test(last)) p.goal = last.slice(0, 300);
    }
    const ready = goalAnswered;
    if (!p.topic)
      return {
        reply: 'Bạn muốn học chủ đề gì?',
        quickReplies: [],
        preferences: p,
        ready,
        offTopic: false,
      };
    if (!p.level)
      return {
        reply: `Bạn đang ở trình độ nào với "${p.topic}"?`,
        quickReplies: LEVEL_REPLIES,
        preferences: p,
        ready,
        offTopic: false,
      };
    if (!ready)
      return {
        reply: 'Bạn có mục tiêu cụ thể không? Ví dụ: dùng cho công việc, thi cử, hay chỉ tò mò.',
        quickReplies: ['Không có mục tiêu cụ thể'],
        preferences: p,
        ready,
        offTopic: false,
      };
    return {
      reply: 'Mình đã có đủ thông tin. Bấm "Tạo lộ trình" khi bạn sẵn sàng.',
      quickReplies: [],
      preferences: p,
      ready,
      offTopic: false,
    };
  }

  async generate(p: Preferences): Promise<PathOutput> {
    // Trimmed so lesson titles stay within the 120-char output bound.
    const topic = (p.topic ?? 'Chủ đề của bạn').slice(0, 50);
    const lessonsPerModule = 4;
    const modules = ['Nền tảng', 'Thực hành cơ bản', 'Áp dụng vào dự án'].map((name, m) => ({
      title: name,
      covers: [m],
      lessons: Array.from({ length: lessonsPerModule }, (_, i) => ({
        title: `${topic}: ${name.toLowerCase()} (bài ${m * lessonsPerModule + i + 1})`,
      })),
    }));
    return {
      ...(await this.categorize()),
      language: 'vi',
      title: `${topic} cho người ${p.level === 'beginner' ? 'mới bắt đầu' : p.level === 'advanced' ? 'đã có nền tảng vững' : 'đã biết cơ bản'}`,
      scope: ['Nền tảng', 'Thực hành cơ bản', 'Áp dụng vào dự án', 'Nâng cao'],
      summary: `${modules.length} module${p.goal ? `, hướng tới: ${p.goal}` : ''}. Nội dung mẫu, chưa do AI soạn.`,
      modules,
    };
  }

  async lesson(input: LessonInput): Promise<LessonOutput> {
    return {
      intro: `Bài này giới thiệu ${input.lessonTitle}.`,
      sections: [
        {
          heading: 'Khái niệm',
          body: `${input.lessonTitle} là một phần của ${input.moduleTitle}.`,
          example: 'Ví dụ mẫu.',
        },
        { heading: 'Áp dụng', body: 'Thực hành từng bước nhỏ.' },
      ],
      takeaways: ['Ý chính thứ nhất', 'Ý chính thứ hai'],
      practice: 'Tự viết lại ví dụ theo cách của bạn.',
      keywords: [`${input.lessonTitle} hướng dẫn`.slice(0, 80)],
    };
  }

  /** Answer is always option 1 (index), so tests can answer right or wrong on purpose. */
  async quiz(input: QuizInput): Promise<QuizOutput> {
    return {
      questions: Array.from({ length: 5 }, (_, i) => ({
        prompt: `Câu ${i + 1} về ${input.lessonTitle}?`,
        options: ['Sai A', 'Đúng', 'Sai B', 'Sai C'],
        answer: 1,
        explanation: 'Vì nội dung bài đã nói vậy.',
      })),
    };
  }
}
