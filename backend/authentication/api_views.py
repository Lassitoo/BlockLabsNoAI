# rawdocs/api_views.py
"""
API Views for Next.js Frontend
Provides RESTful endpoints for annotation, metadata learning, and expert dashboards
"""
from django.contrib.auth.models import User
from django.db.models import Sum, Q, Count, Avg
from django.http import JsonResponse
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from django.utils import timezone
from django.core.files.base import ContentFile
from collections import defaultdict
import json
import requests

# ==================== AUTHENTICATION ====================

from django.contrib.auth.models import Group

@ensure_csrf_cookie
@require_http_methods(["GET"])
def get_csrf_token(request):
    """Get CSRF token for Next.js frontend"""
    print("🔐 CSRF token endpoint called")
    print(f"📍 Origin: {request.META.get('HTTP_ORIGIN', 'No origin')}")
    print(f"🍪 Cookies in request: {request.COOKIES}")
    response = JsonResponse({'detail': 'CSRF cookie set'})
    print(f"📤 Response cookies: {response.cookies}")
    return response


@csrf_exempt  # Temporairement désactivé pour les tests ngrok
@require_http_methods(["POST"])
def api_register(request):
    """Handle user registration from Next.js"""
    try:
        data = json.loads(request.body)
        username = data.get('username')
        email = data.get('email')
        password = data.get('password')
        role = data.get('role', 'document_manager')  
        if not username or not email or not password:
            return JsonResponse({'error': 'All fields are required'}, status=400)

        if User.objects.filter(username=username).exists():
            return JsonResponse({'error': 'Username already exists'}, status=400)

        if User.objects.filter(email=email).exists():
            return JsonResponse({'error': 'Email already registered'}, status=400)

        # Create user
        user = User.objects.create_user(
            username=username, 
            email=email, 
            password=password
        )

        # Assign role to group
        if role:
            # Map Next.js roles to Django group names
            role_mapping = {
                'admin': 'Admin',
                'document_manager': 'Document Manager',
                'expert': 'Expert'
            }
            group_name = role_mapping.get(role, 'Document Manager')
            group, _ = Group.objects.get_or_create(name=group_name)
            user.groups.add(group)

        user.save()
        print("Login response user:", user.id, role)
        return JsonResponse({
            'success': True, 
            'user_id': user.id,
            'username': user.username,
            'email': user.email,
            'role': role
        })
    
    

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt  # Temporairement désactivé pour les tests ngrok
@require_http_methods(["POST"])
def api_login(request):
    """Handle login requests from Next.js"""
    print("🔑 Login endpoint called")
    print(f"📍 Origin: {request.META.get('HTTP_ORIGIN', 'No origin')}")
    print(f"🍪 Cookies in request: {request.COOKIES}")
    print(f"🔐 CSRF token in header: {request.META.get('HTTP_X_CSRFTOKEN', 'No token')}")
    try:
        data = json.loads(request.body)
        username = data.get('username')
        password = data.get('password')
        
        user = authenticate(request, username=username, password=password)
        
        if user is not None:
            login(request, user)
            
            # Determine user role
            role = None
            if user.groups.filter(name='Document Manager').exists():
                role = 'document_manager'
            elif user.groups.filter(name='Expert').exists():
                role = 'expert'
            elif user.groups.filter(name='Admin').exists():
                role = 'admin'
            print("Login response user:", user.id, role)

            
            return JsonResponse({
                'success': True,
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'role': role
                }
            })
        else:
            return JsonResponse({
                'success': False,
                'error': 'Invalid credentials'
            }, status=401)
            
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt  # Temporairement désactivé pour les tests ngrok
@require_http_methods(["POST"])
@login_required
def api_logout(request):
    """Handle logout requests"""
    logout(request)
    return JsonResponse({'success': True})


@ensure_csrf_cookie
@require_http_methods(["GET"])
def get_current_user(request):
    """Get current authenticated user info"""
    if request.user.is_authenticated:
        role = None
        if request.user.groups.filter(name='Document Manager').exists():
            role = 'document_manager'
        elif request.user.groups.filter(name='Expert').exists():
            role = 'expert'
        elif request.user.groups.filter(name='Admin').exists():  
            role = 'admin'

        
        return JsonResponse({
            'authenticated': True,
            'user': {
                'id': request.user.id,
                'username': request.user.username,
                'email': request.user.email,
                'role': role
            }
        })
    else:
        return JsonResponse({
            'authenticated': False
        })