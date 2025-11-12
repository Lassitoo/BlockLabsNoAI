import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Activity, CheckCircle } from 'lucide-react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import axios from '@/lib/axios';

interface Document {
  id: number;
  title: string;
  file: { name: string };
  expert_ready_at: string;
  total_pages: number;
  validated_pages: number;
  annotation_count: number;
  pending_annotations: number;
  annotator: { username: string };
}

interface DashboardStatsResponse {
  success: boolean;
  total_annotations?: number;
  total_documents?: number;
}

interface DocumentsResponse {
  success: boolean;
  documents?: Document[];
}

const ExpertDashboard = () => {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total_annotations: 0,
    total_documents: 0
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch dashboard stats from API
      const statsResponse = await axios.get<DashboardStatsResponse>('/expert/dashboard/');

      // Fetch documents
      const docsResponse = await axios.get<DocumentsResponse>('/expert/documents/?page=1&page_size=10');

      if (docsResponse.data.success) {
        const docs = docsResponse.data.documents || [];
        setDocuments(docs);
        
        // Use API stats if available, otherwise calculate from documents
        if (statsResponse.data.success) {
          setStats({
            total_annotations: statsResponse.data.total_annotations || 0,
            total_documents: statsResponse.data.total_documents || docs.length
          });
        } else {
          // Fallback: calculate from documents
          const totalAnnotations = docs.reduce((sum: number, doc: Document) => sum + doc.annotation_count, 0);
          
          setStats({
            total_annotations: totalAnnotations,
            total_documents: docs.length
          });
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement du dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Expert Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Review validated documents and their annotations
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Chargement du dashboard...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Stats principales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Documents Totaux
                  </CardTitle>
                  <FileText className="w-5 h-5 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total_documents}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Prêts pour révision
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Annotations
                  </CardTitle>
                  <Activity className="w-5 h-5 text-indigo-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total_annotations}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Dans tous les documents
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Documents Récents</CardTitle>
                <CardDescription>Documents prêts pour analyse expert</CardDescription>
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Aucun document à réviser pour le moment.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.slice(0, 5).map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer"
                        onClick={() => router.push(`/expert/documents/${doc.id}/review`)}
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-primary" />
                          <div>
                            <p className="font-medium">{doc.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.validated_pages} / {doc.total_pages} pages validées • {doc.annotation_count} annotations
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.validated_pages === doc.total_pages ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Complet
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 border border-yellow-200">
                              En cours
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ExpertDashboard;