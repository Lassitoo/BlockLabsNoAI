// src/services/documentService.ts
import axios, { AxiosResponse } from 'axios';
import { RawDocument, UploadResponse, DocumentMetadata } from '@/types/document';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api',
  withCredentials: true,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
});

/* -------------------------------------------------
   CSRF INTERCEPTOR – CORRIGÉ & SÉCURISÉ
   ------------------------------------------------- */
api.interceptors.request.use((config) => {
  const csrfToken = getCookie('csrftoken');
  if (csrfToken) {
    // Garantit que headers existe
    config.headers = config.headers ?? {};
    config.headers['X-CSRFToken'] = csrfToken;
  }
  return config;
});

/* -------------------------------------------------
   Fonction pour lire un cookie
   ------------------------------------------------- */
function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() ?? null;
  return null;
}

/* -------------------------------------------------
   SERVICE DOCUMENT – URLS CORRIGÉES AVEC /api/rawdocs/
   ------------------------------------------------- */
export const documentService = {
  // Upload fichier PDF
  async uploadFile(file: File, validate = false): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('pdf_file', file);
    if (validate) formData.append('validate', '1');

    const response: AxiosResponse<UploadResponse> = await api.post('/upload/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Upload via URL
  async uploadFromUrl(url: string, validate = false): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('pdf_url', url);
    if (validate) formData.append('validate', '1');

    const response: AxiosResponse<UploadResponse> = await api.post('/upload/', formData);
    return response.data;
  },

  // Mettre à jour métadonnées
  async updateMetadata(docId: string, metadata: Partial<DocumentMetadata>): Promise<void> {
    const formData = new FormData();
    formData.append('doc_id', docId);
    formData.append('edit_metadata', '1');

    Object.entries(metadata).forEach(([key, value]) => {
      if (value != null) formData.append(key, String(value));
    });

    await api.post('/upload/', formData);
  },

  // Réextraire métadonnées
  async reextractMetadata(docId: string): Promise<DocumentMetadata> {
    const response = await api.post<{ metadata: DocumentMetadata }>(`/reextract/${docId}/`);
    return response.data.metadata;
  },

  // Valider document
  async validateDocument(docId: string): Promise<void> {
    await api.post(`/validate/${docId}/`);
  },

  // Récupérer un document
  async getDocument(docId: string): Promise<RawDocument> {
    const response = await api.get<RawDocument>(`/document/${docId}/`);
    return response.data;
  },

  // HTML structuré
  async getStructuredHtml(docId: string, regen = false): Promise<string> {
    const response = await api.get<{ structured_html: string }>(
      `/document/${docId}/structured/?regen=${regen ? '1' : '0'}`
    );
    return response.data.structured_html;
  },

  // Sauvegarder éditions structurées
  async saveStructuredEdits(
    docId: string,
    edits: Array<{ element_id: string; new_text: string }>
  ): Promise<void> {
    await api.post(`/save-structured-edits/${docId}/`, { edits });
  },

  // URL du PDF original
  getOriginalPdfUrl(docId: string): string {
    return `${api.defaults.baseURL}/view-original/${docId}/`;
  },

  // Lister tous les documents (pour Document Manager)
  async listDocuments(): Promise<RawDocument[]> {
    const response = await api.get<{ documents: RawDocument[] }>('/documents/list/');
    return response.data.documents;
  },
};