from django.urls import path
from . import api_views

app_name = 'administration'

urlpatterns = [
    # Dashboard stats
    path('stats/', api_views.get_admin_stats, name='admin_stats'),
    path('recent-activity/', api_views.get_recent_activity, name='recent_activity'),
    path('system-health/', api_views.get_system_health, name='system_health'),
    
    # Users management
    path('users/', api_views.get_all_users, name='get_users'),
    path('users/<int:user_id>/', api_views.update_user, name='update_user'),
    path('users/<int:user_id>/delete/', api_views.delete_user, name='delete_user'),
    path('users/create/', api_views.create_internal_user, name='create_internal_user'),
    
    # Documents management
    path('documents/', api_views.get_all_documents, name='get_documents'),
    path('documents/<int:doc_id>/delete/', api_views.delete_document, name='delete_document'),
    
    # Annotation
    path('annotation-types/', api_views.get_annotation_types, name='get_annotation_types'),
    path('annotation-types/create/', api_views.create_annotation_type, name='create_annotation_type'),
    path('annotation-types/<int:type_id>/delete/', api_views.delete_annotation_type, name='delete_annotation_type'),
    path('annotations/', api_views.get_all_annotations, name='get_annotations'),
    path('annotations/bulk-delete/', api_views.bulk_delete_annotations, name='bulk_delete_annotations'),
    path('documents/filters/', api_views.get_document_filters, name='document_filters'),
    
    # AI Performance
    path('metadata-learning/', api_views.get_metadata_learning_stats, name='metadata_learning'),
]