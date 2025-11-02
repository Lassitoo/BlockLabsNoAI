import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, CheckCircle, XCircle, AlertCircle, Brain } from 'lucide-react';

interface MetadataStats {
  avg_score: number;
  total_feedbacks: number;
  improvement: number;
}

interface FieldStats {
  [key: string]: {
    correct: number;
    wrong: number;
    missed: number;
    precision: number;
  };
}

interface DocumentStats {
  [key: string]: {
    title: string;
    correct: number;
    wrong: number;
    missed: number;
    precision: number;
  };
}

const MetadataLearning = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [noData, setNoData] = useState(false);
  const [stats, setStats] = useState<MetadataStats | null>(null);
  const [fieldStats, setFieldStats] = useState<FieldStats>({});
  const [documentStats, setDocumentStats] = useState<DocumentStats>({});

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.push('/login');
      return;
    }

    fetchMetadataLearning();
  }, [user, router]);

  const fetchMetadataLearning = async () => {
  try {
    const response = await axios.get<{
      success: boolean;
      no_data: boolean;
      stats: MetadataStats;
      field_stats: FieldStats;
      document_stats: DocumentStats;
    }>('http://localhost:8000/api/admin/metadata-learning/', {
      withCredentials: true
    });

    if (response.data.success) {
      if (response.data.no_data) {
        setNoData(true);
      } else {
        setStats(response.data.stats);
        setFieldStats(response.data.field_stats);
        setDocumentStats(response.data.document_stats);
      }
    }
  } catch (error) {
    console.error('Error fetching metadata learning:', error);
  } finally {
    setLoading(false);
  }
};

  if (!user || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (noData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
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
            <button
              onClick={() => router.push('/admin/AIPerformanceHub')}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-blue-600"
            >
              ← Back to AI Performance
            </button>
          </div>
        </nav>
        <div className="max-w-7xl mx-auto p-6">
          <Card className="bg-white border-slate-200">
            <CardContent className="p-12 text-center">
              <Brain className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">No Learning Data Yet</h3>
              <p className="text-slate-600">Upload and correct documents to see AI learning statistics</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

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
              onClick={() => router.push('/admin/AIPerformanceHub')}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors"
            >
              ← Back to AI Performance
            </button>
            <span className="text-slate-600 text-sm">Welcome, {user.name}</span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Metadata AI Learning</h1>
          <p className="text-slate-600 mt-2">Monitor AI metadata extraction performance and improvements</p>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Global Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-4xl font-bold text-blue-600">{stats?.avg_score.toFixed(1)}%</p>
                  <p className="text-sm text-slate-600 mt-1">Average AI Precision</p>
                </div>
                <CheckCircle className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-200 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Total Feedbacks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-4xl font-bold text-purple-600">{stats?.total_feedbacks}</p>
                  <p className="text-sm text-slate-600 mt-1">Corrections Processed</p>
                </div>
                <Brain className="w-8 h-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card className={`bg-gradient-to-br ${
            (stats?.improvement || 0) >= 0 ? 'from-green-50 to-white border-green-200' : 'from-red-50 to-white border-red-200'
          } shadow-lg`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">AI Improvement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <p className={`text-4xl font-bold ${(stats?.improvement || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(stats?.improvement || 0) >= 0 ? '+' : ''}{stats?.improvement.toFixed(1)}%
                  </p>
                  <p className="text-sm text-slate-600 mt-1">
                    {(stats?.total_feedbacks || 0) < 2 ? 'Not enough data' : 'Since first feedback'}
                  </p>
                </div>
                {(stats?.improvement || 0) >= 0 ? (
                  <TrendingUp className="w-8 h-8 text-green-600" />
                ) : (
                  <TrendingDown className="w-8 h-8 text-red-600" />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Field Performance Table */}
        <Card className="bg-white border-slate-200 shadow-lg mb-8">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-slate-900">Performance by Field</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Field</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-green-600">Correct</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-red-600">Errors</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-orange-600">Missed</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Precision</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(fieldStats).map(([field, data]) => (
                    <tr key={field} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-900 capitalize">{field}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100 text-green-700 font-bold">
                          {data.correct}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-700 font-bold">
                          {data.wrong}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-orange-100 text-orange-700 font-bold">
                          {data.missed}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all"
                              style={{ width: `${data.precision}%` }}
                            />
                          </div>
                          <span className="font-bold text-slate-900 w-12 text-right">{data.precision}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Document Performance Table */}
        <Card className="bg-white border-slate-200 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-slate-900">Precision by Document</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Document</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-green-600">Correct</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-red-600">Errors</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-orange-600">Missed</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Precision</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(documentStats).map(([docId, data]) => (
                    <tr key={docId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-900 max-w-xs truncate">{data.title}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100 text-green-700 font-bold">
                          {data.correct}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-700 font-bold">
                          {data.wrong}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-orange-100 text-orange-700 font-bold">
                          {data.missed}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all"
                              style={{ width: `${data.precision}%` }}
                            />
                          </div>
                          <span className="font-bold text-slate-900 w-12 text-right">{data.precision}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MetadataLearning;