// CORS_ORIGIN: danh sach origin cach nhau dau phay; cho phep ky tu dai dien cho ten mien con, vd.
//   CORS_ORIGIN=http://localhost:5173,https://voucher-platform-web.vercel.app,https://*.vercel.app
// De trong = cho phep moi origin (chi nen dung khi phat trien).
// App di dong khong gui header Origin nen khong bi CORS chan.
export function corsOrigin(raw = process.env.CORS_ORIGIN): true | ((origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void) {
  const entries = (raw || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (entries.length === 0 || entries.includes('*')) return true;

  const patterns = entries.map((e) => new RegExp('^' + e.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]+') + '$'));
  return (origin, cb) => {
    // Khong co Origin (app di dong, curl, Postman) -> cho qua
    if (!origin) return cb(null, true);
    cb(null, patterns.some((p) => p.test(origin)));
  };
}
