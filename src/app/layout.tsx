import type { Metadata } from 'next';
import './globals.css';
import './stitch.css';
export const metadata: Metadata = {title:'EduMind AI · Your learning companion',description:'Turn study materials into cited explanations, adaptive quizzes and a personal study plan.'};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
