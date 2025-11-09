"""
Middleware to completely disable security checks in development
WARNING: NEVER USE IN PRODUCTION!
"""
from django.contrib.auth.models import User

class DisableSecurityMiddleware:
    """Disable all security checks for development testing"""
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Bypass CSRF check
        setattr(request, '_dont_enforce_csrf_checks', True)
        
        # Cloudflare envoie X-Forwarded-Proto: https
        # On s'assure que Django le détecte comme HTTPS
        if request.META.get('HTTP_X_FORWARDED_PROTO') == 'https':
            request.is_secure = lambda: True
        
        # Le middleware d'authentification a déjà été exécuté (car on est après dans la liste)
        # Maintenant on peut vérifier et auto-login si nécessaire
        if hasattr(request, 'user') and not request.user.is_authenticated:
            try:
                # Essayer de trouver le premier utilisateur disponible
                default_user = User.objects.first()
                if default_user:
                    request.user = default_user
                    print(f"⚠️ AUTO-LOGIN: Using default user {default_user.username} for testing")
            except Exception as e:
                print(f"❌ Could not auto-login: {e}")
        
        response = self.get_response(request)
        
        # Add permissive CORS headers
        origin = request.META.get('HTTP_ORIGIN', '*')
        response['Access-Control-Allow-Origin'] = origin
        response['Access-Control-Allow-Credentials'] = 'true'
        response['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Origin, Content-Type, Accept, Authorization, X-CSRFToken, X-Requested-With'
        response['Access-Control-Expose-Headers'] = 'Content-Type, X-CSRFToken, Set-Cookie'
        
        # S'assurer que les cookies sont bien configurés pour cross-origin
        if 'Set-Cookie' in response:
            # Les cookies sont déjà configurés dans settings.py
            pass
        
        return response

    def process_view(self, request, view_func, view_args, view_kwargs):
        """Bypass CSRF for all views and auto-login if needed"""
        setattr(request, '_dont_enforce_csrf_checks', True)
        
        # Auto-login si l'utilisateur n'est pas authentifié
        if hasattr(request, 'user') and not request.user.is_authenticated:
            try:
                # Essayer de trouver le premier utilisateur disponible
                default_user = User.objects.first()
                if default_user:
                    request.user = default_user
                    print(f"⚠️ AUTO-LOGIN: Using default user {default_user.username} for testing")
            except Exception as e:
                print(f"❌ Could not auto-login: {e}")
        
        return None
