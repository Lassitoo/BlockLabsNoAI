#backend/authentication/api_urls.py
from django.urls import path
from . import api_views

urlpatterns = [
    # CSRF
    path('csrf/', api_views.get_csrf_token),
    # Auth
    path('login/', api_views.api_login),
    path('logout/', api_views.api_logout),
    path('user/', api_views.get_current_user),
    path("register/", api_views.api_register),

    ]