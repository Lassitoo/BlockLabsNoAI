import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText, CheckCircle, Clock, Edit3, Trash2, CheckSquare, Eye, TrendingUp, Activity } from 'lucide-react';
import { useRouter } from 'next/router';
import { useData } from '@/contexts/DataContext';
import { documentService } from '@/services/documentService';
import { useState, useEffect } from 'react';
import axios from 'axios';

const DocumentManagerDashboard = () => {
  const router = useRouter();
  const { documents, setDocuments } = useData();
  const [loading, setLoading] = useState(true);

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
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const docs = await documentService.listDocuments();
      setDocuments(docs);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
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
        fetchDocuments();
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
        fetchDocuments();
      } else {
        console.error("❌ Deletion failed:", response.data.error);
        alert(`Erreur lors de la suppression: ${response.data.error}`);
      }
    } catch (error) {
      console.error('❌ Error deleting document:', error);
      alert('Erreur lors de la suppression du document');
    }
  };

  const stats = [
    {
      title: 'Total Documents',
      value: documents.length.toString(),
      icon: FileText,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      description: 'Documents uploaded',
      trend: '+12%'
    },
    {
      title: 'In Progress',
      value: documents.filter(d => d.status !== 'validated').length.toString(),
      icon: Clock,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      description: 'Awaiting validation',
      trend: '+5%'
    },
    {
      title: 'Validated',
      value: documents.filter(d => d.status === 'validated').length.toString(),
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      description: 'Ready for annotation',
      trend: '+8%'
    },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading documents...</div>
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
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Document Manager
            </h1>
            <p className="text-muted-foreground mt-2 text-lg">
              Upload and manage your regulatory documents
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => router.push('/annotation/dashboard')}
              variant="outline"
              size="lg"
              className="border-2 hover:border-blue-600 hover:bg-blue-50 transition-all"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Annotation
            </Button>
            <Button 
              onClick={() => router.push('/document-manager/upload')} 
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Document
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                <div className="flex items-end justify-between">
                  <div className="text-4xl font-bold">{stat.value}</div>
                  <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
                    <TrendingUp className="w-4 h-4" />
                    {stat.trend}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Documents */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Recent Documents</CardTitle>
                <CardDescription className="mt-1">Your recently uploaded documents</CardDescription>
              </div>
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {documents.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium text-muted-foreground mb-2">
                  No documents yet
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload your first document to get started
                </p>
                <Button onClick={() => router.push('/document-manager/upload')}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Document
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.slice(0, 5).map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 rounded-xl border-2 hover:border-blue-200 hover:bg-blue-50/50 transition-all duration-200 cursor-pointer group"
                    onClick={() => router.push(`/document-manager/documents/${doc.id}`)}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="p-3 rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors">
                        <FileText className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                          {doc.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(doc.uploadedAt).toLocaleDateString('fr-FR', { 
                            day: 'numeric', 
                            month: 'long', 
                            year: 'numeric' 
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-3 py-1.5 rounded-full font-medium capitalize ${
                        doc.status === 'validated' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {doc.status}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/annotation/view/${doc.id}`);
                        }}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                      {doc.status !== 'validated' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleValidateDocument(doc.id);
                          }}
                          className="text-green-600 hover:text-green-700 hover:bg-green-100"
                        >
                          <CheckSquare className="w-4 h-4 mr-1" />
                          Validate
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDocument(doc.id);
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default DocumentManagerDashboard;
