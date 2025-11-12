import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Clock, CheckCircle, Play, Eye, Trash2, CheckSquare, TrendingUp, Activity, Sparkles, Upload, ArrowLeft } from 'lucide-react';
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

// Typed API helpers
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}
interface DashboardStatsPayload { stats: DashboardStats }
interface DocumentsPayload { documents: Document[] }

// Fallback type guard for Axios errors for older Axios types
function isAxiosError(error: unknown): error is { response?: { data?: unknown }; message: string } {
  return typeof error === 'object' && error !== null && 'message' in error;
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
      const statsResponse = await api.get<ApiResponse<DashboardStatsPayload>>('/annotation/dashboard/');
      console.log("📊 Stats response:", statsResponse.data);

      if (statsResponse.data.success) {
        setStats(statsResponse.data.data.stats);
        console.log("✅ Stats set successfully");
      } else {
        console.log("❌ Stats response not successful:", statsResponse.data);
      }

      // Fetch documents
      console.log("📄 Fetching documents...");
      const docsResponse = await api.get<ApiResponse<DocumentsPayload>>('/annotation/documents/');
      console.log("📄 Documents response:", docsResponse.data);

      if (docsResponse.data.success) {
        setDocuments(docsResponse.data.data.documents);
        console.log("✅ Documents set successfully:", docsResponse.data.data.documents.length, "documents");
      } else {
        console.log("❌ Documents response not successful:", docsResponse.data);
      }
    } catch (error) {
      console.error('❌ Error in fetchDashboardData:', error);
      if (isAxiosError(error)) {
        // we narrowed it; attempt structured output
        // @ts-expect-error optional chaining if response shape unknown
        console.error('❌ Error details:', error.response?.data || error.message);
      } else {
        console.error('❌ Error details:', (error as Error).message);
      }
    } finally {
      console.log("🏁 Setting loading to false");
      setLoading(false);
    }
  };

  const handleValidateDocument = async (docId: number) => {
    try {
      console.log(`🔍 Validating document ${docId}...`);
      const response = await api.post<ApiResponse<null>>(`/validate/${docId}/`);

      if (response.data.success) {
        console.log("✅ Document validated successfully");
        fetchDashboardData();
      } else {
        console.error("❌ Validation failed:", response.data.error);
        alert(`Erreur lors de la validation: ${response.data.error}`);
      }
    } catch (error) {
      console.error('❌ Error validating document:', error);
      if (isAxiosError(error)) {
        // @ts-expect-error response maybe undefined
        console.error('❌ Error details:', error.response?.data || error.message);
      }
      alert('Erreur lors de la validation du document');
    }
  };

  const handleDeleteDocument = async (docId: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce document ? Cette action est irréversible.')) {
      return;
    }

    try {
      console.log(`🗑️ Deleting document ${docId}...`);
      const response = await api.delete<ApiResponse<null>>(`/delete/${docId}/`);

      if (response.data.success) {
        console.log("✅ Document deleted successfully");
        fetchDashboardData();
      } else {
        console.error("❌ Deletion failed:", response.data.error);
        alert(`Erreur lors de la suppression: ${response.data.error}`);
      }
    } catch (error) {
      console.error('❌ Error deleting document:', error);
      if (isAxiosError(error)) {
        // @ts-expect-error response maybe undefined
        console.error('❌ Error details:', error.response?.data || error.message);
      }
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
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/document-manager')}
            className="text-muted-foreground hover:text-foreground -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Retour
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold">
                Annotation Dashboard
              </h1>
              <p className="text-muted-foreground mt-2">
                Review and annotate documents for processing
              </p>
            </div>
            <Button 
              onClick={() => router.push('/document-manager/upload')} 
              size="sm"
              className="rounded-md px-4 bg-slate-900 text-white hover:bg-slate-800 shadow-sm"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Document
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Documents
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Documents uploaded</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-blue-50">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{stats.total_documents}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Pending Review
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Awaiting validation</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-amber-50">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{stats.to_annotate_count}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Validated
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Ready for annotation</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-green-50">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{stats.completed_count}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Documents List */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Documents</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Your recently uploaded documents
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {documents.length === 0 ? (
              <div className="text-center py-12">
                <div className="p-3 rounded-lg bg-blue-50 w-fit mx-auto mb-3">
                  <FileText className="w-12 h-12 text-blue-500" />
                </div>
                <p className="font-medium mb-1">
                  No documents available
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload and validate documents to start annotating
                </p>
                <Button
                  variant="outline"
                  onClick={() => router.push('/document-manager/upload')}
                  size="sm"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Upload First Document
                </Button>
              </div>
            ) : (
              <div className="space-y-0 divide-y">
                {documents.map((doc) => {
                  const StatusIcon = getStatusIcon(doc.status);
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between py-3.5 px-2 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="p-2 rounded-lg bg-blue-50">
                          <FileText className="w-4 h-4 text-blue-500" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-medium text-sm">
                            {doc.title}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {new Date(doc.created_at).toLocaleDateString('fr-FR', { 
                              day: 'numeric', 
                              month: 'short', 
                              year: 'numeric' 
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Status Badge */}
                        <Badge 
                          variant="secondary" 
                          className={`${
                            doc.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                            doc.status === 'in_progress' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                            doc.status === 'validated' ? 'bg-green-50 text-green-700 border-green-200' :
                            'bg-amber-50 text-amber-700 border-amber-200'
                          } text-xs px-2.5 py-0.5 min-w-[80px] justify-center`}
                        >
                          {doc.status === 'to_annotate' ? 'Pending' : 
                           doc.status === 'in_progress' ? 'In Progress' :
                           doc.status === 'completed' ? 'Completed' : 
                           'Validated'}
                        </Badge>

                        {/* Action Buttons */}
                        <div className="flex gap-1">
                          {doc.status !== 'completed' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => router.push(`/annotation/document/${doc.id}/annotate`)}
                            >
                              <Play className="w-4 h-4 text-blue-500" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => router.push(`/annotation/view/${doc.id}`)}
                          >
                            <Eye className="w-4 h-4 text-blue-500" />
                          </Button>
                          {doc.status !== 'validated' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleValidateDocument(doc.id)}
                            >
                              <CheckSquare className="w-4 h-4 text-green-500" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDeleteDocument(doc.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
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
