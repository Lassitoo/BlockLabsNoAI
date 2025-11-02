import { useEffect } from 'react';
import { useRouter } from 'next/router';

const AdminIndex = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/AdminDashboard');
  }, [router]);

  return null;
};

export default AdminIndex;
