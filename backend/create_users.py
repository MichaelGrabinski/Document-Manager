"""Create/update user accounts in the configured database."""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'docmanager_backend.settings')
django.setup()

from django.contrib.auth.models import User

users = [
    ('Michael', 'admin123', True, True),      # superuser -> admin + editor + viewer
    ('docuser', 'docpass123', True, False),    # staff -> editor + viewer
    ('viewer1', 'viewpass123', False, False),  # default -> viewer only
]

for uname, pwd, is_staff, is_super in users:
    u, created = User.objects.get_or_create(username=uname)
    u.set_password(pwd)
    u.is_staff = is_staff
    u.is_superuser = is_super
    u.save()

    roles = []
    if is_super:
        roles = ['admin', 'editor', 'viewer']
    elif is_staff:
        roles = ['editor', 'viewer']
    else:
        roles = ['viewer']

    status = 'Created' if created else 'Updated'
    print(status + ': ' + uname + ' (roles: ' + ', '.join(roles) + ')')

print('')
print('Total users in DB: ' + str(User.objects.count()))
