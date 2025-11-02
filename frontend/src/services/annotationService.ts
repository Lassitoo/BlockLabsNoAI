// src/services/annotationService.ts
import axios, { AxiosResponse } from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
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
   SERVICE ANNOTATION – URLS AVEC /api/rawdocs/
   ------------------------------------------------- */
export const annotationService = {
  // Dashboard stats
  async getDashboardStats(): Promise<any> {
    const response: AxiosResponse<any> = await api.get('/rawdocs/annotation/dashboard/');
    return response.data;
  },

  // Lister les documents pour annotation
  async getDocuments(): Promise<any> {
    const response: AxiosResponse<any> = await api.get('/rawdocs/annotation/documents/');
    return response.data;
  },

  // Récupérer un document pour annotation
  async getDocument(docId: string): Promise<any> {
    const response: AxiosResponse<any> = await api.get(`/rawdocs/annotation/document/${docId}/`);
    return response.data;
  },

  // Récupérer les détails d'une page
  async getPageDetails(docId: string, pageNumber: number): Promise<any> {
    const response: AxiosResponse<any> = await api.get(`/rawdocs/annotation/document/${docId}/page/${pageNumber}/`);
    return response.data;
  },

  // Ajouter une annotation
  async addAnnotation(data: {
    page_id: number;
    selected_text: string;
    annotation_type_id: number;
    start_pos: number;
    end_pos: number;
    mode?: string;
  }): Promise<any> {
    const response: AxiosResponse<any> = await api.post('/rawdocs/annotation/add/', data);
    return response.data;
  },

  // Mettre à jour une annotation
  async updateAnnotation(annotationId: string, data: {
    selected_text?: string;
    annotation_type_id?: number;
    start_pos?: number;
    end_pos?: number;
  }): Promise<any> {
    const response: AxiosResponse<any> = await api.post(`/rawdocs/annotation/update/${annotationId}/`, data);
    return response.data;
  },

  // Supprimer une annotation
  async deleteAnnotation(annotationId: string): Promise<any> {
    const response: AxiosResponse<any> = await api.post(`/rawdocs/annotation/delete/${annotationId}/`);
    return response.data;
  },

  // Valider les annotations d'une page
  async validatePageAnnotations(pageId: number): Promise<any> {
    const response: AxiosResponse<any> = await api.post(`/rawdocs/annotation/validate-page/${pageId}/`);
    return response.data;
  },

  // Annotation IA d'une page
  async aiAnnotatePage(pageId: number, mode = 'raw'): Promise<any> {
    const response: AxiosResponse<any> = await api.post(`/rawdocs/annotation/ai/page/${pageId}/`, { mode });
    return response.data;
  },

  // Annotation IA d'un document complet
  async aiAnnotateDocument(docId: string, mode = 'raw'): Promise<any> {
    const response: AxiosResponse<any> = await api.post(`/rawdocs/annotation/ai/document/${docId}/`, { mode });
    return response.data;
  },

  // Récupérer tous les types d'annotations
  async getAnnotationTypes(): Promise<any> {
    const response: AxiosResponse<any> = await api.get('/rawdocs/annotation/types/');
    return response.data;
  },

  // Créer un nouveau type d'annotation
  async createAnnotationType(data: {
    name: string;
    display_name: string;
    color?: string;
    description?: string;
  }): Promise<any> {
    const response: AxiosResponse<any> = await api.post('/rawdocs/annotation/types/create/', data);
    return response.data;
  },

  // Soumettre un document pour révision expert
  async submitForExpertReview(docId: string): Promise<any> {
    const response: AxiosResponse<any> = await api.post(`/rawdocs/annotation/submit-for-expert/${docId}/`);
    return response.data;
  },

  // Récupérer le résumé des annotations d'un document
  async getDocumentAnnotationSummary(docId: string): Promise<any> {
    const response: AxiosResponse<any> = await api.get(`/rawdocs/annotation/document/${docId}/summary/`);
    return response.data;
  },
};