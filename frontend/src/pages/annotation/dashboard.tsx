import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Clock, CheckCircle, Play, Eye, Trash2, CheckSquare } from 'lucide-react';
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
        // Refresh the documents list
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
        // Refresh the documents list
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
          <div className="text-lg">Loading...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Annotation Dashboard</h1>
            <p className="text-muted-foreground mt-2">
              Review and annotate documents for processing
            </p>
          </div>
          <Button onClick={() => router.push('/document-manager/upload')} size="lg">
            <FileText className="w-4 h-4 mr-2" />
            New Document
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Documents
                </CardTitle>
                <FileText className="w-5 h-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.total_documents}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  To Annotate
                </CardTitle>
                <Clock className="w-5 h-5 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.to_annotate_count}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  In Progress
                </CardTitle>
                <Play className="w-5 h-5 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.in_progress_count}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Completed
                </CardTitle>
                <CheckCircle className="w-5 h-5 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.completed_count}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Documents List */}
        <Card>
          <CardHeader>
            <CardTitle>Documents for Annotation</CardTitle>
            <CardDescription>
              Documents ready for annotation and review
            </CardDescription>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium mb-2">No documents available</p>
                <p className="text-sm">Upload and validate documents to start annotating</p>
                <Button
                  className="mt-4"
                  onClick={() => router.push('/document-manager/upload')}
                >
                  Upload First Document
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {documents.map((doc) => {
                  const StatusIcon = getStatusIcon(doc.status);
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <FileText className="w-8 h-8 text-primary" />
                        <div className="flex-1">
                          <h3 className="font-medium text-lg">{doc.title}</h3>
                          <p className="text-sm text-muted-foreground">{doc.file_name}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-xs text-muted-foreground">
                              Pages: {doc.annotated_pages}/{doc.total_pages}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              By: {doc.uploaded_by}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(doc.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Progress Bar */}
                        <div className="w-24">
                          <div className="text-xs text-muted-foreground mb-1">
                            {doc.progress_percentage}%
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all"
                              style={{ width: `${doc.progress_percentage}%` }}
                            />
                          </div>
                        </div>

                        {/* Status Badge */}
                        <Badge className={getStatusColor(doc.status)}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {doc.status.replace('_', ' ')}
                        </Badge>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/annotation/view/${doc.id}`)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                          {doc.status !== 'completed' && (
                            <Button
                              size="sm"
                              onClick={() => router.push(`/annotation/document/${doc.id}/annotate`)}
                            >
                              <Play className="w-4 h-4 mr-1" />
                              Annotate
                            </Button>
                          )}
                          {doc.status !== 'validated' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleValidateDocument(doc.id)}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <CheckSquare className="w-4 h-4 mr-1" />
                              Validate
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete
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