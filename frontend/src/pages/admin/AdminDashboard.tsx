import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FileText, Tag, TrendingUp, Activity, Shield, BarChart3, ArrowUpRight } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { useRouter } from 'next/router';

const AdminDashboard = () => {
  const router = useRouter();
  const { documents } = useData();

  const stats = [
    {
      title: 'Users',
      value: '0',
      description: 'Active users',
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      title: 'Documents',
      value: documents.length.toString(),
      description: 'Uploaded documents',
      icon: FileText,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      title: 'Annotations',
      value: '1,247',
      description: 'Total annotations made',
      icon: Tag,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50'
    },
    {
      title: 'AI Requests',
      value: '3,456',
      description: 'Model API calls this month',
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
  ];

  const quickActions = [
    {
      title: 'User Management',
      description: 'Manage users and permissions',
      icon: Users,
      color: 'from-purple-500 to-purple-600',
      route: '/admin/users',
    },
    {
      title: 'Document Management',
      description: 'View and manage documents',
      icon: FileText,
      color: 'from-blue-500 to-blue-600',
      route: '/admin/documents',
    },
    {
      title: 'Annotation Types',
      description: 'Configure annotation types',
      icon: Tag,
      color: 'from-amber-500 to-amber-600',
      route: '/admin/annotations',
    },
    {
      title: 'AI Performance',
      description: 'Monitor AI metrics',
      icon: BarChart3,
      color: 'from-green-500 to-green-600',
      route: '/admin/metrics',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Admin Dashboard
            </h1>
            <p className="text-muted-foreground mt-2 text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600" />
              Monitor platform activity and manage system resources
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
            <Activity className="w-5 h-5 text-purple-600 animate-pulse" />
            <span className="text-sm font-medium text-purple-700">System Online</span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <Card key={stat.title} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{stat.description}</p>
                </div>
                <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 border-b">
            <CardTitle className="text-xl">Quick Actions</CardTitle>
            <CardDescription className="mt-1">Manage platform components</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {quickActions.map((action) => (
                <button
                  key={action.title}
                  onClick={() => router.push(action.route)}
                  className="group p-6 rounded-xl border-2 hover:border-purple-200 hover:bg-purple-50/50 transition-all duration-200 text-left"
                >
                  <div className={`inline-flex p-3 rounded-lg bg-gradient-to-r ${action.color} mb-4`}>
                    <action.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-purple-600 transition-colors">
                    {action.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {action.description}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Recent Activity</CardTitle>
                <CardDescription className="mt-1">Latest platform events and updates</CardDescription>
              </div>
              <Activity className="w-5 h-5 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[
                { user: 'John Doe', action: 'uploaded a document', time: '2 minutes ago', icon: FileText, color: 'text-blue-600' },
                { user: 'Jane Smith', action: 'created 15 annotations', time: '5 minutes ago', icon: Tag, color: 'text-amber-600' },
                { user: 'Admin', action: 'added new user', time: '10 minutes ago', icon: Users, color: 'text-purple-600' },
                { user: 'AI Model', action: 'processed document', time: '15 minutes ago', icon: TrendingUp, color: 'text-green-600' },
              ].map((activity, index) => (
                <div key={index} className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className={`p-2 rounded-lg bg-gray-100`}>
                    <activity.icon className={`w-5 h-5 ${activity.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">
                      <span className="font-semibold">{activity.user}</span> {activity.action}
                    </p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminDashboard;
