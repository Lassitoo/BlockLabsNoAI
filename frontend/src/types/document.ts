// src/types/document.ts
export interface DocumentMetadata {
  title: string;
  type: string;
  publication_date: string;
  version: string;
  source: string;
  context: string;
  country: string;
  language: string;
  url_source: string;
}

export interface DocumentQuality {
  extraction_rate: number;
  field_scores: Record<string, number>;
  extraction_reasoning: Record<string, string>;
  extracted_fields: number;
  total_fields: number;
  llm_powered: boolean;
}

export interface RawDocument {
  id: number;
  name: string;
  file_name: string;
  url?: string;
  owner: string;
  created_at: string;
  uploadedAt: string;
  is_validated: boolean;
  status: string;
  total_pages: number;
  validated_at?: string;
  pages_extracted: boolean;
  file_size: number;
  structured_html?: string;
  metadata?: DocumentMetadata;
  quality?: DocumentQuality;
}

export interface UploadResponse {
  success: boolean;
  document?: RawDocument;
  documents?: RawDocument[]; // For ZIP uploads
  message?: string;
  error?: string;
  is_zip_upload?: boolean;
}