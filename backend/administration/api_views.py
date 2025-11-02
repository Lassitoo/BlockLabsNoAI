from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.models import User, Group
from django.db.models import Avg, Count, Q
from rawdocs.models import MetadataFeedback, RawDocument, DocumentPage, Annotation, AnnotationType
from collections import defaultdict
import json

@require_http_methods(["GET"])
@login_required
@require_http_methods(["GET"])
@login_required
def get_admin_stats(request):
    """Get main admin dashboard statistics"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        # FIXED: Proper queries
        total_users = User.objects.count()
        
        # Count users by group properly
        document_managers = User.objects.filter(
            groups__name__in=['Document Manager']
        ).distinct().count()
        
        experts = User.objects.filter(groups__name='Expert').distinct().count()
        
        admins = User.objects.filter(
            Q(is_staff=True) | Q(groups__name='Admin')
        ).distinct().count()
        
        # Import RawDocument model
        from rawdocs.models import RawDocument, DocumentPage, Annotation
        
        # Document stats
        total_documents = RawDocument.objects.count()
        validated_documents = RawDocument.objects.filter(is_validated=True).count()
        pending_validation = RawDocument.objects.filter(is_validated=False).count()
        pending_expert_review = RawDocument.objects.filter(
            is_ready_for_expert=True,
            is_expert_validated=False
        ).count()
        expert_validated = RawDocument.objects.filter(is_expert_validated=True).count()
        
        # Annotation stats
        total_annotations = Annotation.objects.count()
        total_pages = DocumentPage.objects.count()
        annotated_pages = DocumentPage.objects.filter(is_annotated=True).count()
        
        # DEBUG LOGS
        print("=" * 50)
        print("📊 ADMIN STATS DEBUG")
        print(f"Total Users: {total_users}")
        print(f"Document Managers: {document_managers}")
        print(f"Experts: {experts}")
        print(f"Admins: {admins}")
        print(f"Total Documents: {total_documents}")
        print(f"Validated Docs: {validated_documents}")
        print(f"Total Annotations: {total_annotations}")
        print(f"Total Pages: {total_pages}")
        print(f"Annotated Pages: {annotated_pages}")
        print("=" * 50)
        
        return JsonResponse({
            'success': True,
            'stats': {
                'users': {
                    'total': total_users,
                    'document_managers': document_managers,
                    'experts': experts,
                    'admins': admins
                },
                'documents': {
                    'total': total_documents,
                    'validated': validated_documents,
                    'pending_validation': pending_validation,
                    'pending_expert_review': pending_expert_review,
                    'expert_validated': expert_validated
                },
                'annotations': {
                    'total': total_annotations,
                    'total_pages': total_pages,
                    'annotated_pages': annotated_pages
                }
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"❌ ERROR in get_admin_stats: {e}")
        return JsonResponse({'error': str(e)}, status=500)



@require_http_methods(["GET"])
@login_required
def get_all_users(request):
    """Get detailed list of all users"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        users = User.objects.all().order_by('-date_joined')
        
        users_data = []
        for user in users:
            groups = list(user.groups.values_list('name', flat=True))
            role = groups[0] if groups else 'No role'
            
            # Get user activity stats
            documents_count = RawDocument.objects.filter(owner=user).count()
            
            users_data.append({
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'role': role,
                'is_active': user.is_active,
                'is_staff': user.is_staff,
                'date_joined': user.date_joined.isoformat(),
                'last_login': user.last_login.isoformat() if user.last_login else None,
                'documents_count': documents_count
            })
        
        return JsonResponse({
            'success': True,
            'users': users_data
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def update_user(request, user_id):
    """Update user details"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        data = json.loads(request.body)
        user = User.objects.get(id=user_id)
        
        # Update fields if provided
        if 'email' in data:
            user.email = data['email']
        if 'is_active' in data:
            user.is_active = data['is_active']
        if 'is_staff' in data:
            user.is_staff = data['is_staff']
        
        # Update role (group)
        if 'role' in data:
            user.groups.clear()
            if data['role']:
                group, _ = Group.objects.get_or_create(name=data['role'])
                user.groups.add(group)
        
        user.save()
        
        return JsonResponse({
            'success': True,
            'message': 'User updated successfully'
        })
    except User.DoesNotExist:
        return JsonResponse({'error': 'User not found'}, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
@login_required
def delete_user(request, user_id):
    """Delete a user"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        if request.user.id == user_id:
            return JsonResponse({'error': 'Cannot delete yourself'}, status=400)
        
        user = User.objects.get(id=user_id)
        username = user.username
        user.delete()
        
        return JsonResponse({
            'success': True,
            'message': f'User {username} deleted successfully'
        })
    except User.DoesNotExist:
        return JsonResponse({'error': 'User not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
    

@csrf_exempt
@require_http_methods(["POST"])
@login_required
def create_internal_user(request):
    """Admin creates internal users (Admin, Document Manager, Expert)"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        data = json.loads(request.body)
        username = data.get('username')
        email = data.get('email')
        password = data.get('password')
        role = data.get('role')
        
        if not username or not email or not password or not role:
            return JsonResponse({'error': 'All fields are required'}, status=400)
        
        if User.objects.filter(username=username).exists():
            return JsonResponse({'error': 'Username already exists'}, status=400)
        
        if User.objects.filter(email=email).exists():
            return JsonResponse({'error': 'Email already registered'}, status=400)
        
        # Validate role
        valid_roles = ['Admin', 'Document Manager', 'Expert']
        if role not in valid_roles:
            return JsonResponse({'error': 'Invalid role'}, status=400)
        
        # Create user
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password
        )
        
        # Assign role
        group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(group)
        
        # Set staff status for Admins
        if role == 'Admin':
            user.is_staff = True
        
        user.save()
        
        return JsonResponse({
            'success': True,
            'message': f'User {username} created successfully',
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'role': role
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@require_http_methods(["GET"])
@login_required
def get_all_documents(request):
    """Get detailed list of all documents"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        documents = RawDocument.objects.all().select_related('owner').order_by('-created_at')
        
        docs_data = []
        for doc in documents:
            docs_data.append({
                'id': doc.id,
                'title': doc.title or 'Untitled',
                'doc_type': doc.doc_type or 'Unknown',
                'owner': doc.owner.username if doc.owner else 'Unknown',
                'is_validated': doc.is_validated,
                'is_ready_for_expert': doc.is_ready_for_expert,
                'is_expert_validated': doc.is_expert_validated,
                'total_pages': doc.total_pages or 0,
                'created_at': doc.created_at.isoformat(),
                'validated_at': doc.validated_at.isoformat() if doc.validated_at else None
            })
        
        return JsonResponse({
            'success': True,
            'documents': docs_data
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
@login_required
def delete_document(request, doc_id):
    """Delete a document"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        doc = RawDocument.objects.get(id=doc_id)
        title = doc.title or 'Untitled'
        doc.delete()
        
        return JsonResponse({
            'success': True,
            'message': f'Document "{title}" deleted successfully'
        })
    except RawDocument.DoesNotExist:
        return JsonResponse({'error': 'Document not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@require_http_methods(["GET"])
@login_required
def get_annotation_types(request):
    """Get all annotation types"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        types = AnnotationType.objects.all().order_by('name')
        
        types_data = []
        for atype in types:
            usage_count = Annotation.objects.filter(annotation_type=atype).count()
            types_data.append({
                'id': atype.id,
                'name': atype.name,
                'display_name': atype.display_name,
                'color': atype.color,
                'description': atype.description or '',
                'usage_count': usage_count
            })
        
        return JsonResponse({
            'success': True,
            'annotation_types': types_data
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def create_annotation_type(request):
    """Create new annotation type"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        data = json.loads(request.body)
        
        atype = AnnotationType.objects.create(
            name=data['name'],
            display_name=data['display_name'],
            color=data.get('color', '#3b82f6'),
            description=data.get('description', '')
        )
        
        return JsonResponse({
            'success': True,
            'message': f'Annotation type "{atype.display_name}" created',
            'annotation_type': {
                'id': atype.id,
                'name': atype.name,
                'display_name': atype.display_name,
                'color': atype.color
            }
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
@login_required
def delete_annotation_type(request, type_id):
    """Delete annotation type"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        atype = AnnotationType.objects.get(id=type_id)
        name = atype.display_name
        
        # Delete all annotations using this type
        Annotation.objects.filter(annotation_type=atype).delete()
        atype.delete()
        
        return JsonResponse({
            'success': True,
            'message': f'Annotation type "{name}" deleted'
        })
    except AnnotationType.DoesNotExist:
        return JsonResponse({'error': 'Annotation type not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@require_http_methods(["GET"])
@login_required
def get_metadata_learning_stats(request):
    """Get metadata learning dashboard statistics"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        feedbacks = MetadataFeedback.objects.all().order_by('created_at')
        
        if not feedbacks.exists():
            return JsonResponse({
                'success': True,
                'no_data': True,
                'stats': {'avg_score': 0, 'total_feedbacks': 0, 'improvement': 0},
                'field_stats': {},
                'document_stats': {}
            })
        
        avg_score = feedbacks.aggregate(avg=Avg('feedback_score'))['avg'] or 0
        avg_score = avg_score * 100
        total_feedbacks = feedbacks.count()
        
        first_feedback = feedbacks.first()
        last_feedback = feedbacks.last()
        improvement = 0
        
        if first_feedback and last_feedback and total_feedbacks > 1:
            first_score = first_feedback.feedback_score * 100
            last_score = last_feedback.feedback_score * 100
            if first_score > 0:
                improvement = ((last_score - first_score) / first_score) * 100
        
        field_stats = defaultdict(lambda: {'correct': 0, 'wrong': 0, 'missed': 0, 'precision': 0})
        
        for feedback in feedbacks:
            corrections = feedback.corrections_made
            for item in corrections.get('kept_correct', []):
                field_stats[item['field']]['correct'] += 1
            for item in corrections.get('corrected_fields', []):
                field_stats[item['field']]['wrong'] += 1
            for item in corrections.get('removed_fields', []):
                field_stats[item['field']]['wrong'] += 1
            for item in corrections.get('missed_fields', []):
                field_stats[item['field']]['missed'] += 1
        
        for field, stats in field_stats.items():
            total = stats['correct'] + stats['wrong'] + stats['missed']
            if total > 0:
                stats['precision'] = round((stats['correct'] / total) * 100)
        
        document_stats = defaultdict(lambda: {'title': '', 'correct': 0, 'wrong': 0, 'missed': 0, 'precision': 0})
        
        for feedback in feedbacks:
            doc_id = str(feedback.document.id)
            document_stats[doc_id]['title'] = feedback.document.title or 'Sans titre'
            corrections = feedback.corrections_made
            correct_count = len(corrections.get('kept_correct', []))
            wrong_count = len(corrections.get('corrected_fields', [])) + len(corrections.get('removed_fields', []))
            missed_count = len(corrections.get('missed_fields', []))
            document_stats[doc_id]['correct'] += correct_count
            document_stats[doc_id]['wrong'] += wrong_count
            document_stats[doc_id]['missed'] += missed_count
        
        for doc_id, stats in document_stats.items():
            total = stats['correct'] + stats['wrong'] + stats['missed']
            if total > 0:
                stats['precision'] = round((stats['correct'] / total) * 100)
        
        return JsonResponse({
            'success': True,
            'no_data': False,
            'stats': {
                'avg_score': round(avg_score, 1),
                'total_feedbacks': total_feedbacks,
                'improvement': round(improvement, 1)
            },
            'field_stats': dict(field_stats),
            'document_stats': dict(document_stats)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@require_http_methods(["GET"])
@login_required
def get_recent_activity(request):
    """Get recent system activity with user filter"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        from rawdocs.models import RawDocument
        
        # Get filter parameter
        filter_user = request.GET.get('user')
        
        # Get recent documents with optional user filter
        recent_docs_query = RawDocument.objects.order_by('-created_at')
        if filter_user and filter_user != 'all':
            recent_docs_query = recent_docs_query.filter(owner__username=filter_user)
        
        recent_docs = recent_docs_query[:50]
        
        activities = []
        for doc in recent_docs:
            activities.append({
                'type': 'document_upload',
                'description': f'Document uploaded: {doc.title or "Untitled"}',
                'user': doc.owner.username if doc.owner else 'Unknown',
                'timestamp': doc.created_at.isoformat(),
                'status': 'validated' if doc.is_validated else 'pending'
            })
        
        # Get expert validations with optional filter
        validated_docs_query = RawDocument.objects.filter(
            is_expert_validated=True
        ).order_by('-expert_validated_at')
        
        if filter_user and filter_user != 'all':
            validated_docs_query = validated_docs_query.filter(owner__username=filter_user)
        
        validated_docs = validated_docs_query[:20]
        
        for doc in validated_docs:
            if doc.expert_validated_at:
                activities.append({
                    'type': 'expert_validation',
                    'description': f'Document validated: {doc.title or "Untitled"}',
                    'user': doc.owner.username if doc.owner else 'Expert',
                    'timestamp': doc.expert_validated_at.isoformat(),
                    'status': 'completed'
                })
        
        # Sort all activities by timestamp
        activities.sort(key=lambda x: x['timestamp'], reverse=True)
        
        # Get unique users for filter dropdown
        all_users = User.objects.filter(
            id__in=RawDocument.objects.values_list('owner', flat=True).distinct()
        ).values('id', 'username')
        
        return JsonResponse({
            'success': True,
            'activities': activities[:50],
            'filter_options': {
                'users': list(all_users)
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"❌ ERROR in get_recent_activity: {e}")
        return JsonResponse({'error': str(e)}, status=500)
    



@require_http_methods(["GET"])
@login_required
def get_system_health(request):
    """Get system health metrics"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        import psutil
        import platform
        
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        return JsonResponse({
            'success': True,
            'health': {
                'cpu_percent': cpu_percent,
                'memory_percent': memory.percent,
                'memory_available_gb': round(memory.available / (1024**3), 2),
                'disk_percent': disk.percent,
                'disk_free_gb': round(disk.free / (1024**3), 2),
                'platform': platform.system(),
                'python_version': platform.python_version()
            }
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)
    
@require_http_methods(["GET"])
@login_required
def get_all_annotations(request):
    """Get all annotations with filtering"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        # Get filter parameters
        document_id = request.GET.get('document_id')
        page_id = request.GET.get('page_id')
        annotation_type = request.GET.get('type')
        created_by = request.GET.get('created_by')
        min_confidence = request.GET.get('min_confidence', 0)
        
        # Base query
        annotations = Annotation.objects.select_related(
            'page__document',
            'annotation_type',
            'created_by'
        ).all()
        
        # Apply filters
        if document_id:
            annotations = annotations.filter(page__document_id=document_id)
        if page_id:
            annotations = annotations.filter(page_id=page_id)
        if annotation_type:
            annotations = annotations.filter(annotation_type_id=annotation_type)
        if created_by:
            annotations = annotations.filter(created_by__username=created_by)
        if min_confidence:
            annotations = annotations.filter(confidence_score__gte=float(min_confidence))
        
        # Prepare data
        annotations_data = []
        for ann in annotations[:500]:  # Limit to 500 for performance
            annotations_data.append({
                'id': ann.id,
                'text': ann.selected_text[:100],  # Truncate long text
                'full_text': ann.selected_text,
                'type': {
                    'id': ann.annotation_type.id,
                    'name': ann.annotation_type.name,
                    'display_name': ann.annotation_type.display_name,
                    'color': ann.annotation_type.color
                },
                'document': {
                    'id': ann.page.document.id,
                    'title': ann.page.document.title or 'Untitled'
                },
                'page_number': ann.page.page_number,
                'confidence': round(ann.confidence_score, 1),
                'created_by': ann.created_by.username if ann.created_by else 'System',
                'created_at': ann.created_at.isoformat() if hasattr(ann, 'created_at') else None,
                'is_validated': getattr(ann, 'is_validated', False)
            })
        
        # Get filter options
        all_types = AnnotationType.objects.all().values('id', 'name', 'display_name')
        all_creators = User.objects.filter(
            id__in=Annotation.objects.values_list('created_by', flat=True).distinct()
        ).values('id', 'username')
        all_documents = RawDocument.objects.all().values('id', 'title')
        
        return JsonResponse({
            'success': True,
            'annotations': annotations_data,
            'total_count': annotations.count(),
            'filter_options': {
                'types': list(all_types),
                'creators': list(all_creators),
                'documents': list(all_documents)
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)


@require_http_methods(["GET"])
@login_required
def get_document_filters(request):
    """Get filter options for documents"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        # Get unique owners
        owners = User.objects.filter(
            id__in=RawDocument.objects.values_list('owner', flat=True).distinct()
        ).values('id', 'username')
        
        # Get unique validators
        validators = User.objects.filter(
            id__in=RawDocument.objects.filter(
                validated_at__isnull=False
            ).values_list('owner', flat=True).distinct()
        ).values('id', 'username')
        
        # Get unique doc types
        doc_types = RawDocument.objects.exclude(
            doc_type__isnull=True
        ).exclude(
            doc_type=''
        ).values_list('doc_type', flat=True).distinct()
        
        return JsonResponse({
            'success': True,
            'filters': {
                'owners': list(owners),
                'validators': list(validators),
                'doc_types': list(doc_types),
                'statuses': [
                    {'value': 'pending', 'label': 'Pending Validation'},
                    {'value': 'validated', 'label': 'Validated'},
                    {'value': 'ready_expert', 'label': 'Ready for Expert'},
                    {'value': 'expert_validated', 'label': 'Expert Validated'}
                ]
            }
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def bulk_delete_annotations(request):
    """Bulk delete annotations"""
    try:
        if not request.user.is_staff and not request.user.groups.filter(name='Admin').exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)
        
        data = json.loads(request.body)
        annotation_ids = data.get('annotation_ids', [])
        
        if not annotation_ids:
            return JsonResponse({'error': 'No annotations provided'}, status=400)
        
        deleted_count = Annotation.objects.filter(id__in=annotation_ids).delete()[0]
        
        return JsonResponse({
            'success': True,
            'message': f'{deleted_count} annotations deleted',
            'deleted_count': deleted_count
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)