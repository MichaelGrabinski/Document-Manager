import os
from django.http import FileResponse
from django.contrib.auth import authenticate, login as dj_login, logout as dj_logout
from django.contrib.auth import get_user_model
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from .models import Group, Document, AppUser
from .serializers import GroupSerializer, DocumentSerializer, AppUserSerializer


def _roles_for_user(user):
	"""Map Django auth flags to app roles.
	  superuser  → admin + editor + viewer
	  staff      → editor + viewer  (can add/edit documents)
	  otherwise  → viewer only
	"""
	if getattr(user, 'is_superuser', False):
		return ['admin', 'editor', 'viewer']
	if getattr(user, 'is_staff', False):
		return ['editor', 'viewer']
	return ['viewer']


@api_view(['GET'])
def health(_request):
	return Response({'ok': True})


@api_view(['GET', 'POST', 'DELETE'])
def groups(request):
	if request.method == 'GET':
		qs = Group.objects.all().order_by('created_at')
		if qs.count() == 0:
			seed = Group.objects.create(name='General', search_keys=['general', 'uncategorized'])
			return Response([GroupSerializer(seed).data])
		return Response(GroupSerializer(qs, many=True).data)

	if request.method == 'POST':
		data = request.data
		group_id = data.get('id')
		payload = {
			'name': data.get('name'),
			'parent_id': data.get('parentId') or data.get('parent_id') or None,
			'search_keys': data.get('searchKeys') or data.get('search_keys') or [],
			'allowed_roles': data.get('allowedRoles') or data.get('allowed_roles') or [],
		}
		if group_id:
			obj, _ = Group.objects.update_or_create(id=group_id, defaults=payload)
		else:
			obj = Group.objects.create(**payload)
		return Response({'success': True, 'group': GroupSerializer(obj).data})

	group_id = request.data.get('id')
	if not group_id:
		return Response({'error': 'id required'}, status=status.HTTP_400_BAD_REQUEST)
	Group.objects.filter(id=group_id).delete()
	return Response({'success': True})


@api_view(['GET', 'POST', 'DELETE'])
def documents(request):
	if request.method == 'GET':
		qs = Document.objects.all().order_by('-created_at')
		return Response(DocumentSerializer(qs, many=True).data)

	if request.method == 'POST':
		data = request.data
		doc_id = data.get('id')
		payload = {
			'name': data.get('name'),
			'type': data.get('type', 'pdf'),
			'uploader': data.get('uploader', 'unknown'),
			'keywords': data.get('keywords') or [],
			'ai_summary': data.get('aiSummary') or data.get('ai_summary'),
			'ai_extracted_keywords': data.get('aiExtractedKeywords') or data.get('ai_extracted_keywords') or [],
			'full_text': data.get('fullSimulatedText') or data.get('full_text'),
			'group_id': data.get('groupId') or data.get('group_id') or None,
			'original_file_name': data.get('originalFileName') or data.get('original_file_name'),
		}

		if doc_id:
			obj = Document.objects.filter(id=doc_id).first()
			if obj:
				for k, v in payload.items():
					setattr(obj, k, v)
				obj.save()
			else:
				return Response({'error': 'not found'}, status=status.HTTP_404_NOT_FOUND)
		else:
			return Response({'error': 'use documents/upload for creating with file'}, status=status.HTTP_400_BAD_REQUEST)

		return Response({'success': True, 'doc': DocumentSerializer(obj).data})

	doc_id = request.data.get('id')
	if doc_id:
		Document.objects.filter(id=doc_id).delete()
	return Response({'success': True})


@api_view(['POST'])
def upload_document(request):
	f = request.FILES.get('file')
	if not f:
		return Response({'error': 'file required'}, status=status.HTTP_400_BAD_REQUEST)

	uploader = request.POST.get('uploader') or 'unknown'
	group_id = request.POST.get('groupId') or None
	override_name = request.POST.get('overrideName') or f.name

	name_no_ext = os.path.splitext(os.path.basename(override_name))[0]

	import json as _json
	keywords_raw = request.POST.get('keywords') or '[]'
	try:
		keywords = _json.loads(keywords_raw)
		if not isinstance(keywords, list):
			keywords = []
	except Exception:
		keywords = []

	ai_kw_raw = request.POST.get('aiExtractedKeywords') or '[]'
	try:
		ai_extracted = _json.loads(ai_kw_raw)
		if not isinstance(ai_extracted, list):
			ai_extracted = []
	except Exception:
		ai_extracted = []

	doc = Document.objects.create(
		name=name_no_ext,
		type='pdf',
		uploader=uploader,
		group_id=group_id,
		keywords=keywords,
		ai_summary=request.POST.get('aiSummary') or None,
		ai_extracted_keywords=ai_extracted,
		full_text=request.POST.get('fullText') or None,
		original_file_name=f.name,
		stored_file=f,
	)

	return Response({'success': True, 'doc': DocumentSerializer(doc).data})


