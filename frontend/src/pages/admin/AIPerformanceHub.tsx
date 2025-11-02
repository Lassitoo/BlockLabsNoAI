import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Brain, FileJson, Tag, ArrowRight } from 'lucide-react';

const AIPerformanceHub = () => {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !=='admin') {
      router.push('/login');
      return;
    }
  }, [user, router]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Navbar */}
      <nav className="w-full px-6 py-4 bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">B</span>
            </div>
            <span className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              BlockLabs Admin
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/admin/AdminDashboard')}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors"
            >
              ← Back to Dashboard
            </button>
            <span className="text-slate-600 text-sm">Welcome, {user.name}</span>
            <button
              onClick={() => router.push('/logout')}
              className="text-slate-600 hover:text-slate-900 text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">AI Performance Hub</h1>
          <p className="text-slate-600 mt-2">Monitor and analyze AI system performance</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Metadata AI Performance - Available */}
          <Card 
            className="bg-gradient-to-br from-purple-50 to-white border-purple-200 shadow-lg hover:shadow-xl transition-all cursor-pointer group"
            onClick={() => router.push('/admin/MetadataLearning')}
          >
            <CardHeader className="pb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-lg flex items-center justify-center mb-4">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-xl font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
                Metadata AI
              </CardTitle>
              <CardDescription className="text-slate-600">
                Analyze metadata extraction performance and accuracy
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                  Available
                </span>
                <ArrowRight className="w-5 h-5 text-purple-600 group-hover:translate-x-1 transition-transform" />
              </div>
            </CardContent>
          </Card>

          {/* JSON AI Performance - Coming Soon */}
          <Card className="bg-gradient-to-br from-slate-50 to-white border-slate-200 shadow-lg opacity-60 cursor-not-allowed">
            <CardHeader className="pb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-lg flex items-center justify-center mb-4">
                <FileJson className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-xl font-bold text-slate-900">
                JSON AI
              </CardTitle>
              <CardDescription className="text-slate-600">
                Monitor JSON generation and validation accuracy
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                Coming Soon
              </span>
            </CardContent>
          </Card>

          {/* Annotations AI Performance - Coming Soon */}
          <Card className="bg-gradient-to-br from-slate-50 to-white border-slate-200 shadow-lg opacity-60 cursor-not-allowed">
            <CardHeader className="pb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-lg flex items-center justify-center mb-4">
                <Tag className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-xl font-bold text-slate-900">
                Annotations AI
              </CardTitle>
              <CardDescription className="text-slate-600">
                Track automatic annotation quality and precision
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                Coming Soon
              </span>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AIPerformanceHub;