from django.db import models


class Group(models.Model):
	name = models.CharField(max_length=255)
	parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='children')
	search_keys = models.JSONField(default=list, blank=True)
	allowed_roles = models.JSONField(default=list, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	def __str__(self) -> str:
		return self.name


class Document(models.Model):
	name = models.CharField(max_length=512)
	type = models.CharField(max_length=32, default='pdf')
	uploader = models.CharField(max_length=128)
	uploaded_at = models.DateTimeField(auto_now_add=True)
	keywords = models.JSONField(default=list, blank=True)
	ai_summary = models.TextField(null=True, blank=True)
	ai_extracted_keywords = models.JSONField(default=list, blank=True)
	full_text = models.TextField(null=True, blank=True)

	group = models.ForeignKey(Group, null=True, blank=True, on_delete=models.SET_NULL, related_name='documents')

	original_file_name = models.CharField(max_length=1024, null=True, blank=True)
	stored_file = models.FileField(upload_to='pdfs/')

	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	def __str__(self) -> str:
		return self.name


class AppUser(models.Model):
	name = models.CharField(max_length=64, unique=True)
	roles = models.JSONField(default=list, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	def __str__(self) -> str:
		return self.name
