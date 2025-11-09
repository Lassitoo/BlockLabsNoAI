"""
Test views for debugging cross-origin issues
"""
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import json

@csrf_exempt
@require_http_methods(["GET", "POST", "OPTIONS"])
def test_connection(request):
    """Ultra simple test endpoint"""
    print("=" * 80)
    print("🔔 TEST ENDPOINT CALLED!")
    print(f"Method: {request.method}")
    print(f"Origin: {request.META.get('HTTP_ORIGIN', 'No origin')}")
    print(f"Host: {request.META.get('HTTP_HOST', 'No host')}")
    print(f"X-Forwarded-For: {request.META.get('HTTP_X_FORWARDED_FOR', 'Not set')}")
    print(f"X-Forwarded-Proto: {request.META.get('HTTP_X_FORWARDED_PROTO', 'Not set')}")
    print(f"Is secure: {request.is_secure()}")
    print(f"Path: {request.path}")
    print(f"Full path: {request.get_full_path()}")
    print("=" * 80)
    
    if request.method == "OPTIONS":
        response = JsonResponse({"message": "OPTIONS OK"})
        return response
    
    return JsonResponse({
        "status": "SUCCESS",
        "message": "Backend is reachable from Cloudflare!",
        "method": request.method,
        "origin": request.META.get('HTTP_ORIGIN', 'No origin'),
        "host": request.META.get('HTTP_HOST', 'No host'),
        "user_agent": request.META.get('HTTP_USER_AGENT', 'No user agent'),
        "cookies": list(request.COOKIES.keys()),
        "is_secure": request.is_secure(),
        "x_forwarded_proto": request.META.get('HTTP_X_FORWARDED_PROTO', 'Not set'),
    })

@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def test_login(request):
    """Test login without any authentication"""
    if request.method == "OPTIONS":
        return JsonResponse({"message": "OPTIONS OK"})
    
    try:
        data = json.loads(request.body)
        username = data.get('username', 'N/A')
        password = data.get('password', 'N/A')
        
        return JsonResponse({
            "status": "SUCCESS",
            "message": "Login endpoint reached!",
            "received_username": username,
            "received_password": "***" if password else "N/A",
            "origin": request.META.get('HTTP_ORIGIN', 'No origin'),
        })
    except Exception as e:
        return JsonResponse({
            "status": "ERROR",
            "error": str(e),
            "origin": request.META.get('HTTP_ORIGIN', 'No origin'),
        }, status=500)
