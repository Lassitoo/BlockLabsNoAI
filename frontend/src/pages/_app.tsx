import '@/styles/globals.css';
import '@/styles/upload.css';
import type { AppProps } from 'next/app';
import { AuthProvider } from '@/contexts/AuthContext';
import { DataProvider } from '@/contexts/DataContext';
import { Toaster } from 'sonner';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <DataProvider>
        <Component {...pageProps} />
        <Toaster 
          position="top-right" 
          richColors 
          expand={false}
          duration={3000}
        />
      </DataProvider>
    </AuthProvider>
  );
}
