import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Eye, Clock, CheckCircle, User, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import axios from '@/lib/axios';

interface Document {
  id: number;
  file: { name: string };
  title: string;
  expert_ready_at: string;
  total_pages: number;
  validated_pages: number;
  annotation_count: number;
  pending_annotations: number;
  annotator: { username: string };
}

interface PaginationInfo {
  current: number;
  total: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export default function DocumentList() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationInfo>({
    current: 1,
    total: 1,
    hasNext: false,
    hasPrevious: false
  });

  useEffect(() => {
    fetchDocuments(1);
  }, []);

  const fetchDocuments = async (page: number = 1) => {
    try {
      setLoading(true);
      const response = await axios.get(`/expert/documents/?page=${page}`);
      
      if (response.data.success) {
        setDocuments(response.data.documents || []);
        setPagination(response.data.pagination || pagination);
      } else {
        console.error('Erreur API:', response.data.error);
        setDocuments([]);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des documents:', error);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const getBasename = (path: string) => {
    return path.split('/').pop() || path;
  };

  const truncate = (str: string, maxLength: number) => {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Chargement des documents...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* En-tête */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Documents à Réviser</h1>
            <p className="text-gray-600 mt-1">Liste des documents terminés par les annotateurs</p>
          </div>
          <button
            onClick={() => router.push('/expert')}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Retour
          </button>
        </div>

        {/* Tableau des documents */}
        <Card>
          <CardContent className="p-0">
            {documents.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Fichier
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Date fin
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Pages Validées
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Annotations
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Annotateur
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {documents.map((doc) => (
                        <tr
                          key={doc.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3 max-w-xs">
                              <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
                              <span className="font-medium text-gray-900 truncate">
                                {truncate(getBasename(doc.file.name), 32)}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {new Date(doc.expert_ready_at).toLocaleDateString('fr-FR')}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">
                                {doc.validated_pages} / {doc.total_pages}
                              </span>
                              {doc.validated_pages < doc.total_pages && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 border border-yellow-200">
                                  En cours
                                </span>
                              )}
                              {doc.validated_pages === doc.total_pages && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Complet
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                                {doc.annotation_count}
                              </span>
                              {doc.pending_annotations > 0 && (
                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                                  <Clock className="w-3 h-3" />
                                  {doc.pending_annotations}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                              <User className="w-3 h-3" />
                              {doc.annotator.username || 'Non défini'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                              <CheckCircle className="w-3 h-3" />
                              Terminé
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => router.push(`/expert/documents/${doc.id}/review`)}
                              className="p-2 hover:bg-blue-50 rounded-lg transition-colors group"
                              title="Réviser"
                            >
                              <Eye className="w-5 h-5 text-blue-600 group-hover:text-blue-700" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {pagination.total > 1 && (
                  <div className="flex items-center justify-center gap-2 p-6 border-t bg-gray-50">
                    <button
                      onClick={() => fetchDocuments(1)}
                      disabled={!pagination.hasPrevious}
                      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-600 hover:to-indigo-700 transition-all shadow-sm"
                    >
                      Première
                    </button>
                    <button
                      onClick={() => fetchDocuments(pagination.current - 1)}
                      disabled={!pagination.hasPrevious}
                      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-600 hover:to-indigo-700 transition-all shadow-sm"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-semibold shadow-sm">
                      Page {pagination.current} / {pagination.total}
                    </span>
                    <button
                      onClick={() => fetchDocuments(pagination.current + 1)}
                      disabled={!pagination.hasNext}
                      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-600 hover:to-indigo-700 transition-all shadow-sm"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => fetchDocuments(pagination.total)}
                      disabled={!pagination.hasNext}
                      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-600 hover:to-indigo-700 transition-all shadow-sm"
                    >
                      Dernière
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Aucun document à réviser
                </h3>
                <p className="text-gray-600">
                  Tous les documents ont été révisés.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
