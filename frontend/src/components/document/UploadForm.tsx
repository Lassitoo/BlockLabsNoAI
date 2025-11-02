import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, X, Loader2, Link, Sparkles, CheckCircle } from 'lucide-react';
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
    const validTypes = ['application/pdf', 'application/zip'];
    if (!validTypes.includes(file.type)) {
      toast.error('Type de fichier invalide. Veuillez sélectionner un PDF ou ZIP.');
      return;
    }
    setSelectedFile(file);
    setPdfUrl('');
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
    <Card className="border-0 shadow-xl">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <div className="p-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600">
                <Upload className="w-6 h-6 text-white" />
              </div>
              Importer un document
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              Uploadez un PDF ou ZIP pour extraction automatique
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-8">
        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-8">
          {/* URL Input */}
          <div className="space-y-3">
            <Label htmlFor="pdf_url" className="text-base font-semibold flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-blue-50">
                <Link className="w-4 h-4 text-blue-600" />
              </div>
              Depuis une URL de PDF
            </Label>
            <Input
              id="pdf_url"
              type="url"
              placeholder="https://example.com/document.pdf"
              value={pdfUrl}
              onChange={(e) => {
                setPdfUrl(e.target.value);
                setSelectedFile(null);
              }}
              disabled={isUploading || !!selectedFile}
              className="h-12 text-base border-2 focus:border-blue-500 transition-colors"
            />
            {pdfUrl && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                URL valide détectée
              </div>
            )}
          </div>

          <div className="relative flex items-center gap-4 py-2">
            <div className="flex-1 border-t-2 border-gray-200" />
            <span className="text-sm font-medium text-gray-500 bg-white px-4 py-1.5 rounded-full border-2 border-gray-200 shadow-sm">
              OU
            </span>
            <div className="flex-1 border-t-2 border-gray-200" />
          </div>

          {/* File Drop Zone */}
          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-purple-50">
                <FileText className="w-4 h-4 text-purple-600" />
              </div>
              Depuis un fichier local
            </Label>
            <div
              className={`
                relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer
                transition-all duration-200
                ${dragActive 
                  ? 'border-blue-500 bg-blue-50 scale-[1.02]' 
                  : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/50'
                }
                ${isUploading || !!pdfUrl ? 'opacity-50 cursor-not-allowed' : ''}
                ${selectedFile ? 'border-green-500 bg-green-50' : ''}
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
                accept="application/pdf,application/zip"
                onChange={handleFileInputChange}
                disabled={isUploading || !!pdfUrl}
              />

              {selectedFile ? (
                <div className="flex items-center justify-between p-4 bg-white rounded-lg border-2 border-green-200">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-green-100">
                      <FileText className="w-8 h-8 text-green-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-lg text-gray-900">{selectedFile.name}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
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
                    className="hover:bg-red-100 hover:text-red-600"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="inline-flex p-4 rounded-full bg-gradient-to-r from-blue-100 to-purple-100">
                    <Upload className="w-12 h-12 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold mb-2 text-gray-900">
                      Glissez-déposez un fichier ici
                    </p>
                    <p className="text-base text-muted-foreground mb-1">
                      ou cliquez pour sélectionner
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Formats acceptés : PDF, ZIP
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 justify-center pt-4">
            <Button
              type="submit"
              disabled={isUploading || (!pdfUrl && !selectedFile)}
              className="min-w-[200px] h-12 text-base bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Extraction en cours...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 mr-2" />
                  Extraire les métadonnées
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
