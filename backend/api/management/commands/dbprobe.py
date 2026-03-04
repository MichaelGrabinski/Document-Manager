from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = "Probe the configured database connection and print server/db info."

    def handle(self, *args, **options):
        with connection.cursor() as cursor:
            cursor.execute("SELECT DB_NAME()")
            db_name = cursor.fetchone()[0]

            try:
                cursor.execute("SELECT @@SERVERNAME")
                server_name = cursor.fetchone()[0]
            except Exception:
                server_name = "(unknown)"

        self.stdout.write(self.style.SUCCESS(f"Connected OK: server={server_name} db={db_name}"))
