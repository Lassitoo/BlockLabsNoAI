import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function ExpertDashboard() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to evaluation page
    router.replace('/expert/evaluation');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Redirection vers Évaluation...</p>
      </div>
    </div>
  );
}
