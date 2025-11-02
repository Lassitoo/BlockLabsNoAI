import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Document } from '@/types';
import { toast } from 'sonner';

const UploadDocument = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { addDocument } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validTypes = [
        'application/pdf',
        'application/zip',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ];
      
      if (validTypes.includes(selectedFile.type)) {
        setFile(selectedFile);
      } else {
        toast.error('Invalid file type. Please upload PDF, ZIP, DOCX, or XLSX files.');
      }
    }
  };

  const extractFileType = (filename: string): 'pdf' | 'docx' | 'xlsx' | 'zip' => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (ext === 'docx') return 'docx';
    if (ext === 'xlsx') return 'xlsx';
    return 'zip';
  };

  const handleUpload = async () => {
    if (!file || !user) return;

    setUploading(true);
    
    // Simulate upload and extraction process
    setTimeout(() => {
      const mockDoc: Document = {
        id: Date.now().toString(),
        name: file.name,
        type: extractFileType(file.name),
        uploadedBy: user.id,
        uploadedAt: new Date().toISOString(),
        status: 'extracted',
        metadata: {
          title: file.name.replace(/\.[^/.]+$/, ''),
          author: user.name,
          createdDate: new Date().toISOString(),
          fileSize: file.size,
          pageCount: Math.floor(Math.random() * 20) + 1,
        },
        content: 'This is mock extracted content. In production, this will be extracted from the actual document.',
        pages: Array.from({ length: Math.floor(Math.random() * 20) + 1 }, (_, i) => ({
          pageNumber: i + 1,
          content: `Page ${i + 1} content will be extracted here.`,
          annotations: [],
          relationships: [],
        })),
      };

      addDocument(mockDoc);
      setUploading(false);
      toast.success('Document uploaded and processed successfully!');
      navigate(`/document-manager/documents/${mockDoc.id}`);
    }, 2000);
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Upload Document</h1>
          <p className="text-muted-foreground mt-2">
            Upload PDF, Word, Excel, or ZIP files for processing
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select File</CardTitle>
            <CardDescription>
              Supported formats: PDF, DOCX, XLSX, ZIP
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="file">Document File</Label>
              <div className="flex gap-2">
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.docx,.xlsx,.zip"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </div>
            </div>

            {file && (
              <div className="p-4 rounded-lg border bg-muted/50">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 p-4 rounded-lg bg-info/10 border border-info/20">
              <AlertCircle className="w-5 h-5 text-info mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-info">Processing Information</p>
                <p className="text-muted-foreground mt-1">
                  After upload, the system will extract text content and metadata.
                  You can then edit and annotate the document before validation.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => navigate('/document-manager')}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!file || uploading}
              >
                {uploading ? (
                  <>Processing...</>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload & Extract
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default UploadDocument;
