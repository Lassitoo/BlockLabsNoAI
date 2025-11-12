import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText, CheckCircle, Clock, Edit3, Trash2, CheckSquare, Eye, Search, MoreVertical } from 'lucide-react';
import { useRouter } from 'next/router';
import { useData } from '@/contexts/DataContext';
import { documentService } from '@/services/documentService';
import { useState, useEffect } from 'react';
import axios from 'axios';

const DocumentManagerDashboard = () => {
  const router = useRouter();
  const { documents, setDocuments } = useData();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

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

  // Filter documents based on search and status
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || doc.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const stats = [
    {
      title: 'Total Documents',
      value: documents.length.toString(),
      icon: FileText,
      description: 'Documents uploaded'
    },
    {
      title: 'Pending Review',
      value: documents.filter(d => d.status !== 'validated').length.toString(),
      icon: Clock,
      description: 'Awaiting validation'
    },
    {
      title: 'Validated',
      value: documents.filter(d => d.status === 'validated').length.toString(),
      icon: CheckCircle,
      description: 'Ready for annotation'
    },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-600">Loading documents...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">
              Document Manager
            </h1>
            <p className="text-gray-500 mt-1">
              Manage your regulatory documents
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => router.push('/annotation/dashboard')}
              variant="outline"
              className="border-gray-300 hover:bg-gray-50"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Annotation
            </Button>
            <Button 
              onClick={() => router.push('/document-manager/upload')}
              className="bg-[#001f3f] text-white hover:bg-[#003366] transition-colors duration-200 shadow-md"
            >
              <Upload className="w-4 h-4 mr-2 text-white" />
              Upload Document
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((stat, index) => (
            <Card key={stat.title} className="border-gray-200 hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium text-gray-500">
                    {stat.title}
                  </CardTitle>
                  <p className="text-xs text-gray-400">{stat.description}</p>
                </div>
                <div className={`p-3 rounded-lg ${
                  index === 0 ? 'bg-blue-50' : index === 1 ? 'bg-amber-50' : 'bg-green-50'
                }`}>
                  <stat.icon className={`w-6 h-6 ${
                    index === 0 ? 'text-blue-600' : index === 1 ? 'text-amber-600' : 'text-green-600'
                  }`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold text-gray-900">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Documents List */}
        <Card className="border-gray-200">
          <CardHeader className="border-b border-gray-200">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-semibold">Documents</CardTitle>
                <CardDescription className="mt-1">Your recently uploaded documents</CardDescription>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search documents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
                  />
                </div>

                {/* Filter */}
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="validated">Validated</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredDocuments.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-900 font-medium mb-1">
                  {searchQuery || filterStatus !== 'all' ? 'No documents found' : 'No documents yet'}
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  {searchQuery || filterStatus !== 'all' 
                    ? 'Try adjusting your search or filters' 
                    : 'Upload your first document to get started'}
                </p>
                {!searchQuery && filterStatus === 'all' && (
                  <Button onClick={() => router.push('/document-manager/upload')}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Document
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-6 hover:bg-blue-50/30 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors flex-shrink-0">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0 max-w-2xl">
                          <p 
                            className="font-medium text-gray-900 cursor-pointer hover:text-blue-600 transition-colors break-words line-clamp-2"
                            onClick={() => router.push(`/annotation/view/${doc.id}`)}
                            title={doc.name}
                          >
                            {doc.name}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(doc.uploadedAt).toLocaleDateString('fr-FR', { 
                              day: 'numeric', 
                              month: 'long', 
                              year: 'numeric' 
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap ${
                          doc.status === 'validated' 
                            ? 'bg-green-50 text-green-700 border border-green-200' 
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {doc.status === 'validated' ? 'Validated' : 'Pending'}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/annotation/view/${doc.id}`);
                          }}
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {doc.status !== 'validated' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleValidateDocument(doc.id);
                            }}
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          >
                            <CheckSquare className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDocument(doc.id);
                          }}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
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