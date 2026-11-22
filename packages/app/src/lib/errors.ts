import { ApiError } from '@/lib/api';

/** Vietnamese copy for API error codes (server `code` or a failed job's `errorCode`). */
const COPY: Record<string, string> = {
  AI_UNAVAILABLE: 'AI đang bận, thử lại sau ít phút.',
  AI_INVALID_OUTPUT: 'AI chưa soạn được nội dung. Thử lại nhé.',
  TURN_IN_PROGRESS: 'Đợi AI trả lời xong đã nhé.',
  CONVERSATION_LIMIT: 'Cuộc trò chuyện đã dài quá. Bắt đầu lại nhé?',
  CONVERSATION_CLOSED: 'Lộ trình này đã bắt đầu. Hãy tạo lộ trình mới.',
  TOPIC_REJECTED: 'Mình không thể soạn lộ trình cho chủ đề này.',
  QUEUE_UNAVAILABLE: 'Hệ thống đang bận, thử lại sau ít phút.',
  PATH_NOT_FOUND: 'Không tìm thấy lộ trình này.',
  LESSON_NOT_FOUND: 'Không tìm thấy bài học này.',
  LESSON_NOT_READY: 'Bài học chưa có nội dung.',
  PATH_NOT_STARTED: 'Hãy bắt đầu lộ trình trước.',
  QUIZ_NOT_FOUND: 'Bài kiểm tra chưa có.',
  INVALID_ANSWERS: 'Hãy trả lời tất cả các câu.',
  WRONG_PASSWORD: 'Mật khẩu không đúng.',
  INTERNAL: 'Có lỗi xảy ra. Thử lại nhé.',
};

/** One user-facing sentence for any thrown value: API error, failed job code, or network failure. */
export function describeError(e: unknown): string {
  const code = e instanceof ApiError ? e.code : typeof e === 'string' ? e : (e as { code?: string } | null)?.code;
  if (code && COPY[code]) return COPY[code];
  if (e instanceof ApiError) {
    if (e.status === 429) return 'Bạn thao tác hơi nhanh, thử lại sau một lúc.';
    if (e.status >= 500) return 'Máy chủ đang gặp sự cố. Thử lại sau.';
  }
  if (e instanceof TypeError) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
  return 'Có lỗi xảy ra. Kiểm tra kết nối rồi thử lại.';
}
