"""Production seed: create an admin user only (no demo products / fake dealers).

Usage in prod:
    docker compose -f infra/docker/compose.prod.yml exec api python -m scripts.seed_admin

Set ADMIN_EMAIL + ADMIN_PASSWORD in env first.
"""
from __future__ import annotations

import os
import secrets
import sys

import bcrypt
import pyotp

# Add apps/api to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "api"))

from app.db.session import SessionLocal  # noqa: E402
from app.db.models import StaffProfile, User  # noqa: E402


def main():
    email = os.environ.get("ADMIN_EMAIL")
    password = os.environ.get("ADMIN_PASSWORD")
    if not email or not password:
        print("Set ADMIN_EMAIL and ADMIN_PASSWORD env vars.")
        sys.exit(1)

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            print(f"User {email} already exists.")
            return

        totp_secret = pyotp.random_base32()
        u = User(
            email=email,
            user_type="staff",
            password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
            is_active=True,
        )
        db.add(u)
        db.flush()
        staff = StaffProfile(
            user_id=u.id,
            full_name="Production Admin",
            role="super_admin",
            totp_secret=totp_secret,
            totp_enabled=True,
        )
        db.add(staff)
        db.commit()

        uri = pyotp.totp.TOTP(totp_secret).provisioning_uri(name=email, issuer_name="BharatBoot")
        print(f"✓ Admin user created: {email}")
        print(f"TOTP secret: {totp_secret}")
        print(f"Add to Google Authenticator using: {uri}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
