# Gợi ý khoá học có sẵn trước khi tạo mới — thiết kế

## Mục đích

Tạo khoá mới tốn nhiều token nhất: một lời gọi tạo khung khoá học, sau đó sinh nội dung và quiz cho từng bài. Một bản sao từ cộng đồng
(`CommunityService.copy`) dùng chung nội dung bài học với bản gốc, nên không tốn thêm lời gọi LLM nào. Mục tiêu: khi người học đã có
chủ đề + trình độ, cho họ xem những khoá công khai đang có mà gần giống, trước khi tạo một khoá mới.

## Mục tiêu / Không làm / Thất bại nếu

- Mục tiêu: bấm "Tạo lộ trình" → nếu có khoá công khai khớp, hiện tối đa 3 khoá → "Học khoá này" (sao chép) hoặc "Vẫn tạo khoá mới".
- Không làm: tự động dùng khoá có sẵn mà không hỏi người học (đã chọn hướng A); thay đổi cách chat thu thập thông tin; gom khoá trùng
  lặp hiện có.
- Thất bại nếu: tìm kiếm lỗi hoặc chậm làm người học không tạo được khoá; hiện những khoá lạc đề đến mức người học không còn tin
  vào gợi ý.

## Các hướng đã cân nhắc

1. **Hybrid search trong Typesense (đã chọn).** Thêm trường embedding tự sinh (`ts/multilingual-e5-small`, có tiếng Việt), tạo từ
   title + summary + tags; Typesense tự ghép kết quả tìm theo từ khoá và theo nghĩa (rank fusion, giống RRF). Không gọi API ngoài, không
   tốn token. Đổi lại Typesense tốn thêm RAM để chạy model, và phải tạo lại collection + chạy reindex một lần.
2. Chỉ tìm theo từ khoá bằng `search()` hiện có: không đổi gì về hạ tầng, nhưng bỏ sót khi người học diễn đạt khác tiêu đề khoá học,
   mà bỏ sót thì lại phải gọi LLM.
3. pgvector + Gemini Embedding + tự viết RRF: trùng chức năng với Typesense, thêm extension, mỗi lần tìm tốn một lời gọi API, phải viết
   nhiều code nhất.

## Thiết kế

### API

- **Schema Typesense** (`search-index.service.ts`): thêm trường `embedding` kiểu `float[]`, `embed.from: ['title', 'summary', 'tags']`,
  `model_name: 'ts/multilingual-e5-small'`. Không sửa `PathDoc`, vì Typesense tự sinh vector.
- **Collection có sẵn**: `ensureCollection` chỉ tạo khi chưa có collection, nên collection đang chạy sẽ thiếu trường này. Cách xử lý
  (đề xuất của mình): thêm trường bằng API alter collection nếu chưa có, còn không thì xoá collection rồi chạy `pnpm search:reindex`.
  Phải ghi cách làm vào README.
- **`SearchIndexService.similar({ q, level, limit })`**: hybrid search với
  - `query_by: 'title,tags,summary,title_plain,tags_plain,embedding'`
  - `filter_by: level:=<level>`
  - `vector_query: 'embedding:([], distance_threshold: X)'`, với X là một hằng số có comment, chỉnh bằng các truy vấn mẫu
  - `rank_fusion_alpha` để mặc định trừ khi chỉnh thấy cần đổi
  - Hàm `search()` hiện có giữ nguyên.
- **`GET /learning-paths/conversations/:id/matches`**: đọc conversation đang mở của người gọi, yêu cầu `ready`, rồi tìm theo
  `preferences.topic` + `level`. Kết quả lọc trong Postgres giống `CommunityService.list` (`PUBLIC_PATH`, không lấy khoá đang hiện của
  chính người gọi), trả về `CommunityPath[]` tối đa 3 khoá. Đặt hàm trong `CommunityService`, vì nó đã có `COLUMNS`/`toPath`.
- Không có endpoint copy mới: dùng `POST community/:id/copy` hiện có, kể cả trường hợp 409 `ALREADY_LEARNING`.

### App (`new-path.tsx`)

- "Tạo lộ trình" → gọi `matches`. Danh sách rỗng hoặc **lỗi bất kỳ** → chạy luôn `generate()` như hiện tại (tìm kiếm không bao giờ được
  chặn việc tạo khoá).
- Có kết quả → hiện danh sách: mỗi khoá có tiêu đề, số bài, số lượt sao chép, và nút "Học khoá này". Dưới cùng có nút
  "Vẫn tạo khoá mới". Dùng lại thẻ khoá học của màn cộng đồng nếu có sẵn.
- "Học khoá này" → `copyCommunityPath` (đã xử lý `ALREADY_LEARNING`) → `startConversation()` để đóng cuộc chat cũ → mở khoá học đó.
- Khoá đã sao chép rồi (`copiedPathId` khác null): đổi nút thành "Mở khoá học".

### Kiểm thử

- Unit: `similar()` tạo ra đúng tham số tìm kiếm (bộ lọc level, vector query).
- E2E: tạo một khoá công khai, mở cuộc chat có cùng topic/level → `matches` trả về khoá đó; khác level → rỗng; cuộc chat chưa ready → 409.
  Môi trường e2e cần Typesense tải được model (lần đầu cần mạng).

## Những phần để người làm tự quyết

- Giá trị `distance_threshold`, chỉnh bằng vài cặp truy vấn mẫu, cả khớp lẫn không khớp.
- Vị trí chính xác và style của danh sách khoá khớp trên màn chat.

## Rủi ro

- Typesense tải model từ Hugging Face ở lần đầu dùng; máy chủ hoặc CI không có mạng thì không tạo được collection.
- RAM của Typesense tăng thêm khoảng vài trăm MB.
