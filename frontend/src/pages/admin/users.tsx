import { useEffect } from 'react';
import { useRouter } from 'next/router';

const UsersRedirect = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/UserManagement');
  }, [router]);

  return null;
};

export default UsersRedirect;
