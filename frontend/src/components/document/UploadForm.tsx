import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { documentService } from '@/services/documentService';
import { RawDocument } from '@/types/document';
import { toast } from 'sonner';

interface UploadFormProps {
  onUploadSuccess: (documents: RawDocument[], isZip: boolean) => void;
  isUploading: boolean;
  setIsUploading: (value: boolean) => void;
}

export const UploadForm = ({ onUploadSuccess, isUploading, setIsUploading }: UploadFormProps) => {
  const [pdfUrl, setPdfUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    // Changement clé : Vérifier par extension au lieu de file.type (plus fiable pour ZIP)
    const extension = file.name.toLowerCase().split('.').pop();
    if (extension !== 'pdf' && extension !== 'zip') {
      toast.error('Type de fichier invalide. Veuillez sélectionner un PDF ou ZIP.');
      return;
    }

    // Log pour debug (à enlever en prod)
    console.log('✅ Fichier sélectionné:', file.name, 'Extension:', extension, 'Taille:', file.size);

    setSelectedFile(file);
    setPdfUrl(''); // Clear URL if file is selected
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent, validate: boolean = false) => {
    e.preventDefault();

    if (!pdfUrl && !selectedFile) {
      toast.error('Veuillez sélectionner un fichier ou saisir une URL.');
      return;
    }

    setIsUploading(true);

    try {
      let response;

      if (pdfUrl) {
        response = await documentService.uploadFromUrl(pdfUrl, validate);
      } else if (selectedFile) {
        response = await documentService.uploadFile(selectedFile, validate);
      }

      if (response && response.success) {
        const documents = response.is_zip_upload && response.documents
          ? response.documents
          : response.document
          ? [response.document]
          : [];

        onUploadSuccess(documents, response.is_zip_upload || false);

        // Reset form
        setPdfUrl('');
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.response?.data?.error || 'Erreur lors de l\'importation');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Importer un document
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
          {/* URL Input */}
          <div className="space-y-2">
            <Label htmlFor="pdf_url">Depuis une URL de PDF :</Label>
            <Input
              id="pdf_url"
              type="url"
              placeholder="Collez l'URL du PDF à importer"
              value={pdfUrl}
              onChange={(e) => {
                setPdfUrl(e.target.value);
                setSelectedFile(null); // Clear file if URL is entered
              }}
              disabled={isUploading || !!selectedFile}
            />
          </div>

          <div className="relative flex items-center gap-4">
            <div className="flex-1 border-t border-border" />
            <span className="text-sm text-muted-foreground">OU</span>
            <div className="flex-1 border-t border-border" />
          </div>

          {/* File Drop Zone */}
          <div className="space-y-2">
            <Label>Depuis un fichier local :</Label>
            <div
              className={`
                relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                transition-colors
                ${dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
                ${isUploading || !!pdfUrl ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => !isUploading && !pdfUrl && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.zip"  // Changement : Accepter par extension pour cohérence
                onChange={handleFileInputChange}
                disabled={isUploading || !!pdfUrl}
              />

              {selectedFile ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-primary" />
                    <div className="text-left">
                      <p className="font-medium">{selectedFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                    disabled={isUploading}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">
                    Glissez-déposez un fichier PDF ou ZIP ici
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ou cliquez pour sélectionner
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-center">
            <Button
              type="submit"
              disabled={isUploading || (!pdfUrl && !selectedFile)}
              className="min-w-[150px]"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Extraction...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Extraire
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};