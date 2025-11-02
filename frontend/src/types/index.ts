export type UserRole = 'admin' | 'document_manager' | 'expert';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  createdAt: string;
}

export interface Document {
  id: string;
  name: string;
  type: 'pdf' | 'docx' | 'xlsx' | 'zip';
  uploadedBy: string;
  uploadedAt: string;
  status: 'uploaded' | 'processing' | 'extracted' | 'annotated' | 'validated';
  metadata: DocumentMetadata;
  content: string;
  pages: DocumentPage[];
}

export interface DocumentMetadata {
  title?: string;
  author?: string;
  createdDate?: string;
  modifiedDate?: string;
  pageCount?: number;
  fileSize?: number;
  language?: string;
  [key: string]: any;
}

export interface DocumentPage {
  pageNumber: number;
  content: string;
  annotations: Annotation[];
  relationships: AnnotationRelationship[];
}

export interface AnnotationLabel {
  id: string;
  name: string;
  color: string;
}

export interface Annotation {
  id: string;
  labelId: string;
  text: string;
  startIndex: number;
  endIndex: number;
  pageNumber: number;
  createdAt: string;
  createdBy: string;
}

export interface AnnotationRelationship {
  id: string;
  name: string;
  sourceAnnotationId: string;
  targetAnnotationId: string;
  description?: string;
  createdAt: string;
  createdBy: string;
}

export interface AIModelMetrics {
  modelName: string;
  totalRequests: number;
  successRate: number;
  averageLatency: number;
  lastUsed: string;
}
