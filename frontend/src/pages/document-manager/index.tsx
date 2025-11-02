// Rediriger vers le DocumentManagerDashboard
import { useEffect } from 'react';
import { useRouter } from 'next/router';

const DocumentManagerIndex = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/document-manager/DocumentManagerDashboard');
  }, [router]);

  return null;
};

export default DocumentManagerIndex;