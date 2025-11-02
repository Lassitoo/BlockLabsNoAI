import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FileText, Tag, TrendingUp } from 'lucide-react';
import { useData } from '@/contexts/DataContext';

const AdminDashboard = () => {
  const { documents } = useData();

  const stats = [
    {
      title: 'Total Users',
      value: '12',
      description: 'Active platform users',
      icon: Users,
      color: 'text-primary',
    },
    {
      title: 'Documents',
      value: documents.length.toString(),
      description: 'Uploaded documents',
      icon: FileText,
      color: 'text-success',
    },
    {
      title: 'Annotations',
      value: '0',
      description: 'Total annotations made',
      icon: Tag,
      color: 'text-warning',
    },
    {
      title: 'AI Requests',
      value: '0',
      description: 'Model API calls this month',
      icon: TrendingUp,
      color: 'text-info',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Monitor platform activity and manage system resources
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest platform events and updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              Activity log will appear here when backend is connected
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminDashboard;
