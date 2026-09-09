import asyncio
import smtplib
from email.message import EmailMessage

from .config import get_settings

settings = get_settings()


async def send_team_invite(email: str, organization_name: str, role: str) -> bool:
    if not settings.smtp_host or not settings.smtp_from:
        return False

    message = EmailMessage()
    message["Subject"] = f"CareOS invitation to {organization_name}"
    message["From"] = settings.smtp_from
    message["To"] = email
    message.set_content(f"You have been invited to join {organization_name} on CareOS as {role}.")

    def send() -> None:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_tls:
                server.starttls()
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)

    await asyncio.to_thread(send)
    return True
