import { useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { UploadForm } from '@/components/document/UploadForm';
import { DocumentPreview } from '@/components/document/DocumentPreview';
import { MultiDocumentPreview } from '@/components/document/MultiDocumentPreview';
import { RawDocument } from '@/types/document';
import { toast } from 'sonner';

const UploadDocumentPage = () => {
  const [uploadedDocument, setUploadedDocument] = useState<RawDocument | null>(null);
  const [uploadedDocuments, setUploadedDocuments] = useState<RawDocument[]>([]);
  const [isZipUpload, setIsZipUpload] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleUploadSuccess = (documents: RawDocument[], isZip: boolean) => {
    // Réinitialiser l'état précédent avant d'afficher le nouveau document
    setUploadedDocument(null);
    setUploadedDocuments([]);

    if (isZip) {
      setUploadedDocuments(documents);
      setIsZipUpload(true);
      toast.success(`${documents.length} documents importés avec succès!`);
    } else {
      setUploadedDocument(documents[0]);
      setIsZipUpload(false);
      toast.success('Document importé avec succès!');
    }
  };

  const router = useRouter();

  const handleBackToList = () => {
    router.push('/document-manager');
  };

  return (
    <DashboardLayout>
      <div className="upload-container max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Upload Form - Always visible */}
        <UploadForm
          onUploadSuccess={handleUploadSuccess}
          isUploading={isUploading}
          setIsUploading={setIsUploading}
        />

        {/* Multi-Document Preview (ZIP) */}
        {isZipUpload && uploadedDocuments.length > 0 && (
          <MultiDocumentPreview
            documents={uploadedDocuments}
            onBackToList={handleBackToList}
          />
        )}

        {/* Single Document Preview */}
        {!isZipUpload && uploadedDocument && (
          <DocumentPreview
            document={uploadedDocument}
            onBackToList={handleBackToList}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default UploadDocumentPage;