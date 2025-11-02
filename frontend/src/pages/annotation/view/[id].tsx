import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, FileText, Calendar, User, CheckCircle, Clock, Globe, Building, Tag, Languages, Link as LinkIcon, AlignLeft } from 'lucide-react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';

interface DocumentMetadata {
  title?: string;
  type?: string;
  publication_date?: string;
  version?: string;
  source?: string;
  country?: string;
  language?: string;
  url_source?: string;
  context?: string;
}

interface Document {
  id: number;
  title: string;
  file_name: string;
  status: string;
  uploaded_by: string;
  created_at: string;
  annotated_pages: number;
  metadata: DocumentMetadata;
  validated_at?: string;
}

const DocumentMetadataView = () => {
  const router = useRouter();
  const { id } = router.query;
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [structuredHtml, setStructuredHtml] = useState<string>('');
  const [loadingStructured, setLoadingStructured] = useState(false);

  useEffect(() => {
    if (id) {
      fetchDocument();
      fetchStructuredHtml();
    }
  }, [id]);

  const fetchStructuredHtml = async () => {
    setLoadingStructured(true);
    try {
      const response = await fetch(`http://localhost:8000/api/document/${id}/structured/`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStructuredHtml(data.structured_html || '');
        }
      }
    } catch (error) {
      console.error('Error fetching structured HTML:', error);
    } finally {
      setLoadingStructured(false);
    }
  };

  const fetchDocument = async () => {
    try {
      setLoading(true);
      console.log(`🔍 Fetching document ${id} for metadata view...`);

      // Simple fetch without complex configuration
      const response = await fetch(`http://localhost:8000/api/annotation/document/${id}/`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log("📄 API Response:", data); // Debug log

        if (data.success) {
          // Handle different possible response structures
          const docData = data.data?.document || data.document || data;
          console.log("📄 Document data:", docData); // Debug log

          if (docData) {
            // Use existing metadata if available, otherwise create from document fields
            // Also check if metadata is in different location
            const metadata = docData.metadata || {
              title: docData.title,
              type: docData.doc_type || docData.type,
              publication_date: docData.publication_date || docData.publication_date,
              version: docData.version,
              source: docData.source,
              country: docData.country,
              language: docData.language,
              url_source: docData.url_source,
              context: docData.context,
            };

            const transformedDoc = {
              ...docData,
              metadata: metadata
            };
            setDocument(transformedDoc);
            console.log("✅ Document loaded successfully");
            console.log("📄 Full document data:", docData);
            console.log("📄 Extracted metadata:", metadata);
          } else {
            setError('Structure de réponse invalide: document non trouvé');
          }
        } else {
          setError(data.error || 'Erreur lors du chargement du document');
        }
      } else {
        setError('Erreur lors du chargement du document');
      }
    } catch (error) {
      console.error('❌ Error fetching document:', error);
      setError('Erreur lors du chargement du document');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Chargement du document...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !document) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour
            </Button>
          </div>
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-red-600">
                <p className="text-lg font-medium">Erreur</p>
                <p className="text-sm">{error || 'Document non trouvé'}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const metadataFields = [
    { key: 'title', label: 'Titre', icon: FileText },
    { key: 'type', label: 'Type de document', icon: Tag },
    { key: 'publication_date', label: 'Date de publication', icon: Calendar },
    { key: 'version', label: 'Version', icon: Tag },
    { key: 'source', label: 'Source', icon: Building },
    { key: 'country', label: 'Pays', icon: Globe },
    { key: 'language', label: 'Langue', icon: Languages },
    { key: 'url_source', label: 'URL Source', icon: LinkIcon },
    { key: 'context', label: 'Contexte', icon: AlignLeft },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <FileText className="w-8 h-8 text-primary" />
                {document.title || document.file_name}
              </h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(document.created_at).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  {document.uploaded_by}
                </div>
                <div className="flex items-center gap-1">
                  {document.validated_at ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-green-600">Validé</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-4 h-4 text-yellow-600" />
                      <span className="text-yellow-600">En attente</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Document Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Informations du document</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Nom du fichier</p>
                <p className="text-sm font-medium">{document.file_name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Statut</p>
                <Badge variant={document.status === 'validated' ? 'default' : 'secondary'}>
                  {document.status?.replace('_', ' ')}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pages</p>
                <p className="text-sm">{document.annotated_pages || 0}/{document.total_pages || 0}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Validé le</p>
                <p className="text-sm">
                  {document.validated_at
                    ? new Date(document.validated_at).toLocaleDateString()
                    : 'Non validé'
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metadata Display */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Métadonnées extraites
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!document.metadata || Object.keys(document.metadata).length === 0) ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium mb-2">Aucune métadonnée extraite</p>
                <p className="text-sm">Les métadonnées n&apos;ont pas encore été extraites pour ce document</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {metadataFields.map((field) => {
                  const value = document.metadata?.[field.key as keyof DocumentMetadata];
                  const Icon = field.icon;

                  if (!value) return null;

                  return (
                    <div key={field.key} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <p className="text-sm font-medium text-muted-foreground">{field.label}</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm break-words">
                          {field.key === 'url_source' ? (
                            <a
                              href={value}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {value}
                            </a>
                          ) : (
                            value
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Structured Content Display */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Contenu Structuré
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingStructured ? (
              <div className="flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Chargement du contenu structuré...</p>
                </div>
              </div>
            ) : structuredHtml ? (
              <div
                className="structured-html-view prose max-w-none"
                dangerouslySetInnerHTML={{ __html: structuredHtml }}
                style={{
                  padding: '20px',
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  minHeight: '500px',
                  maxHeight: '800px',
                  overflowY: 'auto'
                }}
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium mb-2">Aucun contenu structuré disponible</p>
                <p className="text-sm">Le contenu structuré n&apos;a pas encore été extrait pour ce document</p>
                <Button
                  variant="outline"
                  onClick={fetchStructuredHtml}
                  className="mt-4"
                >
                  Recharger le contenu
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default DocumentMetadataView;