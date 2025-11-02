import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Clock, CheckCircle, Play, Eye, Trash2, CheckSquare, TrendingUp, Activity, Sparkles } from 'lucide-react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import axios from 'axios';

interface Document {
  id: number;
  title: string;
  file_name: string;
  total_pages: number;
  annotated_pages: number;
  progress_percentage: number;
  status: string;
  uploaded_by: string;
  validated_at?: string;
  created_at: string;
}

interface DashboardStats {
  total_documents: number;
  total_pages: number;
  annotated_pages: number;
  to_annotate_count: number;
  in_progress_count: number;
  completed_count: number;
  avg_annotated_pages_per_doc: number;
}

const AnnotationDashboard = () => {
  console.log("🚀 AnnotationDashboard component mounted!");

  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  console.log("📊 Initial state:", { documents: documents.length, stats: !!stats, loading });

  // Create axios instance with proper configuration
  const api = axios.create({
    baseURL: 'http://localhost:8000/api',
    withCredentials: true,
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  // Add CSRF interceptor
  api.interceptors.request.use((config) => {
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift();
      return null;
    };
    const csrfToken = getCookie('csrftoken');
    if (csrfToken) {
      config.headers = config.headers || {};
      config.headers['X-CSRFToken'] = csrfToken;
    }
    return config;
  });

  useEffect(() => {
    console.log("🔄 useEffect triggered, calling fetchDashboardData");
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      console.log("🔍 Starting fetchDashboardData...");
      setLoading(true);

      // Fetch stats
      console.log("📊 Fetching stats...");
      const statsResponse = await api.get('/annotation/dashboard/');
      console.log("📊 Stats response:", statsResponse.data);

      if (statsResponse.data.success) {
        setStats(statsResponse.data.data.stats);
        console.log("✅ Stats set successfully");
      } else {
        console.log("❌ Stats response not successful:", statsResponse.data);
      }

      // Fetch documents
      console.log("📄 Fetching documents...");
      const docsResponse = await api.get('/annotation/documents/');
      console.log("📄 Documents response:", docsResponse.data);

      if (docsResponse.data.success) {
        setDocuments(docsResponse.data.data.documents);
        console.log("✅ Documents set successfully:", docsResponse.data.data.documents.length, "documents");
      } else {
        console.log("❌ Documents response not successful:", docsResponse.data);
      }
    } catch (error) {
      console.error('❌ Error in fetchDashboardData:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
    } finally {
      console.log("🏁 Setting loading to false");
      setLoading(false);
    }
  };

  const handleValidateDocument = async (docId: number) => {
    try {
      console.log(`🔍 Validating document ${docId}...`);
      const response = await api.post(`/validate/${docId}/`);

      if (response.data.success) {
        console.log("✅ Document validated successfully");
        fetchDashboardData();
      } else {
        console.error("❌ Validation failed:", response.data.error);
        alert(`Erreur lors de la validation: ${response.data.error}`);
      }
    } catch (error) {
      console.error('❌ Error validating document:', error);
      alert('Erreur lors de la validation du document');
    }
  };

  const handleDeleteDocument = async (docId: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce document ? Cette action est irréversible.')) {
      return;
    }

    try {
      console.log(`🗑️ Deleting document ${docId}...`);
      const response = await api.delete(`/delete/${docId}/`);

      if (response.data.success) {
        console.log("✅ Document deleted successfully");
        fetchDashboardData();
      } else {
        console.error("❌ Deletion failed:", response.data.error);
        alert(`Erreur lors de la suppression: ${response.data.error}`);
      }
    } catch (error) {
      console.error('❌ Error deleting document:', error);
      alert('Erreur lors de la suppression du document');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'validated':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return CheckCircle;
      case 'in_progress':
        return Clock;
      default:
        return FileText;
    }
  };

  if (loading) {
    console.log("⏳ Showing loading state, loading =", loading);
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Chargement...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-teal-600 bg-clip-text text-transparent">
              Annotation Dashboard
            </h1>
            <p className="text-muted-foreground mt-2 text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-green-600" />
              Review and annotate documents for processing
            </p>
          </div>
          <Button 
            onClick={() => router.push('/document-manager/upload')} 
            size="lg"
            className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 shadow-lg hover:shadow-xl transition-all"
          >
            <FileText className="w-4 h-4 mr-2" />
            New Document
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Documents
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">All documents</p>
                </div>
                <div className="p-3 rounded-xl bg-blue-50">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div className="text-4xl font-bold">{stats.total_documents}</div>
                  <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
                    <TrendingUp className="w-4 h-4" />
                    +12%
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    To Annotate
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Pending work</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50">
                  <Clock className="w-6 h-6 text-amber-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div className="text-4xl font-bold">{stats.to_annotate_count}</div>
                  <div className="flex items-center gap-1 text-amber-600 text-sm font-medium">
                    <Activity className="w-4 h-4" />
                    Active
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    In Progress
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Currently working</p>
                </div>
                <div className="p-3 rounded-xl bg-cyan-50">
                  <Play className="w-6 h-6 text-cyan-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div className="text-4xl font-bold">{stats.in_progress_count}</div>
                  <div className="flex items-center gap-1 text-cyan-600 text-sm font-medium">
                    <Activity className="w-4 h-4 animate-pulse" />
                    Live
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Completed
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Finished work</p>
                </div>
                <div className="p-3 rounded-xl bg-green-50">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div className="text-4xl font-bold">{stats.completed_count}</div>
                  <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
                    <TrendingUp className="w-4 h-4" />
                    +18%
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Documents List */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-green-50 to-teal-50 border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Documents for Annotation</CardTitle>
                <CardDescription className="mt-1">
                  Documents ready for annotation and review
                </CardDescription>
              </div>
              <Activity className="w-5 h-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {documents.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium text-muted-foreground mb-2">
                  No documents available
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload and validate documents to start annotating
                </p>
                <Button
                  onClick={() => router.push('/document-manager/upload')}
                  className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Upload First Document
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => {
                  const StatusIcon = getStatusIcon(doc.status);
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-5 rounded-xl border-2 hover:border-green-200 hover:bg-green-50/50 transition-all duration-200 group"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="p-3 rounded-lg bg-green-50 group-hover:bg-green-100 transition-colors">
                          <FileText className="w-7 h-7 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg text-gray-900 group-hover:text-green-600 transition-colors">
                            {doc.title}
                          </h3>
                          <p className="text-sm text-muted-foreground">{doc.file_name}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              Pages: {doc.annotated_pages}/{doc.total_pages}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              By: {doc.uploaded_by}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(doc.created_at).toLocaleDateString('fr-FR', { 
                                day: 'numeric', 
                                month: 'long', 
                                year: 'numeric' 
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Progress Bar */}
                        <div className="w-32">
                          <div className="text-xs font-medium text-gray-700 mb-1.5">
                            {doc.progress_percentage}%
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                              className="bg-gradient-to-r from-green-500 to-teal-500 h-2.5 rounded-full transition-all"
                              style={{ width: `${doc.progress_percentage}%` }}
                            />
                          </div>
                        </div>

                        {/* Status Badge */}
                        <Badge className={`${getStatusColor(doc.status)} px-3 py-1.5`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {doc.status.replace('_', ' ')}
                        </Badge>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/annotation/view/${doc.id}`)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                          {doc.status !== 'completed' && (
                            <Button
                              size="sm"
                              onClick={() => router.push(`/annotation/document/${doc.id}/annotate`)}
                              className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700"
                            >
                              <Play className="w-4 h-4 mr-1" />
                              Annotate
                            </Button>
                          )}
                          {doc.status !== 'validated' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleValidateDocument(doc.id)}
                              className="text-green-600 hover:text-green-700 hover:bg-green-100"
                            >
                              <CheckSquare className="w-4 h-4 mr-1" />
                              Validate
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AnnotationDashboard;