@api_view(['GET'])
def document_detail(_request, doc_id: str):
	doc = Document.objects.filter(id=doc_id).first()
	if not doc:
		return Response({'error': 'not found'}, status=status.HTTP_404_NOT_FOUND)
	return FileResponse(doc.stored_file.open('rb'), content_type='application/pdf')


@api_view(['GET', 'POST', 'DELETE'])
def users(request):
	if request.method == 'GET':
		qs = AppUser.objects.all().order_by('created_at')
		if qs.count() == 0:
			admin = AppUser.objects.create(name='admin', roles=['admin', 'editor', 'viewer'])
			return Response([AppUserSerializer(admin).data])
		return Response(AppUserSerializer(qs, many=True).data)

	if request.method == 'POST':
		data = request.data
		name = data.get('name')
		if not name:
			return Response({'error': 'name required'}, status=status.HTTP_400_BAD_REQUEST)
		roles = data.get('roles') or []
		obj, _ = AppUser.objects.update_or_create(name=name, defaults={'roles': roles})
		return Response({'success': True, 'user': AppUserSerializer(obj).data})

	name = request.data.get('name')
	if not name:
		return Response({'error': 'name required'}, status=status.HTTP_400_BAD_REQUEST)
	AppUser.objects.filter(name=name).delete()
	return Response({'success': True})


@api_view(['GET'])
def auth_session(_request):
	# Session-backed auth check. This will work with Django users (including createsuperuser).
	user = getattr(_request, 'user', None)
	if user and getattr(user, 'is_authenticated', False):
		roles = _roles_for_user(user)
		return Response({'authenticated': True, 'user': {'name': user.get_username(), 'roles': roles}})
	return Response({'authenticated': False}, status=status.HTTP_401_UNAUTHORIZED)


@csrf_exempt
@api_view(['POST'])
def auth_login(request):
	"""Login using Django's auth backend.
	Expected JSON: {"username": "...", "password": "..."}
	"""
	username = (request.data or {}).get('username')
	password = (request.data or {}).get('password')
	if not username or not password:
		return Response({'error': 'username and password required'}, status=status.HTTP_400_BAD_REQUEST)

	user = authenticate(request, username=username, password=password)
	if not user:
		return Response({'error': 'invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)

	dj_login(request, user)
	roles = _roles_for_user(user)
	return Response({'success': True, 'user': {'name': user.get_username(), 'roles': roles}})


@csrf_exempt
@api_view(['POST'])
def auth_logout(request):
	dj_logout(request)
	return Response({'success': True})


@csrf_exempt
@api_view(['POST'])
def auth_register(request):
	"""Create a normal (non-superuser) Django auth user.
	Expected JSON: {"username":"...","password":"...","is_staff":false}
	
	Rules:
	- If a staff/superuser is already logged in, they can create any user.
	- If no one is logged in, this is only allowed when DJANGO_ALLOW_PUBLIC_REGISTER=true.
	"""
	allow_public = os.getenv('DJANGO_ALLOW_PUBLIC_REGISTER', 'false').lower() == 'true'
	request_user = getattr(request, 'user', None)
	if not (request_user and getattr(request_user, 'is_authenticated', False) and (request_user.is_staff or request_user.is_superuser)):
		if not allow_public:
			return Response({'error': 'registration disabled'}, status=status.HTTP_403_FORBIDDEN)

	payload = request.data or {}
	username = (payload.get('username') or '').strip()
	password = payload.get('password') or ''
	is_staff = bool(payload.get('is_staff', False))

	if not username or not password:
		return Response({'error': 'username and password required'}, status=status.HTTP_400_BAD_REQUEST)

	User = get_user_model()
	if User.objects.filter(username=username).exists():
		return Response({'error': 'username already exists'}, status=status.HTTP_409_CONFLICT)

	user = User.objects.create_user(username=username, password=password, is_staff=is_staff, is_active=True)
	# Never allow creating superusers via API.
	user.is_superuser = False
	user.save(update_fields=['is_superuser'])

	roles = ['viewer']
	if user.is_staff:
		roles = ['editor', 'viewer']
	return Response({'success': True, 'user': {'name': user.get_username(), 'roles': roles}})
