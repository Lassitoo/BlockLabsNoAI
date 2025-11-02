# rawdocs/api_urls.py
from django.urls import path
from . import api_views

urlpatterns = [
    # ==================== DOCUMENT UPLOAD & MANAGEMENT ====================
    path('upload/', api_views.api_upload_document, name='api_upload'),  # NOUVEAU - Main upload endpoint
    path('reextract/<int:doc_id>/', api_views.api_reextract_metadata, name='api_reextract'),  # NOUVEAU
    path('document/<int:doc_id>/structured/', api_views.api_get_structured_html, name='api_structured_html'),  # NOUVEAU
    path('save-structured-edits/<int:doc_id>/', api_views.api_save_structured_edits, name='api_save_edits'),  # NOUVEAU
    path('view-original/<int:doc_id>/', api_views.api_view_original_document, name='api_view_original'),  # NOUVEAU
    path('validate/<int:doc_id>/', api_views.api_validate_document, name='api_validate_document'),  # NOUVEAU - Validation endpoint
    path('delete/<int:doc_id>/', api_views.api_delete_document, name='api_delete_document'),  # NOUVEAU - Deletion endpoint
    path('metadata/<int:doc_id>/', api_views.update_document_metadata, name='api_update_metadata'),  # NOUVEAU - Update metadata endpoint

    # Annotation Dashboard
    path('annotation/dashboard/', api_views.get_annotation_dashboard_data),
    path('annotation/documents/', api_views.get_annotation_documents),
    path('annotation/document/<int:doc_id>/', api_views.get_document_for_annotation),
    path('annotation/add/', api_views.add_annotation),

    # Metadata Learning
    path('metadata/learning/dashboard/', api_views.get_metadata_learning_data),

    # Expert
    path('expert/dashboard/', api_views.get_expert_dashboard_data),
    path('expert/documents/', api_views.get_expert_documents),

    # ==================== ANNOTATION DASHBOARD ====================
    path('annotation/dashboard/', api_views.get_annotation_dashboard_data, name='api_annotation_dashboard'),
    path('annotation/documents/', api_views.get_annotation_documents, name='api_annotation_documents'),
    path('annotation/document/<int:doc_id>/', api_views.get_document_for_annotation,name='api_get_document_for_annotation'),
    path('annotation/document/<int:doc_id>/page/<int:page_number>/', api_views.get_annotation_page_details,name='api_get_annotation_page_details'),
    path('annotation/document/<int:doc_id>/summary/', api_views.get_document_annotation_summary,name='api_get_document_annotation_summary'),
    path('annotation/add/', api_views.add_annotation, name='api_add_annotation'),
    path('annotation/update/<int:annotation_id>/', api_views.update_annotation, name='api_update_annotation'),
    path('annotation/delete/<int:annotation_id>/', api_views.delete_annotation_api, name='api_delete_annotation'),
    path('annotation/validate-page/<int:page_id>/', api_views.validate_page_annotations_api,name='api_validate_page_annotations'),
    path('annotation/ai/page/<int:page_id>/', api_views.ai_annotate_page_api, name='api_ai_annotate_page'),
    path('annotation/ai/document/<int:doc_id>/', api_views.ai_annotate_document_api, name='api_ai_annotate_document'),
    path('annotation/types/', api_views.get_annotation_types, name='api_get_annotation_types'),
    path('annotation/types/create/', api_views.create_annotation_type_api, name='api_create_annotation_type'),
    path('annotation/submit-for-expert/<int:doc_id>/', api_views.submit_document_for_expert_review_api,name='api_submit_for_expert_review'),

    # ==================== METADATA LEARNING ====================
    path('metadata/learning/dashboard/', api_views.get_metadata_learning_data, name='api_metadata_learning_dashboard'),

    # ==================== EXPERT DASHBOARD ====================
    path('expert/dashboard/', api_views.get_expert_dashboard_data, name='api_expert_dashboard'),
    path('expert/documents/', api_views.get_expert_documents, name='api_expert_documents'),

    # Legacy endpoints (keep for compatibility)
    path('documents/upload/', api_views.api_upload_document),
    path('documents/list/', api_views.list_documents),

    # Metadata API endpoints (legacy - peut être supprimé si non utilisé)
    path('metadata/upload/', api_views.upload_metadata, name='api_upload_metadata'),
    path('metadata/<int:doc_id>/', api_views.get_document_metadata, name='api_get_metadata'),
    
    
    
    
    
    
    
    
    
    
 # Nouvelles URLs pour l'interface d'annotation - appel de api_views
    path('annotation/<int:annotation_id>/details/', 
         api_views.get_annotation_details, 
         name='api_get_annotation_details'),

    path('annotation/<int:annotation_id>/edit/', 
         api_views.edit_annotation, 
         name='api_edit_annotation'),

    # Pour la synchronisation du JSON
    path('annotation/page/<int:page_id>/sync-json/', 
         api_views.sync_page_json, 
         name='api_sync_page_json'),

    # Pour le mode structuré
    path('annotation/add-structured/', 
         api_views.add_structured_annotation, 
         name='api_add_structured_annotation'),

]