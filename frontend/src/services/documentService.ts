import axios from "axios";
import type { AxiosResponse } from "axios";
import { RawDocument, UploadResponse, DocumentMetadata } from "@/types/document";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api",
  withCredentials: true,
  headers: {
    "X-Requested-With": "XMLHttpRequest",
  },
});

export default api;

/* -------------------------------------------------
   CSRF INTERCEPTOR
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


interface SaveEditsResponse {
  structured_html: string;
}

/* -------------------------------------------------
   SERVICE DOCUMENT
   ------------------------------------------------- */
export const documentService = {
  // Upload fichier PDF ou ZIP
  async uploadFile(file: File, validate: boolean = false): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('pdf_file', file);
    if (validate) {
      formData.append('validate', '1');
    }

    console.log('📤 Uploading file:', file.name, 'Type:', file.type, 'Size:', file.size);

    const response = await api.post<UploadResponse>('/upload/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    console.log('✅ Upload response:', response.data);
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

  async updateMetadata(docId: string, metadata: Partial<DocumentMetadata> & { custom_fields?: Array<{name: string, value: string}> }): Promise<RawDocument> {
    console.log('Envoi des métadonnées au backend...', { docId, metadata });

    try {
      const response = await api.put<{
        success: boolean;
        document: RawDocument;
        message: string;
        changes: string[];
      }>(`/metadata/${docId}/update/`, metadata);

      if (response.data.success) {
        console.log('Métadonnées sauvegardées avec succès !', response.data);
        if (metadata.custom_fields?.length) {
          console.log(`Custom fields sauvegardés :`, metadata.custom_fields);
        }
      }

      return response.data.document;
    } catch (error: any) {
      console.error('Échec sauvegarde métadonnées :', error);
      throw error;
    }
  },
  // Réextraire métadonnées
  async reextractMetadata(docId: string): Promise<DocumentMetadata> {
    console.log('🔄 Reextracting metadata for doc:', docId);

    const response = await api.post<{ success: boolean; metadata: DocumentMetadata }>(
      `/reextract/${docId}/`
    );

    console.log('✅ Reextracted metadata:', response.data.metadata);
    return response.data.metadata;
  },

  // Valider document
  async validateDocument(docId: string): Promise<void> {
    console.log('✓ Validating document:', docId);

    await api.post(`/validate/${docId}/`);

    console.log('✅ Document validated');
  },

  async getDocument(docId: string, forceRefresh = false): Promise<RawDocument> {
    console.group('GET DOCUMENT');
    console.log('Document ID:', docId);
    console.log('Force refresh:', forceRefresh);

    try {
      // Cache-busting uniquement si forceRefresh
      const timestamp = forceRefresh ? `?t=${Date.now()}` : '';

      const response = await api.get<{
        success: boolean;
        document: RawDocument & { custom_fields?: Record<string, string> };
      }>(`/document/${docId}${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });

      const doc = response.data.document;

      console.log('Document retrieved:', doc.metadata.title || 'Sans titre');

      console.groupEnd();

      // Retourne le document avec custom_fields garantis
      return {
        ...doc,
        custom_fields: doc.custom_fields || {},
      };

    } catch (error: any) {
      console.error('GET DOCUMENT ERROR:', error);
      
      // Vérifier si c'est une erreur d'authentification
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.error('Erreur d\'authentification - L\'utilisateur n\'est pas connecté');
        throw new Error('Vous devez être connecté pour accéder à ce document');
      }
      
      // Vérifier si c'est une erreur réseau
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        console.error('Erreur réseau - Le serveur Django ne répond pas');
        throw new Error('Impossible de se connecter au serveur. Vérifiez que le serveur Django est démarré.');
      }
      
      console.groupEnd();
      throw error;
    }
  },

  // HTML structuré
  async getStructuredHtml(docId: string, regen = false): Promise<string> {
    console.log('Getting structured HTML for doc:', docId, 'regen:', regen);
    console.log('📄 Getting structured HTML for doc:', docId, 'regen:', regen);

    // ✅ AJOUT: Timestamp pour forcer le rechargement
    const timestamp = Date.now();

    const response = await api.get<{ success: boolean; structured_html: string }>(
      `/document/${docId}/structured/?regen=${regen ? '1' : '0'}&t=${timestamp}`,
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );

    console.log('✅ Structured HTML retrieved:', response.data.structured_html.length, 'characters');
    return response.data.structured_html;
  },

  // Sauvegarder éditions structurées

  async saveStructuredEdits(
    docId: string,
    edits: Array<{ element_id: string; new_text: string }>
  ): Promise<{ structured_html: string }> {
    const response = await api.post<{ structured_html: string }>(
      `/save-structured-edits/${docId}/`,
      { edits }
    );
    return response.data; // ← Renvoie le HTML mis à jour
  },

  // URL du PDF original
  getOriginalPdfUrl(docId: string): string {
    return `${api.defaults.baseURL}/view-original/${docId}/`;
  },

  // Lister tous les documents
  async listDocuments(): Promise<RawDocument[]> {
    console.log('📋 Listing documents');

    const response = await api.get<{ success: boolean; documents: RawDocument[] }>(
      '/documents/list/'
    );

    console.log('✅ Documents retrieved:', response.data.documents.length);
    return response.data.documents;
  },
};