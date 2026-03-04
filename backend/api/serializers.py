from rest_framework import serializers
from .models import Group, Document, AppUser


class GroupSerializer(serializers.ModelSerializer):
    parentId = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = ['id', 'name', 'parentId', 'search_keys', 'allowed_roles', 'created_at', 'updated_at']

    def get_parentId(self, obj: Group):
        return obj.parent_id


class DocumentSerializer(serializers.ModelSerializer):
    groupId = serializers.SerializerMethodField()
    storedFileName = serializers.SerializerMethodField()
    originalFileName = serializers.CharField(source='original_file_name', allow_null=True, required=False)
    aiSummary = serializers.CharField(source='ai_summary', allow_null=True, required=False)
    aiExtractedKeywords = serializers.JSONField(source='ai_extracted_keywords', required=False)
    fullSimulatedText = serializers.CharField(source='full_text', allow_null=True, required=False)
    uploadedAt = serializers.DateTimeField(source='uploaded_at', read_only=True)

    class Meta:
        model = Document
        fields = [
            'id',
            'name',
            'type',
            'uploader',
            'uploadedAt',
            'keywords',
            'aiSummary',
            'aiExtractedKeywords',
            'fullSimulatedText',
            'groupId',
            'originalFileName',
            'storedFileName',
        ]

    def get_groupId(self, obj: Document):
        return obj.group_id

    def get_storedFileName(self, obj: Document):
        # Return filename part only
        return obj.stored_file.name.split('/')[-1] if obj.stored_file else None


class AppUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppUser
        fields = ['id', 'name', 'roles']
