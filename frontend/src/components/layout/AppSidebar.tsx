import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  FileText,
  Users,
  BarChart3,
  Upload,
  Tag,
  BookOpen,
  LogOut,
  Layers,
  Edit3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AppSidebar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const getDashboardUrl = () => {
    switch (user?.role) {
      case 'admin':
        return '/admin';
      case 'document_manager':
        return '/document-manager';
      case 'expert':
        return '/expert';
      default:
        return '/';
    }
  };

  const getMenuItems = () => {
    switch (user?.role) {
      case 'admin':
        return [
          { title: 'Dashboard', url: '/admin', icon: LayoutDashboard },
          { title: 'Users', url: '/admin/users', icon: Users },
          { title: 'Documents', url: '/admin/documents', icon: FileText },
          { title: 'Annotations', url: '/admin/annotations', icon: Tag },
          { title: 'AI Metrics', url: '/admin/metrics', icon: BarChart3 },
        ];
      case 'document_manager':
        return [
          { title: 'Dashboard', url: '/document-manager', icon: LayoutDashboard },
          { title: 'Documents', url: '/document-manager', icon: FileText },
          { title: 'Annotation', url: '/annotation/dashboard', icon: Edit3 },
        ];
      case 'expert':
        return [
          { title: 'Dashboard', url: '/expert', icon: LayoutDashboard },
          { title: 'Evaluation', url: '/expert/evaluation', icon: BarChart3 },
          { title: 'Documents', url: '/expert/documents', icon: BookOpen },
        ];
      default:
        return [];
    }
  };

  const menuItems = getMenuItems();
  const dashboardUrl = getDashboardUrl();

  // ✅ New function for logout + redirect
  const handleLogout = async () => {
    try {
      await logout(); // call logout from AuthContext
      router.push('/login'); // redirect to login page
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b p-4">
        <Link href={dashboardUrl} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <Layers className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-bold text-lg">BlockLabs</h2>
            <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link
                      href={item.url}
                      className={
                        router.pathname === item.url
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : ''
                      }
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <div className="space-y-3">
          <div className="text-sm">
            <p className="font-medium">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          {/* ✅ Use handleLogout here */}
          <Button variant="outline" size="sm" onClick={handleLogout} className="w-full">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
