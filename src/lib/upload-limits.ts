// Leave room for multipart headers below Vercel's request payload limit.
const configured=Number(process.env.NEXT_PUBLIC_UPLOAD_MAX_MB||8);
export const uploadMaxMb=Number.isFinite(configured)&&configured>0?Math.min(configured,8):8;
export const uploadMaxBytes=uploadMaxMb*1_000_000;
