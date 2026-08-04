# Lật Hình Cùng Nhau 💕 — Web App (Lật hình + Voice call)

Chạy hoàn toàn trên trình duyệt (Safari/Chrome trên điện thoại), không cần Mac, không cần Xcode, không cần lên App Store.

## Cấu trúc
```
memory-voice-webapp/
  server/
    index.js       <- server Node.js (đồng bộ game + tín hiệu voice call)
    package.json
  public/
    index.html
    style.css
    game.js         <- toàn bộ logic game + WebRTC
```

## Cách hoạt động
- **Đồng bộ nước lật thẻ**: qua WebSocket, server chỉ đóng vai trò "chuyển tiếp" tin nhắn giữa 2 người trong cùng phòng
- **Voice call**: qua **WebRTC** — sau khi 2 người vào cùng phòng, trình duyệt tự kết nối **trực tiếp với nhau** (server chỉ giúp trao đổi thông tin kết nối ban đầu, không truyền audio qua server) → độ trễ thấp, mượt
- **Phòng chơi**: chỉ cần cả 2 gõ **cùng một mã phòng** (tự đặt, ví dụ "YEU2024") là vào chung phòng

## Cách chạy thử trên máy tính (Windows/Linux đều được)

Cần cài **Node.js** trước (tải tại https://nodejs.org, chọn bản LTS).

```bash
cd memory-voice-webapp/server
npm install
npm start
```

Sau đó mở trình duyệt vào `http://localhost:3000` để test giao diện (test voice call thật cần deploy lên mạng vì cần HTTPS — xem bước dưới).

## Deploy miễn phí lên internet (để 2 điện thoại truy cập được)

Khuyên dùng **Render.com** (có gói free, tự cấp HTTPS — bắt buộc phải có HTTPS thì trình duyệt mới cho phép dùng microphone):

1. Tạo tài khoản tại https://render.com (đăng nhập bằng GitHub cũng được)
2. Đưa code lên GitHub:
   - Tạo 1 repo mới, push toàn bộ thư mục `memory-voice-webapp` lên
3. Trên Render: **New** → **Web Service** → chọn repo vừa tạo
4. Cấu hình:
   - **Root Directory**: `server` (vì package.json nằm trong đó)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance type**: Free
5. Bấm Deploy, chờ khoảng 1-2 phút
6. Render sẽ cho bạn 1 link dạng `https://ten-app-cua-ban.onrender.com`
7. Gửi link đó cho người yêu, cả 2 cùng mở link, nhập chung 1 mã phòng, xong!

**Lưu ý về gói free của Render**: server sẽ "ngủ" sau ~15 phút không ai truy cập, lần vào lại đầu tiên sẽ hơi chậm (10-30 giây để server "thức dậy"). Nếu thấy phiền, có thể nâng cấp gói trả phí (7$/tháng) hoặc dùng dịch vụ khác như Railway/Fly.io.

## Cách chơi
1. Cả 2 người mở cùng 1 link
2. Nhập cùng một mã phòng (tự nghĩ ra, ví dụ tên kỷ niệm nào đó)
3. Trình duyệt sẽ xin quyền **microphone** — bấm Allow/Cho phép
4. Người vào phòng **trước** sẽ tự động chia bài và đi trước
5. Lật đúng cặp thì được lật tiếp, sai thì đổi lượt
6. Có nút mute mic và nút chơi lại

## Có thể tùy chỉnh thêm
- Đổi emoji trong `SYMBOLS` ở đầu file `game.js` thành ảnh kỷ niệm riêng của 2 người
- Đổi màu sắc trong `style.css` (biến gradient ở đầu file)
- Thêm nhạc nền, hiệu ứng confetti khi thắng
- Thêm ô chat text bên cạnh voice call

## Nếu muốn thử nhanh không cần deploy
Có thể dùng **ngrok** (https://ngrok.com) để tạo link tạm thời trỏ vào server đang chạy trên máy bạn — phù hợp để test nhanh trong vài giờ, nhưng deploy lên Render vẫn tiện hơn cho việc dùng lâu dài.
