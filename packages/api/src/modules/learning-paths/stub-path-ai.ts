import { Injectable } from '@nestjs/common';
import type {
  ChatMessageDto,
  ChatReply,
  Level,
  PreferencesDto,
} from './dto/learning-path.dto.js';
import { PathAi } from './path-ai.js';

const LEVEL_REPLIES = ['Cơ bản', 'Trung cấp', 'Nâng cao'];
const TIME_REPLIES = ['15 phút', '30 phút', '60 phút'];

function parseLevel(text: string): Level | undefined {
  const t = text.toLowerCase();
  if (/cơ bản|mới|beginner/.test(t)) return 'beginner';
  if (/trung|intermediate/.test(t)) return 'intermediate';
  if (/nâng cao|advanced/.test(t)) return 'advanced';
}

function parseMinutes(text: string): number | undefined {
  const n = /(\d{1,3})\s*(phút|p\b|min)?/i.exec(text)?.[1];
  return n && +n >= 5 && +n <= 240 ? +n : undefined;
}

/** Deterministic slot filling, no model: topic, then level, then daily time, then an optional goal. */
@Injectable()
export class StubPathAi extends PathAi {
  async chat(
    messages: ChatMessageDto[],
    prefs: PreferencesDto,
  ): Promise<ChatReply> {
    const p = { ...prefs };
    const last =
      messages.findLast((m) => m.role === 'user')?.content.trim() ?? '';
    // The goal question is asked once the required fields are known; any answer to it (a goal or a skip) completes the brief.
    const goalAnswered = !!(last && p.topic && p.level && p.dailyMinutes);
    if (last) {
      if (!p.topic) p.topic = last.slice(0, 200);
      else if (!p.level) p.level = parseLevel(last);
      else if (!p.dailyMinutes) p.dailyMinutes = parseMinutes(last);
      else if (!p.goal && !/^(không|bỏ qua)/i.test(last))
        p.goal = last.slice(0, 300);
    }
    const ready = goalAnswered;
    if (!p.topic)
      return {
        reply: 'Bạn muốn học chủ đề gì?',
        quickReplies: [],
        preferences: p,
        ready,
      };
    if (!p.level)
      return {
        reply: `Bạn đang ở trình độ nào với "${p.topic}"?`,
        quickReplies: LEVEL_REPLIES,
        preferences: p,
        ready,
      };
    if (!p.dailyMinutes)
      return {
        reply: 'Mỗi ngày bạn học được bao lâu?',
        quickReplies: TIME_REPLIES,
        preferences: p,
        ready,
      };
    if (!ready)
      return {
        reply: 'Bạn có mục tiêu cụ thể không? Ví dụ: dùng cho công việc, thi cử, hay chỉ tò mò.',
        quickReplies: ['Không có mục tiêu cụ thể'],
        preferences: p,
        ready,
      };
    return {
      reply: 'Mình đã có đủ thông tin. Bấm "Tạo lộ trình" khi bạn sẵn sàng.',
      quickReplies: [],
      preferences: p,
      ready,
    };
  }

  async generate(p: PreferencesDto) {
    const topic = p.topic ?? 'Chủ đề của bạn';
    const lessonsPerModule = p.dailyMinutes && p.dailyMinutes <= 15 ? 3 : 4;
    const modules = ['Nền tảng', 'Thực hành cơ bản', 'Áp dụng vào dự án'].map(
      (name, m) => ({
        title: name,
        lessons: Array.from({ length: lessonsPerModule }, (_, i) => ({
          title: `${topic}: ${name.toLowerCase()} (bài ${m * lessonsPerModule + i + 1})`,
        })),
      }),
    );
    return {
      title: `${topic} cho người ${p.level === 'beginner' ? 'mới bắt đầu' : p.level === 'advanced' ? 'đã có nền tảng vững' : 'đã biết cơ bản'}`,
      summary: `${modules.length} module, mỗi ngày khoảng ${p.dailyMinutes ?? 30} phút${p.goal ? `, hướng tới: ${p.goal}` : ''}. Nội dung mẫu, chưa do AI soạn.`,
      modules,
    };
  }
}
