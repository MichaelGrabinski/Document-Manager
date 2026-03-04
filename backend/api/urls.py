from django.urls import path
from . import views

urlpatterns = [
    path('', views.health, name='api_index'),
    path('health/', views.health, name='health'),
    path('groups/', views.groups, name='groups'),
    path('documents/', views.documents, name='documents'),
    path('documents/upload/', views.upload_document, name='upload_document'),
    path('documents/<str:doc_id>/', views.document_detail, name='document_detail'),
    path('users/', views.users, name='users'),
    path('auth/session/', views.auth_session, name='auth_session'),
    path('auth/login/', views.auth_login, name='auth_login'),
    path('auth/logout/', views.auth_logout, name='auth_logout'),
    path('auth/register/', views.auth_register, name='auth_register'),
]
