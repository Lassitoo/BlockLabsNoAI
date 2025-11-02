import { useEffect } from 'react';
import { useRouter } from 'next/router';

const DocumentsRedirect = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/DocumentManagement');
  }, [router]);

  return null;
};

export default DocumentsRedirect;
