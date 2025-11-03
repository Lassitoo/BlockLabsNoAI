
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
  id: string;
  file_name: string;
  url?: string;
  owner: string;
  created_at: string;
  is_validated: boolean;
  structured_html?: string;
  metadata: DocumentMetadata;
  quality?: DocumentQuality;
  custom_fields?: Record<string, string>;

}

export interface CustomField {
  name: string;
  value: string;
  type: string;
}

export interface UploadResponse {
  success: boolean;
  document?: RawDocument;
  documents?: RawDocument[];
  message?: string;
  error?: string;
  is_zip_upload?: boolean;
}