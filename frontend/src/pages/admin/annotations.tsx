import { useEffect } from 'react';
import { useRouter } from 'next/router';

const AnnotationsRedirect = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/AnnotationManagement');
  }, [router]);

  return null;
};

export default AnnotationsRedirect;
